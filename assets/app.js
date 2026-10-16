// web/links/assets/app.js — the landing pages, rendered in the browser from the Edge API (config.js → apiBase).
//
// GitHub Pages has no server routing: /p/<id>, /r/<id>, /l/<id> (and any unknown path) are served 404.html, /go and
// /open are real pages (go.html, open.html), / is index.html — every one of them is the same shell, and this file
// reads location.pathname to decide what to draw. All text goes in through textContent / attributes; nothing a
// link carries is ever parsed as HTML.

import {
  FOOT, linkFromGoParams, liveModel, liveTick, metres, openTarget, pageModel, pickLang, queryDict, T,
} from "./grammar.js";

const cfg = window.ROUTEMIND_LINKS;
const api = cfg.apiBase.replace(/\/+$/, "");
const qs = new URLSearchParams(location.search);
const lang = pickLang(qs.get("lang"), navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""]);
const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

// ── tiny DOM helpers ─────────────────────────────────────────────────────────────────────────────────────────

function h(tag, attrs, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "text") e.textContent = v;
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c) e.append(c);
  return e;
}

function arrow() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [k, v] of Object.entries({ width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" })) {
    svg.setAttribute(k, v);
  }
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", "M12 2l7 19-7-4-7 4 7-19z");
  p.setAttribute("fill", "currentColor");
  svg.append(p);
  return svg;
}

function meta(attr, key, content) {
  let m = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!m) {
    m = document.createElement("meta");
    m.setAttribute(attr, key);
    document.head.append(m);
  }
  m.setAttribute("content", content);
}

function themeColor() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (bg) meta("name", "theme-color", bg);
}

function head(title, description, pageUrl, image, appUrl, appStoreId) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.title = `${title} · RouteMind`;
  meta("name", "description", description);
  meta("property", "og:title", title);
  meta("property", "og:description", description);
  meta("property", "og:url", pageUrl);
  meta("property", "og:image", image);
  meta("property", "og:locale", lang === "ar" ? "ar_EG" : "en_US");
  meta("property", "al:android:url", appUrl);
  if (appStoreId) {
    meta("property", "al:ios:app_store_id", appStoreId);
    meta("property", "al:ios:url", appUrl);
    meta("name", "apple-itunes-app", `app-id=${appStoreId}, app-argument=${appUrl}`);
  }
  let canon = document.head.querySelector('link[rel="canonical"]');
  if (!canon) {
    canon = h("link", { rel: "canonical" });
    document.head.append(canon);
  }
  canon.setAttribute("href", pageUrl);
  themeColor();
}

function brand(tag) {
  return h("div", { class: "brand" }, h("span", { class: "logo", "aria-hidden": "true" }), h("b", { text: "RouteMind" }),
    h("span", { class: "tag", text: `· ${tag}` }));
}

function mount(...nodes) {
  const root = document.getElementById("app");
  root.replaceChildren(...nodes);
}

async function getJson(url, ms = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { cache: "no-store", signal: ctl.signal });
    let body = null;
    try {
      body = await r.json();
    } catch {
      body = null;
    }
    return { status: r.status, body };
  } catch {
    return { status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

// ── "Open in RouteMind" (landing.html's script) ──────────────────────────────────────────────────────────────

const ua = navigator.userAgent || "";
const isAndroid = /Android/i.test(ua);
const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

// Always inside the tap (browsers block scheme launches outside a user gesture). Android Chrome / Custom Tabs take
// an intent:// URL whose fallback is the Play page (with the deferred-link referrer). iOS gets the routemind://
// scheme; if the page is still visible 1.6 s later the app is not installed, and we go to the store — and copy the
// link so the first launch can offer it (no attribution SDK: the app reads its own clipboard hint only when the
// user taps the chip).
function wireOpen(open, note, m) {
  open.addEventListener("click", (ev) => {
    if (isAndroid && m.intentUrl) {
      ev.preventDefault();
      window.location.href = m.intentUrl;
      return;
    }
    if (isIOS) {
      ev.preventDefault();
      if (note) note.classList.remove("hidden");
      let hidden = false;
      const onHide = () => {
        hidden = true;
      };
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) onHide();
      });
      window.addEventListener("pagehide", onHide);
      window.location.href = m.appUrl;
      setTimeout(() => {
        if (hidden || document.hidden) return;
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m.appUrl).catch(() => {});
        if (m.appStoreUrl) window.location.href = m.appStoreUrl;
        else if (note) note.textContent = m.t.still;
      }, 1600);
    }
    // Desktop: the href (the custom scheme) tries; nothing else to do.
  });
}

