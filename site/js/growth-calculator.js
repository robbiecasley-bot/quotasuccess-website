/**
 * QuotaSuccess — Growth Engine Calculator
 *
 * Runs two models against the same inputs and compares them:
 *
 *   BACKWARDS  growth target, less whatever arrives without outbound,
 *              held at the chosen coverage ratio -> pipeline required.
 *
 *   FORWARDS   the people you have, what they can realistically work,
 *              degraded by data accuracy, through the user's own
 *              conversion rates -> pipeline actually produced.
 *
 * The gap between the two is the point of the tool. Section 03 then layers
 * four improvements on in sequence and shows the marginal contribution of
 * each, because no single lever closes a gap of this shape.
 *
 * Capacity note: once sequences carry the first touches, a person's ceiling
 * stops being "contacts I can work" and becomes "replies I can handle".
 * That is why the sequenced portion divides replies by the engagement rate —
 * handling 50 replies a month at a 3.5% engagement rate implies roughly
 * 1,430 contacts reached. This is the single biggest lever in the model and
 * also the one most sensitive to its inputs, which is why both the reply
 * ceiling and the sequenced share are user-editable.
 *
 * No storage APIs are used. Nothing leaves the page unless the visitor
 * submits the form at the bottom, which is handled by js/main.js.
 */
