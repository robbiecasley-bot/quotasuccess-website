// Receives lead-capture / self-assessment submissions from site/js/main.js and
// writes them straight to Supabase via PostgREST, using the service-role key.
// The key lives only in Netlify's environment variables — it is never sent to
// the browser (site/index.html only ever calls this function's URL).

const ALLOWED_SOURCES = new Set(["assessment", "lead_capture"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server not configured" }) };
  }

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
    pace_scores: payload.pace_scores || null,
    pace_block: payload.pace_block ? String(payload.pace_block).slice(0, 50) : null
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
