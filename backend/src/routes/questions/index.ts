import { Hono } from 'hono';
import type { Env } from '@/types';
import type { DbClient } from '@/lib/db';
import { requireAuth } from '@/lib/helpers/auth';
import { checkCsrf } from '@/lib/utils/csrf';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { parseBody } from '@/lib/utils/http';
import { badRequest, forbidden, notFound, jsonResponse } from '@/lib/utils/responses';
import { getConfig } from '@/lib/config';

const questions = new Hono<{ Bindings: Env }>();

const QUESTION_TOPIC_MAX_LENGTH = 80;
const QUESTION_MESSAGE_MAX_LENGTH = 4000;
const ANSWER_MESSAGE_MAX_LENGTH = 4000;
const FINZBRO_EMAIL = 'finzbro@finanzapp.local';

type DbRow = Record<string, unknown>;

interface UserRow {
  id: number | string;
  username?: string | null;
  first_name?: string | null;
}

interface QuestionRow {
  id: number | string;
  from_user_id: number | string;
  thema?: string | null;
  message?: string | null;
  answered?: boolean | null;
  edited?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  group_id?: number | string | null;
}

interface AnswerRow {
  id: number | string;
  question_id: number | string;
  from_user_id: number | string;
  message?: string | null;
  edited?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface LikeRefRow {
  id?: number | string;
  question_id?: number | string;
  answer_id?: number | string;
}

async function listQuestionsWithRelations(
  db: DbClient,
  userId: number,
  searchRaw = '',
) {
  const { data: allQuestions } = await db
    .from('global_questions')
    .select('id, from_user_id, thema, message, answered, edited, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (!allQuestions?.length) return [];

  const search = searchRaw.trim().toLowerCase();
  const filtered = search
    ? (allQuestions as QuestionRow[]).filter((q) =>
        String(q.thema ?? '').toLowerCase().includes(search) ||
        String(q.message ?? '').toLowerCase().includes(search)
      ).slice(0, 10)
    : (allQuestions as QuestionRow[]);

  const questionIds = filtered.map((q) => q.id);

  const [{ data: answers }, { data: qLikes }, { data: myQLikes }, { data: botUser }] = await Promise.all([
    db.from('global_answers').select('*').in('question_id', questionIds).order('created_at', { ascending: true }),
    db.from('question_likes').select('question_id').in('question_id', questionIds),
    db.from('question_likes').select('question_id').in('question_id', questionIds).eq('user_id', userId),
    db.from('users').select('id').eq('email', FINZBRO_EMAIL).maybeSingle(),
  ]);

  const botId = botUser ? String((botUser as { id: number | string }).id) : null;

  const typedAnswers = (answers ?? []) as AnswerRow[];
  const answerIds = typedAnswers.map((a) => a.id);
  const [{ data: aLikes }, { data: myALikes }] = await Promise.all([
    answerIds.length ? db.from('answer_likes').select('answer_id').in('answer_id', answerIds) : Promise.resolve({ data: [] }),
    answerIds.length ? db.from('answer_likes').select('answer_id').in('answer_id', answerIds).eq('user_id', userId) : Promise.resolve({ data: [] }),
  ]);

  const userIds = new Set<number>();
  for (const q of filtered) userIds.add(Number(q.from_user_id));
  for (const a of typedAnswers) userIds.add(Number(a.from_user_id));

  const { data: users } = await db.from('users').select('id, username, first_name').in('id', Array.from(userIds));
  const usersById = new Map<string, UserRow>(((users ?? []) as UserRow[]).map((u) => [String(u.id), u]));

  const qLikesCount = new Map<string, number>();
  for (const l of (qLikes ?? []) as LikeRefRow[]) qLikesCount.set(String(l.question_id), (qLikesCount.get(String(l.question_id)) ?? 0) + 1);
  const aLikesCount = new Map<string, number>();
  for (const l of (aLikes ?? []) as LikeRefRow[]) aLikesCount.set(String(l.answer_id), (aLikesCount.get(String(l.answer_id)) ?? 0) + 1);
  const myQIds = new Set(((myQLikes ?? []) as LikeRefRow[]).map((l) => String(l.question_id)));
  const myAIds = new Set(((myALikes ?? []) as LikeRefRow[]).map((l) => String(l.answer_id)));

  const answersByQ = new Map<string, AnswerRow[]>();
  for (const a of typedAnswers) {
    const k = String(a.question_id);
    if (!answersByQ.has(k)) answersByQ.set(k, []);
    answersByQ.get(k)!.push(a);
  }

  return filtered.map((q) => {
    const author = usersById.get(String(q.from_user_id));
    const qAnswers = answersByQ.get(String(q.id)) ?? [];
    return {
      id: String(q.id), thema: q.thema, message: q.message,
      answered: q.answered, edited: q.edited, created_at: q.created_at, updated_at: q.updated_at,
      likes: qLikesCount.get(String(q.id)) ?? 0,
      liked_by_me: myQIds.has(String(q.id)),
      author: author ? { id: String(author.id), username: author.username, first_name: author.first_name } : null,
      is_mine: Number(q.from_user_id) === userId,
      answers: qAnswers.map((a) => {
        const aAuthor = usersById.get(String(a.from_user_id));
        const isBot = botId !== null && String(a.from_user_id) === botId;
        return {
          id: String(a.id), message: a.message, edited: a.edited,
          created_at: a.created_at, updated_at: a.updated_at,
          likes: aLikesCount.get(String(a.id)) ?? 0,
          liked_by_me: myAIds.has(String(a.id)),
          author: aAuthor ? { id: String(aAuthor.id), username: aAuthor.username, first_name: aAuthor.first_name } : null,
          is_mine: Number(a.from_user_id) === userId,
          is_bot: isBot,
        };
      }),
    };
  });
}

async function maybeCreateFinzbroAnswer(
  db: DbClient,
  env: Env,
  questionId: number,
  thema: string,
  questionMessage: string,
  triggeringMessage: string,
) {
  const cfg = getConfig(env);
  const apiKey = cfg.openrouterApiKey || cfg.openrouterApiKey2;
  if (!apiKey) return;

  const finzbroEmail = env.FINZBRO_BOT_EMAIL ?? FINZBRO_EMAIL;

  // Find or create the FinzbRo bot user
  let { data: bot } = await db.from('users').select('id').eq('email', finzbroEmail).single();
  if (!bot) {
    const { data: created } = await db
      .from('users')
      .insert({ username: 'finzbro', email: finzbroEmail, password: '', first_name: 'FinzbRo', last_name: '' })
      .select('id')
      .single();
    bot = created;
  }
  if (!bot) {
    console.error('[questions:finzbro] could not find or create bot user');
    return;
  }

  // Fetch all existing answers in the thread (excluding the one just inserted — it's triggeringMessage)
  const { data: existingAnswers } = await db
    .from('global_answers')
    .select('from_user_id, message')
    .eq('question_id', questionId)
    .order('created_at', { ascending: true });

  // Build conversation history: question → answers so far → triggering message
  const history: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: `Thema: ${thema}\n\n${questionMessage}` },
  ];

