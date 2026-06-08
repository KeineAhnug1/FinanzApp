// @ts-check
// Rate limiting (in-memory, Workers-kompatibel)

const TRUST_PROXY = typeof process !== "undefined" ? process.env.TRUST_PROXY === "true" : true;

/**
 * @param {Request} request
 * @returns {string}
 */
export function getClientIp(request) {
  if (TRUST_PROXY) {
    const cfIp = request.headers.get("cf-connecting-ip");
    if (cfIp) return cfIp.split(",")[0].trim();
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp.split(",")[0].trim();
  }
  return "unknown";
}

/** @type {Map<string, { windowStart: number; count: number }>} */
const _rateLimitBuckets = new Map();

/**
 * @param {string} key
 * @param {number} maxAttempts
 * @param {number} windowMs
 * @returns {boolean} true if allowed, false if rate limited
 */
export function rateLimitBucket(key, maxAttempts, windowMs) {
  const now = Date.now();
  let rec = _rateLimitBuckets.get(key);
  if (!rec || now - rec.windowStart > windowMs) {
    rec = { windowStart: now, count: 0 };
  }
  rec.count++;
  _rateLimitBuckets.set(key, rec);
  return rec.count <= maxAttempts;
}

/**
 * Returns null if allowed, or a 429 Response if rate limited.
 * @param {Request} request
 * @param {{ maxAttempts?: number; windowMs?: number; group?: string }} [options]
 * @returns {Response | null}
 */
export function checkRateLimit(request, { maxAttempts = 10, windowMs = 60_000, group = "general" } = {}) {
  const ip = getClientIp(request);
  const allowed = rateLimitBucket(`${group}:${ip}`, maxAttempts, windowMs);
  if (!allowed) {
    return new Response(
      JSON.stringify({ ok: false, message: "Zu viele Anfragen. Bitte warte kurz und versuche es erneut." }),
      { status: 429, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }
  return null;
}

// Cleanup old buckets periodically
setInterval(() => {
  const cutoff = Date.now() - 300_000;
  for (const [key, rec] of _rateLimitBuckets) {
    if (rec.windowStart < cutoff) _rateLimitBuckets.delete(key);
  }
}, 120_000).unref?.();
