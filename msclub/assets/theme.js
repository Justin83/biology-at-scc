/* Club pages: light or dark. The pages follow the device's setting until someone picks one
   with the sun / moon button in the club bar (next to Officer tools). The choice is kept in
   this browser only (localStorage "club-theme") and set as <html data-theme="light|dark">,
   which club.css reads. Loaded in <head> without defer, so a saved choice is applied before
   the page is drawn (no flash of the other theme). */
(function () {
  "use strict";
  var KEY = "club-theme", root = document.documentElement;
  function saved() {
    try { var t = localStorage.getItem(KEY); return t === "light" || t === "dark" ? t : null; } catch (e) { return null; }
  }
  function system() { return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; }
  function current() { return root.getAttribute("data-theme") || system(); }

  var t = saved();
  if (t) root.setAttribute("data-theme", t);

  // the button says what it does next; aria-pressed = dark mode is on
  function sync() {
    var dark = current() === "dark";
    Array.prototype.forEach.call(document.querySelectorAll("[data-theme-toggle]"), function (b) {
      b.setAttribute("aria-pressed", String(dark));
      b.title = dark ? "Switch to light mode" : "Switch to dark mode";
      b.hidden = false; // hidden until this script runs, so it never shows without it
    });
  }
  function start() {
    sync();
    document.addEventListener("click", function (ev) {
      var b = ev.target.closest && ev.target.closest("[data-theme-toggle]");
      if (!b) return;
      var next = current() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* storage blocked: this page only */ }
      sync();
    });
    // no choice saved: keep the button in step if the device switches (e.g., at sunset)
    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)"), on = function () { if (!root.getAttribute("data-theme")) sync(); };
      if (mq.addEventListener) mq.addEventListener("change", on); else if (mq.addListener) mq.addListener(on);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
