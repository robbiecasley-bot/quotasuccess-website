/**
 * The interactive PACE self-assessment (brief §5.4): 16 questions, 4 per domain,
 * scored on the framework's own maturity scale (Absent..Optimised). Domain colours
 * follow the brief's palette rule (3.1): teal/green are fixed identities for
 * Position/Expand, amber is reserved for whichever domain turns out to be "the
 * block" and is never a fixed identity for Acquire/Convert.
 */
(function () {
  const AMBER = "#C0612A";

  const DOMAINS = [
    { key: "position", label: "Position", color: "#1F8A8F" },
    { key: "acquire", label: "Acquire", color: "#FF8351" },
    { key: "convert", label: "Convert", color: "#0C1A2E" },
    { key: "expand", label: "Expand", color: "#2F9E6E" }
  ];

  const QUESTIONS = [
    { key: "pos_know_best_customers", domain: "position", text: "We know our current best customers well enough to find more just like them." },
    { key: "pos_icp_personas", domain: "position", text: "We have a clear ICP and 2–4 validated personas everyone actually uses." },
    { key: "pos_trigger_events", domain: "position", text: "We know the trigger events that signal a buyer is in-market." },
    { key: "pos_pricing_holds_up", domain: "position", text: "Our pricing and packaging hold up against discounting and feature wars." },

    { key: "acq_channels_deliberate", domain: "acquire", text: "Our inbound and outbound channels are deliberately chosen, not just “whatever we’ve always done”." },
    { key: "acq_lead_scoring", domain: "acquire", text: "We have a lead-scoring model that actually qualifies leads before they hit sales." },
    { key: "acq_mql_definition_agreed", domain: "acquire", text: "Marketing and sales agree on what counts as a real, sales-ready lead." },
    { key: "acq_pipeline_repeatable", domain: "acquire", text: "Our pipeline comes from repeatable sources, not a handful of heroic reps." },

    { key: "conv_process_stages_exit_criteria", domain: "convert", text: "Our sales process has clear stages and exit criteria the team actually follows." },
    { key: "conv_qualification_scorecard", domain: "convert", text: "We have a qualification scorecard reps genuinely use, not just fill in for the CRM." },
    { key: "conv_forecast_lead_lag", domain: "convert", text: "Our forecast is built on tracked lead and lag measures, not gut feel." },
    { key: "conv_leaders_time_to_coach", domain: "convert", text: "Sales leaders have time to coach, not just chase the number." },

    { key: "exp_know_churn_reasons", domain: "expand", text: "We know why customers churn and have a plan to stop it." },
    { key: "exp_customers_prove_roi", domain: "expand", text: "Customers can point to a clear ROI when it's time to renew." },
    { key: "exp_upsell_cross_sell_motion", domain: "expand", text: "We have a real upsell or cross-sell motion, not just an occasional ask." },
    { key: "exp_referrals", domain: "expand", text: "Happy customers regularly refer us to others." }
  ];

  const SCALE_LABELS = ["Absent", "Ad hoc", "Defined", "Repeatable", "Optimised"];

  function domainInfo(key) {
    return DOMAINS.find((d) => d.key === key);
  }

  function buildForm() {
    const form = document.getElementById("assessment-form");
    if (!form) return;

    QUESTIONS.forEach((q, index) => {
      const domain = domainInfo(q.domain);
      const questionId = `q-${q.domain}-${index}`;
      const name = `${q.domain}-${index}`;

      const wrap = document.createElement("div");
      wrap.className = "assess-question";

      const domainLabel = document.createElement("span");
      domainLabel.className = "assess-question__domain";
      domainLabel.style.color = domain.color === "#0C1A2E" ? "var(--teal)" : domain.color;
      domainLabel.textContent = domain.label;
      wrap.appendChild(domainLabel);

      const questionText = document.createElement("p");
      questionText.id = questionId;
      questionText.textContent = q.text;
      wrap.appendChild(questionText);

      const scale = document.createElement("div");
      scale.className = "scale";
      scale.setAttribute("role", "radiogroup");
      scale.setAttribute("aria-labelledby", questionId);

      SCALE_LABELS.forEach((labelText, i) => {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = name;
        input.value = String(i + 1);
        input.required = true;
        input.dataset.domain = q.domain;
        input.dataset.key = q.key;
        input.dataset.text = q.text;
        label.appendChild(input);
        label.appendChild(document.createTextNode(labelText));
        scale.appendChild(label);
      });

      wrap.appendChild(scale);
      form.appendChild(wrap);
    });

    const submitWrap = document.createElement("div");
    submitWrap.style.marginTop = "1.5rem";
    const submitBtn = document.createElement("button");
    submitBtn.type = "submit";
    submitBtn.className = "btn btn--primary";
    submitBtn.textContent = "See my scorecard";
    submitWrap.appendChild(submitBtn);
    form.appendChild(submitWrap);

    form.addEventListener("change", updateProgress);
  }

  function updateProgress() {
    const form = document.getElementById("assessment-form");
    const bar = document.getElementById("assessment-progress-bar");
    if (!form || !bar) return;
    const answeredNames = new Set();
    form.querySelectorAll('input[type="radio"]:checked').forEach((el) => answeredNames.add(el.name));
    const pct = Math.round((answeredNames.size / QUESTIONS.length) * 100);
    bar.style.width = pct + "%";
  }

  // The full, ungrouped set of answers, one entry per question, kept
  // alongside the domain rollup so the exact 1-5 answer to each question is
  // preserved rather than only its contribution to a domain average.
  function collectAnswers(form) {
    return Array.from(form.querySelectorAll('input[type="radio"]:checked')).map((el) => ({
      key: el.dataset.key,
      domain: el.dataset.domain,
      text: el.dataset.text,
      value: Number(el.value)
    }));
  }

  function scoreAssessment(form) {
    const raw = { position: [], acquire: [], convert: [], expand: [] };
    form.querySelectorAll('input[type="radio"]:checked').forEach((el) => {
      raw[el.dataset.domain].push(Number(el.value));
    });

    const domainScores = {};
    DOMAINS.forEach((d) => {
      const values = raw[d.key];
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      domainScores[d.key] = Math.round((avg / 5) * 100);
    });

    let block = DOMAINS[0].key;
    DOMAINS.forEach((d) => {
      if (domainScores[d.key] < domainScores[block]) block = d.key;
    });

    return { domainScores, block };
  }

  function renderScorecard(domainScores, block) {
    const el = document.getElementById("result-scorecard");
    if (!el) return;
    el.innerHTML = "";

    const title = document.createElement("p");
    title.className = "scorecard__title";
    title.textContent = "Your PACE scorecard";
    el.appendChild(title);

    DOMAINS.forEach((d) => {
      const pct = domainScores[d.key];
      const isBlock = d.key === block;

      const row = document.createElement("div");
      row.className = "scorecard__row" + (isBlock ? " scorecard__row--block" : "");

      const labelRow = document.createElement("div");
      labelRow.className = "scorecard__row-label";
      const spanLabel = document.createElement("span");
      spanLabel.textContent = d.label;
      const strong = document.createElement("strong");
      strong.textContent = pct + "%";
      labelRow.appendChild(spanLabel);
      labelRow.appendChild(strong);
      row.appendChild(labelRow);

      const bar = document.createElement("div");
      bar.className = "scorecard__bar";
      const fill = document.createElement("span");
      fill.style.width = pct + "%";
      fill.style.background = isBlock ? AMBER : d.color;
      bar.appendChild(fill);
      row.appendChild(bar);

      el.appendChild(row);
    });

    const tag = document.createElement("span");
    tag.className = "scorecard__block-tag";
    tag.textContent = `${domainInfo(block).label} is the block`;
    el.appendChild(tag);
  }

  function handleSubmit(event) {
    event.preventDefault();
    const form = event.target;

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const { domainScores, block } = scoreAssessment(form);
    renderScorecard(domainScores, block);

    document.getElementById("assessment-pace-scores").value = JSON.stringify(domainScores);
    document.getElementById("assessment-pace-block").value = block;
    const answersField = document.getElementById("assessment-pace-answers");
    if (answersField) answersField.value = JSON.stringify(collectAnswers(form));

    form.hidden = true;
    document.querySelector(".assessment-progress").hidden = true;

    const result = document.getElementById("assessment-result");
    result.classList.add("is-visible");
    result.scrollIntoView({ behavior: "smooth", block: "start" });

    if (window.trackEvent) {
      window.trackEvent("assessment_completed", { block, scores: domainScores });
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    buildForm();
    const form = document.getElementById("assessment-form");
    if (form) form.addEventListener("submit", handleSubmit);
  });
})();
