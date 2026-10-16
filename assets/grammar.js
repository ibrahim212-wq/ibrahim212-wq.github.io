// web/links/assets/grammar.js — everything the landing pages compute, with no DOM: the stateless /go reader, the
// "Open in RouteMind" / intent / store URLs, the Google / Apple / Waze twins, the page strings (English + Egyptian
// Arabic) and the two page models. A browser copy of routemind-backend's services/link_grammar.py and the page
// half of api/links.py (the Edge function keeps the server half: supabase/functions/api/links/grammar.ts).
//
// Checked against the Python reference by supabase/functions/api/tests/links_web.test.ts, which replays
// tests/fixtures/diff_links.json (written by tests/diff_links.py) through this file.
//
// Plain ES module (no build step): app.js imports it in the browser, the tests import it in Node.

// ── Python's str / float semantics, as far as a query string needs them ─────────────────────────────────────

/** Python's str.isspace() set (str.strip() with no argument). */
const WS = new Set([
  "\t", "\n", "\x0B", "\x0C", "\r", "\x1C", "\x1D", "\x1E", "\x1F", " ", "\x85", "\xA0", " ", " ",
  " ", " ", " ", " ", " ", " ", " ", " ", " ", " ", " ",
  " ", " ", " ", "　",
]);

export function pyStrip(s) {
  const cps = Array.from(s);
  let a = 0;
  let b = cps.length;
  while (a < b && WS.has(cps[a])) a++;
  while (b > a && WS.has(cps[b - 1])) b--;
  return cps.slice(a, b).join("");
}

/** s[:n] in code points. */
export function cpSlice(s, n) {
  const cps = Array.from(s);
  return cps.length <= n ? s : cps.slice(0, n).join("");
}

/** Every Unicode decimal digit → its ASCII digit (Python's float() reads them all). */
function asciiDigits(s) {
  let out = "";
  for (const ch of s) {
    if (/^\p{Nd}$/u.test(ch)) {
      const cp = ch.codePointAt(0);
      let k = 0;
      while (k < 200 && /^\p{Nd}$/u.test(String.fromCodePoint(cp - k - 1))) k++;
      out += String(k % 10);
    } else out += ch;
  }
  return out;
}

const FLOAT_LIT = /^[+-]?(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?$/;

/** float(x) for a string or a JSON number; throws where Python raises. */
export function pyFloat(x) {
  if (typeof x === "boolean") return x ? 1 : 0;
  if (typeof x === "number") return x;
  if (typeof x !== "string") throw new TypeError("float() argument must be a string or a real number");
  const s = asciiDigits(pyStrip(x));
  const m = /^([+-]?)(inf|infinity|nan)$/.exec(s.toLowerCase());
  if (m) return m[2] === "nan" ? NaN : m[1] === "-" ? -Infinity : Infinity;
  if (!FLOAT_LIT.test(s)) throw new RangeError(`could not convert string to float: '${x}'`);
  return Number(s.replaceAll("_", ""));
}

/** str(x) of what a link field may hold. */
function str(x) {
  if (x === null || x === undefined) return "None";
  if (typeof x === "string") return x;
  if (typeof x === "boolean") return x ? "True" : "False";
  return String(x);
}

/** Python truthiness: an empty list / dict is false. */
export function truthy(x) {
  if (Array.isArray(x)) return x.length > 0;
  if (x && typeof x === "object") return Object.keys(x).length > 0;
  return !!x;
}

const isDict = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/** format(x, ".6f") — correctly rounded, ties to even on the exact binary value (toFixed rounds ties up). */
export function fixed6(x) {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  const neg = x < 0 || Object.is(x, -0);
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, Math.abs(x));
  const hi = dv.getUint32(0);
  const lo = dv.getUint32(4);
  const expBits = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let exp;
  if (expBits === 0) exp = -1074;
  else {
    mant |= 1n << 52n;
    exp = expBits - 1075;
  }
  const scale = 10n ** 6n;
  let q;
  if (exp >= 0) q = mant * scale * (1n << BigInt(exp));
  else {
    const num = mant * scale;
    const den = 1n << BigInt(-exp);
    q = num / den;
    const r2 = (num % den) * 2n;
    if (r2 > den || (r2 === den && q % 2n === 1n)) q += 1n;
  }
  let s = q.toString().padStart(7, "0");
  s = s.slice(0, s.length - 6) + "." + s.slice(s.length - 6);
  return (neg ? "-" : "") + s;
}

// ── the grammar (services/link_grammar.py) ───────────────────────────────────────────────────────────────────

export const MAX_LABEL = 120;
export const MAX_QUERY = 200;