// ── place / route / go / open / not found ────────────────────────────────────────────────────────────────────

function renderLanding(m) {
  const t = m.t;
  head(m.title, m.address ? `${m.address} · ${m.coords || t.tag}` : m.coords || t.tag, m.pageUrl, m.ogImage, m.appUrl,
    m.appStoreId);
  const body = h("div", { class: "body" }, h("h1", { text: m.title }));
  if (m.address) body.append(h("p", { class: "sub", text: m.address }));
  if (m.via) body.append(h("p", { class: "sub", text: t.via.replace("{n}", String(m.via)) }));
  if (m.wrappedUrl) body.append(h("p", { class: "sub", dir: "ltr", text: m.wrappedUrl }));
  if (m.coords) {
    const copy = h("button", { type: "button", text: t.copy });
    copy.addEventListener("click", () => {
      const done = () => {
        copy.textContent = t.copied;
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m.coords).then(done, done);
      else done();
    });
    body.append(h("div", { class: "coords" }, h("span", { text: m.coords }), copy));
  }
  const card = h("div", { class: "card" });
  if (m.lat) {
    const img = h("img", { class: "map", src: m.ogImage, alt: "", loading: "eager" });
    img.addEventListener("error", () => img.classList.add("broken"));
    card.append(img);
  }
  card.append(body);
  if (m.state) card.append(h("div", { class: "state", text: m.stateText }));
  const open = h("a", { class: "btn primary", href: m.appUrl }, arrow(), h("span", { text: t.open }));
  const note = h("p", { class: "note hidden", text: t.opening });
  const actions = h("div", { class: "actions" }, open, note);
  if (m.ext) {
    actions.append(h("div", { class: "row" },
      h("a", { class: "btn", href: m.ext.google, rel: "noopener", text: t.google }),
      h("a", { class: "btn", href: m.ext.apple, rel: "noopener", text: t.apple }),
      h("a", { class: "btn", href: m.ext.waze, rel: "noopener", text: t.waze })));
  }
  actions.append(h("p", { class: "note", text: t.no_app }));
  const store = h("div", { class: "store" }, h("a", { href: m.playUrl, rel: "noopener", text: "Google Play" }));
  if (m.appStoreUrl) store.append(h("a", { href: m.appStoreUrl, rel: "noopener", text: "App Store" }));
  actions.append(store);
  card.append(actions);
  wireOpen(open, note, m);
  mount(brand(t.tag), card, h("p", { class: "foot", text: `routemind · ${m.foot}` }));
}

const base = { lang, cfg, origin: location.origin, href: location.href };

async function shortLink(seg, id) {
  if (!ID_RE.test(id)) return renderLanding(pageModel({ ...base, linkId: id, seg, state: "not_found" }));
  const r = await getJson(`${api}/api/links/${encodeURIComponent(id)}?page=1`);
  if (r.status === 200 && r.body && r.body.link) {
    return renderLanding(pageModel({ ...base, link: r.body.link, linkId: id, seg }));
  }
  if (r.status === 410 && r.body) {
    // An expired / revoked row still shows its pin (it is not a secret); the banner says why.
    return renderLanding(pageModel({ ...base, link: r.body.link || null, linkId: id, seg, state: r.body.error || "expired" }));
  }
  const state = r.status === 404 ? "not_found" : "unavailable";
  return renderLanding(pageModel({ ...base, linkId: id, seg, state }));
}

function goPage() {
  const link = linkFromGoParams(queryDict(location.search));
  renderLanding(pageModel({ ...base, link, seg: "go", state: link ? null : "not_found" }));
}

function openPage() {
  const u = openTarget(qs.get("u"));
  renderLanding(pageModel({ ...base, seg: "open", wrappedUrl: u, state: u ? null : "not_found" }));
}

// ── /l/<id>: the live-trip viewer (live.html) ────────────────────────────────────────────────────────────────

const POLL_MS = 8000;
// A new map image costs a Mapbox Static request: only when the car moved this far, or this long passed.
const MAP_MOVE_M = 150;
const MAP_EVERY_MS = 60_000;

