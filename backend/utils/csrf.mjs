// @ts-check
import { parseCookies } from "./http.mjs";

/** @param {string | undefined} m */
export function isStateChangingMethod(m) {
  const method = (m || "").toUpperCase();
  return method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE";
}

/**
 * Double-submit CSRF check: compare x-csrf-token header with csrf_token cookie.
 * @param {Request} request
 * @returns {boolean}
 */
export function checkCsrf(request) {
  const cookies = parseCookies(request);
  const cookieToken = cookies["csrf_token"] || "";
  const headerToken = request.headers.get("x-csrf-token") || "";
  return !!(cookieToken && headerToken && cookieToken === headerToken);
}
