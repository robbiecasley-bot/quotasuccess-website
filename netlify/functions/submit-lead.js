// Receives lead-capture / self-assessment submissions from site/js/main.js and
// writes them straight to Supabase via PostgREST, using the service-role key.
// The key lives only in Netlify's environment variables — it is never sent to
// the browser (site/index.html only ever calls this function's URL).

const ALLOWED_SOURCES = new Set(["assessment", "lead_capture"]);
const PACE_DOMAINS = ["position", "acquire", "convert", "expand"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    pace_block: sanitizePaceBlock(payload.pace_block)
  };

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Prefer: "return=minimal"
      },
      body: JSON.stringify(row)
    });

    if (!response.ok) {
      const detail = await response.text();
      return { statusCode: 502, body: JSON.stringify({ error: "Could not save lead", detail }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "Unexpected error" }) };
  }
};
