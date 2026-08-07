// Receives lead-capture / self-assessment submissions from site/js/main.js and
// writes them straight to Supabase via PostgREST, using the service-role key.
// The key lives only in Netlify's environment variables — it is never sent to
// the browser (site/index.html only ever calls this function's URL).
//
// Writes land in three tables: `leads` (one row per submission, plus the
// PACE score rollup for quick reference), `sign_responses` (one row per
// "Signs you may need our help" question, selected true/false — the full
// set, not just the ones picked) and `assessment_responses` (one row per
// self-assessment question with its exact 1-5 answer). Normalising the
// per-question detail like this means nothing is lost to a summary.
//
// After a successful insert, also emails a formatted notification via Resend
// (if configured) so a submission can be read and actioned without opening
// Supabase directly. Email sending is best-effort: a Resend failure never
// fails the visitor's submission, it's only logged server-side.

const ALLOWED_SOURCES = new Set(["assessment", "lead_capture"]);
const PACE_DOMAINS = ["position", "acquire", "convert", "expand"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SERVICE_INTEREST_OPTIONS = new Set([
  "not_sure",
  "diagnostic",
  "fractional",
  "engineering",
  "training",
  "frameworks"
]);
const SERVICE_INTEREST_LABELS = {
  not_sure: "Not sure yet / just the diagnostic",
  diagnostic: "PACE Diagnostic",
  fractional: "QuotaSuccess Fractional",
  engineering: "QuotaSuccess Engineering",
  training: "QuotaSuccess Training",
  frameworks: "QuotaSuccess Frameworks"
};
const PACE_DOMAIN_LABELS = { position: "Position", acquire: "Acquire", convert: "Convert", expand: "Expand" };
const SCALE_LABELS = { 1: "Absent", 2: "Ad hoc", 3: "Defined", 4: "Repeatable", 5: "Optimised" };
const MAX_SIGN_RESPONSES = 60;
const MAX_ASSESSMENT_RESPONSES = 40;
const MAX_QUESTION_TEXT_LENGTH = 300;
const MAX_QUESTION_KEY_LENGTH = 100;

const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 5);
const RATE_LIMIT_WINDOW_MINUTES = Number(process.env.RATE_LIMIT_WINDOW_MINUTES || 10);

function getClientIp(event) {
  return (
    event.headers["x-nf-client-connection-ip"] ||
    event.headers["client-ip"] ||
    (event.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    "unknown"
  );
}

// Every hit (valid or not) counts toward the limit, so a bot spamming garbage
// still gets throttled. Lookup failures fail open — an infra hiccup here
// shouldn't block a real visitor from booking a diagnostic.
async function isRateLimited(supabaseUrl, serviceKey, ip) {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString();
  const query = `ip=eq.${encodeURIComponent(ip)}&created_at=gte.${encodeURIComponent(since)}&select=id`;

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/lead_submission_attempts?${query}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    });
    if (!response.ok) return false;
    const rows = await response.json();
    return rows.length >= RATE_LIMIT_MAX;
  } catch (err) {
    return false;
  }
}

