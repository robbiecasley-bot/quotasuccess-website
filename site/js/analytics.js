/**
 * Thin analytics wrapper (brief §6/§7: "privacy-friendly analytics + event tracking
 * on CTAs and assessment"). No provider is wired up yet, so this no-ops safely.
 * Once you have a GA4 measurement ID (or Plausible), load that provider's script
 * in index.html and this will start forwarding events to window.gtag automatically.
 */
window.trackEvent = function trackEvent(name, props) {
  if (typeof window.gtag === "function") {
    window.gtag("event", name, props || {});
    return;
  }
  if (typeof window.plausible === "function") {
    window.plausible(name, { props: props || {} });
    return;
  }
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    console.debug("[trackEvent]", name, props || {});
  }
};
