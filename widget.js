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
 * change here takes up to a week to reach returning visitors. (One accepted
 * bend: the preload below actively fetches the baked fallback, so a cached
 * stale loader preloads a superseded bundle — a wasted hint + console
 * warning, never a wrong execution. Cost is bounded: returning visitors
 * usually have that bundle in HTTP cache; see the rollback note in
 * publish-cdn.cjs for the one case worth acting on.)
 *
 * widget-baf3f802d377.js is replaced by scripts/publish-cdn.cjs at publish time
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
  var FALLBACK_FILE = "widget-baf3f802d377.js";

  // The tag the host page wrote — carries data-amira-key / -mode / -token.
  var loaderTag =
    document.currentScript || document.querySelector("script[data-amira-key]");
  if (!loaderTag) return;

  // Warm the bundle path while version.json resolves: preconnect opens
  // DNS+TLS to the bundle host, and preloading the baked fallback (== the
  // current release at loader-publish time) downloads the bytes in PARALLEL
  // with the version lookup instead of strictly after it. inject() then
  // executes from the preload cache. A stale loader (version != fallback)
  // simply ignores the preload - only inject() ever creates an executing
  // script, so there is no double-execution risk. No crossorigin attribute
  // on either hint: the injected <script> is classic/non-CORS and a
  // mismatched preload mode would be ignored by the browser.
  try {
    var pc = document.createElement("link");
    pc.rel = "preconnect";
    pc.href = "https://cdn.jsdelivr.net";
    document.head.appendChild(pc);
    var pl = document.createElement("link");
    pl.rel = "preload";
    pl.as = "script";
    pl.href = BUNDLE_BASE + FALLBACK_FILE;
    // Nonce-CSP hosts: the preload is checked against script-src like the
    // injected script — carry the same nonce or it 404s at the CSP layer.
    if (loaderTag.nonce) pl.nonce = loaderTag.nonce;
    document.head.appendChild(pl);
  } catch (e) {}

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
