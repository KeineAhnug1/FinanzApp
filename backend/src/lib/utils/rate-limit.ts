import { jsonResponse } from './responses';

// ---------------------------------------------------------------------------
// IP extraction
// ---------------------------------------------------------------------------

export function getClientIp(request: Request): string {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return (cfIp.split(',')[0] ?? '').trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return (forwarded.split(',')[0] ?? '').trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return (realIp.split(',')[0] ?? '').trim();
  return 'unknown';
}

// ---------------------------------------------------------------------------
// In-memory sliding-window rate limiter (Workers-compatible)
// ---------------------------------------------------------------------------

interface Bucket {
  windowStart: number;
  count: number;
}

const _buckets = new Map<string, Bucket>();

export function rateLimitBucket(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  let bucket = _buckets.get(key);
  if (!bucket || now - bucket.windowStart > windowMs) {
    bucket = { windowStart: now, count: 0 };
  }
  bucket.count++;
  _buckets.set(key, bucket);

  // Prune stale entries on every write to avoid unbounded growth
  const cutoff = now - windowMs * 2;
  for (const [k, b] of _buckets) {
    if (b.windowStart < cutoff) _buckets.delete(k);
  }

  return bucket.count <= maxAttempts;
}

/** Returns null if allowed, or a 429 Response if rate limited. */
export function checkRateLimit(
  request: Request,
  {
    maxAttempts = 10,
    windowMs = 60_000,
    group = 'general',
  }: { maxAttempts?: number; windowMs?: number; group?: string } = {},
): Response | null {
  const ip = getClientIp(request);
  const allowed = rateLimitBucket(`${group}:${ip}`, maxAttempts, windowMs);
  if (!allowed) {
    return jsonResponse(
      { ok: false, message: 'Zu viele Anfragen. Bitte warte kurz und versuche es erneut.' },
      429,
    );
  }
  return null;
}