export function validPoint(lat, lng) {
  let la;
  let lo;
  try {
    la = pyFloat(lat);
    lo = pyFloat(lng);
  } catch {
    return null;
  }
  if (Number.isNaN(la) || Number.isNaN(lo)) return null;
  if (!(-90 <= la && la <= 90 && -180 <= lo && lo <= 180)) return null;
  return [la, lo];
}

const BIDI = /[​-‏‪-‮⁠-⁤⁦-⁩﻿]/gu;

export function cleanText(v, limit) {
  if (v === null || v === undefined) return null;
  const s = pyStrip(str(v).replaceAll("\r", " ").replaceAll("\n", " ")).replace(BIDI, "");
  return s ? cpSlice(s, limit) : null;
}

/** 6 decimals, trailing zeros trimmed — the canonical human form. */
export function fmt(v) {
  const s = fixed6(v).replace(/0+$/, "").replace(/\.+$/, "");
  return s !== "" && s !== "-0" ? s : "0";
}

function pair(s) {
  if (!s) return null;
  const parts = s.split(",");
  if (parts.length !== 2) return null;
  return validPoint(pyStrip(parts[0]), pyStrip(parts[1]));
}

const pt2 = (p) => ({ lat: p[0], lng: p[1] });
const MODES = new Map([["drive", "driving"], ["walk", "walking"], ["bike", "cycling"], ["transit", "transit"]]);

/** The query as Starlette handed it over: keys lower-cased, the LAST value of a repeated key. */
export function queryDict(search) {
  const q = Object.create(null);
  for (const [k, v] of new URLSearchParams(search)) q[k.toLowerCase()] = v;
  return q;
}

/** Mirror of RouteMindLink.parse for the https /go form (services/link_grammar.py link_from_go_params). */
export function linkFromGoParams(q) {
  const get = (k) => (Object.prototype.hasOwnProperty.call(q, k) ? q[k] : undefined);
  const kind = get("kind");
  const nav = ["1", "true", "yes"].includes(get("nav"));
  let out;
  if (kind === "route" || get("d") !== undefined) {
    const d = get("d") || get("dest") || get("destination");
    if (!d) return null;
    const stop = (v, name) => {
      const p = pair(v);
      const s = p ? { point: pt2(p) } : { query: cleanText(v, MAX_QUERY) || "" };
      const n = cleanText(name, MAX_LABEL);
      if (n) s.label = n;
      return s;
    };
    out = { kind: "route", destination: stop(d, get("dn")) };
    const o = get("o") || get("origin");
    if (o) out.origin = stop(o, get("on"));
    const w = (get("w") || "").split("|").filter((x) => pyStrip(x) !== "");
    const wn = (get("wn") || "").split("|");
    if (w.length) out.waypoints = w.slice(0, 25).map((x, i) => stop(x, i < wn.length ? wn[i] : null));
    const mode = MODES.get(get("mode") || "");
    if (mode) out.profile = mode;
  } else if (kind === "q" || get("text") !== undefined) {
    const t = cleanText(get("text") || get("q"), MAX_QUERY);
    if (!t && !get("pid")) return null;
    out = { kind: "query", query: t || "" };
    if (get("pid")) out.placeId = get("pid");
    const near = pair(get("near"));
    if (near) out.near = pt2(near);
  } else {
    const p = validPoint(get("lat"), get("lng")) || pair(get("ll"));
    const name = cleanText(get("name") || get("n"), MAX_LABEL);
    if (!p) {
      if (!name) return null;
      out = { kind: "query", query: name };
    } else if (name || get("addr") || get("pid")) {
      out = { kind: "place", point: pt2(p), label: name || "" };
      const addr = cleanText(get("addr") || get("address"), MAX_QUERY);
      if (addr) out.address = addr;
      if (get("pid")) out.placeId = get("pid");
    } else {
      out = { kind: "coordinate", point: pt2(p) };
      try {
        const z = pyFloat(get("z") || "");
        if (0 < z && z <= 24) out.zoom = z;
      } catch {
        // no zoom
      }
    }
  }
  out.source = "routemind";
  if (nav) out.navigate = true;
  return out;
}

/** The point a link is about (the destination for routes). */
export function linkPoint(link) {
  if (!isDict(link)) return null;
  if (link.kind === "coordinate" || link.kind === "place") {
    const p = isDict(link.point) ? link.point : {};
    return validPoint(p.lat, p.lng);
  }
  if (link.kind === "route") {
    const d = isDict(link.destination) ? link.destination : {};
    const p = isDict(d.point) ? d.point : {};
    return validPoint(p.lat, p.lng);
  }
  return null;
}