  for (const a of (existingAnswers ?? []) as { from_user_id: number | string; message?: string | null }[]) {
    if (!a.message) continue;
    // Bot answers become assistant turns; human answers become user turns
    const role = String(a.from_user_id) === String(bot.id) ? 'assistant' : 'user';
    history.push({ role, content: a.message });
  }

  // Add the message that @mentioned FinzbRo (only if it differs from the question itself)
  if (triggeringMessage !== questionMessage) {
    history.push({ role: 'user', content: triggeringMessage });
  }

  const messages = [
    {
      role: 'system' as const,
      content: 'Du bist FinzbRo, ein freundlicher und kompetenter Finanz-Assistent in einer deutschen Finanz-Community-App. Antworte immer auf Deutsch, präzise und hilfreich. Maximal 4 Sätze. Ignoriere @Finzbro-Erwähnungen — antworte einfach inhaltlich.',
    },
    ...history,
  ];

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': cfg.openrouterSiteUrl,
        'X-Title': cfg.openrouterAppName,
      },
      body: JSON.stringify({ model: cfg.openrouterModel, messages, max_tokens: 400 }),
    });
    console.log('[finzbro] openrouter status:', response.status, 'model:', cfg.openrouterModel);
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[finzbro] openrouter error', response.status, errText);
      return;
    }
    const raw = await response.text();
    console.log('[finzbro] raw response length:', raw.length, 'preview:', raw.slice(0, 120));
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(raw) as Record<string, unknown>;
    } catch (parseErr) {
      console.error('[finzbro] JSON parse failed:', parseErr, 'raw:', raw.slice(0, 200));
      return;
    }
    const content = (data?.choices as Record<string, unknown>[])?.[0]?.message as Record<string, unknown>;
    const answerText = String(content?.content ?? '').trim();
    console.log('[finzbro] answerText length:', answerText.length, 'preview:', answerText.slice(0, 80));
    if (!answerText) {
      console.error('[finzbro] empty answerText, content was:', JSON.stringify(content));
      return;
    }

    const { error: insertErr } = await db.from('global_answers').insert({ question_id: questionId, from_user_id: bot.id, message: answerText, edited: false });
    if (insertErr) {
      console.error('[finzbro] insert error:', JSON.stringify(insertErr));
      return;
    }
    await db.from('global_questions').update({ answered: true, updated_at: new Date().toISOString() }).eq('id', questionId);
    console.log('[finzbro] answer inserted successfully for question', questionId);
  } catch (err) {
    console.error('[questions:finzbro] generation failed', { questionId, err });
  }
}

