import { COLLECTIONS, FINZBRO_USERNAME } from "../config/runtime.mjs";
import { escapeRegex, parseObjectId } from "../utils/data.mjs";
import { parseBody, sendJson } from "../utils/http.mjs";
import { badRequest, forbidden, notFound, unauthorized } from "../helpers/responses.mjs";

export function createMessageHandlers(db, { ensureFinzbroUserId, generateFinzbroChatAnswer } = {}) {

  async function handleGetConversations(req, res, session) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const userId = parseObjectId(session.user.id);
    if (!userId) return sendJson(res, 400, { ok: false, message: "Invalid user id" });

    const rows = await db.collection(COLLECTIONS.privateMessages).aggregate([
      { $match: { $or: [{ sender_id: userId }, { recipient_id: userId }] } },
      {
        $addFields: {
          partnerId: { $cond: [{ $eq: ["$sender_id", userId] }, "$recipient_id", "$sender_id"] }
        }
      },
      { $sort: { sent_at: -1 } },
      {
        $group: {
          _id: "$partnerId",
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$recipient_id", userId] }, { $eq: ["$read_at", null] }] },
                1,
                0
              ]
            }
          }
        }
      },
      { $sort: { "lastMessage.sent_at": -1 } }
    ]).toArray();

    const partnerIds = rows.map((r) => r._id).filter(Boolean);
    const partners = partnerIds.length
      ? await db.collection(COLLECTIONS.users).find(
        { _id: { $in: partnerIds } },
        { projection: { _id: 1, username: 1, profileImage: 1 } }
      ).toArray()
      : [];
    const partnerById = new Map(partners.map((p) => [String(p._id), p]));

    const conversations = rows.map((r) => {
      const partner = partnerById.get(String(r._id));
      if (!partner) return null;
      const msg = r.lastMessage;
      return {
        partnerId: String(partner._id),
        partnerUsername: partner.username,
        partnerProfileImage: partner.profileImage || null,
        lastMessage: String(msg.content || ""),
        lastMessageAt: msg.sent_at instanceof Date ? msg.sent_at.toISOString() : null,
        unreadCount: r.unreadCount
      };
    }).filter(Boolean);

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

    const partnerUser = await db.collection(COLLECTIONS.users).findOne(
      { _id: partnerId },
      { projection: { _id: 1 } }
    );
    if (!partnerUser) return notFound(res, "Nutzer nicht gefunden");

    await db.collection(COLLECTIONS.privateMessages).updateMany(
      { sender_id: partnerId, recipient_id: userId, read_at: null },
      { $set: { read_at: new Date() } }
    );

    const messages = await db.collection(COLLECTIONS.privateMessages)
      .find(
        {
          $or: [
            { sender_id: userId, recipient_id: partnerId },
            { sender_id: partnerId, recipient_id: userId }
          ]
        },
        { projection: { _id: 1, sender_id: 1, content: 1, sent_at: 1, read_at: 1, deleted_at: 1 } }
      )
      .sort({ sent_at: 1, _id: 1 })
      .toArray();

    const result = messages.map((m) => ({
      _id: String(m._id),
      sender_id: String(m.sender_id),
      content: String(m.content || ""),
      sent_at: m.sent_at instanceof Date ? m.sent_at.toISOString() : null,
      read_at: m.read_at instanceof Date ? m.read_at.toISOString() : null,
      isOwn: String(m.sender_id) === String(userId),
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
    if (String(userId) === String(recipientId)) return badRequest(res, "Du kannst dir keine Nachrichten an dich selbst senden");

    const recipient = await db.collection(COLLECTIONS.users).findOne(
      { _id: recipientId },
      { projection: { _id: 1, username: 1 } }
    );
    if (!recipient) return notFound(res, "Empfänger nicht gefunden");

    const now = new Date();
    const doc = { sender_id: userId, recipient_id: recipientId, content, sent_at: now, read_at: null };
    const result = await db.collection(COLLECTIONS.privateMessages).insertOne(doc);

    if (ensureFinzbroUserId && generateFinzbroChatAnswer &&
      String(recipient.username).toLowerCase() === FINZBRO_USERNAME) {
      (async () => {
        try {
          const finzbroUserId = await ensureFinzbroUserId();

          const history = await db.collection(COLLECTIONS.privateMessages)
            .find({
              $or: [
                { sender_id: userId, recipient_id: finzbroUserId },
                { sender_id: finzbroUserId, recipient_id: userId }
              ],
              _id: { $ne: result.insertedId }
            })
            .sort({ sent_at: -1, _id: -1 })
            .limit(5)
            .toArray();

          const chatHistory = history.reverse().map((m) => ({
            role: String(m.sender_id) === String(finzbroUserId) ? "assistant" : "user",
            content: String(m.content)
          }));
          chatHistory.push({ role: "user", content });

          const replyText = await generateFinzbroChatAnswer(chatHistory);
          const replyNow = new Date();
          await db.collection(COLLECTIONS.privateMessages).insertOne({
            sender_id: finzbroUserId,
            recipient_id: userId,
            content: replyText,
            sent_at: replyNow,
            read_at: null
          });
        } catch (err) {
          console.error("FinzBro chat reply failed:", err);
        }
      })();
    }

    return sendJson(res, 201, {
      ok: true,
      message: {
        _id: String(result.insertedId),
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

    const count = await db.collection(COLLECTIONS.privateMessages).countDocuments({
      recipient_id: userId,
      read_at: null
    });

    return sendJson(res, 200, { ok: true, count });
  }

  async function handleUserSearch(req, res, url, session) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const q = String(url.searchParams.get("q") || "").trim();
    if (!q) return sendJson(res, 200, { ok: true, users: [] });

    const userId = parseObjectId(session.user.id);
    const users = await db.collection(COLLECTIONS.users)
      .find(
        { _id: { $ne: userId }, username: { $regex: escapeRegex(q), $options: "i" } },
        { projection: { _id: 1, username: 1 } }
      )
      .limit(10)
      .toArray();

    return sendJson(res, 200, {
      ok: true,
      users: users.map((u) => ({ _id: String(u._id), username: u.username }))
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

    const existing = await db.collection(COLLECTIONS.privateMessages).findOne(
      { _id: messageId },
      { projection: { _id: 1, sender_id: 1, deleted_at: 1 } }
    );
    if (!existing) return notFound(res, "Nachricht nicht gefunden");
    if (String(existing.sender_id) !== String(userId))
      return forbidden(res, "Nur der Absender darf diese Nachricht löschen");
    if (existing.deleted_at)
      return sendJson(res, 400, { ok: false, message: "Nachricht wurde bereits gelöscht" });

    await db.collection(COLLECTIONS.privateMessages).updateOne(
      { _id: messageId },
      { $set: { content: null, deleted_at: new Date() } }
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

    const existing = await db.collection(COLLECTIONS.groupMessages).findOne(
      { _id: messageId, group_id: groupId },
      { projection: { _id: 1, from_user_id: 1, deleted_at: 1 } }
    );
    if (!existing) return notFound(res, "Nachricht nicht gefunden");
    if (String(existing.from_user_id) !== String(userId))
      return forbidden(res, "Nur der Absender darf diese Nachricht löschen");
    if (existing.deleted_at)
      return sendJson(res, 400, { ok: false, message: "Nachricht wurde bereits gelöscht" });

    await db.collection(COLLECTIONS.groupMessages).updateOne(
      { _id: messageId },
      { $set: { message: null, deleted_at: new Date() } }
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
