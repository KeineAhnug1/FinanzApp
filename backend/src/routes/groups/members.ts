import { Hono } from 'hono';
import type { Env } from '@/types';
import type { DbClient } from '@/lib/db';
import { requireAuth } from '@/lib/helpers/auth';
import { checkCsrf } from '@/lib/utils/csrf';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { parseBody } from '@/lib/utils/http';
import { badRequest, forbidden, notFound, jsonResponse } from '@/lib/utils/responses';

const members = new Hono<{ Bindings: Env }>();

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

// PATCH /api/groups/:id/members/:userId
members.patch('/:id/members/:userId', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  const targetUserId = Number(c.req.param('userId'));
  if (!Number.isFinite(groupId) || !Number.isFinite(targetUserId)) return badRequest('Invalid id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);
  if ((ctx.membership as Record<string, unknown>).role !== 'admin') return forbidden('Nur Admins können Rollen ändern');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const newRole = String(payload.role ?? '');
  if (newRole !== 'admin' && newRole !== 'member') return badRequest('role muss "admin" oder "member" sein');

  const { data: target } = await auth.db.from('group_members').select('id, role, user_id')
    .eq('group_id', groupId).eq('user_id', targetUserId).single();
  if (!target) return notFound('Mitglied nicht gefunden');

  if ((target as Record<string, unknown>).role === newRole) {
    return jsonResponse({ ok: true, member: { user_id: String(targetUserId), role: newRole }, message: 'Rolle unverändert' }, 200);
  }

  if ((target as Record<string, unknown>).role === 'admin' && newRole === 'member') {
    const { count } = await auth.db.from('group_members').select('id', { count: 'exact', head: true })
      .eq('group_id', groupId).eq('role', 'admin').in('status', ['accepted', 'pending_admin']);
    if ((count ?? 0) <= 1)
      return jsonResponse({ ok: false, message: 'Du bist der einzige Admin. Ernenne zuerst ein anderes Mitglied zum Admin.' }, 409);
  }

  await auth.db.from('group_members').update({ role: newRole }).eq('id', (target as Record<string, unknown>).id);

  return jsonResponse({ ok: true, member: { user_id: String(targetUserId), role: newRole } }, 200);
});

// DELETE /api/groups/:id/members/:userId
members.delete('/:id/members/:userId', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'groups-mutate' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const groupId = Number(c.req.param('id'));
  const targetUserId = Number(c.req.param('userId'));
  if (!Number.isFinite(groupId) || !Number.isFinite(targetUserId)) return badRequest('Invalid id');

  const ctx = await getGroupCtx(auth.db, groupId, auth.user.id);
  if (!ctx.ok) return jsonResponse({ ok: false, message: ctx.message }, ctx.status);
  if ((ctx.membership as Record<string, unknown>).role !== 'admin') return forbidden('Nur Admins können Mitglieder entfernen');

  if (targetUserId === auth.user.id)
    return jsonResponse({ ok: false, message: "Verwende stattdessen 'Gruppe verlassen', um dich selbst zu entfernen" }, 409);

  const { data: target } = await auth.db.from('group_members').select('id, role, user_id')
    .eq('group_id', groupId).eq('user_id', targetUserId).single();
  if (!target) return notFound('Mitglied nicht gefunden');

  if ((target as Record<string, unknown>).role === 'admin') {
    const { count } = await auth.db.from('group_members').select('id', { count: 'exact', head: true })
      .eq('group_id', groupId).eq('role', 'admin').in('status', ['accepted', 'pending_admin']);
    if ((count ?? 0) <= 1)
      return jsonResponse({ ok: false, message: 'Du bist der einzige Admin. Ernenne zuerst ein anderes Mitglied zum Admin.' }, 409);
  }

  await auth.db.from('group_members').delete().eq('id', (target as Record<string, unknown>).id);

  return jsonResponse({ ok: true, message: 'Mitglied entfernt' }, 200);
});

export default members;
