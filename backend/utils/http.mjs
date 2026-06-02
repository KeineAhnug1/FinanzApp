// @ts-check
import http from "node:http";

/**
 * @param {http.ServerResponse} res
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
    ...extraHeaders
  });
  res.end(body);
}

/**
 * @param {http.IncomingMessage} req
 * @returns {Promise<Record<string, unknown>>}
 */
export function readBody(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    let totalBytes = 0;
    req.on("data", (/** @type {Buffer} */ chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > 1_000_000) {
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
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function parseBody(req, res) {
  try {
    return await readBody(req);
  } catch (/** @type {unknown} */ error) {
    const err = /** @type {Error} */ (error);
    if (err.message === "payload_too_large") sendJson(res, 413, { ok: false, message: "Payload too large" });
    else badRequest(res, "Invalid JSON body");
    return null;
  }
}

/**
 * @param {http.IncomingMessage} req
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