async function livePage(id) {
  let view = null;
  if (ID_RE.test(id)) {
    const r = await getJson(`${api}/api/live/${encodeURIComponent(id)}?page=1`);
    if (r.status === 200 && r.body) view = r.body;
    else if (r.status === 410 && r.body) view = { ...r.body, ended: true };
  }
  const m = liveModel({ view, liveId: id, lang, cfg, origin: location.origin });
  const t = m.t;
  head(m.title, m.heading || t.tag, m.pageUrl, m.ogImage, m.appUrl, m.appStoreId);
  meta("property", "og:title", `${t.live} · ${m.title}`);
  const map = h("img", { class: "map", src: m.ogImage, alt: "" });
  map.addEventListener("error", () => map.classList.add("broken"));
  const pillText = h("span", { text: t.live });
  const pill = h("div", { class: "pill" }, h("span", { class: "dot" }), pillText);
  const eta = h("div", { class: "big", text: m.ended ? t.ended : t.waiting });
  const updated = h("p", { class: "sub" });
  const body = h("div", { class: "body" }, pill, h("h1", { text: m.title }), eta, updated);
  if (m.heading) body.append(h("p", { class: "sub", text: m.heading }));
  if (!m.found) body.append(h("p", { class: "sub", text: t.unavailable }));
  const actions = h("div", { class: "actions" }, h("a", { class: "btn primary", href: m.appUrl, text: t.open }));
  if (m.googleUrl) actions.append(h("a", { class: "btn", href: m.googleUrl, rel: "noopener", text: t.google }));
  actions.append(h("a", { class: "btn", href: m.playUrl, rel: "noopener", text: t.get }));
  const card = h("div", { class: "card live" }, map, body, actions);
  mount(brand(t.live), card, h("p", { class: "foot", text: `routemind · ${FOOT[lang]}` }));

  let stopped = m.ended || !m.found;
  let lastMap = null;
  let lastMapAt = 0;
  const stop = (text) => {
    stopped = true;
    eta.textContent = text;
    card.classList.add("stopped");
  };
  if (stopped) card.classList.add("stopped");
  const tick = async () => {
    if (stopped) return;
    const r = await getJson(`${api}/api/live/${encodeURIComponent(id)}`);
    if (r.status === 410 || r.status === 404) return stop(t.ended);
    if (r.status !== 200 || !r.body) return;
    const v = liveTick(r.body, lang, Date.now());
    if (v.stop) {
      stop(v.eta);
      pillText.textContent = v.pill;
      return;
    }
    eta.textContent = v.eta;
    if (v.updated !== undefined) updated.textContent = v.updated;
    if (v.lat !== undefined) {
      const here = [v.lat, v.lng];
      const now = Date.now();
      if (!lastMap || (metres(lastMap, here) >= MAP_MOVE_M) ||
        (now - lastMapAt >= MAP_EVERY_MS && metres(lastMap, here) >= 10)) {
        lastMap = here;
        lastMapAt = now;
        map.classList.remove("broken");
        map.src = `${api}/api/link-preview.png?lat=${v.lat.toFixed(6)}&lng=${v.lng.toFixed(6)}`;
      }
    }
  };
  tick();
  setInterval(tick, POLL_MS);
}

// ── route ────────────────────────────────────────────────────────────────────────────────────────────────────

function main() {
  themeColor();
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", themeColor);
  // Never drawn inside another site's frame (Python sent X-Frame-Options: DENY; a static host cannot).
  if (window.top !== window.self) {
    mount(h("a", { class: "btn primary", href: location.href, target: "_top", rel: "noopener", text: T[lang].open }));
    return;
  }
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const seg = path.split("/").filter(Boolean);
  let id = "";
  try {
    id = seg[1] ? decodeURIComponent(seg[1]) : "";
  } catch {
    id = "";
  }
  if (seg.length === 2 && (seg[0] === "p" || seg[0] === "r")) return shortLink(seg[0], id);
  if (seg.length === 2 && seg[0] === "l") return livePage(id);
  if (path === "/go" || path === "/go.html") return goPage();
  if (path === "/open" || path === "/open.html") return openPage();
  if (path === "/" || path === "/index.html") return renderLanding(pageModel({ ...base, seg: "" }));
  return renderLanding(pageModel({ ...base, seg: "", state: "not_found" }));
}

main();
