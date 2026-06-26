import { Hono } from 'hono';
import type { Env } from '@/types';
import type { DbClient } from '@/lib/db';
import { requireAuth } from '@/lib/helpers/auth';
import { checkCsrf } from '@/lib/utils/csrf';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { parseBody } from '@/lib/utils/http';
import { badRequest, notFound, jsonResponse } from '@/lib/utils/responses';

const activities = new Hono<{ Bindings: Env }>();

async function getGroupCtx(db: DbClient, groupId: number, userId: number) {
  const [{ data: user }, { data: group }, { data: membership }] = await Promise.all([
    db.from('users').select('id, username, first_name, last_name').eq('id', userId).single(),
    db.from('groups').select('*').eq('id', groupId).single(),
    db.from('group_members').select('*').eq('group_id', groupId).eq('user_id', userId).in('status', ['accepted', 'pending_admin']).single(),
  ]);
  if (!user) return { ok: false, status: 401, message: 'Session user not found' } as const;
  if (!group) return { ok: false, status: 404, message: 'Group not found' } as const;
  if (!membership) return { ok: false, status: 403, message: 'You are not a participant of this group' } as const;
  return { ok: true, groupId, user, group, membership } as const;
}

function parseInfo(raw: unknown): string | { error: string } {
  const info = String(raw ?? '').trim();
  if (!info) return { error: 'Beschreibung ist erforderlich' };
  if (info.length > 200) return { error: 'Beschreibung zu lang (max. 200 Zeichen)' };
  return info;
}

function parseDate(raw: unknown): string | null | { error: string } {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw);
  const d = new Date(s);
  if (isNaN(d.getTime())) return { error: 'Ungültiges Datum' };
  return d.toISOString();
}

// POST /api/groups/:id/activities
activities.post('/:id/activities', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  if (!Number.isFinite(groupId)) return badRequest('Invalid group id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const info = parseInfo(payload.info);
  if (typeof info !== 'string') return badRequest(info.error);
  const date = parseDate(payload.date);
  if (date && typeof date === 'object') return badRequest(date.error);

  const { data } = await auth.db.from('group_activities')
    .insert({ group_id: groupId, info, date })
    .select('id, group_id, info, date, created_at').single();
  if (!data) return jsonResponse({ ok: false, message: 'Aktivität konnte nicht erstellt werden.' }, 500);

  return jsonResponse({
    ok: true,
    activity: {
      activity_id: String(data.id), info: data.info ?? null,
      date: data.date ?? null, created_at: data.created_at ?? null,
    },
  }, 201);
});

// PATCH /api/groups/:id/activities/:activityId
activities.patch('/:id/activities/:activityId', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  const activityId = Number(c.req.param('activityId'));
  if (!Number.isFinite(groupId) || !Number.isFinite(activityId)) return badRequest('Invalid id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const { data: existing } = await auth.db.from('group_activities').select('id, group_id')
    .eq('id', activityId).eq('group_id', groupId).single();
  if (!existing) return notFound('Aktivität nicht gefunden');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const update: Record<string, unknown> = {};

  if ('info' in payload) {
    const info = parseInfo(payload.info);
    if (typeof info !== 'string') return badRequest(info.error);
    update.info = info;
  }
  if ('date' in payload) {
    const date = parseDate(payload.date);
    if (date && typeof date === 'object') return badRequest(date.error);
    update.date = date;
  }

  if (Object.keys(update).length) {
    await auth.db.from('group_activities').update(update).eq('id', activityId);
  }

  const { data } = await auth.db.from('group_activities')
    .select('id, group_id, info, date, created_at').eq('id', activityId).single();

  return jsonResponse({
    ok: true,
    activity: {
      activity_id: String(data?.id ?? activityId), info: data?.info ?? null,
      date: data?.date ?? null, created_at: data?.created_at ?? null,
    },
  }, 200);
});

// DELETE /api/groups/:id/activities/:activityId
activities.delete('/:id/activities/:activityId', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  const activityId = Number(c.req.param('activityId'));
  if (!Number.isFinite(groupId) || !Number.isFinite(activityId)) return badRequest('Invalid id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);

  const { data: existing } = await auth.db.from('group_activities').select('id, group_id')
    .eq('id', activityId).eq('group_id', groupId).single();
  if (!existing) return notFound('Aktivität nicht gefunden');

  await auth.db.from('group_funding').update({ group_activity_id: null }).eq('group_activity_id', activityId);
  await auth.db.from('group_activities').delete().eq('id', activityId);

  return jsonResponse({ ok: true, message: 'Aktivität gelöscht' }, 200);
});

export default activities;
