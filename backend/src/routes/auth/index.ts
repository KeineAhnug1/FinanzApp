import { Hono } from 'hono';
import type { Env } from '@/types';
import { createDb } from '@/lib/db';
import {
  createSession,
  buildSessionCookie,
  getSessionToken,
  getSessionRecord,
  destroySession,
  clearSessionCookie,
  invalidateAllUserSessions,
} from '@/lib/session';
import { checkCsrf, generateCsrfToken, buildCsrfCookie, clearCsrfCookie, getCsrfTokenFromCookies } from '@/lib/utils/csrf';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { hashPassword, verifyPassword, isScryptPasswordHash, isSha256PasswordHash, hashCode, verifyCode } from '@/lib/utils/password';
import { normalizeEmail } from '@/lib/utils/data';
import { parseBody, isSecure } from '@/lib/utils/http';
import { badRequest, unauthorized, conflict, notFound, jsonResponse } from '@/lib/utils/responses';
import { detectBlockedRegistrationName } from '@/lib/config/blocked-names';
import { sendVerificationEmail, sendPasswordResetEmail } from '@/lib/email';

const auth = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// POST /login
// ---------------------------------------------------------------------------
auth.post('/login', async (c) => {
  const request = c.req.raw;

  const rl = checkRateLimit(request, { maxAttempts: 5, windowMs: 60_000, group: 'login' });
  if (rl) return rl;

  // No CSRF check on login — no authenticated session exists yet

  const payload = await parseBody<{ email?: unknown; password?: unknown }>(request);
  const email = normalizeEmail(payload.email);
  const password = String(payload.password ?? '');
  if (!email || !password) return badRequest('Email und Passwort sind Pflichtfelder');

  const db = createDb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, c.env.DATABASE_URL, c.env.HYPERDRIVE);

  const { data: user, error } = await db
    .from('users')
    .select('id, username, email, password, first_name, last_name, created_at')
    .eq('email', email)
    .single();

  if (error || !user) return unauthorized('E-Mail oder Passwort falsch');

  const valid = await verifyPassword(password, user.password as string);
  if (!valid) return unauthorized('E-Mail oder Passwort falsch');

  const pw = user.password as string;
  if (!pw.startsWith('scrypt:')) {
    const upgraded = await hashPassword(password);
    await db.from('users').update({ password: upgraded }).eq('id', user.id);
  }

  const token = await createSession(c.env, String(user.id));
  const secure = isSecure(request);
  const csrfToken = generateCsrfToken();

  const body = JSON.stringify({
    ok: true,
    csrf: csrfToken,
    user: {
      id: String(user.id),
      username: user.username,
      email: user.email,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      created_at: user.created_at ?? null,
    },
  });

  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' });
  headers.append('Set-Cookie', buildSessionCookie(c.env, token, secure));
  headers.append('Set-Cookie', buildCsrfCookie(csrfToken, secure));
  return new Response(body, { status: 200, headers });
});

// ---------------------------------------------------------------------------
// POST /logout
// ---------------------------------------------------------------------------
auth.post('/logout', async (c) => {
  const request = c.req.raw;

  const csrf = await checkCsrf(request);
  if (csrf) return csrf;

  const token = getSessionToken(request, c.env);
  await destroySession(c.env, token);

  const secure = isSecure(request);
  const cookies = [
    clearSessionCookie(c.env, secure),
    clearCsrfCookie(secure),
  ];

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': cookies.join(', '),
    },
  });
});

