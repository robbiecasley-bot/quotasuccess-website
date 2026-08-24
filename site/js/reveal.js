/**
 * Scroll-reveal for QuotaSuccess.
 *
 * Elements carrying .reveal start slightly offset and fade into place as they
 * enter the viewport. Deliberately restrained: one short movement, once, never
 * reversed on scroll-up — motion that re-triggers reads as a gimmick on a page
 * someone is trying to read.
 *
 * External file rather than inline because netlify.toml sets script-src 'self'.
 *
 * Progressive enhancement: if IntersectionObserver is unavailable, or the
 * visitor prefers reduced motion, everything is shown immediately by removing
 * the gate class. Nothing is ever left hidden by this script.
 */
(function () {
  "use strict";

  var GATE = "reveal-ready";
  var SHOWN = "is-visible";

  function showAll(items) {
    for (var i = 0; i < items.length; i++) items[i].classList.add(SHOWN);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var items = document.querySelectorAll(".reveal");
    if (!items.length) return;

    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced || !("IntersectionObserver" in window)) {
      showAll(items);
      return;
    }

    // Only gate once we know we can un-gate. Avoids a flash of hidden content
    // if the script fails between here and the observer firing.
    document.documentElement.classList.add(GATE);

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add(SHOWN);
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

    for (var i = 0; i < items.length; i++) {
      // Stagger children within a group so a grid resolves in sequence rather
      // than all at once. Capped so a long list never feels slow.
      var delay = Math.min(i % 6, 5) * 60;
      items[i].style.transitionDelay = delay + "ms";
      observer.observe(items[i]);
    }

    // Anything already in view on load should not wait for a scroll event.
    window.setTimeout(function () {
      for (var j = 0; j < items.length; j++) {
        var r = items[j].getBoundingClientRect();
        if (r.top < window.innerHeight) items[j].classList.add(SHOWN);
      }
    }, 40);
  });
})();
