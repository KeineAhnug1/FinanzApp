import { FINZBRO_USERNAME } from "../config/runtime.mjs";
import { parseObjectId } from "../utils/data.mjs";
import { parseBody, sendJson } from "../utils/http.mjs";
import { badRequest, forbidden, notFound, unauthorized } from "../helpers/responses.mjs";

export function createMessageHandlers(pool, { ensureFinzbroUserId, generateFinzbroChatAnswer, notifyUser } = {}) {

  async function handleGetConversations(req, res, session) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const userId = parseObjectId(session.user.id);
    if (!userId) return sendJson(res, 400, { ok: false, message: "Invalid user id" });

    const { rows } = await pool.query(
      `SELECT DISTINCT ON (partner_id)
         partner_id,
         id AS last_message_id,
         sender_id,
         recipient_id,
         content,
         sent_at,
         read_at,
         deleted_at
       FROM (
         SELECT
           CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS partner_id,
           id, sender_id, recipient_id, content, sent_at, read_at, deleted_at
         FROM private_messages
         WHERE sender_id = $1 OR recipient_id = $1
       ) sub
       ORDER BY partner_id, sent_at DESC, id DESC`,
      [userId]
    );

    if (rows.length === 0) {
      return sendJson(res, 200, { ok: true, conversations: [] });
    }

    const partnerIds = rows.map((r) => r.partner_id);

    const unreadRes = await pool.query(
      `SELECT
         sender_id AS partner_id,
         COUNT(*)::int AS unread_count
       FROM private_messages
       WHERE recipient_id = $1 AND read_at IS NULL AND sender_id = ANY($2)
       GROUP BY sender_id`,
      [userId, partnerIds]
    );
    const unreadByPartner = new Map(unreadRes.rows.map((r) => [r.partner_id, r.unread_count]));

    const partnersRes = await pool.query(
      `SELECT id, username, "profileImage" FROM users WHERE id = ANY($1)`,
      [partnerIds]
    );
    const partnerById = new Map(partnersRes.rows.map((p) => [p.id, p]));

    const conversations = rows.map((r) => {
      const partner = partnerById.get(r.partner_id);
      if (!partner) return null;
      return {
        partnerId: String(partner.id),
        partnerUsername: partner.username,
        partnerProfileImage: partner.profileImage || null,
        lastMessage: String(r.content || ""),
        lastMessageAt: r.sent_at instanceof Date ? r.sent_at.toISOString() : null,
        unreadCount: unreadByPartner.get(r.partner_id) || 0
      };
    }).filter(Boolean);

    conversations.sort((a, b) => {
      const aTime = a.lastMessageAt || "";
      const bTime = b.lastMessageAt || "";
      return bTime.localeCompare(aTime);
    });

    return sendJson(res, 200, { ok: true, conversations });
  }

  async function handleGetConversation(req, res, partnerIdRaw, session) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const userId = parseObjectId(session.user.id);
    const partnerId = parseObjectId(partnerIdRaw);
    if (!userId || !partnerId) return badRequest(res, "Invalid user id");

    const partnerRes = await pool.query(
      `SELECT id FROM users WHERE id = $1`,
      [partnerId]
    );
    if (partnerRes.rows.length === 0) return notFound(res, "Nutzer nicht gefunden");

    await pool.query(
      `UPDATE private_messages SET read_at = NOW()
       WHERE sender_id = $1 AND recipient_id = $2 AND read_at IS NULL`,
      [partnerId, userId]
    );

    const { rows: messages } = await pool.query(
      `SELECT id, sender_id, content, sent_at, read_at, deleted_at
       FROM private_messages
       WHERE (sender_id = $1 AND recipient_id = $2)
          OR (sender_id = $2 AND recipient_id = $1)
       ORDER BY sent_at ASC, id ASC`,
      [userId, partnerId]
    );

    const result = messages.map((m) => ({
      _id: String(m.id),
      sender_id: String(m.sender_id),
      content: String(m.content || ""),
      sent_at: m.sent_at instanceof Date ? m.sent_at.toISOString() : null,
      read_at: m.read_at instanceof Date ? m.read_at.toISOString() : null,
      isOwn: m.sender_id === userId,
      deleted_at: m.deleted_at instanceof Date ? m.deleted_at.toISOString() : null
    }));

    return sendJson(res, 200, { ok: true, messages: result });
  }

  async function handleSendMessage(req, res, session) {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const payload = await parseBody(req, res);
    if (!payload) return;

    const userId = parseObjectId(session.user.id);
    const recipientId = parseObjectId(String(payload.recipientId || ""));
    const content = String(payload.content || "").trim();

    if (!recipientId) return badRequest(res, "recipientId fehlt oder ist ungültig");
    if (!content) return badRequest(res, "Nachricht darf nicht leer sein");
    if (content.length > 2000) return badRequest(res, "Nachricht ist zu lang (max. 2000 Zeichen)");
    if (userId === recipientId) return badRequest(res, "Du kannst dir keine Nachrichten an dich selbst senden");

    const recipientRes = await pool.query(
      `SELECT id, username FROM users WHERE id = $1`,
      [recipientId]
    );
    if (recipientRes.rows.length === 0) return notFound(res, "Empfänger nicht gefunden");
    const recipient = recipientRes.rows[0];

    const now = new Date();
    const insertRes = await pool.query(
      `INSERT INTO private_messages (sender_id, recipient_id, content, sent_at, read_at)
       VALUES ($1, $2, $3, $4, NULL)
       RETURNING id`,
      [userId, recipientId, content, now]
    );
    const insertedId = insertRes.rows[0].id;

    if (ensureFinzbroUserId && generateFinzbroChatAnswer &&
      String(recipient.username).toLowerCase() === FINZBRO_USERNAME) {
      (async () => {
        try {
          const finzbroUserId = await ensureFinzbroUserId();

          const historyRes = await pool.query(
            `SELECT id, sender_id, content FROM private_messages
             WHERE ((sender_id = $1 AND recipient_id = $2)
                OR (sender_id = $2 AND recipient_id = $1))
               AND id != $3
             ORDER BY sent_at DESC, id DESC
             LIMIT 5`,
            [userId, finzbroUserId, insertedId]
          );

          const chatHistory = historyRes.rows.reverse().map((m) => ({
            role: m.sender_id === finzbroUserId ? "assistant" : "user",
            content: String(m.content)
          }));
          chatHistory.push({ role: "user", content });

          const replyText = await generateFinzbroChatAnswer(chatHistory);
          const replyNow = new Date();
          const { rows: replyRows } = await pool.query(
            `INSERT INTO private_messages (sender_id, recipient_id, content, sent_at, read_at)
             VALUES ($1, $2, $3, $4, NULL) RETURNING id`,
            [finzbroUserId, userId, replyText, replyNow]
          );
          if (notifyUser) {
            notifyUser(userId, "new_message", {
              _id: String(replyRows[0].id),
              sender_id: String(finzbroUserId),
              partnerId: String(finzbroUserId),
              content: replyText,
              sent_at: replyNow.toISOString()
            });
          }
        } catch (err) {
          console.error("FinzBro chat reply failed:", err);
        }
      })();
    } else if (notifyUser) {
      notifyUser(recipientId, "new_message", {
        _id: String(insertedId),
        sender_id: String(userId),
        partnerId: String(userId),
        content,
        sent_at: now.toISOString()
      });
    }

    return sendJson(res, 201, {
      ok: true,
      message: {
        _id: String(insertedId),
        sender_id: String(userId),
        content,
        sent_at: now.toISOString(),
        read_at: null,
        isOwn: true
      }
    });
  }

  async function handleUnreadCount(req, res, session) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const userId = parseObjectId(session.user.id);
    if (!userId) return sendJson(res, 400, { ok: false, message: "Invalid user id" });

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM private_messages
       WHERE recipient_id = $1 AND read_at IS NULL`,
      [userId]
    );

    return sendJson(res, 200, { ok: true, count: rows[0].count });
  }

  async function handleUserSearch(req, res, url, session) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const q = String(url.searchParams.get("q") || "").trim();
    if (!q) return sendJson(res, 200, { ok: true, users: [] });

    const userId = parseObjectId(session.user.id);
    const pattern = `%${q}%`;

    const { rows: users } = await pool.query(
      `SELECT id, username FROM users
       WHERE id != $1 AND username ILIKE $2
       LIMIT 10`,
      [userId, pattern]
    );

    return sendJson(res, 200, {
      ok: true,
      users: users.map((u) => ({ _id: String(u.id), username: u.username }))
    });
  }

  async function handleDeletePrivateMessage(req, res, messageIdRaw, session) {
    if (req.method !== "DELETE") {
      res.setHeader("Allow", "DELETE");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const userId = parseObjectId(session.user.id);
    if (!userId) return unauthorized(res, "Session invalid");
    const messageId = parseObjectId(messageIdRaw);
    if (!messageId) return sendJson(res, 400, { ok: false, message: "Ungültige Nachrichten-ID" });

    const { rows } = await pool.query(
      `SELECT id, sender_id, deleted_at FROM private_messages WHERE id = $1`,
      [messageId]
    );
    if (rows.length === 0) return notFound(res, "Nachricht nicht gefunden");

    const existing = rows[0];
    if (existing.sender_id !== userId)
      return forbidden(res, "Nur der Absender darf diese Nachricht löschen");
    if (existing.deleted_at)
      return sendJson(res, 400, { ok: false, message: "Nachricht wurde bereits gelöscht" });

    await pool.query(
      `UPDATE private_messages SET content = NULL, deleted_at = NOW() WHERE id = $1`,
      [messageId]
    );
    return sendJson(res, 200, { ok: true, message: "Nachricht gelöscht" });
  }

  async function handleDeleteGroupMessage(req, res, groupIdRaw, messageIdRaw, session) {
    if (req.method !== "DELETE") {
      res.setHeader("Allow", "DELETE");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const userId = parseObjectId(session.user.id);
    if (!userId) return unauthorized(res, "Session invalid");
    const groupId = parseObjectId(groupIdRaw);
    const messageId = parseObjectId(messageIdRaw);
    if (!groupId || !messageId) return sendJson(res, 400, { ok: false, message: "Ungültige ID" });

    const { rows } = await pool.query(
      `SELECT id, from_user_id, deleted_at FROM group_message WHERE id = $1 AND group_id = $2`,
      [messageId, groupId]
    );
    if (rows.length === 0) return notFound(res, "Nachricht nicht gefunden");

    const existing = rows[0];
    if (existing.from_user_id !== userId)
      return forbidden(res, "Nur der Absender darf diese Nachricht löschen");
    if (existing.deleted_at)
      return sendJson(res, 400, { ok: false, message: "Nachricht wurde bereits gelöscht" });

    await pool.query(
      `UPDATE group_message SET message = NULL, deleted_at = NOW() WHERE id = $1`,
      [messageId]
    );
    return sendJson(res, 200, { ok: true, message: "Nachricht gelöscht" });
  }

  return {
    handleGetConversations,
    handleGetConversation,
    handleSendMessage,
    handleUnreadCount,
    handleUserSearch,
    handleDeletePrivateMessage,
    handleDeleteGroupMessage
  };
}
