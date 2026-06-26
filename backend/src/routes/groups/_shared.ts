import type { DbClient } from '@/lib/db';
import { forbidden } from '@/lib/utils/responses';

// Returns null for non-finite input so missing DB amounts serialize as null
// (toFixedAmount() in lib/helpers/finance coerces null/NaN to 0).
export function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : null;
}

export async function getGroupCtx(db: DbClient, groupId: number, userId: number) {
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

export async function getGroupMembership(
  db: DbClient,
  groupId: number,
  userId: number,
  statuses: string[] = ['accepted', 'pending_admin'],
) {
  const [{ data: user }, { data: group }, { data: membership }] = await Promise.all([
    db.from('users').select('id, username, first_name, last_name').eq('id', userId).single(),
    db.from('groups').select('*').eq('id', groupId).single(),
    db.from('group_members').select('*').eq('group_id', groupId).eq('user_id', userId).in('status', statuses).single(),
  ]);
  if (!user) return { ok: false, status: 401, message: 'Session user not found' } as const;
  if (!group) return { ok: false, status: 404, message: 'Group not found' } as const;
  if (!membership) return { ok: false, status: 403, message: 'You are not a participant of this group' } as const;
  return { ok: true, groupId, user, group, membership } as const;
}

export function requireAdmin(membership: Record<string, unknown>, message = 'Nur Admins …'): Response | null {
  return membership.role === 'admin' ? null : forbidden(message);
}
