// @ts-check
// Web Fetch API utils (Cloudflare Workers / Pages Functions)

/**
 * @param {unknown} payload
 * @param {number} [status]
 * @param {Record<string, string | string[]>} [extraHeaders]
 * @returns {Response}
 */
export function jsonResponse(payload, status = 200, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Security-Policy": "default-src 'none'",
  });
  for (const [key, value] of Object.entries(extraHeaders)) {
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }
  return new Response(body, { status, headers });
}

/**
 * @param {Request} request
 * @param {number} [maxBytes]
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function parseBody(request, maxBytes = 1_000_000) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxBytes) return null;

  const arrayBuffer = await request.arrayBuffer();
  if (arrayBuffer.byteLength > maxBytes) return null;

  const raw = new TextDecoder().decode(arrayBuffer);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {Request} request
 * @returns {Record<string, string>}
 */
export function parseCookies(request) {
  const raw = request.headers.get("cookie") || "";
  /** @type {Record<string, string>} */
  const out = {};
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(rest.join("=") || "");
    } catch {
      out[k] = rest.join("=") || "";
    }
  }
  return out;
}

/**
 * Legacy compatibility: same signature as old sendJson but returns a Response.
 * @param {unknown} _res - ignored, kept for call-site compat during migration
 * @param {number} statusCode
 * @param {unknown} payload
 * @param {Record<string, string | string[]>} [extraHeaders]
 * @returns {Response}
 */
export function sendJson(_res, statusCode, payload, extraHeaders = {}) {
  return jsonResponse(payload, statusCode, extraHeaders);
}
