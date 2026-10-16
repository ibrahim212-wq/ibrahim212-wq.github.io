// web/links/config.js — THE one place the landing pages learn where RouteMind's API lives (and the store ids).
//
// apiBase = the same base the app uses (lib/core/config/backend_config.dart: public.app_config 'backend' →
// api_base, else <SUPABASE_URL>/functions/v1). The pages call <apiBase>/api/links/<id>, <apiBase>/api/live/<id> and
// <apiBase>/api/link-preview.png — answered by the Supabase Edge Function `api` (supabase/functions/api/links/).
// Everything here is public by design: no key, no token.
window.ROUTEMIND_LINKS = Object.freeze({
  apiBase: "https://mldsninoxerbmecojztr.supabase.co/functions/v1",
  androidPackage: "com.routemind.app",
  // "" = https://play.google.com/store/apps/details?id=<androidPackage>
  playStoreUrl: "",
  // The numeric App Store id once the listing exists (turns on "App Store" and Safari's Smart App Banner).
  appStoreId: "",
  appStoreUrl: "",
});
