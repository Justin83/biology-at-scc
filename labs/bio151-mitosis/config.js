// BIO 151 Mitosis Lab: client configuration.
// These values are public by design: the Supabase "publishable" key only reaches the
// mitosis_* database functions, which check a student's editing token or the instructor
// key themselves (see sql/001_mitosis.sql). No secrets here.
window.MITOSIS_CONFIG = {
  SUPABASE_URL: "https://efxymeviokaocosmpqwf.supabase.co",
  SUPABASE_KEY: "sb_publishable_xoPXCFR7FN5X6as1E1tYAg_bmSpYMHE",
  // This semester's experiment. Each semester gets its own (see docs/bio151-mitosis-lab/README.md).
  // Any page can show another one with ?exp=<slug>.
  EXPERIMENT_SLUG: "bio151-mitosis-2026fa",
  // Stable URL that the printed QR code points at (it never changes between semesters).
  STUDENT_FORM_URL: "https://biologyatscc.com/labs/bio151-mitosis/",
  // Classroom dashboard refresh interval (seconds).
  REFRESH_SECONDS: 12
};
