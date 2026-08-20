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

    // Required opportunities worked backwards through the user's own conversion
    // rates to the number of contacts someone has to physically work. This is
    // the figure that makes the capacity ceiling visible rather than asserted;
    // it reconciles exactly with the headcount multiple in section 04.
    m.meetingsReq = m.oppsReq / m.m2o;
    m.engagedReq = m.meetingsReq / m.r2m;
    m.reachedReq = m.engagedReq / m.eng;
    m.contactsReq = m.reachedReq / m.acc;

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

    renderReality(m);

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

  // The comparison the rest of the page depends on: contacts the target
  // demands, against contacts the team can physically work.
  function renderReality(m) {
    var node = document.getElementById("reality");
    if (!node) return;

    var capacityYear = m.baseCapacity * 12;

    if (m.outbound <= 0) { node.hidden = true; return; }
    node.hidden = false;

    var figures =
      '<div class="calc-reality__figures">' +
        '<div class="calc-reality__fig"><span>Contacts the target demands</span><strong>' +
          count(m.contactsReq) + "</strong></div>" +
        '<div class="calc-reality__fig"><span>Contacts your team can work</span><strong>' +
          count(capacityYear) + "</strong></div>" +
        (capacityYear > 0 && m.contactsReq > capacityYear
          ? '<div class="calc-reality__fig calc-reality__fig--gap"><span>Short by</span><strong>' +
            one(m.contactsReq / capacityYear) + "\u00D7</strong></div>"
          : "") +
      "</div>";

    var body;
    if (capacityYear <= 0) {
      body = "<p>To produce <strong>" + count(m.oppsReq) + " qualified opportunities</strong> at your own " +
        "conversion rates, someone has to work about <strong>" + count(m.contactsReq) +
        " contacts a year</strong>. Nobody is currently doing that work, so all of it has to come from " +
        "somewhere you do not have today.</p>";
    } else if (m.contactsReq <= capacityYear) {
      body = "<p>To produce <strong>" + count(m.oppsReq) + " qualified opportunities</strong> at your own " +
        "conversion rates, someone has to work about <strong>" + count(m.contactsReq) +
        " contacts a year</strong>. Your team can work <strong>" + count(capacityYear) +
        "</strong>, so capacity is not your constraint. What follows is about making each of those " +
        "contacts worth more.</p>";
    } else {
      body = "<p>To produce <strong>" + count(m.oppsReq) + " qualified opportunities</strong> at your own " +
        "conversion rates, someone has to work about <strong>" + count(m.contactsReq) +
        " contacts a year</strong>. Your team can work <strong>" + count(capacityYear) +
        "</strong>.</p>" +
        "<p>That is the whole problem in one line. <strong class=\"calc-reality__gap\">" +
        one(m.contactsReq / capacityYear) + " times more contacts than there are hours to work them.</strong> " +
        "No amount of effort closes a gap that shape &mdash; it closes by making each contact worth more, " +
        "and by lifting the ceiling on how many can be reached at all.</p>";
    }

    node.innerHTML = figures + body;
  }

  function renderToday(m) {
    var rungs = [
      { l: "Contacts worked", s: count(m.baseCapacity) + " a month across " + one(m.people) + (m.people === 1 ? " person" : " people"), v: count(m.baseCapacity * 12) },
      { l: "Contacts actually reached", s: Math.round(m.acc * 100) + "% of contact data is accurate and current", v: count(m.base.reached) },
      { l: "Contacts who engage", s: one(m.eng * 100) + "% reply or start a conversation \u2014 not opens or clicks", v: count(m.base.engaged) },
      { l: "Discovery meetings held", s: Math.round(m.r2m * 100) + "% of those conversations turn into a meeting", v: count(m.base.meetings) },
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
    // Improvements applied in sequence; each row reports its marginal gain over
    // the layer before it. "Required" is inserted after Today so the gap is
    // stated before the fixes, but it is not part of the chain and never
    // carries a delta.
    var layers = [
      { name: "Today", cap: "What your current setup produces", c: m.baseCapacity, a: m.acc, e: m.eng, o: m.m2o, cls: "calc-wf--base" },
      { name: "Sharper targeting", cap: "ICP precision, segmentation, personalisation at scale", c: m.baseCapacity, a: m.acc, e: m.eng2, o: m.m2o },
      { name: "Better data", cap: "Verified, fully researched contacts", c: m.baseCapacity, a: m.acc2, e: m.eng2, o: m.m2o },
      { name: "Playbooks and skill", cap: "Trigger-specific research, what to say, proof it worked", c: m.baseCapacity, a: m.acc2, e: m.eng2, o: m.m2o2 },
      m.autoshare > 0
        ? { name: "Sequenced volume", cap: "Sequences carry first touches, people handle replies", c: m.optCapacity, a: m.acc2, e: m.eng2, o: m.m2o2, cls: "calc-wf--total" }
        : { name: "Volume \u2014 not applied", cap: "You have set sequenced outreach to 0%, so reach stays capped at what your team can personally work", c: m.optCapacity, a: m.acc2, e: m.eng2, o: m.m2o2, cls: "calc-wf--off" }
    ];

    var values = layers.map(function (L) {
      return produce(L.c, L.a, L.e, m.r2m, L.o, m.deal).value;
    });
    var scale = Math.max(Math.max.apply(null, values), m.pipeReq, 1);

    function row(name, cap, value, delta, cls, isReq) {
      var deltaHtml =
        delta === null ? "" :
        delta > 0 ? ' <span class="calc-wf__delta">+' + money(delta) + "</span>" :
        delta < 0 ? ' <span class="calc-wf__delta calc-wf__delta--down">\u2212' + money(Math.abs(delta)) + "</span>" :
                    ' <span class="calc-wf__delta calc-wf__delta--none">no change</span>';
      return '<div class="calc-wf ' + (cls || "") + '">' +
          '<div class="calc-wf__top">' +
            '<span class="calc-wf__name">' + name + '<span class="calc-wf__cap">' + cap + "</span></span>" +
            "<span>" + '<span class="calc-wf__val">' + money(value) + "</span>" + deltaHtml + "</span>" +
          "</div>" +
          '<div class="calc-wf__track">' +
            '<div class="calc-wf__bar" style="width:' + (value / scale * 100) + '%"></div>' +
            (isReq ? "" : '<div class="calc-wf__req" style="left:' + Math.min(m.pipeReq / scale * 100, 99.3) + '%"></div>') +
          "</div>" +
        "</div>";
    }

    var html = row(layers[0].name, layers[0].cap, values[0], null, layers[0].cls, false);

    html += row("Required", "Pipeline needed to deliver " + money(m.outbound) + " of growth",
                m.pipeReq, null, "calc-wf--req", true);

    for (var i = 1; i < layers.length; i++) {
      html += row(layers[i].name, layers[i].cap, values[i], values[i] - values[i - 1], layers[i].cls, false);
    }

    document.getElementById("waterfall").innerHTML = html;
    return values[values.length - 1];
  }

  // Month a conversation started today would book, given the cycle. Naming the
  // actual month works at any cycle length; "next year's number" only holds
  // for long ones.
  function bookingMonth(monthsOut) {
    var d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + Math.round(monthsOut));
    return d.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  }

  function renderMeaning(m, optimised) {
    // Pipeline from the three quality layers alone — no extra contacts, no
    // change to how outreach is run. This is the number that gives someone
    // permission to start small, so it is stated on its own.
    var quality = produce(m.baseCapacity, m.acc2, m.eng2, m.r2m, m.m2o2, m.deal).value;
    var covered = m.base.value >= m.pipeReq;
    var html = "";

    if (m.outbound <= 0) {
      document.getElementById("meaning-body").innerHTML =
        "<p>On these numbers, everything you need arrives without outbound. " +
        "Nothing below applies until the growth target rises above what your existing " +
        "channels already deliver.</p>";
      return;
    }

    /* --- opening line, branches on whether there is actually a gap --- */
    html += covered
      ? '<p class="calc-mean-lead">Your outbound already covers the target. What follows is how you protect it.</p>'
      : '<p class="calc-mean-lead">Each layer multiplies the one before it. That is why the total is bigger than it looks.</p>';

    /* --- the three quality layers --- */
    html += "<ul class=\"calc-mean-list\">" +
      "<li><strong>Better targeting.</strong> More of the right people engage, because the message finally fits a problem they actually have.</li>" +
      "<li><strong>Better data.</strong> The effort you already spend reaches a real person instead of a dead line or someone who left.</li>" +
      "<li><strong>Better playbooks.</strong> Your team knows what triggered the lead, what to ask and where it has worked before, so more conversations survive first contact.</li>" +
      "</ul>";

    html += "<p>Each change is modest on its own. Stacked, the same <strong>" +
      count(m.baseCapacity * 12) + " contacts</strong> a year produce <strong>" +
      money(quality) + "</strong> instead of <strong>" + money(m.base.value) +
      "</strong> \u2014 because you are not improving one step, you are improving every step a contact passes through.</p>";

    /* --- capacity: the part that was doing the work unexplained --- */
    if (m.autoshare > 0) {
      html += "<p><strong>Volume comes last, not first.</strong> Your team can personally work about <strong>" +
        count(m.baseCapacity) + " contacts a month</strong>. With sequences carrying the first touches and " +
        "your people stepping in only once someone replies, the same team covers <strong>" +
        count(m.optCapacity) + "</strong> \u2014 because their limit stops being how many they can contact " +
        "and becomes how many reply. That takes the total to <strong>" + money(optimised) + "</strong>" +
        (optimised >= m.pipeReq
          ? " against the <strong>" + money(m.pipeReq) + "</strong> you need."
          : ", which still leaves <strong>" + money(m.pipeReq - optimised) +
            "</strong> to find from a larger team, a bigger average deal, or a smaller target.") +
        " If sequenced outreach is not something your business would run, that ceiling has to be lifted " +
        "by hiring instead &mdash; set the sequencing figure to 0% to see what that looks like.</p>";
    } else {
      html += "<p><strong>You have modelled this without sequenced outreach</strong>, so reach stays capped at what your " +
        "team can personally work. The three changes above are what is available without altering how outreach runs. " +
        "If that ceiling is the constraint, sequencing the first touches is the lever that removes it.</p>";
    }

    html += "<p class=\"calc-mean-note\">None of that requires a bigger team. It requires a better system.</p>";

    /* --- timing, stated as a real date so it holds at any cycle length --- */
    html += "<p>Your sales cycle is <strong>" + one(m.cycle) + " months</strong>, so a conversation started today " +
      "books around <strong>" + bookingMonth(m.cycle) + "</strong>. Targeting buyers already showing a trigger pulls " +
      "that forward to <strong>" + bookingMonth(m.cycle * (1 - m.compress)) + "</strong>. Every month you wait moves " +
      "the whole picture back by a month.</p>";

    document.getElementById("meaning-body").innerHTML = html;
  }

  // The three "could reach" fields take an absolute rate, not an uplift. Showing
  // today's figure inline is what stops someone entering "30" meaning a 30%
  // improvement and unknowingly modelling a decline.
  function renderBaselines(m) {
    var rows = [
      { id: "base-eng", now: one(m.eng * 100) + "%", opt: m.eng2, base: m.eng, label: "engagement" },
      { id: "base-acc", now: Math.round(m.acc * 100) + "%", opt: m.acc2, base: m.acc, label: "data accuracy" },
      { id: "base-m2o", now: Math.round(m.m2o * 100) + "%", opt: m.m2o2, base: m.m2o, label: "meeting-to-opportunity" }
    ];
    var below = [];
    rows.forEach(function (r) {
      var node = document.getElementById(r.id);
      if (!node) return;
      var lower = r.opt < r.base;
      if (lower) below.push(r.label);
      node.textContent = "Today: " + r.now + (lower ? " — this is lower" : "");
      node.className = "calc-base" + (lower ? " calc-base--warn" : "");
    });

    var flag = document.getElementById("opt-flag");
    if (!flag) return;
    if (below.length) {
      flag.hidden = false;
      flag.innerHTML = "You have set " + below.join(", ") +
        " <strong>below</strong> today's figure, so the layers below show a decline rather than a gain. " +
        "These fields take the rate you expect to reach, not the size of the improvement — " +
        "a 30% uplift on a 40% rate is <strong>52%</strong>, not 30%.";
    } else {
      flag.hidden = true;
    }
  }

  function calc() {
    var m = read();
    renderBaselines(m);
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
