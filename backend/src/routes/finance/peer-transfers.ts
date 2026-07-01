import { Hono } from 'hono';
import type { Env } from '@/types';
import { requireAuth } from '@/lib/helpers/auth';
import { checkCsrf } from '@/lib/utils/csrf';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { parseBody } from '@/lib/utils/http';
import { badRequest, jsonResponse } from '@/lib/utils/responses';
import { createPeerTransfer, toFixedAmount } from '@/lib/helpers/finance';

const peerTransfers = new Hono<{ Bindings: Env }>();

peerTransfers.post('/peer-transfers', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const rl = checkRateLimit(c.req.raw, { maxAttempts: 30, windowMs: 60_000, group: 'peer-transfer' });
  if (rl) return rl;

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const recipientUsername = String(payload.recipient_username ?? '').trim();
  const fromIdRaw = payload.from_bank_account_id;
  const fromId = Number(fromIdRaw);
  const amount = toFixedAmount(payload.amount);
  const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';

  if (!recipientUsername) return badRequest('Empfänger-Benutzername fehlt');
  if (!Number.isFinite(fromId) || fromId <= 0) return badRequest('Eigenes Konto ist ungültig');
  if (amount <= 0) return badRequest('Betrag muss > 0 sein');

  const { data: sender } = await auth.db
    .from('bank_accounts')
    .select('id, balance')
    .eq('id', fromId)
    .eq('user_id', auth.user.id)
    .single();
  if (!sender) return badRequest('Eigenes Konto nicht gefunden');

  const senderBalance = toFixedAmount(sender.balance);
  if (senderBalance < amount) return badRequest('Kontostand reicht nicht aus');

  const { data: recipient } = await auth.db
    .from('users')
    .select('id, default_bank_account_id, username')
    .eq('username', recipientUsername)
    .single();
  if (!recipient) return badRequest('Empfänger nicht gefunden');
  if (Number(recipient.id) === auth.user.id) return badRequest('Selbstüberweisung nicht möglich');
  if (recipient.default_bank_account_id == null) return badRequest('Empfänger hat kein Standardkonto');

  const result = await createPeerTransfer(
    auth.db,
    auth.user.id,
    Number(recipient.id),
    fromId,
    Number(recipient.default_bank_account_id),
    amount,
    reason || `Überweisung an ${recipient.username}`,
  );

  if ('error' in result) return badRequest(result.error);

  return jsonResponse({ ok: true, transfer_id: result.transferId }, 201);
});

peerTransfers.get('/peer-transfers', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const { data } = await auth.db
    .from('transfers')
    .select(
      '*, from_user:users!from_user_id(username, first_name, last_name), to_user:users!to_user_id(username, first_name, last_name)',
    )
    .or(`from_user_id.eq.${auth.user.id},to_user_id.eq.${auth.user.id}`)
    .order('created_at', { ascending: false })
    .limit(100);

  return jsonResponse({ ok: true, items: data ?? [] }, 200);
});

export default peerTransfers;
