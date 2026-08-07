(function () {
  const SUBMIT_ENDPOINT = "/.netlify/functions/submit-lead";

  function initMobileMenu() {
    const toggle = document.querySelector(".nav-toggle");
    const menu = document.getElementById("mobile-menu");
    if (!toggle || !menu) return;

    toggle.addEventListener("click", function () {
      const isOpen = !menu.hidden;
      menu.hidden = isOpen;
      toggle.setAttribute("aria-expanded", String(!isOpen));
    });

    menu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", function () {
        menu.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // Every "Signs you may need our help" question is tracked here — not just
  // the selected ones — so the full response set (selected AND not
  // selected) reaches the database, not a filtered summary. Read fresh from
  // the DOM at submit time via getAllSignResponses(). Selected keys are
  // also mirrored into sessionStorage (see saveSelectedSymptomKeys/
  // restoreSelectedSymptomKeys) so a reload between picking symptoms and
  // submitting the assessment further down the page doesn't lose the
  // selection.
  const SYMPTOMS_STORAGE_KEY = "qs_selected_symptom_keys";

  function symptomButtonText(btn) {
    // The button also contains a checkmark span (.symptom-item__mark); grab
    // only the plain text span so stored/emailed symptom text doesn't get a
    // stray "✓" glued onto the front of it.
    const textEl = btn.querySelector('span:not(.symptom-item__mark)');
    return (textEl ? textEl.textContent : btn.textContent).trim();
  }

  // One entry per Signs question on the page, with whether it's currently
  // selected — the shape submit-lead.js writes into sign_responses. The
  // domain is lower-cased here because data-domain in the HTML is
  // capitalised (e.g. "Convert", for the trackEvent/analytics label), but
  // the server only accepts the lower-case PACE domain keys ("convert")
  // used everywhere else (pace_scores, assessment_responses, the DB check
  // constraint) — mismatched casing here silently drops every row.
  function getAllSignResponses() {
    return Array.from(document.querySelectorAll(".symptom-item")).map((btn) => ({
      key: btn.dataset.key || "",
      domain: (btn.dataset.domain || "").toLowerCase(),
      text: symptomButtonText(btn),
      selected: btn.getAttribute("aria-pressed") === "true"
    }));
  }

  function saveSelectedSymptomKeys() {
    try {
      const keys = getAllSignResponses().filter((s) => s.selected).map((s) => s.key);
      sessionStorage.setItem(SYMPTOMS_STORAGE_KEY, JSON.stringify(keys));
    } catch (err) {
      // sessionStorage can be unavailable (private browsing, storage full,
      // etc). Non-fatal — the selection just won't survive a reload.
    }
  }

  function clearSavedSymptomKeys() {
    try {
      sessionStorage.removeItem(SYMPTOMS_STORAGE_KEY);
    } catch (err) {
      // Non-fatal, see saveSelectedSymptomKeys.
    }
  }

  function restoreSelectedSymptomKeys() {
    try {
      const raw = sessionStorage.getItem(SYMPTOMS_STORAGE_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw);
      return new Set(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
    } catch (err) {
      return new Set();
    }
  }

  function updateSymptomCta() {
    const cta = document.getElementById("symptom-cta");
    const countEl = document.getElementById("symptom-cta-count");
    if (!cta || !countEl) return;
    const count = getAllSignResponses().filter((s) => s.selected).length;
    countEl.textContent = String(count);
    cta.hidden = count === 0;
  }

  function initSymptomTracking() {
    const restoredKeys = restoreSelectedSymptomKeys();

    document.querySelectorAll(".symptom-item").forEach((btn) => {
      // Restore selection from an earlier page load in this tab, if any,
      // instead of always defaulting to unselected.
      btn.setAttribute("aria-pressed", restoredKeys.has(btn.dataset.key) ? "true" : "false");

      btn.addEventListener("click", function () {
        const alreadyPressed = btn.getAttribute("aria-pressed") === "true";
        btn.setAttribute("aria-pressed", String(!alreadyPressed));

        if (window.trackEvent) {
          window.trackEvent("symptom_click", {
            domain: btn.dataset.domain,
            symptom: symptomButtonText(btn),
            selected: !alreadyPressed
          });
        }

        // Selection is tracked for the CTA and for whichever lead form gets
        // submitted later; the page no longer jumps anywhere on click.
        updateSymptomCta();
        saveSelectedSymptomKeys();
      });
    });

    // Reflect any restored selection in the CTA box immediately, rather
    // than waiting for the next click.
    updateSymptomCta();
  }

  function clearSymptomSelection() {
    document.querySelectorAll('.symptom-item[aria-pressed="true"]').forEach((btn) => {
      btn.setAttribute("aria-pressed", "false");
    });
    clearSavedSymptomKeys();
    updateSymptomCta();
  }

  function setStatus(form, message, state) {
    const status = form.querySelector(".form-status");
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state || "";
  }

  function isHoneypotTripped(form) {
    const hp = form.querySelector('input[name="company_website"]');
    return !!(hp && hp.value.trim() !== "");
  }

  async function submitLead(form, payload) {
    const response = await fetch(SUBMIT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error("Submission failed");
    }
  }

  function initLeadForm(form) {
    if (!form) return;

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      if (isHoneypotTripped(form)) {
        // Silently drop likely-bot submissions without alerting the sender.
        setStatus(form, "Thanks, we'll be in touch.", "success");
        form.reset();
        return;
      }

      const email = form.querySelector('input[name="email"]');
      if (email && !email.checkValidity()) {
        email.reportValidity();
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      setStatus(form, "Sending…", "");

      const payload = {
        source: form.querySelector('input[name="source"]').value,
        email: email ? email.value.trim() : "",
        company: (form.querySelector('input[name="company"]') || {}).value || "",
        role: (form.querySelector('input[name="role"]') || {}).value || "",
        sign_responses: getAllSignResponses()
      };

      const serviceInterest = form.querySelector('select[name="service_interest"]');
      if (serviceInterest && serviceInterest.value) payload.service_interest = serviceInterest.value;

      const paceScores = form.querySelector('input[name="pace_scores"]');
      const paceBlock = form.querySelector('input[name="pace_block"]');
      const assessmentResponses = form.querySelector('input[name="assessment_responses"]');
      if (paceScores && paceScores.value) payload.pace_scores = JSON.parse(paceScores.value);
      if (paceBlock && paceBlock.value) payload.pace_block = paceBlock.value;
      if (assessmentResponses && assessmentResponses.value) payload.assessment_responses = JSON.parse(assessmentResponses.value);

      try {
        await submitLead(form, payload);
        setStatus(form, "Thanks — we'll follow up personally, soon.", "success");
        form.reset();
        clearSymptomSelection();
        if (window.trackEvent) {
          window.trackEvent("lead_submitted", { source: payload.source });
        }
      } catch (err) {
        setStatus(form, "Something went wrong. Email robbie@quotasuccess.com.au directly and we'll sort it.", "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initMobileMenu();
    initSymptomTracking();
    initLeadForm(document.getElementById("lead-capture-form"));
    initLeadForm(document.getElementById("assessment-lead-form"));
  });
})();
