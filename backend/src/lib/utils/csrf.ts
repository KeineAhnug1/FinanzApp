// CSRF double-submit cookie pattern.
// The client sends the csrf_token cookie value in the x-csrf-token header.
// We compare them using a timing-safe comparison via crypto.subtle.

export function getCsrfTokenFromCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name?.trim() === 'csrf_token') {
      try {
        return decodeURIComponent(rest.join('=').trim());
      } catch {
        return rest.join('=').trim();
      }
    }
  }
  return null;
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const ka = await crypto.subtle.importKey('raw', enc.encode(a), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const kb = await crypto.subtle.importKey('raw', enc.encode(b), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const dummy = enc.encode('csrf-compare');
  const [sa, sb] = await Promise.all([
    crypto.subtle.sign('HMAC', ka, dummy),
    crypto.subtle.sign('HMAC', kb, dummy),
  ]);
  if (sa.byteLength !== sb.byteLength) return false;
  const va = new Uint8Array(sa);
  const vb = new Uint8Array(sb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= (va[i] ?? 0) ^ (vb[i] ?? 0);
  return diff === 0;
}

/** Returns null if valid, or a 403 Response if the CSRF check fails. */
export async function checkCsrf(request: Request): Promise<Response | null> {
  const cookieToken = getCsrfTokenFromCookies(request.headers.get('cookie'));
  const headerToken = request.headers.get('x-csrf-token');

  if (!cookieToken || !headerToken) {
    return new Response(
      JSON.stringify({ ok: false, message: 'CSRF-Token fehlt.' }),
      { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }

  const valid = await timingSafeEqual(cookieToken, headerToken);
  if (!valid) {
    return new Response(
      JSON.stringify({ ok: false, message: 'Ungültiger CSRF-Token.' }),
      { status: 403, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
  return null;
}

/** Generate a random CSRF token (hex string). */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Build a Set-Cookie string for the CSRF token (not HttpOnly so JS can read it). */
export function buildCsrfCookie(token: string, secure = false): string {
  const sameSite = secure ? 'None' : 'Lax';
  const parts = [
    `csrf_token=${encodeURIComponent(token)}`,
    'Path=/',
    `SameSite=${sameSite}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Build a Set-Cookie string that clears the CSRF cookie. Mirrors buildCsrfCookie's flags. */
export function clearCsrfCookie(secure = false): string {
  const sameSite = secure ? 'None' : 'Lax';
  const parts = [
    'csrf_token=',
    'Max-Age=0',
    'Path=/',
    `SameSite=${sameSite}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
