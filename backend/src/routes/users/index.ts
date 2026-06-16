import { Hono } from 'hono';
import type { Env } from '@/types';
import { requireAuth } from '@/lib/helpers/auth';
import { createDb } from '@/lib/db';
import { checkCsrf } from '@/lib/utils/csrf';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { parseBody } from '@/lib/utils/http';
import { badRequest, jsonResponse } from '@/lib/utils/responses';
import { hashPassword, verifyPassword } from '@/lib/utils/password';
import {
  invalidateAllUserSessions,
  createSession,
  buildSessionCookie,
  getSessionToken,
  destroySession,
} from '@/lib/session';
import { isSecure } from '@/lib/utils/http';

const users = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /me
// ---------------------------------------------------------------------------
users.get('/me', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const { data: user } = await auth.db
    .from('users')
    .select('id, username, email, first_name, last_name, created_at, "profileImage", income, age')
    .eq('id', auth.user.id)
    .single();

  if (!user) return jsonResponse({ ok: false, message: 'Benutzer nicht gefunden' }, 404);

  return jsonResponse({
    ok: true,
    user: {
      id: String(user.id),
      username: user.username,
      email: user.email,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      created_at: user.created_at ?? null,
      profileImage: (user as Record<string, unknown>).profileImage ?? null,
      income: (user as Record<string, unknown>).income ?? null,
      age: (user as Record<string, unknown>).age ?? null,
    },
  }, 200);
});

// ---------------------------------------------------------------------------
// PATCH /me
// ---------------------------------------------------------------------------
users.patch('/me', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const updates: Record<string, unknown> = {};

  if (payload.first_name !== undefined) updates.first_name = String(payload.first_name ?? '').trim().slice(0, 100);
  if (payload.last_name !== undefined) updates.last_name = String(payload.last_name ?? '').trim().slice(0, 100);
  if (payload.income !== undefined) {
    const inc = Number(payload.income);
    if (Number.isFinite(inc) && inc >= 0) updates.income = Number(inc.toFixed(2));
  }
  if (payload.age !== undefined) {
    const age = Number(payload.age);
    if (Number.isFinite(age) && age > 0 && age < 150) updates.age = Math.floor(age);
  }

  if (Object.keys(updates).length === 0) return badRequest('Keine Änderung angegeben');

  await auth.db.from('users').update(updates).eq('id', auth.user.id);
  return jsonResponse({ ok: true, message: 'Profil aktualisiert' }, 200);
});

// ---------------------------------------------------------------------------
// DELETE /me
// ---------------------------------------------------------------------------
users.delete('/me', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const userId = auth.user.id;
  const db = auth.db;

  const { data: bankAccounts } = await db.from('bank_accounts').select('id').eq('user_id', userId);
  const bankIds = (bankAccounts ?? []).map((b: Record<string, unknown>) => b.id);
  if (bankIds.length) {
    await db.from('income').delete().in('bank_account_id', bankIds);
    await db.from('private_expenses').delete().in('bank_account_id', bankIds);
  }

  await Promise.all([
    db.from('user_categories').delete().eq('user_id', userId),
    db.from('bank_accounts').delete().eq('user_id', userId),
    db.from('share_accounts').delete().eq('user_id', userId),
    db.from('group_members').delete().eq('user_id', userId),
    db.from('question_likes').delete().eq('user_id', userId),
    db.from('answer_likes').delete().eq('user_id', userId),
  ]);

  await db.from('users').delete().eq('id', userId);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': `finanzapp_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
    },
  });
});

// ---------------------------------------------------------------------------
// POST /me/password
// ---------------------------------------------------------------------------
users.post('/me/password', async (c) => {
  const request = c.req.raw;

  const rl = checkRateLimit(request, { maxAttempts: 5, windowMs: 60_000, group: 'password-change' });
  if (rl) return rl;

  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(request);
  if (csrf) return csrf;

  const payload = await parseBody<Record<string, unknown>>(request);
  const currentPassword = String(payload.current_password ?? '');
  const newPassword = String(payload.new_password ?? '');

  if (!currentPassword || !newPassword) return badRequest('Aktuelles und neues Passwort sind Pflichtfelder');
  if (newPassword.length < 8) return badRequest('Neues Passwort muss mindestens 8 Zeichen haben');

  const { data: user } = await auth.db.from('users').select('password').eq('id', auth.user.id).single();
  if (!user) return jsonResponse({ ok: false, message: 'Benutzer nicht gefunden' }, 404);

  const isValid = await verifyPassword(currentPassword, user.password as string);
  if (!isValid) return jsonResponse({ ok: false, code: 'wrong_password', message: 'Aktuelles Passwort ist falsch' }, 400);

  await auth.db.from('users').update({ password: await hashPassword(newPassword) }).eq('id', auth.user.id);

  await invalidateAllUserSessions(c.env, auth.user.id);
  const oldToken = getSessionToken(request, c.env);
  await destroySession(c.env, oldToken);
  const newToken = await createSession(c.env, auth.user.id);
  const secure = isSecure(request);
  return new Response(JSON.stringify({ ok: true, message: 'Passwort erfolgreich geändert' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': buildSessionCookie(c.env, newToken, secure),
    },
  });
});

// ---------------------------------------------------------------------------
// PUT /me/profile-image
// ---------------------------------------------------------------------------
users.put('/me/profile-image', async (c) => {
  const request = c.req.raw;

  const rl = checkRateLimit(request, { maxAttempts: 10, windowMs: 60_000, group: 'profile-image' });
  if (rl) return rl;

  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(request);
  if (csrf) return csrf;

  const payload = await parseBody<Record<string, unknown>>(request);
  const profileImage = payload.profileImage;

  if (!profileImage || typeof profileImage !== 'string') return badRequest('profileImage ist ein Pflichtfeld');

  const dataUrlMatch = profileImage.match(/^data:(image\/(?:jpeg|png|webp));base64,/);
  if (!dataUrlMatch) return badRequest('Nur JPEG, PNG und WebP sind erlaubt');

  const base64Data = profileImage.slice(profileImage.indexOf(',') + 1);
  const approxBytes = Math.ceil(base64Data.length * 0.75);
  const MAX_SIZE_BYTES = 210_000;
  if (approxBytes > MAX_SIZE_BYTES) {
    return jsonResponse({ ok: false, message: 'Bild ist zu groß (max. 200 KB)' }, 413);
  }

  await auth.db.from('users').update({ profileImage } as Record<string, unknown>).eq('id', auth.user.id);
  return jsonResponse({ ok: true, message: 'Profilbild gespeichert' }, 200);
});

export default users;
