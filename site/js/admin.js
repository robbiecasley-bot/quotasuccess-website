// QuotaSuccess admin dashboard.
//
// Talks to Supabase directly over its REST API (no SDK, same lightweight
// approach as netlify/functions/submit-lead.js) using the project's public
// "anon" key. That key is meant to be public — see the comment in
// admin.html. What actually keeps this data private is the row-level
// security policy on the `leads` table (supabase/schema.sql), which only
// grants read access to a session logged in as robbie@quotasuccess.com.au.
//
// The session is kept in memory only (no localStorage/sessionStorage), so
// refreshing the page requires signing in again. That's a deliberate,
// simple choice for a single-admin internal tool.
(function () {
  const SUPABASE_URL = "https://gbcttmrgvbjcsxvlbwfi.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdiY3R0bXJndmJqY3N4dmxid2ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2MDkyNjAsImV4cCI6MjEwMTE4NTI2MH0.lTBCoHppa6JIMDtYKNHxTrPnRYZRLvpA9PtD0HxYUfA";

  const SERVICE_INTEREST_LABELS = {
    not_sure: "Not sure yet",
    diagnostic: "PACE Diagnostic",
    fractional: "Fractional",
    engineering: "Engineering",
    training: "Training",
    frameworks: "Frameworks"
  };
  const PACE_DOMAIN_LABELS = { position: "Position", acquire: "Acquire", convert: "Convert", expand: "Expand" };
  const SCALE_LABELS = { 1: "Absent", 2: "Ad hoc", 3: "Defined", 4: "Repeatable", 5: "Optimised" };

  let accessToken = null;
  let allLeads = [];

  function el(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
    ));
  }

  async function signIn(email, password) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error_description || data.msg || "Sign in failed");
    }
    return data.access_token;
  }

  // PostgREST resource embedding (the sign_responses(*) / assessment_responses(*)
  // parts) follows the lead_id foreign keys automatically, so each lead comes
  // back with its full per-question detail in one request — no separate
  // round trip needed.
  async function fetchLeads() {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/leads?select=*,sign_responses(*),assessment_responses(*)&order=created_at.desc&limit=200`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) {
      if (response.status === 401) throw new Error("Your session has expired. Please sign in again.");
      throw new Error("Could not load submissions.");
    }
    return response.json();
  }

  // Deleting the leads row cascades to its sign_responses/assessment_responses
  // rows automatically (ON DELETE CASCADE in the schema). Requires the delete
  // RLS policies from supabase/schema.sql to be applied — without them this
  // returns 403/empty and nothing is removed, which the caller surfaces.
  async function deleteLead(id) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${id}`, {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        Prefer: "return=representation"
      }
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error("Your session has expired. Please sign in again.");
      throw new Error("Delete failed — the database may not have the delete permission set up yet (see ADMIN.md).");
    }
    const deleted = await response.json();
    if (!deleted.length) {
      throw new Error("Nothing was deleted — the database may not have the delete permission set up yet (see ADMIN.md).");
    }
  }

  function formatDate(value) {
    try {
      return new Date(value).toLocaleString("en-AU", {
        timeZone: "Australia/Sydney",
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
      });
    } catch (err) {
      return value;
    }
  }

  function renderRow(lead) {
    const sourceLabel = lead.source === "assessment" ? "Self-assessment" : "General enquiry";
    const serviceLabel = lead.service_interest ? (SERVICE_INTEREST_LABELS[lead.service_interest] || lead.service_interest) : "—";

    let blockCell = "—";
    if (lead.pace_block) {
      const score = lead.pace_scores ? lead.pace_scores[lead.pace_block] : null;
      blockCell = `<span class="admin-pill admin-pill--block">${escapeHtml(PACE_DOMAIN_LABELS[lead.pace_block] || lead.pace_block)}${score != null ? ` (${escapeHtml(score)}%)` : ""}</span>`;
    }

    const selectedSigns = Array.isArray(lead.sign_responses) ? lead.sign_responses.filter((s) => s.selected) : [];
    let symptomsCell = "—";
    if (selectedSigns.length) {
      const items = selectedSigns.map((s) => `<li>[${escapeHtml(PACE_DOMAIN_LABELS[s.domain] || s.domain)}] ${escapeHtml(s.question_text)}</li>`).join("");
      symptomsCell = `<details><summary>${selectedSigns.length} selected</summary><ul class="admin-symptom-list">${items}</ul></details>`;
    }

    const answers = Array.isArray(lead.assessment_responses) ? lead.assessment_responses.slice() : [];
    let answersCell = "—";
    if (answers.length) {
      const order = ["position", "acquire", "convert", "expand"];
      answers.sort((a, b) => order.indexOf(a.domain) - order.indexOf(b.domain));
      const items = answers.map((a) => `<li>[${escapeHtml(PACE_DOMAIN_LABELS[a.domain] || a.domain)}] ${escapeHtml(a.question_text)} — <strong>${escapeHtml(SCALE_LABELS[a.scale_value] || a.scale_value)}</strong> (${escapeHtml(a.scale_value)}/5)</li>`).join("");
      answersCell = `<details><summary>${answers.length} answers</summary><ul class="admin-symptom-list">${items}</ul></details>`;
    }

    return `
      <tr data-lead-id="${escapeHtml(lead.id)}" data-lead-email="${escapeHtml(lead.email)}">
        <td>${escapeHtml(formatDate(lead.created_at))}</td>
        <td><span class="admin-pill">${escapeHtml(sourceLabel)}</span></td>
        <td><a href="mailto:${escapeHtml(lead.email)}">${escapeHtml(lead.email)}</a></td>
        <td>${escapeHtml(lead.company || "—")}</td>
        <td>${escapeHtml(lead.role || "—")}</td>
        <td>${escapeHtml(serviceLabel)}</td>
        <td>${blockCell}</td>
        <td>${symptomsCell}</td>
        <td>${answersCell}</td>
        <td><button type="button" class="admin-delete-btn" data-delete-id="${escapeHtml(lead.id)}">Delete</button></td>
      </tr>
    `;
  }

  // Shared by the table render and the CSV export, so "download" always
  // means "download what the two filters are currently showing."
  function getFilteredLeads() {
    const sourceFilter = el("filter-source").value;
    const serviceFilter = el("filter-service").value;
    return allLeads.filter((lead) => {
      if (sourceFilter && lead.source !== sourceFilter) return false;
      if (serviceFilter && lead.service_interest !== serviceFilter) return false;
      return true;
    });
  }

  function renderTable() {
    const filtered = getFilteredLeads();
    el("leads-tbody").innerHTML = filtered.map(renderRow).join("");
    el("leads-empty").hidden = filtered.length !== 0;
  }

  function csvEscape(value) {
    const s = String(value == null ? "" : value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function leadToCsvRow(lead) {
    const sourceLabel = lead.source === "assessment" ? "Self-assessment" : "General enquiry";
    const serviceLabel = lead.service_interest ? (SERVICE_INTEREST_LABELS[lead.service_interest] || lead.service_interest) : "";
    const scores = lead.pace_scores || {};

    const selectedSigns = Array.isArray(lead.sign_responses) ? lead.sign_responses.filter((s) => s.selected) : [];
    const signsText = selectedSigns
      .map((s) => `[${PACE_DOMAIN_LABELS[s.domain] || s.domain}] ${s.question_text}`)
      .join(" | ");

    const order = ["position", "acquire", "convert", "expand"];
    const answers = (Array.isArray(lead.assessment_responses) ? lead.assessment_responses.slice() : [])
      .sort((a, b) => order.indexOf(a.domain) - order.indexOf(b.domain));
    const answersText = answers
      .map((a) => `[${PACE_DOMAIN_LABELS[a.domain] || a.domain}] ${a.question_text} - ${SCALE_LABELS[a.scale_value] || a.scale_value} (${a.scale_value}/5)`)
      .join(" | ");

    return [
      formatDate(lead.created_at), sourceLabel, lead.email || "", lead.company || "", lead.role || "",
      serviceLabel, lead.pace_block ? (PACE_DOMAIN_LABELS[lead.pace_block] || lead.pace_block) : "",
      scores.position != null ? scores.position : "", scores.acquire != null ? scores.acquire : "",
      scores.convert != null ? scores.convert : "", scores.expand != null ? scores.expand : "",
      signsText, answersText
    ].map(csvEscape).join(",");
  }

  function exportCsv() {
    const header = [
      "Date", "Source", "Email", "Company", "Role", "Interested in", "PACE block",
      "Position %", "Acquire %", "Convert %", "Expand %", "Signs selected", "Assessment answers"
    ].map(csvEscape).join(",");
    const csv = [header].concat(getFilteredLeads().map(leadToCsvRow)).join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quotasuccess-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleDeleteClick(event) {
    const btn = event.target.closest("[data-delete-id]");
    if (!btn) return;

    const row = btn.closest("tr");
    const email = row ? row.dataset.leadEmail : "this lead";
    if (!window.confirm(`Delete the ${email} submission? This can't be undone.`)) return;

    const id = btn.dataset.deleteId;
    btn.disabled = true;
    btn.textContent = "Deleting…";
    el("dashboard-error").textContent = "";

    try {
      await deleteLead(id);
      allLeads = allLeads.filter((lead) => String(lead.id) !== id);
      renderTable();
    } catch (err) {
      el("dashboard-error").textContent = err.message;
      if (/expired|sign in/i.test(err.message)) {
        showLogin();
        return;
      }
      btn.disabled = false;
      btn.textContent = "Delete";
    }
  }

  async function loadDashboard() {
    el("dashboard-error").textContent = "";
    try {
      allLeads = await fetchLeads();
      renderTable();
    } catch (err) {
      el("dashboard-error").textContent = err.message;
      if (/expired|sign in/i.test(err.message)) showLogin();
    }
  }

  function showDashboard() {
    el("login-view").hidden = true;
    el("dashboard-view").hidden = false;
    el("sign-out-btn").hidden = false;
    loadDashboard();
  }

  function showLogin() {
    accessToken = null;
    el("dashboard-view").hidden = true;
    el("sign-out-btn").hidden = true;
    el("login-view").hidden = false;
  }

  document.addEventListener("DOMContentLoaded", function () {
    el("login-form").addEventListener("submit", async function (event) {
      event.preventDefault();
      el("login-error").textContent = "";
      const email = el("login-email").value.trim();
      const password = el("login-password").value;
      try {
        accessToken = await signIn(email, password);
        showDashboard();
      } catch (err) {
        el("login-error").textContent = err.message;
      }
    });

    el("sign-out-btn").addEventListener("click", showLogin);
    el("refresh-btn").addEventListener("click", loadDashboard);
    el("export-btn").addEventListener("click", exportCsv);
    el("filter-source").addEventListener("change", renderTable);
    el("filter-service").addEventListener("change", renderTable);
    el("leads-tbody").addEventListener("click", handleDeleteClick);
  });
})();