function mentionsFinzbro(text: string): boolean {
  return /@finzbro/i.test(text);
}

// POST /api/questions/finzbro — direct chat with FinzbRo AI
questions.post('/finzbro', async (c) => {
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 20, windowMs: 60_000, group: 'finzbro-chat' });
  if (rl) return rl;
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const cfg = getConfig(c.env);
  const apiKey = cfg.openrouterApiKey || cfg.openrouterApiKey2;
  if (!apiKey) return jsonResponse({ ok: false, message: 'KI nicht verfügbar.' }, 503);

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const userMessage = String(payload.message ?? '').trim().slice(0, 1000);
  if (!userMessage) return jsonResponse({ ok: false, message: 'Nachricht ist erforderlich.' }, 400);

  const history = Array.isArray(payload.history)
    ? (payload.history as Array<{ role: string; content: string }>)
        .slice(-10)
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: String(m.content ?? '').slice(0, 500) }))
    : [];

  const messages = [
    { role: 'system', content: 'Du bist FinzbRo, ein freundlicher und kompetenter Finanz-Assistent in einer deutschen Finanz-App. Antworte immer auf Deutsch, kurz, präzise und hilfreich. Maximal 4 Sätze pro Antwort.' },
    ...history,
    { role: 'user', content: userMessage },
  ];

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': cfg.openrouterSiteUrl,
        'X-Title': cfg.openrouterAppName,
      },
      body: JSON.stringify({ model: cfg.openrouterModel, messages, max_tokens: 400 }),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[finzbro-chat] openrouter error', response.status, errText);
      return jsonResponse({ ok: false, message: 'FinzbRo ist gerade nicht verfügbar.' }, 502);
    }
    const data = await response.json() as Record<string, unknown>;
    const content = (data?.choices as Record<string, unknown>[])?.[0]?.message as Record<string, unknown>;
    const reply = String(content?.content ?? '').trim();
    if (!reply) return jsonResponse({ ok: false, message: 'Keine Antwort erhalten.' }, 502);
    return jsonResponse({ ok: true, reply }, 200);
  } catch (err) {
    console.error('[finzbro-chat] failed', err);
    return jsonResponse({ ok: false, message: 'Fehler beim Aufrufen der KI.' }, 500);
  }
});

// GET /api/questions
questions.get('/', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const search = new URL(c.req.url).searchParams.get('search') ?? '';
  const qs = await listQuestionsWithRelations(auth.db, auth.user.id, search);
  return jsonResponse({ ok: true, questions: qs }, 200);
});

