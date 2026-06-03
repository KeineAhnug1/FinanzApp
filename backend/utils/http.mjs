// @ts-check

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} statusCode
 * @param {unknown} payload
 * @param {Record<string, string>} [extraHeaders]
 */
export function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    // Very strict CSP for JSON responses; static HTML has its own CSP in server
    "Content-Security-Policy": "default-src 'none'",
    ...extraHeaders
  });
  res.end(body);
}

/**
 * Add basic security headers for static HTML responses.
 * @param {import('node:http').ServerResponse} res
 */
export function applySecurityHeadersForHtml(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  // CSP allows self assets and images/data for logos; adjust if needed
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'"
  ].join("; ");
  res.setHeader("Content-Security-Policy", csp);
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()\n");
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [maxBytes]
 * @returns {Promise<Record<string, unknown>>}
 */
export function readBody(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let totalBytes = 0;
    req.on("data", (/** @type {Buffer} */ chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

import { badRequest } from "../helpers/responses.mjs";

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ maxBytes?: number; tooLargeMessage?: string }} [options]
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function parseBody(req, res, options = {}) {
  try {
    return await readBody(req, options.maxBytes);
  } catch (/** @type {unknown} */ error) {
    const err = /** @type {Error} */ (error);
    if (err.message === "payload_too_large") sendJson(res, 413, { ok: false, message: options.tooLargeMessage || "Payload too large" });
    else badRequest(res, "Invalid JSON body");
    return null;
  }
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {Record<string, string>}
 */
export function parseCookies(req) {
  const raw = String(req.headers.cookie || "");
  /** @type {Record<string, string>} */
  const out = {};
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    out[k] = decodeURIComponent(rest.join("=") || "");
  }
  return out;
}