// ---------------------------------------------------------------------------
// POST /register
// ---------------------------------------------------------------------------
auth.post('/register', async (c) => {
  const request = c.req.raw;

  const rl = checkRateLimit(request, { maxAttempts: 3, windowMs: 60_000, group: 'register' });
  if (rl) return rl;

  // No CSRF check on register — no authenticated session exists yet

  const payload = await parseBody<{
    username?: unknown;
    email?: unknown;
    password?: unknown;
    first_name?: unknown;
    last_name?: unknown;
  }>(request);

  const username = String(payload.username ?? '').trim().toLowerCase();
  const email = normalizeEmail(payload.email);
  const password = String(payload.password ?? '');
  const firstName = String(payload.first_name ?? '').trim();
  const lastName = String(payload.last_name ?? '').trim();

  if (!username || !email || !password || !firstName || !lastName) {
    return badRequest('Username, Vorname, Nachname, E-Mail und Passwort sind Pflichtfelder');
  }
  if (detectBlockedRegistrationName({ username, firstName, lastName })) {
    return jsonResponse({ ok: false, code: 'forbidden_name', message: 'Der angegebene Name ist verboten.' }, 400);
  }
  if (username.length > 50) return badRequest('Username zu lang (max. 50 Zeichen)');
  if (firstName.length > 100) return badRequest('Vorname zu lang (max. 100 Zeichen)');
  if (lastName.length > 100) return badRequest('Nachname zu lang (max. 100 Zeichen)');
  if (email.length > 254) return badRequest('E-Mail zu lang');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest('Bitte eine gültige E-Mail-Adresse angeben');
  if (password.length < 8) return badRequest('Passwort muss mindestens 8 Zeichen haben');

  const db = createDb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, c.env.DATABASE_URL, c.env.HYPERDRIVE);

  const { data: existing } = await db
    .from('users')
    .select('id')
    .or(`email.eq.${email},username.eq.${username}`)
    .limit(1);

  if (existing && existing.length > 0) {
    return conflict('Username oder E-Mail existiert bereits');
  }

  const ttl = Number(c.env.EMAIL_CODE_TTL_MINUTES ?? 15);
  const code = String(Math.floor(Math.random() * 900000) + 100000);
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();
  const passwordHash = await hashPassword(password);
  const codeHash = await hashCode(code);

  await db.from('email_verifications').upsert({
    email,
    username,
    password: passwordHash,
    first_name: firstName,
    last_name: lastName,
    code_hash: codeHash,
    attempts: 0,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
  }, { onConflict: 'email' });

  let delivered = false;
  try {
    delivered = await sendVerificationEmail(c.env, email, firstName, code);
  } catch (err) {
    console.error('[register] Email send failed:', err);
    return jsonResponse({ ok: false, message: 'E-Mail konnte nicht versendet werden.' }, 502);
  }

  if (c.env.NODE_ENV !== 'production') {
    console.log(`[register:dev] Verification code for ${email}: ${code}`);
  }

  return jsonResponse({
    ok: true,
    pending_email: email,
    expires_in_seconds: ttl * 60,
    message: delivered ? 'Verifizierungscode wurde per E-Mail versendet' : 'E-Mail-Service nicht konfiguriert.',
  }, 200);
});

