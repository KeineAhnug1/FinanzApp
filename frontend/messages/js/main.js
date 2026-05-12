/**
 * main.js – Entry point for the messages page.
 * Imports all modules and kicks off initialization.
 */
import "./user-search.js";
import "./chat.js";
import { init } from "./messages.js";

// ── Bootstrap ─────────────────────────────────────────────
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
