import type { Env } from '@/types';

export interface SessionRecord { userId: string; }

async function generateToken(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createSession(env: Env, userId: string | number): Promise<string> {
  const token = await generateToken();
  const ttl = Number(env.SESSION_TTL_MINUTES ?? 180) * 60;
  const now = Date.now();
  await env.SESSIONS.put(`session:${token}`, JSON.stringify({ userId: String(userId), issuedAt: now }), { expirationTtl: ttl });
  return token;
}

export async function getSessionRecord(env: Env, token: string | undefined): Promise<SessionRecord | null> {
  if (!token) return null;
  const raw = await env.SESSIONS.get(`session:${token}`);
  if (!raw) return null;

  let userId: string;
  let issuedAt = 0;
  try {
    const parsed = JSON.parse(raw) as { userId?: string; issuedAt?: number };
    if (!parsed.userId) return null;
    userId = parsed.userId;
    issuedAt = Number(parsed.issuedAt ?? 0);
  } catch {
    userId = raw;
  }

  const bumpedRaw = await env.SESSIONS.get(`pw-changed:${userId}`);
  if (bumpedRaw) {
    const bumpedAt = Number(bumpedRaw);
    if (Number.isFinite(bumpedAt) && bumpedAt > issuedAt) {
      await env.SESSIONS.delete(`session:${token}`);
      return null;
    }
  }

  const ttl = Number(env.SESSION_TTL_MINUTES ?? 180) * 60;
  await env.SESSIONS.put(`session:${token}`, JSON.stringify({ userId, issuedAt: issuedAt || Date.now() }), { expirationTtl: ttl });
  return { userId };
}

export async function destroySession(env: Env, token: string | undefined): Promise<void> {
  if (!token) return;
  await env.SESSIONS.delete(`session:${token}`);
}

export async function invalidateAllUserSessions(env: Env, userId: string | number): Promise<void> {
  const ttl = Number(env.SESSION_TTL_MINUTES ?? 180) * 60;
  await env.SESSIONS.put(`pw-changed:${userId}`, String(Date.now()), { expirationTtl: ttl + 86400 });
}

export function buildSessionCookie(env: Env, token: string, secure = false): string {
  const name = env.SESSION_COOKIE_NAME ?? 'finanzapp_session';
  const ttl = Number(env.SESSION_TTL_MINUTES ?? 180) * 60;
  const sameSite = secure ? 'None' : 'Lax';
  const parts = [`${name}=${encodeURIComponent(token)}`, 'HttpOnly', 'Path=/', `SameSite=${sameSite}`, `Max-Age=${ttl}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(env: Env, secure = false): string {
  const name = env.SESSION_COOKIE_NAME ?? 'finanzapp_session';
  const sameSite = secure ? 'None' : 'Lax';
  const parts = [`${name}=`, 'HttpOnly', 'Path=/', `SameSite=${sameSite}`, 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function getSessionToken(request: Request, env: Env): string | undefined {
  const name = env.SESSION_COOKIE_NAME ?? 'finanzapp_session';
  const cookieHeader = request.headers.get('cookie') ?? '';
  for (const part of cookieHeader.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k?.trim() === name) {
      try { return decodeURIComponent(rest.join('=').trim()); } catch { return rest.join('=').trim(); }
    }
  }
  return undefined;
}
