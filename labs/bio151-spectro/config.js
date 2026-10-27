// BIO 151 Live Lab — client configuration.
// These values are public by design (the Supabase "publishable" key only reaches
// the PIN-checked lab_* RPC functions; see sql/001_livelab.sql). No secrets here.
window.LAB_CONFIG = {
  SUPABASE_URL: "https://efxymeviokaocosmpqwf.supabase.co",
  SUPABASE_KEY: "sb_publishable_xoPXCFR7FN5X6as1E1tYAg_bmSpYMHE",
  // Default experiment. Override on either page with ?exp=<slug>.
  EXPERIMENT_SLUG: "bio151-chlorophyll",
  // Stable URL that the printed QR code points at.
  STUDENT_FORM_URL: "https://justin83.github.io/biology-at-scc/labs/bio151-spectro/",
  // Dashboard auto-refresh interval (seconds). Student form re-syncs at the same cadence.
  REFRESH_SECONDS: 12
};