// ---------------------------------------------------------------------------
// POST /verify
// ---------------------------------------------------------------------------
auth.post('/verify', async (c) => {
  const request = c.req.raw;

  const rl = checkRateLimit(request, { maxAttempts: 5, windowMs: 60_000, group: 'register-verify' });
  if (rl) return rl;

  // No CSRF check — unauthenticated flow

  const payload = await parseBody<{ email?: unknown; code?: unknown }>(request);
  const email = normalizeEmail(payload.email);
  const code = String(payload.code ?? '').trim();

  if (!email || !code) return badRequest('E-Mail und Code sind Pflichtfelder');

  const db = createDb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, c.env.DATABASE_URL, c.env.HYPERDRIVE);

  const { data: verification } = await db
    .from('email_verifications')
    .select('*')
    .eq('email', email)
    .single();

  if (!verification) {
    return jsonResponse({ ok: false, message: 'Keine offene Verifizierung für diese E-Mail' }, 404);
  }

  if (detectBlockedRegistrationName({
    username: verification.username,
    firstName: verification.first_name,
    lastName: verification.last_name,
  })) {
    await db.from('email_verifications').delete().eq('email', email);
    return jsonResponse({ ok: false, code: 'forbidden_name', message: 'Der angegebene Name ist verboten.' }, 400);
  }

  if (verification.expires_at && new Date(verification.expires_at).getTime() < Date.now()) {
    await db.from('email_verifications').delete().eq('email', email);
    return jsonResponse({ ok: false, message: 'Code abgelaufen. Bitte erneut registrieren.' }, 410);
  }

  if ((verification.attempts ?? 0) >= 5) {
    return jsonResponse({ ok: false, message: 'Zu viele Fehlversuche. Bitte erneut registrieren.' }, 429);
  }

  const codeValid = await verifyCode(code, verification.code_hash);
  if (!codeValid) {
    await db.from('email_verifications').update({ attempts: (verification.attempts ?? 0) + 1 }).eq('email', email);
    return badRequest('Verifizierungscode ist ungültig');
  }

  const passwordHash =
    isScryptPasswordHash(verification.password) || isSha256PasswordHash(verification.password)
      ? verification.password
      : await hashPassword(verification.password);

  const { data: inserted, error } = await db
    .from('users')
    .insert({
      username: verification.username,
      email: verification.email,
      password: passwordHash,
      first_name: verification.first_name,
      last_name: verification.last_name,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return jsonResponse({ ok: false, message: 'Username oder E-Mail existiert bereits' }, 409);
    }
    throw error;
  }

  const { data: bankAccounts } = await db
    .from('bank_accounts')
    .select('id')
    .eq('user_id', inserted.id)
    .limit(1);
  if (!bankAccounts || bankAccounts.length === 0) {
    await db.from('bank_accounts').insert({ user_id: inserted.id, label: 'Bankkonto 1', balance: 0 });
  }
  const { data: shareAccounts } = await db
    .from('share_accounts')
    .select('id')
    .eq('user_id', inserted.id)
    .limit(1);
  if (!shareAccounts || shareAccounts.length === 0) {
    await db.from('share_accounts').insert({ user_id: inserted.id, label: 'Aktienkonto 1' });
  }

  await db.from('email_verifications').delete().eq('email', email);

  return jsonResponse({
    ok: true,
    message: 'E-Mail verifiziert und Konto erstellt',
    user: { id: String(inserted.id), username: verification.username, email: verification.email },
  }, 201);
});

// ---------------------------------------------------------------------------
// POST /forgot-password
// ---------------------------------------------------------------------------
auth.post('/forgot-password', async (c) => {
  const request = c.req.raw;

  const rl = checkRateLimit(request, { maxAttempts: 2, windowMs: 60_000, group: 'password-forgot' });
  if (rl) return rl;

  // No CSRF check — unauthenticated flow

  const payload = await parseBody<{ email?: unknown }>(request);
  const email = normalizeEmail(payload.email);
  if (!email) return badRequest('E-Mail ist ein Pflichtfeld');

  const minDelay = new Promise<void>((resolve) => setTimeout(resolve, 400));

  const db = createDb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, c.env.DATABASE_URL, c.env.HYPERDRIVE);
  const ttl = Number(c.env.EMAIL_CODE_TTL_MINUTES ?? 15);

  const { data: user } = await db
    .from('users')
    .select('id, first_name, email')
    .eq('email', email)
    .single();

  if (user) {
    const code = String(Math.floor(Math.random() * 900000) + 100000);
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

    await db.from('password_resets').upsert({
      email,
      user_id: user.id,
      code_hash: await hashCode(code),
      attempts: 0,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
    }, { onConflict: 'email' });

    try {
      await sendPasswordResetEmail(c.env, email, user.first_name, code);
    } catch (err) {
      console.error('[forgot-password] Email send failed:', err);
    }
  }

  await minDelay;

  return jsonResponse({
    ok: true,
    expires_in_seconds: ttl * 60,
    message: 'Falls ein Konto mit dieser E-Mail existiert, wurde ein Code versendet.',
  }, 200);
});

