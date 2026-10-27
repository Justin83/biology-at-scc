// BIO 151 Live Lab — tiny client for the lab_* RPC functions.
// Every call is a POST to PostgREST's /rest/v1/rpc/<function> with a JSON body
// whose keys are the function's parameter names. Functions always return a JSON
// object with { ok: true, ... } or { ok: false, error: "<code>" }.
(function () {
  const CFG = window.LAB_CONFIG || {};

  const ERRORS = {
    not_found: "This experiment is not set up yet. Ask your instructor.",
    no_such_group: "That group does not exist.",
    pin_too_short: "Choose a PIN with at least 4 characters.",
    wrong_pin: "That PIN does not match this group's PIN. Check with your lab partner, or ask your instructor to reset it.",
    closed: "Data entry for this experiment has been closed by the instructor.",
    out_of_range: "One of the absorbance values is outside the range the instrument can read (-1 to 10).",
    bad_number: "One of the values is not a number. Use digits and a decimal point only.",
    bad_readings: "The readings could not be understood. Reload the page and try again.",
    unauthorized: "Instructor key not accepted.",
    confirm_required: "Confirmation text did not match.",
    empty_x_values: "Enter at least one wavelength.",
    unknown_action: "Unknown instructor action.",
    network: "Could not reach the server. Check your connection and try again."
  };

  function slugFromPage() {
    const q = new URLSearchParams(location.search).get("exp");
    return (q && /^[a-z0-9][a-z0-9-]{2,59}$/.test(q)) ? q : CFG.EXPERIMENT_SLUG;
  }

  async function rpc(fn, args) {
    let res;
    try {
      res = await fetch(`${CFG.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "apikey": CFG.SUPABASE_KEY,
          "Authorization": "Bearer " + CFG.SUPABASE_KEY
        },
        body: JSON.stringify(args || {})
      });
    } catch (e) {
      return { ok: false, error: "network", detail: String(e) };
    }
    let body = null;
    try { body = await res.json(); } catch (_) { /* fall through */ }
    if (!res.ok) {
      return { ok: false, error: "http_" + res.status, detail: body && (body.message || body.hint || JSON.stringify(body)) };
    }
    if (!body || typeof body !== "object") return { ok: false, error: "bad_response" };
    return body;
  }

  function errorText(r) {
    if (!r) return ERRORS.network;
    if (ERRORS[r.error]) return ERRORS[r.error];
    if (r.error && r.error.startsWith("http_")) return `Server error (${r.error.slice(5)})${r.detail ? ": " + r.detail : ""}`;
    return r.error || "Unknown error";
  }

  // Parse what a student typed into a number or null. Accepts "0.52", ".52", "1,2", " 0.5 ".
  function parseAbsorbance(text) {
    const t = String(text == null ? "" : text).trim().replace(",", ".");
    if (t === "") return { value: null };
    if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return { error: "not a number" };
    const v = Number(t);
    if (!Number.isFinite(v)) return { error: "not a number" };
    return { value: v };
  }

  function fmtTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.LabAPI = {
    slug: slugFromPage(),
    getExperiment: (slug) => rpc("lab_get_experiment", { p_slug: slug }),
    joinGroup: (slug, groupNumber, pin, members) => rpc("lab_join_group", { p_slug: slug, p_group_number: groupNumber, p_pin: pin, p_members: members || [] }),
    saveReadings: (slug, groupNumber, pin, readings, dilution, notes, leafType) => rpc("lab_save_readings", { p_slug: slug, p_group_number: groupNumber, p_pin: pin, p_readings: readings, p_dilution: dilution, p_notes: notes, p_leaf_type: leafType === undefined ? null : leafType }),
    dashboard: (slug) => rpc("lab_dashboard", { p_slug: slug }),
    instructor: (key, action, slug, payload) => rpc("lab_instructor", { p_key: key, p_action: action, p_slug: slug || null, p_payload: payload || {} }),
    errorText, parseAbsorbance, fmtTime, esc
  };
})();
