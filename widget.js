/**
 * Amira widget CDN loader — this file is published to the CDN repo AS
 * `widget.js`, i.e. it lives at the exact URL every host site already embeds.
 *
 * Why it exists: jsDelivr serves branch files with a 7-day browser cache, so a
 * host page could keep running a stale bundle for a week after a release. This
 * loader is the only thing that URL serves now; the real bundle ships under a
 * content-hashed name (widget-<hash>.js) that never changes once published, so
 * caching it forever is correct. The loader resolves "which hash is current?"
 * at page load from version.json — releases go live within a minute, with
 * zero backend involvement.
 *
 * Where version.json is read from (2026-08-26): jsDelivr FIRST, GitHub's raw
 * endpoint second. The raw endpoint was the only source before, and it is not
 * built for production traffic — it answered a Varnish 503 ("Backend.max_conn
 * reached") during a customer test, the loader fell back to the bundle baked
 * into a week-old cached copy of itself, and a fix that was already published
 * looked broken. jsDelivr is a real multi-CDN; its 12h edge cache is handled
 * by the CI purge step that follows every release (build.yml). The raw
 * endpoint stays as the second try so either host being down still resolves.
 *
 * Fallback order when BOTH lookups fail (or exceed the ~5s budget): the last
 * bundle this browser successfully resolved (localStorage — a returning
 * visitor keeps yesterday's release through an outage), then the bundle
 * baked in below at publish time. The baked name is only ever as fresh as
 * the loader copy the browser holds.
 *
 * The loader itself is still browser-cached for 7 days, which is harmless
 * BECAUSE it is version-agnostic: all release-specific knowledge lives in
 * version.json + localStorage + the baked fallback. Keep it that way — any
 * behavior change here takes up to a week to reach returning visitors. (One
 * accepted bend: the preload below actively fetches the remembered/baked
 * bundle, so a stale guess preloads a superseded bundle — a wasted hint +
 * console warning, never a wrong execution. See the rollback note in
 * publish-cdn.cjs for the one case worth acting on.)
 *
 * widget-612516c78858.js is replaced by scripts/publish-cdn.cjs at publish time
 * with the bundle filename being published, so a failed/blocked version fetch
 * degrades to "the release current at loader-publish time", never to nothing.
 */
(function () {
  "use strict";

  if (window.__amiraWidgetLoaderRan) return; // double-embed / double-inject guard
  window.__amiraWidgetLoaderRan = true;

  var CDN_REPO = "QNOVA-AC/amiraAvatar-Widget-CDN";
  var BUNDLE_BASE = "https://cdn.jsdelivr.net/gh/" + CDN_REPO + "@main/";
  // Primary: jsDelivr (purged by CI after each release). Secondary: GitHub raw
  // (~5 min edge cache, no purge needed, but flaky under load).
  var VERSION_URLS = [
    BUNDLE_BASE + "version.json",
    "https://raw.githubusercontent.com/" + CDN_REPO + "/main/version.json"
  ];
  var FALLBACK_FILE = "widget-612516c78858.js";
  var LKG_KEY = "amira_widget_bundle"; // last-known-good bundle for THIS browser
  var VALID = /^widget-[\w.-]+\.js$/;

  // The tag the host page wrote — carries data-amira-key / -mode / -token.
  var loaderTag =
    document.currentScript || document.querySelector("script[data-amira-key]");
  if (!loaderTag) return;

  function readLKG() {
    try {
      var v = window.localStorage.getItem(LKG_KEY);
      return v && VALID.test(v) ? v : null;
    } catch (e) { return null; }
  }
  function writeLKG(file) {
    try { window.localStorage.setItem(LKG_KEY, file); } catch (e) {}
  }
  var lkg = readLKG();

  // Warm the bundle path while version.json resolves: preconnect opens
  // DNS+TLS to the bundle host, and preloading the best guess (what this
  // browser ran last time, else the baked fallback) downloads the bytes in
  // PARALLEL with the version lookup instead of strictly after it. inject()
  // then executes from the preload cache. A wrong guess is simply ignored —
  // only inject() ever creates an executing script, so there is no
  // double-execution risk. No crossorigin attribute on either hint: the
  // injected <script> is classic/non-CORS and a mismatched preload mode
  // would be ignored by the browser.
  try {
    var pc = document.createElement("link");
    pc.rel = "preconnect";
    pc.href = "https://cdn.jsdelivr.net";
    document.head.appendChild(pc);
    var pl = document.createElement("link");
    pl.rel = "preload";
    pl.as = "script";
    pl.href = BUNDLE_BASE + (lkg || FALLBACK_FILE);
    // Nonce-CSP hosts: the preload is checked against script-src like the
    // injected script — carry the same nonce or it 404s at the CSP layer.
    if (loaderTag.nonce) pl.nonce = loaderTag.nonce;
    document.head.appendChild(pl);
  } catch (e) {}

  var injected = false;
  function inject(file) {
    if (injected) return; // exactly one executing script, whatever resolved
    injected = true;
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

  // One lookup with its own time budget: a hung host must not eat the whole
  // ~5s guard before the second host gets its turn. cache:"no-store" skips the
  // BROWSER cache layer; each host's own edge cache is the only staleness left.
  function lookup(url, ms) {
    var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
    var opts = ctl ? { cache: "no-store", signal: ctl.signal } : { cache: "no-store" };
    var req;
    try {
      req = fetch(url, opts);
    } catch (e) {
      // No fetch at all (or a synchronous throw): must become a rejection, not
      // an exception escaping the loader before anything was injected.
      if (timer) clearTimeout(timer);
      return Promise.reject(e);
    }
    return req.then(
      function (r) {
        if (timer) clearTimeout(timer);
        if (!r.ok) throw new Error("version fetch " + r.status);
        return r.json();
      },
      function (err) {
        if (timer) clearTimeout(timer);
        throw err;
      }
    ).then(function (v) {
      if (!v || typeof v.file !== "string" || !VALID.test(v.file)) {
        throw new Error("version pointer malformed");
      }
      return v.file;
    });
  }

  lookup(VERSION_URLS[0], 2500)
    .catch(function () { return lookup(VERSION_URLS[1], 2500); })
    .then(
      function (file) {
        writeLKG(file);
        inject(file);
      },
      function () {
        inject(lkg || FALLBACK_FILE);
      }
    );
})();
