import { Hono } from 'hono';
import type { Env } from '@/types';
import { requireAuth } from '@/lib/helpers/auth';
import { checkCsrf } from '@/lib/utils/csrf';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { parseBody, isSecure } from '@/lib/utils/http';
import { badRequest, jsonResponse, notFound } from '@/lib/utils/responses';
import { hashPassword, verifyPassword } from '@/lib/utils/password';
import { isValidImageBytes, decodeBase64Prefix, type SupportedImageMime } from '@/lib/utils/image';
import {
  invalidateAllUserSessions,
  createSession,
  buildSessionCookie,
  clearSessionCookie,
  getSessionToken,
  destroySession,
} from '@/lib/session';
import defaultAccountRoutes from './default-account';

const users = new Hono<{ Bindings: Env }>();

users.route('/', defaultAccountRoutes);

users.get('/me', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const { data: user, error: userErr } = await auth.db
    .from('users')
    .select('id, username, email, first_name, last_name, created_at, "profileImage", income, age, show_profile_image_to_others')
    .eq('id', auth.user.id)
    .single();

  // Fallback: migration not yet applied — re-query without the new column so
  // the app keeps working instead of logging the user out.
  let userRow = user as Record<string, unknown> | null;
  if (userErr && /show_profile_image_to_others/.test(userErr.message ?? '')) {
    const retry = await auth.db
      .from('users')
      .select('id, username, email, first_name, last_name, created_at, "profileImage", income, age')
      .eq('id', auth.user.id)
      .single();
    userRow = (retry.data as Record<string, unknown> | null) ?? null;
  }

  if (!userRow) return notFound('Benutzer nicht gefunden');

  return jsonResponse({
    ok: true,
    user: {
      id: String(userRow.id),
      username: userRow.username,
      email: userRow.email,
      first_name: userRow.first_name ?? null,
      last_name: userRow.last_name ?? null,
      created_at: userRow.created_at ?? null,
      profileImage: userRow.profileImage ?? null,
      income: userRow.income ?? null,
      age: userRow.age ?? null,
      show_profile_image_to_others: userRow.show_profile_image_to_others !== false,
    },
  }, 200);
});

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
  if (payload.show_profile_image_to_others !== undefined) {
    updates.show_profile_image_to_others = payload.show_profile_image_to_others === true;
  }

  if (Object.keys(updates).length === 0) return badRequest('Keine Änderung angegeben');

  const { error: updErr } = await auth.db.from('users').update(updates).eq('id', auth.user.id);
  if (updErr && /show_profile_image_to_others/.test(updErr.message ?? '')) {
    return jsonResponse({
      ok: false,
      message: 'Migration fehlt: Spalte show_profile_image_to_others. Bitte SQL ausführen.',
    }, 503);
  }
  if (updErr) return jsonResponse({ ok: false, message: updErr.message }, 500);
  return jsonResponse({ ok: true, message: 'Profil aktualisiert' }, 200);
});

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

  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': clearSessionCookie(c.env, isSecure(c.req.raw)),
  });
});

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
  if (!user) return notFound('Benutzer nicht gefunden');

  const isValid = await verifyPassword(currentPassword, user.password as string);
  if (!isValid) return jsonResponse({ ok: false, code: 'wrong_password', message: 'Aktuelles Passwort ist falsch' }, 400);

  await auth.db.from('users').update({ password: await hashPassword(newPassword) }).eq('id', auth.user.id);

  await invalidateAllUserSessions(c.env, auth.user.id);
  const oldToken = getSessionToken(request, c.env);
  await destroySession(c.env, oldToken);
  const newToken = await createSession(c.env, auth.user.id);
  const secure = isSecure(request);
  return jsonResponse({ ok: true, message: 'Passwort erfolgreich geändert' }, 200, {
    'Set-Cookie': buildSessionCookie(c.env, newToken, secure),
  });
});

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

  const mime = dataUrlMatch[1] as SupportedImageMime;
  let header: Uint8Array;
  try {
    header = decodeBase64Prefix(base64Data, 16);
  } catch {
    return badRequest('Bilddaten ungültig.');
  }
  if (!isValidImageBytes(header, mime)) return badRequest('Bilddaten ungültig.');

  await auth.db.from('users').update({ profileImage } as Record<string, unknown>).eq('id', auth.user.id);
  return jsonResponse({ ok: true, message: 'Profilbild gespeichert' }, 200);
});

export default users;
