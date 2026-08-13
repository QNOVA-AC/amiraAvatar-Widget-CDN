/**
 * Amira widget CDN loader — this file is published to the CDN repo AS
 * `widget.js`, i.e. it lives at the exact URL every host site already embeds.
 *
 * Why it exists: jsDelivr serves branch files with a 7-day browser cache, so a
 * host page could keep running a stale bundle for a week after a release. This
 * loader is the only thing that URL serves now; the real bundle ships under a
 * content-hashed name (widget-<hash>.js) that never changes once published, so
 * caching it forever is correct. The loader resolves "which hash is current?"
 * at page load from version.json via GitHub's raw endpoint, which caches for
 * ~5 minutes — releases go live within minutes, with zero backend involvement.
 *
 * The loader itself is still browser-cached for 7 days, which is harmless
 * BECAUSE it is version-agnostic: all release-specific knowledge lives in
 * version.json + the baked fallback below. Keep it that way — any behavior
 * change here takes up to a week to reach returning visitors.
 *
 * widget-0fb7f080f3cd.js is replaced by scripts/publish-cdn.cjs at publish time
 * with the bundle filename being published, so a failed/blocked version fetch
 * degrades to "the release current at loader-publish time", never to nothing.
 */
(function () {
  "use strict";

  if (window.__amiraWidgetLoaderRan) return; // double-embed / double-inject guard
  window.__amiraWidgetLoaderRan = true;

  var VERSION_URL =
    "https://raw.githubusercontent.com/QNOVA-AC/amiraAvatar-Widget-CDN/main/version.json";
  var BUNDLE_BASE =
    "https://cdn.jsdelivr.net/gh/QNOVA-AC/amiraAvatar-Widget-CDN@main/";
  var FALLBACK_FILE = "widget-0fb7f080f3cd.js";

  // The tag the host page wrote — carries data-amira-key / -mode / -token.
  var loaderTag =
    document.currentScript || document.querySelector("script[data-amira-key]");
  if (!loaderTag) return;

  function inject(file) {
    if (timer) clearTimeout(timer); // resolved (or gave up) — disarm the abort guard
    var s = document.createElement("script");
    s.src = BUNDLE_BASE + file;
    s.async = true;
    // The bundle reads its config off document.currentScript (its own tag
    // while executing), falling back to script[data-amira-key] (the loader
    // tag). Copy every data-* attribute so both paths see identical values;
    // carry the CSP nonce through for hosts that use one.
    for (var i = 0; i < loaderTag.attributes.length; i++) {
      var a = loaderTag.attributes[i];
      if (a.name.indexOf("data-") === 0) s.setAttribute(a.name, a.value);
    }
    if (loaderTag.nonce) s.nonce = loaderTag.nonce;
    document.head.appendChild(s);
  }

  // ~5s guard: a hung version lookup must not strand the page widget-less —
  // abort and fall back. inject() disarms the timer on every path.
  var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
  var timer = ctl && setTimeout(function () { ctl.abort(); }, 5000);

  // cache:"no-store" skips the BROWSER cache layer; the raw endpoint's own
  // edge cache (~5 min) is the only staleness left.
  fetch(VERSION_URL, ctl ? { cache: "no-store", signal: ctl.signal } : { cache: "no-store" })
    .then(function (r) {
      if (!r.ok) throw new Error("version fetch " + r.status);
      return r.json();
    })
    .then(function (v) {
      var file = v && typeof v.file === "string" && /^widget-[\w.-]+\.js$/.test(v.file)
        ? v.file
        : FALLBACK_FILE;
      inject(file);
    })
    .catch(function () {
      inject(FALLBACK_FILE);
    });
})();