async function logAttempt(supabaseUrl, serviceKey, ip) {
  try {
    await fetch(`${supabaseUrl}/rest/v1/lead_submission_attempts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "return=minimal"
      },
      body: JSON.stringify({ ip })
    });
  } catch (err) {
    // Non-fatal: worst case, this one attempt doesn't count toward the window.
  }
}

// Never trust the client's scoring — a submitter could hand-craft this
// payload without ever running the assessment. Only well-formed domain
// scores (0-100) survive; anything else is dropped rather than stored.
function sanitizePaceScores(input) {
  if (!input || typeof input !== "object") return null;
  const out = {};
  for (const domain of PACE_DOMAINS) {
    const val = input[domain];
    if (typeof val !== "number" || !Number.isFinite(val) || val < 0 || val > 100) return null;
    out[domain] = Math.round(val);
  }
  return out;
}

function sanitizePaceBlock(value) {
  return PACE_DOMAINS.includes(value) ? value : null;
}

function sanitizeServiceInterest(value) {
  return SERVICE_INTEREST_OPTIONS.has(value) ? value : null;
}

function sanitizeQuestionKey(value) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_QUESTION_KEY_LENGTH) : null;
}

function sanitizeQuestionText(value) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, MAX_QUESTION_TEXT_LENGTH) : null;
}

// Only well-formed {key, domain, text, selected} entries survive — every
// field required, domain restricted to the four PACE keys, selected coerced
// to a strict boolean. This is the full response set (selected AND not
// selected), not just a filtered "what they picked" summary, so nothing
// well-formed is dropped just because it was left unselected.
function sanitizeSignResponses(input, leadId) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const item of input.slice(0, MAX_SIGN_RESPONSES)) {
    if (!item || typeof item !== "object") continue;
    const key = sanitizeQuestionKey(item.key);
    const domain = PACE_DOMAINS.includes(item.domain) ? item.domain : null;
    const text = sanitizeQuestionText(item.text);
    if (!key || !domain || !text || typeof item.selected !== "boolean") continue;
    out.push({ lead_id: leadId, question_key: key, domain, question_text: text, selected: item.selected });
  }
  return out;
}

// Only well-formed {key, domain, text, value} entries survive, value
// restricted to the assessment's 1-5 scale. Same "never trust the client"
// posture as sanitizePaceScores.
function sanitizeAssessmentResponses(input, leadId) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const item of input.slice(0, MAX_ASSESSMENT_RESPONSES)) {
    if (!item || typeof item !== "object") continue;
    const key = sanitizeQuestionKey(item.key);
    const domain = PACE_DOMAINS.includes(item.domain) ? item.domain : null;
    const text = sanitizeQuestionText(item.text);
    const value = Number(item.value);
    if (!key || !domain || !text || !Number.isInteger(value) || value < 1 || value > 5) continue;
    out.push({ lead_id: leadId, question_key: key, domain, question_text: text, scale_value: value });
  }
  return out;
}

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

function buildNotificationEmailHtml(row, selectedSigns, assessmentResponses) {
  const sourceLabel = row.source === "assessment" ? "Self-assessment" : "General enquiry";
  const serviceLabel = row.service_interest ? SERVICE_INTEREST_LABELS[row.service_interest] : "Not specified";

  let scoresBlock = "";
  if (row.pace_scores) {
    const rows = PACE_DOMAINS.map((d) => {
      const isBlock = d === row.pace_block;
      return `<tr>
        <td style="padding:4px 12px 4px 0; ${isBlock ? "font-weight:bold; color:#C0612A;" : ""}">${PACE_DOMAIN_LABELS[d]}${isBlock ? " (the block)" : ""}</td>
        <td style="padding:4px 0;">${escapeHtml(row.pace_scores[d])}%</td>
      </tr>`;
    }).join("");
    scoresBlock = `<h3 style="margin:20px 0 8px; font-size:15px;">PACE scorecard</h3><table>${rows}</table>`;
  }

  let symptomsBlock = "";
  if (selectedSigns.length) {
    const items = selectedSigns.map((s) => `<li>[${PACE_DOMAIN_LABELS[s.domain] || s.domain}] ${escapeHtml(s.question_text)}</li>`).join("");
    symptomsBlock = `<h3 style="margin:20px 0 8px; font-size:15px;">Signs selected (${selectedSigns.length})</h3><ul style="margin:0; padding-left:20px;">${items}</ul>`;
  }

  let answersBlock = "";
  if (assessmentResponses && assessmentResponses.length) {
    const ordered = assessmentResponses.slice().sort((a, b) => PACE_DOMAINS.indexOf(a.domain) - PACE_DOMAINS.indexOf(b.domain));
    const items = ordered.map((a) => `<li>[${PACE_DOMAIN_LABELS[a.domain] || a.domain}] ${escapeHtml(a.question_text)} — <strong>${escapeHtml(SCALE_LABELS[a.scale_value] || a.scale_value)}</strong> (${escapeHtml(a.scale_value)}/5)</li>`).join("");
    answersBlock = `<h3 style="margin:20px 0 8px; font-size:15px;">Full self-assessment answers (${assessmentResponses.length})</h3><ul style="margin:0; padding-left:20px;">${items}</ul>`;
  }

  return `
    <div style="font-family:Arial,Helvetica,sans-serif; color:#0C1A2E; font-size:14px; line-height:1.5;">
      <h2 style="margin:0 0 4px;">New ${escapeHtml(sourceLabel)} submission</h2>
      <p style="color:#5B6577; margin:0 0 20px;">${new Date(row.created_at || Date.now()).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })} (Sydney time)</p>
      <table style="border-collapse:collapse;">
        <tr><td style="padding:4px 12px 4px 0; color:#5B6577;">Email</td><td style="padding:4px 0;"><strong>${escapeHtml(row.email)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0; color:#5B6577;">Company</td><td style="padding:4px 0;">${escapeHtml(row.company || "—")}</td></tr>
        <tr><td style="padding:4px 12px 4px 0; color:#5B6577;">Role</td><td style="padding:4px 0;">${escapeHtml(row.role || "—")}</td></tr>
        <tr><td style="padding:4px 12px 4px 0; color:#5B6577;">Interested in</td><td style="padding:4px 0;">${escapeHtml(serviceLabel)}</td></tr>
      </table>
      ${scoresBlock}
      ${answersBlock}
      ${symptomsBlock}
    </div>
  `;
}

// Best-effort only: a Resend failure (missing config, network error, bad
// response) is logged and swallowed. The lead is already saved in Supabase
// by the time this runs, so a broken notification should never turn into a
// failed submission for the visitor.
async function sendNotificationEmail(row, selectedSigns, assessmentResponses) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  const to = process.env.RESEND_TO;
  if (!apiKey || !from || !to) return;

  const sourceLabel = row.source === "assessment" ? "Self-assessment" : "General enquiry";
  const subjectDetail = row.service_interest
    ? SERVICE_INTEREST_LABELS[row.service_interest]
    : row.pace_block
      ? `${PACE_DOMAIN_LABELS[row.pace_block]} is the block`
      : "";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: row.email,
        subject: `New QuotaSuccess lead — ${sourceLabel}${subjectDetail ? ` — ${subjectDetail}` : ""}`,
        html: buildNotificationEmailHtml(row, selectedSigns, assessmentResponses)
      })
    });
    if (!response.ok) {
      console.error("Resend notification failed", response.status, await response.text());
    }
  } catch (err) {
    console.error("Resend notification error", err);
  }
}

// Best-effort child-table insert: the lead itself is already saved by the
// time this runs, so a failure here (bad network blip, etc.) is logged and
// swallowed rather than turning into a failed submission for the visitor.
async function insertRows(supabaseUrl, serviceKey, table, rows) {
  if (!rows.length) return;
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "return=minimal"
      },
      body: JSON.stringify(rows)
    });
    if (!response.ok) {
      console.error(`Insert into ${table} failed`, response.status, await response.text());
    }
  } catch (err) {
    console.error(`Insert into ${table} error`, err);
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
  }

  const ip = getClientIp(event);

  if (await isRateLimited(supabaseUrl, serviceKey, ip)) {
    return {
      statusCode: 429,
      headers: { "Retry-After": String(RATE_LIMIT_WINDOW_MINUTES * 60) },
      body: JSON.stringify({ error: "Too many requests. Please try again shortly." })
    };
  }
  await logAttempt(supabaseUrl, serviceKey, ip);

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const email = String(payload.email || "").trim().toLowerCase();
  const source = ALLOWED_SOURCES.has(payload.source) ? payload.source : "lead_capture";

  if (!EMAIL_RE.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: "A valid email is required" }) };
  }

  const row = {
    source,
    email,
    company: payload.company ? String(payload.company).slice(0, 200) : null,
    role: payload.role ? String(payload.role).slice(0, 200) : null,
    pace_scores: sanitizePaceScores(payload.pace_scores),
    pace_block: sanitizePaceBlock(payload.pace_block),
    service_interest: sanitizeServiceInterest(payload.service_interest)
  };

  try {
    // return=representation so the generated id is available for the
    // sign_responses / assessment_responses foreign keys below.
    const response = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "return=representation"
      },
      body: JSON.stringify(row)
    });

    if (!response.ok) {
      const detail = await response.text();
      return { statusCode: 502, body: JSON.stringify({ error: "Could not save lead", detail }) };
    }

    const [inserted] = await response.json();
    const leadId = inserted && inserted.id;

    const signResponses = sanitizeSignResponses(payload.sign_responses, leadId);
    const assessmentResponses = sanitizeAssessmentResponses(payload.assessment_responses, leadId);

    if (leadId) {
      // Best-effort — never blocks or fails the visitor's submission.
      await Promise.all([
        insertRows(supabaseUrl, serviceKey, "sign_responses", signResponses),
        insertRows(supabaseUrl, serviceKey, "assessment_responses", assessmentResponses)
      ]);

      const selectedSigns = signResponses.filter((s) => s.selected);
      await sendNotificationEmail({ ...row, created_at: inserted.created_at }, selectedSigns, assessmentResponses);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "Unexpected error" }) };
  }
};
