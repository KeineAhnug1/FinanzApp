// @ts-check
import { jsonResponse } from "../utils/http.mjs";

/** @param {string} message @returns {Response} */
export function badRequest(message) { return jsonResponse({ ok: false, message }, 400); }
/** @param {string} message @returns {Response} */
export function unauthorized(message) { return jsonResponse({ ok: false, message }, 401); }
/** @param {string} message @returns {Response} */
export function forbidden(message) { return jsonResponse({ ok: false, message }, 403); }
/** @param {string} message @returns {Response} */
export function notFound(message) { return jsonResponse({ ok: false, message }, 404); }
/** @param {string} message @returns {Response} */
export function conflict(message) { return jsonResponse({ ok: false, message }, 409); }