// POST /api/questions
questions.post('/', async (c) => {
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 10, windowMs: 60_000, group: 'forum-questions' });
  if (rl) return rl;
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const thema = String(payload.thema ?? '').trim().slice(0, QUESTION_TOPIC_MAX_LENGTH);
  const message = String(payload.message ?? '').trim().slice(0, QUESTION_MESSAGE_MAX_LENGTH);
  if (!thema) return badRequest(`Thema ist erforderlich (max. ${QUESTION_TOPIC_MAX_LENGTH} Zeichen).`);
  if (!message) return badRequest('Frage ist erforderlich und darf nicht zu lang sein.');

  const { data: inserted } = await auth.db.from('global_questions').insert({
    from_user_id: auth.user.id, thema, message, answered: false, edited: false,
  }).select('id, from_user_id, thema, message, answered, edited, created_at, updated_at').single();

  if (!inserted) return jsonResponse({ ok: false, message: 'Frage konnte nicht erstellt werden.' }, 500);

  // Fire-and-forget: response geht sofort raus, FinzbRo antwortet asynchron
  if (mentionsFinzbro(thema) || mentionsFinzbro(message)) {
    const env = c.env;
    const db = auth.db;
    const qId = Number(inserted.id);
    c.executionCtx.waitUntil(maybeCreateFinzbroAnswer(db, env, qId, thema, message, message).catch(console.error));
  }

  return jsonResponse({
    ok: true,
    question: {
      id: String(inserted.id), thema, message,
      answered: inserted.answered, edited: inserted.edited,
      created_at: inserted.created_at, updated_at: inserted.updated_at,
      likes: 0, liked_by_me: false,
      author: { id: String(auth.user.id), username: auth.user.username, first_name: auth.user.first_name },
      is_mine: true, answers: [],
    },
  }, 201);
});

// GET /api/questions/:id
questions.get('/:id', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;

  const questionId = Number(c.req.param('id'));
  if (!Number.isFinite(questionId)) return badRequest('question_id ist ungültig');

  const { data: q } = await auth.db.from('global_questions')
    .select('id, from_user_id, thema, message, answered, edited, created_at, updated_at').eq('id', questionId).single();
  if (!q) return notFound('Frage nicht gefunden');

  const [{ data: answers }, { data: qLikeRows }, { data: myQLike }] = await Promise.all([
    auth.db.from('global_answers').select('*').eq('question_id', questionId).order('created_at', { ascending: true }),
    auth.db.from('question_likes').select('id').eq('question_id', questionId),
    auth.db.from('question_likes').select('id').eq('question_id', questionId).eq('user_id', auth.user.id),
  ]);

  const typedAnswers = (answers ?? []) as AnswerRow[];
  const answerIds = typedAnswers.map((a) => a.id);
  const [{ data: aLikes }, { data: myALikes }, { data: author }, { data: botUser }] = await Promise.all([
    answerIds.length ? auth.db.from('answer_likes').select('answer_id').in('answer_id', answerIds) : Promise.resolve({ data: [] }),
    answerIds.length ? auth.db.from('answer_likes').select('answer_id').in('answer_id', answerIds).eq('user_id', auth.user.id) : Promise.resolve({ data: [] }),
    auth.db.from('users').select('id, username, first_name').eq('id', q.from_user_id).maybeSingle(),
    auth.db.from('users').select('id').eq('email', FINZBRO_EMAIL).maybeSingle(),
  ]);

  const botId = botUser ? String((botUser as { id: number | string }).id) : null;

  const aLikesCount = new Map<string, number>();
  for (const l of (aLikes ?? []) as LikeRefRow[]) aLikesCount.set(String(l.answer_id), (aLikesCount.get(String(l.answer_id)) ?? 0) + 1);
  const myAIds = new Set(((myALikes ?? []) as LikeRefRow[]).map((l) => String(l.answer_id)));

  const userIds = new Set(typedAnswers.map((a) => Number(a.from_user_id)));
  const { data: answerUsers } = userIds.size ? await auth.db.from('users').select('id, username, first_name').in('id', Array.from(userIds)) : { data: [] };
  const usersById = new Map<string, UserRow>(((answerUsers ?? []) as UserRow[]).map((u) => [String(u.id), u]));

  return jsonResponse({
    ok: true,
    question: {
      id: String(q.id), thema: q.thema, message: q.message,
      answered: q.answered, edited: q.edited, created_at: q.created_at, updated_at: q.updated_at,
      likes: (qLikeRows ?? []).length, liked_by_me: (myQLike ?? []).length > 0,
      is_mine: Number(q.from_user_id) === auth.user.id,
      author: author ? { id: String((author as UserRow).id), username: (author as UserRow).username, first_name: (author as UserRow).first_name } : null,
      answers: typedAnswers.map((a) => {
        const aAuthor = usersById.get(String(a.from_user_id));
        const isBot = botId !== null && String(a.from_user_id) === botId;
        return {
          id: String(a.id), message: a.message, edited: a.edited,
          created_at: a.created_at, updated_at: a.updated_at,
          likes: aLikesCount.get(String(a.id)) ?? 0, liked_by_me: myAIds.has(String(a.id)),
          is_mine: Number(a.from_user_id) === auth.user.id,
          is_bot: isBot,
          author: aAuthor ? { id: String(aAuthor.id), username: aAuthor.username, first_name: aAuthor.first_name } : null,
        };
      }),
    },
  }, 200);
});

