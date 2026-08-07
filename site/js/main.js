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

  // Selected symptoms are tracked here (not scrolled to) so a submitted lead
  // form can carry them along. Read fresh from the DOM at submit time via
  // getSelectedSymptoms(), so this array is really just used for the CTA count.
  function getSelectedSymptoms() {
    return Array.from(document.querySelectorAll('.symptom-item[aria-pressed="true"]')).map((btn) => ({
      domain: btn.dataset.domain || "",
      text: btn.textContent.trim()
    }));
  }

  function updateSymptomCta() {
    const cta = document.getElementById("symptom-cta");
    const countEl = document.getElementById("symptom-cta-count");
    if (!cta || !countEl) return;
    const count = getSelectedSymptoms().length;
    countEl.textContent = String(count);
    cta.hidden = count === 0;
  }

  function initSymptomTracking() {
    document.querySelectorAll(".symptom-item").forEach((btn) => {
      btn.setAttribute("aria-pressed", "false");
      btn.addEventListener("click", function () {
        const alreadyPressed = btn.getAttribute("aria-pressed") === "true";
        btn.setAttribute("aria-pressed", String(!alreadyPressed));

        if (window.trackEvent) {
          window.trackEvent("symptom_click", {
            domain: btn.dataset.domain,
            symptom: btn.textContent.trim(),
            selected: !alreadyPressed
          });
        }

        // Selection is tracked for the CTA and for whichever lead form gets
        // submitted later; the page no longer jumps anywhere on click.
        updateSymptomCta();
      });
    });
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
        symptoms: getSelectedSymptoms()
      };

      const serviceInterest = form.querySelector('select[name="service_interest"]');
      if (serviceInterest && serviceInterest.value) payload.service_interest = serviceInterest.value;

      const paceScores = form.querySelector('input[name="pace_scores"]');
      const paceBlock = form.querySelector('input[name="pace_block"]');
      if (paceScores && paceScores.value) payload.pace_scores = JSON.parse(paceScores.value);
      if (paceBlock && paceBlock.value) payload.pace_block = paceBlock.value;

      try {
        await submitLead(form, payload);
        setStatus(form, "Thanks — we'll follow up personally, soon.", "success");
        form.reset();
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
