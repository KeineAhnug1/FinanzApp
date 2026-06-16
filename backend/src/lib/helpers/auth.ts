import type { Context } from 'hono';
import type { Env } from '@/types';
import { createDb, type DbClient } from '@/lib/db';
import { getSessionToken, getSessionRecord } from '@/lib/session';
import { unauthorized } from '@/lib/utils/responses';

export interface AuthContext {
  user: { id: number; username: string; email: string; first_name: string; last_name: string };
  db: DbClient;
  env: Env;
}

export async function requireAuth(c: Context<{ Bindings: Env }>): Promise<AuthContext | Response> {
  const token = getSessionToken(c.req.raw, c.env);
  if (!token) return unauthorized('Nicht angemeldet');

  const rec = await getSessionRecord(c.env, token);
  if (!rec) return unauthorized('Session abgelaufen');

  const db = createDb(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, c.env.DATABASE_URL, c.env.HYPERDRIVE);
  const { data: user } = await db
    .from('users')
    .select('id, username, email, first_name, last_name')
    .eq('id', rec.userId)
    .single();

  if (!user) return unauthorized('Benutzer nicht gefunden');

  return {
    user: {
      id: Number(user.id),
      username: user.username ?? '',
      email: user.email ?? '',
      first_name: user.first_name ?? '',
      last_name: user.last_name ?? '',
    },
    db,
    env: c.env,
  };
}
