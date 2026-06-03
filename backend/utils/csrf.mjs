// @ts-check
import { parseCookies, sendJson } from "./http.mjs";

/** @param {string | undefined} m */
export function isStateChangingMethod(m) {
  const method = (m || "").toUpperCase();
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

/**
 * Double-submit CSRF check: compare header x-csrf-token with csrf_token cookie.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {boolean}
 */
export function checkCsrf(req, res) {
  const cookies = parseCookies(req);
  const cookieToken = cookies["csrf_token"] || "";
  const headerToken = String(req.headers["x-csrf-token"] || "");
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    sendJson(res, 403, { ok: false, message: "CSRF token invalid or missing" });
    return false;
  }
  return true;
}