(function () {
  "use strict";

  var FIELDS = [
    "growth", "passive", "deal", "cov", "win", "cycle",
    "people", "perday", "days", "acc", "eng", "r2m", "m2o",
    "eng2", "acc2", "m2o2", "autoshare", "replies", "compress"
  ];

  var DEFAULTS = {
    growth: 8000000, passive: 4800000, deal: 120000, cov: "3.5", win: 25, cycle: 9,
    people: 1, perday: 30, days: 18, acc: 70, eng: 2, r2m: 50, m2o: 40,
    eng2: 3.5, acc2: 92, m2o2: 55, autoshare: 50, replies: 50, compress: 30
  };

  var el = {};

  /* ---------- helpers ---------- */

  function num(id) {
    var v = parseFloat(el[id].value);
    return isNaN(v) ? 0 : v;
  }
  function pct(id, min, max) {
    return Math.min(Math.max(num(id), min), max) / 100;
  }
  function money(n) {
    if (!isFinite(n)) return "—";
    var a = Math.abs(n);
    if (a >= 1e6) return "$" + (n / 1e6).toFixed(1).replace(/\.0$/, "") + "m";
    if (a >= 1e3) return "$" + Math.round(n / 1e3) + "k";
    return "$" + Math.round(n);
  }
  function count(n) {
    return (!isFinite(n) || n < 0) ? "—" : Math.round(n).toLocaleString("en-AU");
  }
  function one(n) {
    return !isFinite(n) ? "—" : String(Math.round(n * 10) / 10);
  }
  function ratio(n) {
    return String(n).replace(/\.0$/, "") + ":1";
  }
  function setText(id, v) {
    var node = document.getElementById(id);
    if (node) node.textContent = v;
  }
  function setHtml(id, v) {
    var node = document.getElementById(id);
    if (node) node.innerHTML = v;
  }

  /* ---------- the model ---------- */

  // Contacts reached in a month -> pipeline value produced in a year.
  function produce(contactsPerMonth, accuracy, engage, r2m, meetToOpp, dealValue) {
    var reached = contactsPerMonth * 12 * accuracy;
    var engaged = reached * engage;
    var meetings = engaged * r2m;
    var opps = meetings * meetToOpp;
    return { reached: reached, engaged: engaged, meetings: meetings, opps: opps, value: opps * dealValue };
  }

  function read() {
    var m = {
      growth: num("growth"),
      passive: num("passive"),
      deal: Math.max(num("deal"), 1),
      cov: Math.max(parseFloat(el.cov.value) || 3.5, 1),
      win: pct("win", 1, 100),
      cycle: Math.max(num("cycle"), 1),
      people: Math.max(num("people"), 0),
      perday: Math.max(num("perday"), 1),
      days: Math.max(num("days"), 1),
      acc: pct("acc", 1, 100),
      eng: pct("eng", 0.1, 100),
      r2m: pct("r2m", 1, 100),
      m2o: pct("m2o", 1, 100),
      eng2: pct("eng2", 0.1, 100),
      acc2: pct("acc2", 1, 100),
      m2o2: pct("m2o2", 1, 100),
      autoshare: pct("autoshare", 0, 90),
      replies: Math.max(num("replies"), 1),
      compress: pct("compress", 0, 80)
    };

    m.outbound = Math.max(m.growth - m.passive, 0);
    m.pipeReq = m.outbound * m.cov;
    m.oppsReq = m.pipeReq / m.deal;

    m.baseCapacity = m.people * m.perday * m.days;
    m.base = produce(m.baseCapacity, m.acc, m.eng, m.r2m, m.m2o, m.deal);

    // Optimised capacity: part still worked by hand, part carried by
    // sequences and bounded by how many replies a person can handle.
    m.manualCapacity = m.people * m.perday * m.days * (1 - m.autoshare);
    m.seqCapacity = m.eng2 > 0 ? (m.people * m.replies * m.autoshare) / m.eng2 : 0;
    m.optCapacity = m.manualCapacity + m.seqCapacity;

    return m;
  }

  /* ---------- rendering ---------- */

  function renderAimingFor(m) {
    setText("v-outbound", money(m.outbound));
    setText("n-outbound", "per year · " + money(m.outbound / 4) + " per quarter");
    setText("v-pipereq", money(m.pipeReq));
    setText("n-pipereq", "at " + ratio(m.cov) + " coverage");
    setText("v-oppsreq", count(m.oppsReq));

    setText("note-1",
      "Of the " + money(m.growth) + " of growth you need this year, " + money(m.passive) +
      " arrives without outbound. That leaves " + money(m.outbound) +
      " for outbound to deliver. Held at " + ratio(m.cov) +
      " coverage, that is the pipeline it has to originate.");

    // Coverage vs win rate sanity check.
    var covered = m.cov * m.win;
    var flag = document.getElementById("cov-flag");
    if (covered < 0.98) {
      flag.hidden = false;
      flag.textContent =
        "Worth checking: at a " + Math.round(m.win * 100) + "% win rate, " + ratio(m.cov) +
        " coverage only produces about " + Math.round(covered * 100) +
        "% of the revenue it is meant to cover. To cover it fully you would need roughly " +
        ratio(Math.round((1 / m.win) * 10) / 10) + ", or a higher win rate.";
    } else if (covered > 1.6) {
      flag.hidden = false;
      flag.textContent =
        "Worth checking: at a " + Math.round(m.win * 100) + "% win rate, " + ratio(m.cov) +
        " coverage is more than you need. Around " + ratio(Math.round((1 / m.win) * 10) / 10) +
        " would cover the target, so this model may be overstating the pipeline required.";
    } else {
      flag.hidden = true;
    }
  }

  function renderToday(m) {
    var rungs = [
      { l: "Contacts worked", s: count(m.baseCapacity) + " a month across " + one(m.people) + (m.people === 1 ? " person" : " people"), v: count(m.baseCapacity * 12) },
      { l: "Contacts actually reached", s: Math.round(m.acc * 100) + "% of contact data is accurate and current", v: count(m.base.reached) },
      { l: "Contacts who engage", s: "at " + one(m.eng * 100) + "%", v: count(m.base.engaged) },
      { l: "Discovery meetings held", s: "at " + Math.round(m.r2m * 100) + "%", v: count(m.base.meetings) },
      { l: "Qualified opportunities", s: Math.round((1 - m.m2o) * 100) + "% of meetings qualify out", v: count(m.base.opps) },
      { l: "Pipeline produced", s: "per year, at " + money(m.deal) + " average deal value", v: money(m.base.value), final: true }
    ];

    document.getElementById("ladder").innerHTML = rungs.map(function (r) {
      return '<div class="calc-rung' + (r.final ? " calc-rung--final" : "") + '">' +
        '<span class="calc-rung__l">' + r.l + '<span class="calc-rung__s">' + r.s + "</span></span>" +
        '<span class="calc-rung__v">' + r.v + "</span></div>";
    }).join("");

    setText("note-2",
      "This runs forwards from " + one(m.people) + (m.people === 1 ? " person" : " people") +
      " working " + count(m.perday) + " contacts a day over " + count(m.days) +
      " selling days, through your own conversion rates, to the pipeline that comes out the other end. Figures are annual.");

    var share = m.pipeReq > 0 ? m.base.value / m.pipeReq : 0;
    document.getElementById("verdict-fill").style.width = Math.min(share * 100, 100) + "%";

    var gap = Math.max(m.pipeReq - m.base.value, 0);
    setHtml("verdict-text", share >= 1
      ? "Today's outbound produces <strong>" + money(m.base.value) +
        "</strong> against the <strong>" + money(m.pipeReq) +
        "</strong> required. On these numbers you are covered."
      : "Today's outbound produces <strong>" + money(m.base.value) +
        "</strong> against the <strong>" + money(m.pipeReq) +
        "</strong> required &mdash; about <strong>" + Math.round(share * 100) +
        "%</strong>. The shortfall is <strong>" + money(gap) + "</strong> of pipeline a year.");
  }

  function renderWaterfall(m) {
    // Layers applied in order; each row shows its own marginal contribution.
    var layers = [
      { name: "Today", cap: "What your current setup produces", c: m.baseCapacity, a: m.acc, e: m.eng, o: m.m2o, cls: "calc-wf--base" },
      { name: "Sharper targeting", cap: "ICP precision, segmentation, personalisation at scale", c: m.baseCapacity, a: m.acc, e: m.eng2, o: m.m2o },
      { name: "Better data", cap: "Waterfall enrichment and validation", c: m.baseCapacity, a: m.acc2, e: m.eng2, o: m.m2o },
      { name: "Playbooks and skill", cap: "Trigger-specific research, what to say, proof it worked", c: m.baseCapacity, a: m.acc2, e: m.eng2, o: m.m2o2 },
      { name: "Sequenced volume", cap: "Sequences carry first touches, people handle replies", c: m.optCapacity, a: m.acc2, e: m.eng2, o: m.m2o2, cls: "calc-wf--total" }
    ];

    var values = layers.map(function (L) {
      return produce(L.c, L.a, L.e, m.r2m, L.o, m.deal).value;
    });
    var scale = Math.max(Math.max.apply(null, values), m.pipeReq, 1);

    var html = layers.map(function (L, i) {
      var v = values[i];
      var delta = i === 0 ? null : v - values[i - 1];
      return '<div class="calc-wf ' + (L.cls || "") + '">' +
        '<div class="calc-wf__top">' +
          '<span class="calc-wf__name">' + L.name + '<span class="calc-wf__cap">' + L.cap + "</span></span>" +
          "<span>" +
            '<span class="calc-wf__val">' + money(v) + "</span>" +
            (delta !== null && delta > 0 ? ' <span class="calc-wf__delta">+' + money(delta) + "</span>" : "") +
          "</span>" +
        "</div>" +
        '<div class="calc-wf__track"><div class="calc-wf__bar" style="width:' + (v / scale * 100) + '%"></div></div>' +
        "</div>";
    }).join("");

    html += '<div class="calc-wf calc-wf--req">' +
      '<div class="calc-wf__top">' +
        '<span class="calc-wf__name">Required<span class="calc-wf__cap">Pipeline needed to deliver ' + money(m.outbound) + " of growth</span></span>" +
        '<span class="calc-wf__val">' + money(m.pipeReq) + "</span>" +
      "</div>" +
      '<div class="calc-wf__track"><div class="calc-wf__bar" style="width:' + (m.pipeReq / scale * 100) + '%"></div></div>' +
      "</div>";

    document.getElementById("waterfall").innerHTML = html;
    return values[values.length - 1];
  }

  function renderMeaning(m, optimised) {
    // Headcount needed to close the gap by effort alone, at today's productivity.
    var oppsPerPerson = m.people > 0 ? m.base.opps / m.people : 0;
    var peopleNeeded = oppsPerPerson > 0 ? m.oppsReq / oppsPerPerson : Infinity;
    var extra = peopleNeeded - m.people;

    if (m.people > 0 && isFinite(peopleNeeded)) {
      setHtml("mean-1",
        "At today's productivity, one person generates about <strong>" + count(oppsPerPerson) +
        " qualified opportunities a year</strong>. Hitting <strong>" + count(m.oppsReq) +
        "</strong> by effort alone would take <strong>" + one(peopleNeeded) + " people</strong>" +
        (extra > 0.1 ? " &mdash; roughly <strong>" + one(extra) + " more</strong> than you have." : "."));
    } else {
      setHtml("mean-1",
        "With no one currently prospecting, every one of the <strong>" + count(m.oppsReq) +
        " qualified opportunities</strong> this target needs has to come from somewhere new.");
    }

    var closes = optimised >= m.pipeReq;
    setHtml("mean-2", closes
      ? "The engineered version reaches <strong>" + money(optimised) +
        "</strong> against the <strong>" + money(m.pipeReq) +
        "</strong> required, with the team you already have. The constraint was never how hard people were working."
      : "The engineered version reaches <strong>" + money(optimised) + "</strong>, which closes most of the gap but not all of it. The remainder is a genuine capacity or targeting decision, not something more effort will solve.");

    var fast = m.cycle * (1 - m.compress);
    setHtml("mean-3",
      "Timing matters as much as volume. A conversation started today books revenue in about <strong>" +
      one(m.cycle) + " months</strong>, so work not started this month cannot land inside this financial year. " +
      "Targeting buyers already showing a trigger pulls that back to roughly <strong>" + one(fast) +
      " months</strong>. Meanwhile the outbound requirement runs at <strong>" + money(m.outbound / 12) +
      " of closed revenue a month</strong>, whether or not the engine is producing it.");
  }

  function calc() {
    var m = read();
    renderAimingFor(m);
    renderToday(m);
    var optimised = renderWaterfall(m);
    renderMeaning(m, optimised);
  }

  function reset() {
    FIELDS.forEach(function (f) { el[f].value = DEFAULTS[f]; });
    calc();
    el.growth.focus();
  }

  document.addEventListener("DOMContentLoaded", function () {
    var missing = false;
    FIELDS.forEach(function (f) {
      el[f] = document.getElementById(f);
      if (!el[f]) missing = true;
    });
    if (missing) return;

    FIELDS.forEach(function (f) {
      el[f].addEventListener("input", calc);
      el[f].addEventListener("change", calc);
    });

    var resetBtn = document.getElementById("calc-reset");
    if (resetBtn) resetBtn.addEventListener("click", reset);

    calc();

    if (window.trackEvent) window.trackEvent("calculator_viewed", {});
  });
})();
