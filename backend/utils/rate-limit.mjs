const TRUST_PROXY = process.env.TRUST_PROXY === "true";

export function getClientIp(req) {
  if (TRUST_PROXY) {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) return String(forwarded).split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

const _rateLimitBuckets = new Map();

export function rateLimitBucket(res, key, maxAttempts, windowMs) {
  const { sendJson } = _sendJsonRef;
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

// sendJson is injected once at startup to avoid a circular import
const _sendJsonRef = { sendJson: null };
export function initRateLimiter(sendJsonFn) {
  _sendJsonRef.sendJson = sendJsonFn;
}

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