// PATCH /api/questions/:id
questions.patch('/:id', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const questionId = Number(c.req.param('id'));
  if (!Number.isFinite(questionId)) return badRequest('question_id ist ungültig');

  const { data: existing } = await auth.db.from('global_questions').select('id, from_user_id').eq('id', questionId).single();
  if (!existing) return notFound('Frage nicht gefunden');
  if (Number(existing.from_user_id) !== auth.user.id) return forbidden('Nur der Ersteller darf diese Frage bearbeiten');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const thema = String(payload.thema ?? '').trim().slice(0, QUESTION_TOPIC_MAX_LENGTH);
  const message = String(payload.message ?? '').trim().slice(0, QUESTION_MESSAGE_MAX_LENGTH);
  if (!thema) return badRequest(`Thema ist erforderlich (max. ${QUESTION_TOPIC_MAX_LENGTH} Zeichen).`);
  if (!message) return badRequest('Frage ist erforderlich und darf nicht zu lang sein.');

  await auth.db.from('global_questions').update({ thema, message, edited: true, updated_at: new Date().toISOString() }).eq('id', questionId);
  return jsonResponse({ ok: true, message: 'Frage aktualisiert' }, 200);
});

// DELETE /api/questions/:id
questions.delete('/:id', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const questionId = Number(c.req.param('id'));
  if (!Number.isFinite(questionId)) return badRequest('question_id ist ungültig');

  const { data: existing } = await auth.db.from('global_questions').select('id, from_user_id').eq('id', questionId).single();
  if (!existing) return notFound('Frage nicht gefunden');
  if (Number(existing.from_user_id) !== auth.user.id) return forbidden('Nur der Ersteller darf diese Frage löschen');

  const { data: answers } = await auth.db.from('global_answers').select('id').eq('question_id', questionId);
  const answerIds = ((answers ?? []) as AnswerRow[]).map((a) => a.id);
  if (answerIds.length) {
    await auth.db.from('answer_likes').delete().in('answer_id', answerIds);
    await auth.db.from('global_answers').delete().eq('question_id', questionId);
  }
  await auth.db.from('question_likes').delete().eq('question_id', questionId);
  await auth.db.from('global_questions').delete().eq('id', questionId);

  return jsonResponse({ ok: true, message: 'Frage gelöscht' }, 200);
});

// POST /api/questions/:id/like
questions.post('/:id/like', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 60, windowMs: 60_000, group: 'forum-likes' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const questionId = Number(c.req.param('id'));
  if (!Number.isFinite(questionId)) return badRequest('question_id ist ungültig');

  const { data: existing } = await auth.db.from('question_likes').select('id')
    .eq('question_id', questionId).eq('user_id', auth.user.id).single();

  let liked: boolean;
  if (existing) {
    await auth.db.from('question_likes').delete().eq('id', existing.id);
    liked = false;
  } else {
    await auth.db.from('question_likes').insert({ question_id: questionId, user_id: auth.user.id });
    liked = true;
  }

  const { count } = await auth.db.from('question_likes').select('id', { count: 'exact', head: true }).eq('question_id', questionId);
  return jsonResponse({ ok: true, liked, likes: count ?? 0 }, 200);
});

