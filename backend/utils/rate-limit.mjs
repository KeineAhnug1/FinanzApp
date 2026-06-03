// @ts-check

const TRUST_PROXY = process.env.TRUST_PROXY === "true";

/**
 * @param {import('node:http').IncomingMessage} req
 * @returns {string}
 */
export function getClientIp(req) {
  if (TRUST_PROXY) {
    const cfIp = req.headers["cf-connecting-ip"];
    if (cfIp) return String(cfIp).split(",")[0].trim();
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) return String(forwarded).split(",")[0].trim();
    const realIp = req.headers["x-real-ip"];
    if (realIp) return String(realIp).split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

/** @type {Map<string, { windowStart: number; count: number }>} */
const _rateLimitBuckets = new Map();

/**
 * @param {http.ServerResponse} res
 * @param {string} key
 * @param {number} maxAttempts
 * @param {number} windowMs
 * @returns {boolean}
 */
export function rateLimitBucket(res, key, maxAttempts, windowMs) {
  const { sendJson } = _sendJsonRef;
  if (!sendJson) throw new Error("Rate limiter not initialized");
  const now = Date.now();
  let rec = _rateLimitBuckets.get(key);
  if (!rec || now - rec.windowStart > windowMs) {
    rec = { windowStart: now, count: 0 };
  }
  rec.count++;
  _rateLimitBuckets.set(key, rec);
  if (rec.count > maxAttempts) {
    const retryAfter = Math.ceil((rec.windowStart + windowMs - now) / 1000);
    sendJson(res, 429, { ok: false, message: "Zu viele Anfragen. Bitte warte kurz und versuche es erneut." },
      { "Retry-After": String(retryAfter) });
    return false;
  }
  return true;
}

/** @type {{ sendJson: ((res: import('node:http').ServerResponse, status: number, payload: unknown, headers?: Record<string,string>) => void) | null }} */
const _sendJsonRef = { sendJson: null };

/**
 * @param {(res: import('node:http').ServerResponse, status: number, payload: unknown, headers?: Record<string,string>) => void} sendJsonFn
 */
export function initRateLimiter(sendJsonFn) {
  _sendJsonRef.sendJson = sendJsonFn;
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ maxAttempts?: number; windowMs?: number; group?: string }} [options]
 * @returns {boolean}
 */
export function checkRateLimit(req, res, { maxAttempts = 10, windowMs = 60_000, group = "general" } = {}) {
  const ip = getClientIp(req);
  return rateLimitBucket(res, `${group}:${ip}`, maxAttempts, windowMs);
}

setInterval(() => {
  const cutoff = Date.now() - 300_000;
  for (const [key, rec] of _rateLimitBuckets) {
    if (rec.windowStart < cutoff) _rateLimitBuckets.delete(key);
  }
}, 120_000).unref();