export function linkTitle(link, lang = "en") {
  if (link.kind === "place" && truthy(link.label)) return str(link.label);
  if (link.kind === "query" && truthy(link.query)) return str(link.query);
  if (link.kind === "route") {
    const d = isDict(link.destination) ? link.destination : {};
    if (truthy(d.label)) return str(d.label);
    if (truthy(d.query)) return str(d.query);
    return lang !== "ar" ? "Route" : "مسار";
  }
  if (truthy(link.hintLabel)) return str(link.hintLabel);
  return lang !== "ar" ? "Shared location" : "مكان اتبعتلك";
}

// ── URLs (urllib.parse.quote / quote_plus / urlencode) ───────────────────────────────────────────────────────

const ALWAYS_SAFE = new Set(Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.-~"));
const UTF8 = new TextEncoder();

export function quote(s, safe = "/") {
  const extra = new Set(Array.from(safe));
  let out = "";
  for (const ch of s) {
    if (ALWAYS_SAFE.has(ch) || extra.has(ch)) {
      out += ch;
      continue;
    }
    for (const b of UTF8.encode(ch)) out += "%" + b.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

export const quotePlus = (s) => quote(s, " ").replaceAll(" ", "+");

export function urlencode(params) {
  return Object.entries(params).map(([k, v]) => `${quotePlus(k)}=${quotePlus(String(v))}`).join("&");
}

/** routemind://v1/place|route|q?<this> for a stateless link (api/links.py _go_params). */
export function goParams(link) {
  const p = linkPoint(link);
  let out = {};
  if ((link.kind === "coordinate" || link.kind === "place") && p) {
    out = { lat: fmt(p[0]), lng: fmt(p[1]) };
    if (truthy(link.label)) out.name = str(link.label);
    if (truthy(link.address)) out.addr = str(link.address);
  } else if (link.kind === "query") {
    out = { text: str(link.query ?? "") };
  } else if (link.kind === "route") {
    const stop = (s) => (isDict(s.point) ? `${fmt(s.point.lat)},${fmt(s.point.lng)}` : str(s.query || ""));
    out = { d: stop(link.destination) };
    if (truthy(link.destination.label)) out.dn = str(link.destination.label);
    if (truthy(link.origin)) out.o = stop(link.origin);
    if (truthy(link.waypoints)) out.w = link.waypoints.map(stop).join("|");
    if (truthy(link.profile)) {
      out.mode = { driving: "drive", walking: "walk", cycling: "bike", transit: "transit" }[link.profile];
    }
  }
  if (truthy(link.navigate)) out.nav = "1";
  return out;
}

/** The Google / Apple / Waze twins (api/links.py _external_urls — the shapes the app's ShareComposer emits). */
export function externalUrls(link) {
  const p = linkPoint(link);
  if (!p) {
    const q = str(link.query || link.label || "");
    return {
      google: "https://www.google.com/maps/search/?" + urlencode({ api: "1", query: q }),
      apple: "https://maps.apple.com/?" + urlencode({ q }),
      waze: "https://waze.com/ul?" + urlencode({ q, navigate: "yes" }),
    };
  }
  const ll = `${fmt(p[0])},${fmt(p[1])}`;
  if (link.kind === "route") {
    const travel = { walking: "walking", cycling: "bicycling", transit: "transit" };
    const g = {
      api: "1", destination: ll,
      travelmode: Object.prototype.hasOwnProperty.call(travel, link.profile || "") ? travel[link.profile] : "driving",
    };
    const o = isDict(link.origin) && isDict(link.origin.point) ? link.origin.point : null;
    if (o) g.origin = `${fmt(o.lat)},${fmt(o.lng)}`;
    const wps = (Array.isArray(link.waypoints) ? link.waypoints : []).filter((w) => truthy(w.point)).map((w) => w.point);
    if (wps.length) g.waypoints = wps.map((w) => `${fmt(w.lat)},${fmt(w.lng)}`).join("|");
    const a = { daddr: ll, dirflg: link.profile === "walking" ? "w" : "d" };
    if (o) a.saddr = g.origin;
    return {
      google: "https://www.google.com/maps/dir/?" + urlencode(g),
      apple: "https://maps.apple.com/?" + urlencode(a),
      waze: "https://waze.com/ul?" + urlencode({ ll, navigate: "yes" }),
    };
  }
  const name = truthy(link.label) ? str(link.label) : "";
  return {
    google: "https://www.google.com/maps/search/?" + urlencode({ api: "1", query: ll }),
    apple: "https://maps.apple.com/?" + urlencode(name ? { ll, q: name } : { ll }),
    waze: "https://waze.com/ul?" + urlencode({ ll, navigate: "yes" }),
  };
}

// ── store / app URLs (from config.js) ────────────────────────────────────────────────────────────────────────

export function playStoreUrl(linkId, cfg) {
  const base = cfg.playStoreUrl || `https://play.google.com/store/apps/details?id=${cfg.androidPackage}`;
  if (linkId) return `${base}&referrer=${quote(urlencode({ utm_source: "routemind_link", link: linkId }), "")}`;
  return base;
}

export function appStoreUrl(cfg) {
  if (cfg.appStoreUrl) return cfg.appStoreUrl;
  return cfg.appStoreId ? `https://apps.apple.com/app/id${cfg.appStoreId}` : "";
}

/** Android Chrome / Custom Tabs open the app through intent:// — with the Play page (and the deferred-link
 *  referrer) as the fallback when it is not installed. */
export function intentUrl(appUrl, linkId, cfg) {
  if (!appUrl.startsWith("routemind://")) return null;
  const rest = appUrl.slice("routemind://".length);
  return `intent://${rest}#Intent;scheme=routemind;package=${cfg.androidPackage};` +
    `S.browser_fallback_url=${quote(playStoreUrl(linkId, cfg), "")};end`;
}

export function previewUrl(cfg, p) {
  const base = `${cfg.apiBase.replace(/\/+$/, "")}/api/link-preview.png`;
  return p ? `${base}?${urlencode({ lat: fmt(p[0]), lng: fmt(p[1]) })}` : base;
}

/** Schemes a wrapped /open?u=… link may carry (api/links.py OPEN_SCHEMES). */
export const OPEN_SCHEMES = ["http://", "https://", "geo:", "waze:", "comgooglemaps:", "maps:", "om:", "ge0:",
  "yandexmaps:", "yandexnavi:", "dgis:", "here-location:", "here-route:", "osmandmaps:", "google.navigation:"];

export function openTarget(u) {
  const s = pyStrip(u || "");
  if (!OPEN_SCHEMES.some((p) => s.toLowerCase().startsWith(p)) || s.length > 2048) return null;
  return s;
}

// ── words ────────────────────────────────────────────────────────────────────────────────────────────────────

export const T = {
  en: {
    open: "Open in RouteMind", get: "Get RouteMind", google: "Google Maps", apple: "Apple Maps",
    waze: "Waze", copy: "Copy coordinates", copied: "Copied", shared: "Shared location",
    via: "via {n} stops", route: "Route", tag: "Smart traffic navigation for Cairo & Giza",
    no_app: "Don't have the app yet?", opening: "Opening RouteMind…", still: "Still here? Install RouteMind:",
    live: "Live trip", arriving: "Arriving in {m} min", updated: "Updated {s}s ago", ended: "This trip has ended.",
    waiting: "Waiting for the first position…", heading: "Heading to {d}", unavailable: "This link is no longer available.",
  },
  ar: {
    open: "افتح في RouteMind", get: "نزّل RouteMind", google: "جوجل مابس", apple: "آبل مابس",
    waze: "ويز", copy: "نسخ الإحداثيات", copied: "اتنسخ", shared: "مكان اتبعتلك",
    via: "عن طريق {n} محطات", route: "مسار", tag: "ملاحة ذكية بالمرور للقاهرة والجيزة",
    no_app: "لسه منزّلتش التطبيق؟", opening: "بنفتح RouteMind…", still: "لسه هنا؟ نزّل RouteMind:",
    live: "رحلة لايف", arriving: "هيوصل بعد {m} دقيقة", updated: "اتحدّث من {s} ثانية", ended: "الرحلة دي خلصت.",
    waiting: "مستنيين أول موقع…", heading: "رايح {d}", unavailable: "اللينك ده مبقاش شغال.",
  },
};

const STATE_TITLES = {
  en: { expired: "This link has expired", revoked: "The sender removed this link", not_found: "Link not found" },
  ar: { expired: "اللينك ده انتهى", revoked: "اللي بعت اللينك لغاه", not_found: "اللينك مش موجود" },
};

export function stateTitle(state, lang) {
  return STATE_TITLES[lang][state] ?? "RouteMind";
}

export function stateText(state, lang) {
  return `${stateTitle(state, lang)} · ${T[lang].unavailable}`;
}

export const FOOT = { en: "Cairo & Giza", ar: "القاهرة والجيزة" };

/** `?lang=ar|en`, else Arabic when the browser's languages name it anywhere (the Accept-Language rule). */
export function pickLang(qLang, languages) {
  const q = (qLang || "").toLowerCase();
  if (q === "ar" || q === "en") return q;
  const al = (languages || []).join(",").toLowerCase();
  return al.startsWith("ar") || al.includes(",ar") || al.includes(" ar") ? "ar" : "en";
}

// ── the page models ──────────────────────────────────────────────────────────────────────────────────────────

/** What landing.html rendered, for a place / route / go / open / not-found page (api/links.py _render). */
export function pageModel({ link = null, linkId = null, seg, state = null, wrappedUrl = null, lang, cfg, origin, href }) {
  const t = T[lang];
  const p = link ? linkPoint(link) : null;
  let appUrl;
  if (linkId) appUrl = `routemind://v1/${seg}/${linkId}`;
  else if (wrappedUrl) appUrl = "routemind://v1/open?" + urlencode({ u: wrappedUrl });
  else if (link) {
    const k = link.kind === "route" ? "route" : link.kind === "query" ? "q" : "place";
    appUrl = `routemind://v1/${k}?` + urlencode(goParams(link));
  } else appUrl = "routemind://v1/place";
  return {
    lang, rtl: lang === "ar", t,
    title: link ? linkTitle(link, lang) : state ? stateTitle(state, lang) : "RouteMind",
    address: link && link.kind === "place" && truthy(link.address) ? str(link.address) : null,
    coords: p ? `${fmt(p[0])}, ${fmt(p[1])}` : "",
    lat: p ? fmt(p[0]) : "", lng: p ? fmt(p[1]) : "",
    via: link && link.kind === "route" ? (Array.isArray(link.waypoints) ? link.waypoints.length : 0) : 0,
    state, stateText: state ? stateText(state, lang) : "",
    pageUrl: linkId ? `${origin}/${seg}/${linkId}` : href,
    appUrl, intentUrl: intentUrl(appUrl, linkId, cfg),
    playUrl: playStoreUrl(linkId, cfg), appStoreUrl: appStoreUrl(cfg), appStoreId: cfg.appStoreId || "",
    ogImage: previewUrl(cfg, p),
    ext: link ? externalUrls(link) : null,
    kind: link ? link.kind : null, wrappedUrl,
    foot: FOOT[lang],
  };
}

/** What live.html rendered for /l/<id> (api/links.py landing_live). `view` = GET /api/live/<id>, or null. */
export function liveModel({ view = null, liveId, lang, cfg, origin }) {
  const t = T[lang];
  const dest = view && isDict(view.destination) ? view.destination : null;
  const d = dest ? linkPoint(dest) : null;
  const destTitle = dest ? linkTitle(dest, lang) : "";
  return {
    lang, rtl: lang === "ar", t, liveId,
    title: (view && truthy(view.label) && str(view.label)) || t.live,
    destTitle, heading: destTitle ? t.heading.replace("{d}", destTitle) : "",
    destLat: d ? fmt(d[0]) : "", destLng: d ? fmt(d[1]) : "",
    found: view !== null, ended: !!(view && view.ended),
    pageUrl: `${origin}/l/${liveId}`, appUrl: `routemind://v1/live/${liveId}`,
    googleUrl: d ? `https://www.google.com/maps/search/?api=1&query=${fmt(d[0])},${fmt(d[1])}` : null,
    playUrl: playStoreUrl(null, cfg), appStoreUrl: appStoreUrl(cfg), appStoreId: cfg.appStoreId || "",
    ogImage: `${cfg.apiBase.replace(/\/+$/, "")}/api/link-preview.png?` +
      (d ? urlencode({ lat: fmt(d[0]), lng: fmt(d[1]) }) : ""),
    foot: FOOT[lang],
  };
}

/** The live viewer's lines for one GET /api/live/<id> answer (live.html's tick()). */
export function liveTick(v, lang, nowMs) {
  const t = T[lang];
  if (v.ended) return { stop: true, eta: t.ended, pill: t.ended };
  if (v.position && v.position.lat != null) {
    const m = v.eta_seconds != null ? Math.round(v.eta_seconds / 60) : null;
    const eta = m != null ? t.arriving.replace("{m}", String(m))
      : `${Number(v.position.lat).toFixed(5)}, ${Number(v.position.lng).toFixed(5)}`;
    let updated = "";
    if (v.position.updated_at) {
      const s = Math.max(0, Math.round((nowMs - Date.parse(v.position.updated_at)) / 1000));
      updated = t.updated.replace("{s}", String(s));
    }
    return { stop: false, eta, updated, lat: Number(v.position.lat), lng: Number(v.position.lng) };
  }
  return { stop: false, eta: t.waiting };
}

/** Metres between two points (the viewer only asks for a new map image once the car has really moved). */
export function metres(a, b) {
  const r = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
