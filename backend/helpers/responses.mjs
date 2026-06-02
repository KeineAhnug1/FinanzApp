// @ts-check
import { sendJson } from "../utils/http.mjs";

/** @param {import('node:http').ServerResponse} res @param {string} message */
export function badRequest(res, message) { return sendJson(res, 400, { ok: false, message }); }
/** @param {import('node:http').ServerResponse} res @param {string} message */
export function unauthorized(res, message) { return sendJson(res, 401, { ok: false, message }); }
/** @param {import('node:http').ServerResponse} res @param {string} message */
export function forbidden(res, message) { return sendJson(res, 403, { ok: false, message }); }
/** @param {import('node:http').ServerResponse} res @param {string} message */
export function notFound(res, message) { return sendJson(res, 404, { ok: false, message }); }
/** @param {import('node:http').ServerResponse} res @param {string} message */
export function conflict(res, message) { return sendJson(res, 409, { ok: false, message }); }
