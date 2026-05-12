import { ANSWER_MESSAGE_MAX_LENGTH } from "../config/runtime.mjs";
import { detectBlockedMessageTerm } from "../config/blocked-names.mjs";
import { parseId as parseObjectId, parsePositiveAmount, parseLongText, toDecimal, toNullableDate, toNullableNumber } from "../utils/data.mjs";
import { parseBody, sendJson } from "../utils/http.mjs";
import { badRequest, unauthorized, forbidden, notFound, conflict } from "../helpers/responses.mjs";
import { calculateDashboardStyleDonationBalance } from "../helpers/finance-db.mjs";

const ACTIVE_MEMBER_FILTER = `(status IN ('accepted', 'active') OR status IS NULL)`;
const VISIBLE_MEMBER_FILTER = `(status IN ('accepted', 'invited', 'active') OR status IS NULL)`;

export function createGroupHandlers(pool) {

  async function getGroupContext(groupIdRaw, sessionUserId) {
    const groupId = parseObjectId(groupIdRaw);
    if (!groupId) return { ok: false, status: 400, message: "Invalid group id" };

    const userObjectId = parseObjectId(sessionUserId);
    if (!userObjectId) return { ok: false, status: 401, message: "Session user invalid" };

    const userResult = await pool.query(
      `SELECT id, username, first_name, last_name FROM users WHERE id = $1`,
      [userObjectId]
    );
    if (userResult.rows.length === 0) return { ok: false, status: 404, message: "Session user not found" };
    const user = userResult.rows[0];

    const groupResult = await pool.query(
      `SELECT * FROM groups WHERE id = $1`,
      [groupId]
    );
    if (groupResult.rows.length === 0) return { ok: false, status: 404, message: "Group not found" };
    const group = groupResult.rows[0];

    const membershipResult = await pool.query(
      `SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2 AND ${ACTIVE_MEMBER_FILTER}`,
      [groupId, user.id]
    );
    if (membershipResult.rows.length === 0) return { ok: false, status: 403, message: "You are not a participant of this group" };
    const membership = membershipResult.rows[0];

    return { ok: true, groupId, user, group, membership };
  }

  async function deleteGroupCascade(groupId) {
    const fundingResult = await pool.query(
      `SELECT id FROM group_funding WHERE group_id = $1`,
      [groupId]
    );
    const fundingIds = fundingResult.rows.map((row) => row.id);

    let groupExpenseIds = [];
    if (fundingIds.length) {
      const expenseResult = await pool.query(
        `SELECT id FROM group_expenses WHERE group_funding_id = ANY($1)`,
        [fundingIds]
      );
      groupExpenseIds = expenseResult.rows.map((row) => row.id);
    }

    if (groupExpenseIds.length) {
      await Promise.all([
        pool.query(`DELETE FROM transactions WHERE group_expense_id = ANY($1)`, [groupExpenseIds]),
        pool.query(`DELETE FROM group_expenses WHERE id = ANY($1)`, [groupExpenseIds])
      ]);
    }
    if (fundingIds.length) {
      await Promise.all([
        pool.query(`DELETE FROM funding_participants WHERE group_funding_id = ANY($1)`, [fundingIds]),
        pool.query(`DELETE FROM group_funding WHERE id = ANY($1)`, [fundingIds])
      ]);
    }

    await Promise.all([
      pool.query(`DELETE FROM group_message WHERE group_id = $1`, [groupId]),
      pool.query(`DELETE FROM group_activities WHERE group_id = $1`, [groupId]),
      pool.query(`DELETE FROM group_members WHERE group_id = $1`, [groupId])
    ]);
    await pool.query(`DELETE FROM groups WHERE id = $1`, [groupId]);
  }

  async function handleGroups(req, res, session) {
    const userId = parseObjectId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    if (req.method === "GET") {
      const result = await pool.query(
        `SELECT g.id AS group_id, g.name, g.address, g.created_at, gm.role, gm.status
         FROM group_members gm
         JOIN groups g ON g.id = gm.group_id
         WHERE gm.user_id = $1 AND ${ACTIVE_MEMBER_FILTER}
         ORDER BY g.created_at DESC`,
        [userId]
      );

      return sendJson(res, 200, {
        ok: true,
        session_username: session.user.username,
        groups: result.rows.map((entry) => ({
          group_id: String(entry.group_id),
          name: entry.name,
          address: entry.address ?? null,
          created_at: entry.created_at ?? null,
          role: entry.role,
          status: entry.status ?? null
        }))
      });
    }

    if (req.method === "POST") {
      const payload = await parseBody(req, res);
      if (!payload) return;

      const name = String(payload.name || "").trim();
      const address = String(payload.address || "").trim();
      if (!name) return badRequest(res, "Gruppenname ist erforderlich.");

      const now = new Date();
      const groupResult = await pool.query(
        `INSERT INTO groups (name, address, created_at) VALUES ($1, $2, $3) RETURNING id`,
        [name, address || null, now]
      );
      const groupId = groupResult.rows[0].id;

      await pool.query(
        `INSERT INTO group_members (group_id, user_id, role, status) VALUES ($1, $2, $3, $4)`,
        [groupId, userId, "admin", "accepted"]
      );

      return sendJson(res, 201, { ok: true, group: { group_id: String(groupId), name, address: address || null, role: "admin", status: "accepted", created_at: now } });
    }

    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  async function handleGroupDetail(req, res, groupIdRaw, session) {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });

    const membersResult = await pool.query(
      `SELECT u.id AS user_id, u.username, u.first_name, u.last_name, u."profileImage", gm.role, gm.status
       FROM group_members gm
       JOIN users u ON u.id = gm.user_id
       WHERE gm.group_id = $1 AND ${VISIBLE_MEMBER_FILTER}
       ORDER BY u.username ASC`,
      [context.groupId]
    );

    const activitiesResult = await pool.query(
      `SELECT id, info, date, created_at FROM group_activities WHERE group_id = $1 ORDER BY date DESC, created_at DESC`,
      [context.groupId]
    );
    const activities = activitiesResult.rows;

    const fundingsResult = await pool.query(
      `SELECT id, group_activity_id, amount, info, created_at FROM group_funding WHERE group_id = $1 ORDER BY created_at DESC`,
      [context.groupId]
    );
    const fundings = fundingsResult.rows;

    const activityById = new Map(activities.map((activity) => [String(activity.id), activity]));
    const fundingIds = fundings.map((funding) => funding.id);

    let participants = [];
    let expenses = [];
    let transactions = [];
    if (fundingIds.length) {
      const participantsResult = await pool.query(
        `SELECT fp.group_funding_id, fp.amount, fp.created_at,
                u.id AS user_id, u.username, u.first_name, u.last_name
         FROM funding_participants fp
         JOIN bank_accounts ba ON ba.id = fp.bank_account_id
         JOIN users u ON u.id = ba.user_id
         JOIN group_members gm ON gm.user_id = u.id AND gm.group_id = $1
         WHERE fp.group_funding_id = ANY($2)
           AND ${ACTIVE_MEMBER_FILTER}
         ORDER BY fp.created_at DESC`,
        [context.groupId, fundingIds]
      );
      participants = participantsResult.rows;

      const expensesResult = await pool.query(
        `SELECT id, group_funding_id, amount, info, state, cycle, pay_date, due_date, created_at
         FROM group_expenses WHERE group_funding_id = ANY($1)
         ORDER BY created_at DESC`,
        [fundingIds]
      );
      expenses = expensesResult.rows;

      const expenseIds = expenses.map((expense) => expense.id);
      if (expenseIds.length) {
        const transactionsResult = await pool.query(
          `SELECT id, group_expense_id, created_at FROM transactions WHERE group_expense_id = ANY($1) ORDER BY created_at DESC`,
          [expenseIds]
        );
        transactions = transactionsResult.rows;
      }
    }

    const participantsByFunding = new Map();
    for (const participant of participants) {
      const fundingKey = String(participant.group_funding_id);
      if (!participantsByFunding.has(fundingKey)) participantsByFunding.set(fundingKey, []);
      participantsByFunding.get(fundingKey).push(participant);
    }

    const expensesById = new Map(expenses.map((expense) => [String(expense.id), expense]));
    const fundingById = new Map(fundings.map((funding) => [String(funding.id), funding]));

    return sendJson(res, 200, {
      ok: true,
      group: { group_id: String(context.group.id), name: context.group.name, address: context.group.address ?? null, created_at: context.group.created_at ?? null },
      is_admin: context.membership.role === "admin",
      session_user_id: String(context.user.id),
      members: membersResult.rows.map((member) => ({ user_id: String(member.user_id), username: member.username, first_name: member.first_name ?? null, last_name: member.last_name ?? null, profileImage: member.profileImage ?? null, role: member.role, status: member.status ?? null })),
      activities: activities.map((activity) => ({ activity_id: String(activity.id), info: activity.info ?? null, date: activity.date ?? null, created_at: activity.created_at ?? null })),
      fundings: fundings.map((funding) => {
        const linkedActivity = funding.group_activity_id ? activityById.get(String(funding.group_activity_id)) : null;
        const contributions = participantsByFunding.get(String(funding.id)) ?? [];
        return {
          funding_id: String(funding.id), group_activity_id: funding.group_activity_id ? String(funding.group_activity_id) : null, amount: toNullableNumber(funding.amount), info: funding.info ?? null, created_at: funding.created_at ?? null,
          contributions: contributions.map((entry) => ({ user_id: String(entry.user_id), username: entry.username, first_name: entry.first_name ?? null, last_name: entry.last_name ?? null, amount: toNullableNumber(entry.amount), created_at: entry.created_at ?? null })),
          total_donated: Number(contributions.reduce((sum, entry) => sum + (toNullableNumber(entry.amount) ?? 0), 0).toFixed(2)),
          linked_activity: linkedActivity ? { activity_id: String(linkedActivity.id), info: linkedActivity.info ?? null, date: linkedActivity.date ?? null } : null
        };
      }),
      expenses: expenses.map((expense) => {
        const funding = fundingById.get(String(expense.group_funding_id));
        return { group_expense_id: String(expense.id), group_funding_id: String(expense.group_funding_id), funding_info: funding?.info ?? null, amount: toNullableNumber(expense.amount), info: expense.info ?? null, state: expense.state ?? null, cycle: expense.cycle ?? null, due_date: expense.due_date ?? expense.pay_date ?? null, pay_date: expense.pay_date ?? expense.due_date ?? null, created_at: expense.created_at ?? null };
      }),
      funding_transactions: transactions.map((transaction) => {
        const expense = expensesById.get(String(transaction.group_expense_id));
        const funding = expense ? fundingById.get(String(expense.group_funding_id)) : null;
        return { transaction_id: String(transaction.id), group_expense_id: String(transaction.group_expense_id), group_funding_id: expense ? String(expense.group_funding_id) : null, amount: expense ? toNullableNumber(expense.amount) : null, created_at: transaction.created_at ?? null, expense_info: expense?.info ?? null, funding_info: funding?.info ?? null };
      })
    });
  }

  async function handleCreateGroupActivity(req, res, groupIdRaw, session) {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
    const payload = await parseBody(req, res);
    if (!payload) return;
    const info = String(payload.info || "").trim();
    if (!info) return badRequest(res, "Activity info is required");
    const date = toNullableDate(payload.date);
    if (payload.date && !date) return badRequest(res, "Activity date is invalid");
    const createdAt = new Date();
    const insertResult = await pool.query(
      `INSERT INTO group_activities (group_id, info, date, created_at) VALUES ($1, $2, $3, $4) RETURNING id`,
      [context.groupId, info, date, createdAt]
    );
    return sendJson(res, 201, { ok: true, activity: { activity_id: String(insertResult.rows[0].id), info, date, created_at: createdAt } });
  }

  async function handleCreateGroupFunding(req, res, groupIdRaw, session) {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
    const payload = await parseBody(req, res);
    if (!payload) return;

    const info = String(payload.info || "").trim() || null;
    let groupActivityId = null;
    const activityIdRaw = String(payload.group_activity_id || "").trim();
    if (activityIdRaw) {
      groupActivityId = parseObjectId(activityIdRaw);
      if (!groupActivityId) return badRequest(res, "Invalid linked activity id");
      const linkedResult = await pool.query(
        `SELECT id FROM group_activities WHERE id = $1 AND group_id = $2`,
        [groupActivityId, context.groupId]
      );
      if (linkedResult.rows.length === 0) return badRequest(res, "Linked activity does not exist in this group");
    }

    if (!groupActivityId) {
      const createdAt = new Date();
      const activityInsert = await pool.query(
        `INSERT INTO group_activities (group_id, info, date, created_at) VALUES ($1, $2, $3, $4) RETURNING id`,
        [context.groupId, info || "Funding activity", null, createdAt]
      );
      groupActivityId = activityInsert.rows[0].id;
    }

    const createdAt = new Date();
    const amount = 0.00;
    const insertResult = await pool.query(
      `INSERT INTO group_funding (group_id, group_activity_id, amount, info, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [context.groupId, groupActivityId, amount, info, createdAt]
    );
    return sendJson(res, 201, { ok: true, funding: { funding_id: String(insertResult.rows[0].id), group_activity_id: groupActivityId ? String(groupActivityId) : null, amount: 0, info, created_at: createdAt } });
  }

  async function handleDonateToFunding(req, res, groupIdRaw, fundingIdRaw, session) {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });

    const fundingId = parseObjectId(fundingIdRaw);
    if (!fundingId) return badRequest(res, "Invalid funding id");
    const fundingResult = await pool.query(
      `SELECT id, amount, info FROM group_funding WHERE id = $1 AND group_id = $2`,
      [fundingId, context.groupId]
    );
    if (fundingResult.rows.length === 0) return notFound(res, "Funding not found for this group");
    const funding = fundingResult.rows[0];

    const payload = await parseBody(req, res);
    if (!payload) return;

    const normalizedAmount = parsePositiveAmount(payload.amount);
    if (normalizedAmount == null) return badRequest(res, "Donation amount must be a positive number");
    const amount = toDecimal(normalizedAmount);

    const donationBalance = await calculateDashboardStyleDonationBalance(pool, context.user.id);
    const currentBalance = Math.max(0, donationBalance.availableDonationBalance);
    if (normalizedAmount > currentBalance) return badRequest(res, "Not enough available balance based on your dashboard entries for this donation");

    const bankAccount = donationBalance.userAccounts[0] ?? null;
    if (!bankAccount?.id) return badRequest(res, "No bank account available for this user");

    const existingResult = await pool.query(
      `SELECT id, amount FROM funding_participants WHERE group_funding_id = $1 AND bank_account_id = $2`,
      [fundingId, bankAccount.id]
    );
    const createdAt = new Date();
    let fundingParticipantId;

    if (existingResult.rows.length > 0) {
      const existingParticipant = existingResult.rows[0];
      fundingParticipantId = existingParticipant.id;
      const currentAmount = toNullableNumber(existingParticipant.amount) ?? 0;
      const nextAmount = Number((currentAmount + normalizedAmount).toFixed(2));
      await pool.query(
        `UPDATE funding_participants SET amount = $1 WHERE id = $2`,
        [toDecimal(nextAmount), existingParticipant.id]
      );
    } else {
      const insertParticipant = await pool.query(
        `INSERT INTO funding_participants (group_funding_id, bank_account_id, amount, created_at) VALUES ($1, $2, $3, $4) RETURNING id`,
        [fundingId, bankAccount.id, amount, createdAt]
      );
      fundingParticipantId = insertParticipant.rows[0].id;
    }

    const currentFundingAmount = toNullableNumber(funding.amount) ?? 0;
    const updatedFundingAmount = Number((currentFundingAmount + normalizedAmount).toFixed(2));
    await pool.query(
      `UPDATE group_funding SET amount = $1 WHERE id = $2`,
      [toDecimal(updatedFundingAmount), fundingId]
    );

    const donationLabel = funding.info ? `Funding donation: ${funding.info}` : "Funding donation";
    const donationExpenseResult = await pool.query(
      `INSERT INTO private_expenses (bank_account_id, source, category, amount, theo_amount, spent_at, due_date, pay_date, info, note, state, recurrence, cycle, is_active, created_at, updated_at, group_funding_id, funding_participant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
      [bankAccount.id, donationLabel, "other", amount, amount, createdAt, createdAt, createdAt, donationLabel, donationLabel, "open", null, "once", true, createdAt, createdAt, fundingId, fundingParticipantId]
    );
    await pool.query(
      `INSERT INTO transactions (private_expense_id, created_at) VALUES ($1, $2)`,
      [donationExpenseResult.rows[0].id, createdAt]
    );

    return sendJson(res, 201, { ok: true, donation: { funding_id: String(fundingId), amount: normalizedAmount, funding_total: updatedFundingAmount, bank_balance: Number((currentBalance - normalizedAmount).toFixed(2)) } });
  }

  async function handleCreateGroupExpense(req, res, groupIdRaw, session) {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
    if (context.membership.role !== "admin") return forbidden(res, "Only admins can create group expenses");

    const payload = await parseBody(req, res);
    if (!payload) return;

    const fundingId = parseObjectId(payload.group_funding_id);
    if (!fundingId) return badRequest(res, "A valid funding is required");
    const fundingResult = await pool.query(
      `SELECT id, amount FROM group_funding WHERE id = $1 AND group_id = $2`,
      [fundingId, context.groupId]
    );
    if (fundingResult.rows.length === 0) return notFound(res, "Funding not found in this group");
    const funding = fundingResult.rows[0];

    const normalizedAmount = parsePositiveAmount(payload.amount);
    if (normalizedAmount == null) return badRequest(res, "Expense amount must be a positive number");
    const payDate = toNullableDate(payload.due_date || payload.pay_date);
    if ((payload.due_date || payload.pay_date) && !payDate) return badRequest(res, "Expense due date is invalid");

    const info = String(payload.info || "").trim() || null;
    const fundingBalance = toNullableNumber(funding.amount) ?? 0;
    if (normalizedAmount > fundingBalance) return badRequest(res, "Funding balance is too low for this expense");

    const createdAt = new Date();
    const amountDecimal = toDecimal(normalizedAmount);
    const expenseResult = await pool.query(
      `INSERT INTO group_expenses (group_funding_id, amount, info, state, cycle, pay_date, due_date, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [fundingId, amountDecimal, info, "paid", null, payDate, payDate, createdAt]
    );
    await pool.query(
      `INSERT INTO transactions (group_expense_id, created_at) VALUES ($1, $2)`,
      [expenseResult.rows[0].id, createdAt]
    );

    const updatedFundingBalance = Number((fundingBalance - normalizedAmount).toFixed(2));
    await pool.query(
      `UPDATE group_funding SET amount = $1 WHERE id = $2`,
      [toDecimal(updatedFundingBalance), fundingId]
    );

    return sendJson(res, 201, { ok: true, expense: { group_expense_id: String(expenseResult.rows[0].id), group_funding_id: String(fundingId), amount: normalizedAmount, info, state: "paid", due_date: payDate, pay_date: payDate, created_at: createdAt, funding_balance: updatedFundingBalance } });
  }

  async function handleGroupMessages(req, res, groupIdRaw, session) {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });

    if (req.method === "GET") {
      const requestUrl = new URL(req.url || "/", "http://localhost");
      const requestedLimit = Number.parseInt(requestUrl.searchParams.get("limit") || "30", 10);
      const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 30;
      const beforeMessageIdRaw = String(requestUrl.searchParams.get("before_message_id") || "").trim();

      let rows;
      if (beforeMessageIdRaw) {
        const beforeMessageId = parseObjectId(beforeMessageIdRaw);
        if (!beforeMessageId) return badRequest(res, "Invalid before_message_id");
        const beforeResult = await pool.query(
          `SELECT id, created_at FROM group_message WHERE id = $1 AND group_id = $2`,
          [beforeMessageId, context.groupId]
        );
        if (beforeResult.rows.length === 0) return notFound(res, "Cursor message not found in this group");
        const beforeMessage = beforeResult.rows[0];
        const beforeCreatedAt = beforeMessage.created_at ?? null;

        let result;
        if (beforeCreatedAt) {
          result = await pool.query(
            `SELECT id, from_user_id, message, status, edited, created_at, deleted_at
             FROM group_message
             WHERE group_id = $1 AND (created_at < $2 OR (created_at = $2 AND id < $3))
             ORDER BY created_at DESC, id DESC
             LIMIT $4`,
            [context.groupId, beforeCreatedAt, beforeMessage.id, limit + 1]
          );
        } else {
          result = await pool.query(
            `SELECT id, from_user_id, message, status, edited, created_at, deleted_at
             FROM group_message
             WHERE group_id = $1 AND id < $2
             ORDER BY created_at DESC, id DESC
             LIMIT $3`,
            [context.groupId, beforeMessage.id, limit + 1]
          );
        }
        rows = result.rows;
      } else {
        const result = await pool.query(
          `SELECT id, from_user_id, message, status, edited, created_at, deleted_at
           FROM group_message
           WHERE group_id = $1
           ORDER BY created_at DESC, id DESC
           LIMIT $2`,
          [context.groupId, limit + 1]
        );
        rows = result.rows;
      }

      const hasOlder = rows.length > limit;
      const orderedRows = (hasOlder ? rows.slice(0, limit) : rows).reverse();
      const uniqueUserIds = [...new Set(orderedRows.map((entry) => entry.from_user_id))].filter(Boolean);

      let usersById = new Map();
      if (uniqueUserIds.length) {
        const usersResult = await pool.query(
          `SELECT id, username, first_name, last_name, "profileImage" FROM users WHERE id = ANY($1)`,
          [uniqueUserIds]
        );
        usersById = new Map(usersResult.rows.map((user) => [String(user.id), user]));
      }

      const messages = orderedRows.map((entry) => {
        const author = usersById.get(String(entry.from_user_id)) || null;
        return { message_id: String(entry.id), group_id: String(context.groupId), from_user_id: String(entry.from_user_id), username: author?.username || null, first_name: author?.first_name ?? null, last_name: author?.last_name ?? null, profileImage: author?.profileImage || null, message: entry.message ?? "", status: entry.status ?? null, edited: Boolean(entry.edited), created_at: entry.created_at ?? null, deleted_at: entry.deleted_at instanceof Date ? entry.deleted_at.toISOString() : null };
      });

      return sendJson(res, 200, { ok: true, messages, has_older: hasOlder });
    }

    const payload = await parseBody(req, res);
    if (!payload) return;

    const message = parseLongText(payload.message, ANSWER_MESSAGE_MAX_LENGTH);
    if (!message) return badRequest(res, "Message is required and must be short enough");
    if (detectBlockedMessageTerm(message)) return badRequest(res, "Die Nachricht enthaelt verbotene Begriffe und kann nicht gesendet werden.");

    const createdAt = new Date();
    const insertResult = await pool.query(
      `INSERT INTO group_message (group_id, from_user_id, message, status, edited, created_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [context.groupId, context.user.id, message, null, false, createdAt]
    );

    return sendJson(res, 201, { ok: true, message: { message_id: String(insertResult.rows[0].id), group_id: String(context.groupId), from_user_id: String(context.user.id), username: context.user.username || null, first_name: context.user.first_name ?? null, last_name: context.user.last_name ?? null, message, status: null, edited: false, created_at: createdAt } });
  }

  async function handleInviteUser(req, res, groupIdRaw, session) {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
    if (context.membership.role !== "admin") return forbidden(res, "Only admins can invite users");

    const payload = await parseBody(req, res);
    if (!payload) return;

    const username = String(payload.username || "").trim().toLowerCase();
    if (!username) return badRequest(res, "Username is required");

    const inviteUserResult = await pool.query(
      `SELECT id, username, first_name, last_name FROM users WHERE username = $1`,
      [username]
    );
    if (inviteUserResult.rows.length === 0) return notFound(res, "User not found");
    const inviteUser = inviteUserResult.rows[0];

    const existingResult = await pool.query(
      `SELECT id, status FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [context.groupId, inviteUser.id]
    );

    if (existingResult.rows.length > 0) {
      const existingMembership = existingResult.rows[0];
      if (existingMembership.status === "denied") {
        await pool.query(
          `UPDATE group_members SET role = $1, status = $2 WHERE id = $3`,
          ["member", "invited", existingMembership.id]
        );
        return sendJson(res, 200, { ok: true, member: { user_id: String(inviteUser.id), username: inviteUser.username, first_name: inviteUser.first_name ?? null, last_name: inviteUser.last_name ?? null, role: "member", status: "invited" } });
      }
      if (existingMembership.status === "invited") return conflict(res, "User already has a pending invitation");
      return conflict(res, "User is already in this group");
    }

    await pool.query(
      `INSERT INTO group_members (group_id, user_id, role, status) VALUES ($1, $2, $3, $4)`,
      [context.groupId, inviteUser.id, "member", "invited"]
    );
    return sendJson(res, 201, { ok: true, member: { user_id: String(inviteUser.id), username: inviteUser.username, first_name: inviteUser.first_name ?? null, last_name: inviteUser.last_name ?? null, role: "member", status: "invited" } });
  }

  async function handleGetInvitations(req, res, session) {
    if (req.method !== "GET") { res.setHeader("Allow", "GET"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const userId = parseObjectId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    const result = await pool.query(
      `SELECT g.id AS group_id, g.name AS group_name, g.address AS group_address, g.created_at AS group_created_at, gm.role, gm.status
       FROM group_members gm
       JOIN groups g ON g.id = gm.group_id
       WHERE gm.user_id = $1 AND gm.status = 'invited'
       ORDER BY g.created_at DESC`,
      [userId]
    );

    return sendJson(res, 200, { ok: true, invitations: result.rows.map((entry) => ({ group_id: String(entry.group_id), group_name: entry.group_name, group_address: entry.group_address ?? null, group_created_at: entry.group_created_at ?? null, role: entry.role, status: entry.status })) });
  }

  async function handleInvitationDecision(req, res, groupIdRaw, decision, session) {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    if (decision !== "accept" && decision !== "deny") return badRequest(res, "Invalid invitation decision");

    const groupId = parseObjectId(groupIdRaw);
    if (!groupId) return badRequest(res, "Invalid group id");
    const userId = parseObjectId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    const targetStatus = decision === "accept" ? "accepted" : "denied";
    const result = await pool.query(
      `UPDATE group_members SET status = $1 WHERE group_id = $2 AND user_id = $3 AND status = 'invited'`,
      [targetStatus, groupId, userId]
    );
    if (result.rowCount === 0) return notFound(res, "Invitation not found or already handled");

    return sendJson(res, 200, { ok: true, status: targetStatus });
  }

  async function handleRemoveMember(req, res, groupIdRaw, userIdRaw, session) {
    if (req.method !== "DELETE") { res.setHeader("Allow", "DELETE"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
    if (context.membership.role !== "admin") return forbidden(res, "Only admins can remove participants");

    const targetUserId = parseObjectId(userIdRaw);
    if (!targetUserId) return badRequest(res, "Invalid user id");
    if (targetUserId === context.user.id) return badRequest(res, "You can only remove other participants");

    const deleteResult = await pool.query(
      `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,
      [context.groupId, targetUserId]
    );
    if (deleteResult.rowCount === 0) return notFound(res, "Participant not found in this group");
    return sendJson(res, 200, { ok: true });
  }

  async function handlePromoteMemberToAdmin(req, res, groupIdRaw, userIdRaw, session) {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
    if (context.membership.role !== "admin") return forbidden(res, "Only admins can assign admin role");

    const targetUserId = parseObjectId(userIdRaw);
    if (!targetUserId) return badRequest(res, "Invalid user id");
    if (targetUserId === context.user.id) return badRequest(res, "You are already an admin");

    const targetResult = await pool.query(
      `SELECT id, role FROM group_members WHERE group_id = $1 AND user_id = $2 AND ${ACTIVE_MEMBER_FILTER}`,
      [context.groupId, targetUserId]
    );
    if (targetResult.rows.length === 0) return notFound(res, "Participant not found in this group");
    const targetMembership = targetResult.rows[0];
    if (targetMembership.role === "admin") return conflict(res, "User is already admin");

    await pool.query(
      `UPDATE group_members SET role = $1 WHERE id = $2`,
      ["admin", targetMembership.id]
    );
    return sendJson(res, 200, { ok: true, role: "admin" });
  }

  async function handleLeaveGroup(req, res, groupIdRaw, session) {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });

    const leaveResult = await pool.query(
      `DELETE FROM group_members WHERE id = $1`,
      [context.membership.id]
    );
    if (leaveResult.rowCount === 0) return notFound(res, "Membership not found");

    if (context.membership.role === "admin") {
      const adminCountResult = await pool.query(
        `SELECT COUNT(*) AS cnt FROM group_members WHERE group_id = $1 AND role = 'admin' AND ${ACTIVE_MEMBER_FILTER}`,
        [context.groupId]
      );
      const activeAdmins = Number(adminCountResult.rows[0].cnt);
      if (activeAdmins === 0) {
        const replacementResult = await pool.query(
          `SELECT id FROM group_members WHERE group_id = $1 AND ${ACTIVE_MEMBER_FILTER} ORDER BY id ASC LIMIT 1`,
          [context.groupId]
        );
        if (replacementResult.rows.length > 0) {
          await pool.query(
            `UPDATE group_members SET role = $1 WHERE id = $2`,
            ["admin", replacementResult.rows[0].id]
          );
        }
      }
    }

    const remainingResult = await pool.query(
      `SELECT COUNT(*) AS cnt FROM group_members WHERE group_id = $1 AND ${ACTIVE_MEMBER_FILTER}`,
      [context.groupId]
    );
    const remainingMembers = Number(remainingResult.rows[0].cnt);
    if (remainingMembers === 0) {
      await deleteGroupCascade(context.groupId);
      return sendJson(res, 200, { ok: true, left: true, deleted_group: true });
    }
    return sendJson(res, 200, { ok: true, left: true, deleted_group: false });
  }

  async function handleDeleteGroup(req, res, groupIdRaw, session) {
    if (req.method !== "DELETE") { res.setHeader("Allow", "DELETE"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
    if (context.membership.role !== "admin") return forbidden(res, "Only admins can delete groups");
    await deleteGroupCascade(context.groupId);
    return sendJson(res, 200, { ok: true });
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
    handleGroups, handleGroupDetail, handleCreateGroupActivity, handleCreateGroupFunding,
    handleDonateToFunding, handleCreateGroupExpense, handleGroupMessages,
    handleInviteUser, handleGetInvitations, handleInvitationDecision,
    handleRemoveMember, handlePromoteMemberToAdmin, handleLeaveGroup, handleDeleteGroup,
    handleDeleteGroupMessage
  };
}
