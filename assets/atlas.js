// web/links/assets/atlas.js — the Atlas landing page (/go/atlas?c=…|j=…|g=…|i=…, docs/atlas-v2-brief.md D5): what a
// person sees when they tap a friend's Atlas link. Pure (no DOM): app.js renders the model with the same card as every
// other link page.
//
// GitHub Pages has no file at /go/atlas, so it serves 404.html — the same shell — and app.js routes on the path (like
// /p/<id>). The App Links / Universal Links paths already cover it (/go prefix on Android, /go/* in the AASA).
//
// Open in RouteMind = routemind://v1/atlas?<same parameter> (RouteMindLink.atlas in the app). Not installed: Android's
// intent:// falls back to Play WITH the link in the install referrer (`atlaslink=`, read once by
// InboundCoordinator.start); iOS copies the routemind:// URL before sending to the App Store, and the app's clipboard
// chip offers it on the first launch (the deep-link system's existing rules). Nothing a link carries is ever HTML.

import { appStoreUrl, FOOT, previewUrl, quote, T, urlencode } from "./grammar.js";

/** The unambiguous alphabet of every Atlas code (the server's atlas_code(); no 0 O 1 I L). */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const COMPARE_RE = /^[A-Za-z0-9_-]{8,4000}$/;

/** A typed / linked code: upper-cased, spaces and dashes dropped; null unless `len` alphabet characters. */
export function normalizeCode(raw, len) {
  const s = String(raw || "").toUpperCase().replace(/[\s-]/g, "");
  if (s.length !== len) return null;
  for (const ch of s) if (!CODE_ALPHABET.includes(ch)) return null;
  return s;
}

/** One Atlas action per link. Mixed and repeated actions are malformed. */
export function atlasAction(params) {
  if (["c", "j", "g", "i"].reduce((n, key) => n + params.getAll(key).length, 0) > 1) return null;
  const get = (k) => (params.has(k) ? params.get(k) : null);
  const c = get("c");
  if (c !== null) return COMPARE_RE.test(c) ? { kind: "compare", key: "c", value: c } : null;
  for (const [key, kind, len] of [["j", "join", 8], ["g", "gift", 10], ["i", "invite", 8]]) {
    const v = get(key);
    if (v === null) continue;
    const code = normalizeCode(v, len);
    return code ? { kind, key, value: code } : null;
  }
  return { kind: "open", key: null, value: "" };
}

export const ATLAS_T = {
  en: {
    tag: "Atlas · unveil Egypt by going there",
    open: { title: "Atlas — unveil Egypt", sub: "Egypt is under a haze; every real trip lifts it. Open Masar to play." },
    compare: { title: "Compare our maps of Egypt", sub: "Open it in Masar to see which areas each of us has explored." },
    join: { title: "Join my Atlas group", sub: "Explore Egypt with friends and see who unveils the most each week." },
    gift: { title: "A sticker gift for you", sub: "Open Atlas to review the gift." },
    invite: { title: "Explore Egypt with me", sub: "Open Atlas to review the invitation and reward details." },
  },
  ar: {
    tag: "أطلس · اكشف مصر وإنت رايح فيها",
    open: { title: "أطلس — اكشف مصر", sub: "مصر متغطية بالشبّورة، وكل مشوار بجد بيكشفها. افتح مسار والعب." },
    compare: { title: "قارن خريطتك لمصر بخريطتي", sub: "افتحه في مسار وشوف مين فينا لفّ أماكن أكتر." },
    join: { title: "دعوة لشلة في أطلس", sub: "افتح أطلس وراجع الدعوة. ترتيب الشلة للأعضاء بس." },
    gift: { title: "ستيكر هدية من صاحبك", sub: "افتح أطلس عشان تشوف الهدية." },
    invite: { title: "دعوة لاكتشاف مصر سوا", sub: "افتح أطلس وراجع الدعوة وشروط ستيكر «رفيق»." },
  },
};

/** Play with the Atlas link in the install referrer (InboundCoordinator reads `atlaslink`). */
export function atlasPlayUrl(action, cfg) {
  const base = cfg.playStoreUrl || `https://play.google.com/store/apps/details?id=${cfg.androidPackage}`;
  if (!action || !action.key) return base;
  const ref = urlencode({ utm_source: "routemind_link", atlaslink: urlencode({ [action.key]: action.value }) });
  return `${base}&referrer=${quote(ref, "")}`;
}

export function atlasAppUrl(action) {
  return action && action.key ? `routemind://v1/atlas?${urlencode({ [action.key]: action.value })}` : "routemind://v1/atlas";
}

/** The card for /go/atlas — the same shape as grammar.js pageModel, so app.js renders it unchanged. */
export function atlasModel({ search, lang, cfg, origin }) {
  const t = T[lang];
  const a = ATLAS_T[lang];
  const action = atlasAction(new URLSearchParams(search || ""));
  const appUrl = atlasAppUrl(action);
  const playUrl = atlasPlayUrl(action, cfg);
  const words = action ? a[action.kind] : null;
  return {
    lang, rtl: lang === "ar", t,
    title: words ? words.title : (lang === "ar" ? "اللينك مش موجود" : "Link not found"),
    address: words ? words.sub : null,
    coords: "", lat: "", lng: "", via: 0,
    state: action ? null : "not_found",
    stateText: action ? "" : t.unavailable,
    pageUrl: `${origin}/go/atlas`,
    previewAppUrl: atlasAppUrl(null),
    appUrl,
    intentUrl: `intent://${appUrl.slice("routemind://".length)}#Intent;scheme=routemind;package=${cfg.androidPackage};` +
      `S.browser_fallback_url=${quote(playUrl, "")};end`,
    playUrl, appStoreUrl: appStoreUrl(cfg), appStoreId: cfg.appStoreId || "",
    ogImage: previewUrl(cfg, null),
    ext: null, kind: "atlas", wrappedUrl: null,
    foot: FOOT[lang],
    tag: a.tag,
    action,
  };
}
