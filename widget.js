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
 * widget-97a25d59bdcf.js is replaced by scripts/publish-cdn.cjs at publish time
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
  var FALLBACK_FILE = "widget-97a25d59bdcf.js";
  var LKG_KEY = "amira_widget_bundle"; // last-known-good bundle for THIS browser
  var VALID = /^widget-[\w.-]+\.js$/;

  // The tag the host page wrote — carries data-amira-key / -mode / -token.
  var loaderTag =
    document.currentScript || document.querySelector("script[data-amira-key]");
  if (!loaderTag) return;

  // Docked layout: a column that was open on the previous page keeps its
  // place from the first paint when this tag sits in <head>, drawn as the
  // visitor left it (colours, brand frame, the avatar's image in the card).
  // A replay of what the bundle wrote on pagehide (src/ui/side-dock.js —
  // keep the CSS identical); the bundle takes it over or drops it when it
  // starts, and its load/error drops it if nothing claimed it (an older
  // bundle, a failed download). Never allowed to stop the bundle loading.
  var SIDE_STYLE = "aw-side-reserve";
  var sideHeld = false;
  function dropSide() {
    try {
      if (window.__amiraSideClaimed) return;
      var el = document.getElementById(SIDE_STYLE);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      document.documentElement.removeAttribute("data-aw-side");
    } catch (e) {}
  }
  try {
    var rec = JSON.parse(window.sessionStorage.getItem("avatar_side_dock") || "null");
    var sd = rec && rec.v === 1 && (rec.side === "left" || rec.side === "right") ? rec.side : null;
    var sw = rec ? Math.round(Number(rec.w)) : 0;
    var room = (document.documentElement.clientWidth || window.innerWidth || 0) - sw;
    if (sd && sw >= 120 && sw <= 1000 && rec.t && Date.now() - rec.t <= 40000 && room >= 960 &&
        !document.getElementById(SIDE_STYLE)) {
      var bg = typeof rec.bg === "string" ? rec.bg.replace(/^\s+|\s+$/g, "") : "";
      if (!/^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\))$/i.test(bg)) bg = "#fff";
      var p = typeof rec.p === "string" ? rec.p.replace(/^\s+|\s+$/g, "") : "";
      if (!/^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(p)) p = "";
      // The card: [x, y, width, height, radius] within the column.
      var c = Array.isArray(rec.card) && rec.card.length === 5
        ? [0, 1, 2, 3, 4].map(function (k) { return Math.round(Number(rec.card[k])); })
        : null;
      if (c && !(c.every(isFinite) && c[0] >= 0 && c[1] >= 0 && c[2] > 0 && c[3] > 0 &&
          c[0] + c[2] <= sw && c[3] <= 3000 && c[4] >= 0 && c[4] <= 200)) c = null;
      var img = c && typeof rec.img === "string" && /^https:\/\/[^\s"'()\\<>]{1,900}$/.test(rec.img) ? rec.img : "";
      var frame = c ? c[1] + c[3] : 0;
      var grad = p && frame
        ? "linear-gradient(180deg,rgba(" + p + ",1) 0,rgba(" + p + ",.6) " + frame / 2 + "px,rgba(" + p + ",0) " + frame + "px),"
        : "";
      var css =
        "html:root{margin-" + sd + ":" + sw + "px!important;width:auto!important;" +
        "--aw-side-width:" + sw + "px;--aw-side-" + sd + ":" + sw + "px}" +
        "@media print{html:root{margin-" + sd + ":0!important}}" +
        "html:root::after{all:initial!important;content:\"\"!important;position:fixed!important;top:0!important;bottom:0!important;" +
        sd + ":0!important;width:" + sw + "px!important;z-index:2147483645!important;pointer-events:none!important;" +
        "background:" + grad + bg + "!important}";
      if (c) {
        var x = sd === "left" ? c[0] : sw - c[0] - c[2];
        css +=
          "html:root::before{all:initial!important;content:\"\"!important;position:fixed!important;top:" + c[1] + "px!important;" +
          sd + ":" + x + "px!important;width:" + c[2] + "px!important;height:" + c[3] + "px!important;border-radius:" + c[4] + "px!important;" +
          "z-index:2147483646!important;pointer-events:none!important;" +
          "background:rgba(127,127,127,.18)" + (img ? " url(\"" + img + "\") center/cover no-repeat" : "") + "!important}";
      }
      css += "@media print{html:root::after,html:root::before{display:none!important}}";
      var st = document.createElement("style");
      st.id = SIDE_STYLE;
      st.textContent = css;
      (document.head || document.documentElement).appendChild(st);
      document.documentElement.setAttribute("data-aw-side", sd);
      sideHeld = true;
      setTimeout(dropSide, 15000);
    }
  } catch (e) {}

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
    s.addEventListener("load", dropSide);
    s.addEventListener("error", dropSide);
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

  // A held column: the bundle this browser ran on the page it comes from
  // starts at once; the lookup below only refreshes the record.
  if (sideHeld && lkg) inject(lkg);

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