// ---------------------------------------------------------------------------
// POST /reset-password
// ---------------------------------------------------------------------------
auth.post('/reset-password', async (c) => {
  const request = c.req.raw;

  const rl = checkRateLimit(request, { maxAttempts: 3, windowMs: 60_000, group: 'password-reset' });
  if (rl) return rl;

  // No CSRF check — unauthenticated flow

  const payload = await parseBody<{ email?: unknown; code?: unknown; new_password?: unknown }>(request);
  const email = normalizeEmail(payload.email);
  const code = String(payload.code ?? '').trim();
  const newPassword = String(payload.new_password ?? '');

  if (!email || !code || !newPassword) {
    return badRequest('E-Mail, Code und neues Passwort sind Pflichtfelder');
  }
  if (newPassword.length < 8) return badRequest('Neues Passwort muss mindestens 8 Zeichen haben');

  const db = createDb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, c.env.DATABASE_URL, c.env.HYPERDRIVE);

  const { data: reset } = await db
    .from('password_resets')
    .select('*')
    .eq('email', email)
    .single();

  if (!reset) return badRequest('Kein aktiver Reset-Code für diese E-Mail');

  if (reset.expires_at && new Date(reset.expires_at).getTime() < Date.now()) {
    await db.from('password_resets').delete().eq('email', email);
    return jsonResponse({ ok: false, message: 'Code abgelaufen. Bitte erneut anfordern.' }, 410);
  }

  if ((reset.attempts ?? 0) >= 5) {
    return jsonResponse({ ok: false, message: 'Zu viele Fehlversuche. Bitte erneut anfordern.' }, 429);
  }

  const codeValid = await verifyCode(code, reset.code_hash);
  if (!codeValid) {
    await db.from('password_resets').update({ attempts: (reset.attempts ?? 0) + 1 }).eq('email', email);
    return badRequest('Code ist ungültig');
  }

  await db.from('users').update({ password: await hashPassword(newPassword) }).eq('id', reset.user_id);
  await db.from('password_resets').delete().eq('email', email);
  await invalidateAllUserSessions(c.env, reset.user_id);

  return jsonResponse({ ok: true, message: 'Passwort erfolgreich zurückgesetzt' }, 200);
});

// ---------------------------------------------------------------------------
// GET /session — returns current session user + CSRF token
// ---------------------------------------------------------------------------
auth.get('/session', async (c) => {
  const request = c.req.raw;
  const token = getSessionToken(request, c.env);
  const rec = token ? await getSessionRecord(c.env, token) : null;

  const extraHeaders: Record<string, string> = {};
  let csrf = getCsrfTokenFromCookies(request.headers.get('cookie'));
  if (!csrf) {
    csrf = generateCsrfToken();
    extraHeaders['Set-Cookie'] = buildCsrfCookie(csrf, isSecure(request));
  }

  if (!rec) {
    return jsonResponse({ ok: true, session_user: null, csrf }, 200, extraHeaders);
  }

  const db = createDb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, c.env.DATABASE_URL, c.env.HYPERDRIVE);

  const { data: user } = await db
    .from('users')
    .select('id, username, email, first_name, last_name, created_at, "profileImage"')
    .eq('id', rec.userId)
    .single();

  if (!user) {
    return jsonResponse({ ok: true, session_user: null, csrf }, 200, extraHeaders);
  }

  return jsonResponse(
    {
      ok: true,
      csrf,
      session_user: {
        id: String(user.id),
        username: user.username,
        email: user.email,
        first_name: user.first_name ?? null,
        last_name: user.last_name ?? null,
        created_at: user.created_at ?? null,
        profileImage: (user as Record<string, unknown>).profileImage ?? null,
      },
    },
    200,
    extraHeaders,
  );
});

export default auth;