// POST /api/questions/:id/answers
questions.post('/:id/answers', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const questionId = Number(c.req.param('id'));
  if (!Number.isFinite(questionId)) return badRequest('question_id ist ungültig');

  const { data: question } = await auth.db.from('global_questions').select('id, thema, message').eq('id', questionId).single();
  if (!question) return notFound('Frage nicht gefunden');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const message = String(payload.message ?? '').trim().slice(0, ANSWER_MESSAGE_MAX_LENGTH);
  if (!message) return badRequest('Antwort ist erforderlich und darf nicht zu lang sein.');

  await auth.db.from('global_answers').insert({ question_id: questionId, from_user_id: auth.user.id, message, edited: false });
  await auth.db.from('global_questions').update({ answered: true, updated_at: new Date().toISOString() }).eq('id', questionId);

  if (mentionsFinzbro(message)) {
    const env = c.env;
    const db = auth.db;
    const q = question as { id: number | string; thema?: string | null; message?: string | null };
    c.executionCtx.waitUntil(
      maybeCreateFinzbroAnswer(db, env, questionId, String(q.thema ?? ''), String(q.message ?? ''), message).catch(console.error)
    );
  }

  return jsonResponse({ ok: true, message: 'Antwort erstellt' }, 201);
});

// PATCH /api/questions/answers/:answerId
questions.patch('/answers/:answerId', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const answerId = Number(c.req.param('answerId'));
  if (!Number.isFinite(answerId)) return badRequest('answer_id ist ungültig');

  const { data: existing } = await auth.db.from('global_answers').select('id, from_user_id').eq('id', answerId).single();
  if (!existing) return notFound('Antwort nicht gefunden');
  if (Number(existing.from_user_id) !== auth.user.id) return forbidden('Nur der Autor darf diese Antwort bearbeiten');

  const payload = await parseBody<Record<string, unknown>>(c.req.raw);
  const message = String(payload.message ?? '').trim().slice(0, ANSWER_MESSAGE_MAX_LENGTH);
  if (!message) return badRequest('Antwort darf nicht leer sein.');

  await auth.db.from('global_answers').update({ message, edited: true, updated_at: new Date().toISOString() }).eq('id', answerId);
  return jsonResponse({ ok: true, message: 'Antwort aktualisiert' }, 200);
});

// DELETE /api/questions/answers/:answerId
questions.delete('/answers/:answerId', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const answerId = Number(c.req.param('answerId'));
  if (!Number.isFinite(answerId)) return badRequest('answer_id ist ungültig');

  const { data: existing } = await auth.db.from('global_answers').select('id, from_user_id, question_id').eq('id', answerId).single();
  if (!existing) return notFound('Antwort nicht gefunden');
  if (Number(existing.from_user_id) !== auth.user.id) return forbidden('Nur der Autor darf diese Antwort löschen');

  await auth.db.from('answer_likes').delete().eq('answer_id', answerId);
  await auth.db.from('global_answers').delete().eq('id', answerId);

  const { count } = await auth.db.from('global_answers').select('id', { count: 'exact', head: true }).eq('question_id', existing.question_id);
  if ((count ?? 0) === 0)
    await auth.db.from('global_questions').update({ answered: false }).eq('id', existing.question_id);

  return jsonResponse({ ok: true, message: 'Antwort gelöscht' }, 200);
});

// POST /api/questions/answers/:answerId/like
questions.post('/answers/:answerId/like', async (c) => {
  const auth = await requireAuth(c);
  if (auth instanceof Response) return auth;
  const rl = checkRateLimit(c.req.raw, { maxAttempts: 60, windowMs: 60_000, group: 'forum-likes' });
  if (rl) return rl;
  const csrf = await checkCsrf(c.req.raw);
  if (csrf) return csrf;

  const answerId = Number(c.req.param('answerId'));
  if (!Number.isFinite(answerId)) return badRequest('answer_id ist ungültig');

  const { data: answerRow } = await auth.db.from('global_answers').select('id').eq('id', answerId).single();
  if (!answerRow) return notFound('Antwort nicht gefunden');

  const { data: existing } = await auth.db.from('answer_likes').select('id')
    .eq('answer_id', answerId).eq('user_id', auth.user.id).single();

  let liked: boolean;
  if (existing) {
    await auth.db.from('answer_likes').delete().eq('id', existing.id);
    liked = false;
  } else {
    await auth.db.from('answer_likes').insert({ answer_id: answerId, user_id: auth.user.id });
    liked = true;
  }

  const { count } = await auth.db.from('answer_likes').select('id', { count: 'exact', head: true }).eq('answer_id', answerId);
  return jsonResponse({ ok: true, liked, likes: count ?? 0 }, 200);
});

export default questions;
