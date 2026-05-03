import { Decimal128 } from "mongodb";
import { COLLECTIONS, ANSWER_MESSAGE_MAX_LENGTH } from "../config/runtime.mjs";
import { detectBlockedMessageTerm } from "../config/blocked-names.mjs";
import { parseObjectId, parsePositiveAmount, toDecimal, toNumber } from "../utils/data.mjs";
import { readBody, sendJson } from "../utils/http.mjs";
import { badRequest, unauthorized, forbidden, notFound, conflict } from "../helpers/responses.mjs";
import { calculateDashboardStyleDonationBalance } from "../helpers/finance-db.mjs";

function activeMembershipFilter() {
  return { $or: [{ status: "accepted" }, { status: "active" }, { status: null }, { status: { $exists: false } }] };
}

function visibleMembershipFilter() {
  return { $or: [{ status: "accepted" }, { status: "invited" }, { status: "active" }, { status: null }, { status: { $exists: false } }] };
}

function toNullableDate(value) {
  if (value == null || value === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toNullableNumber(value) {
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLongText(value, maxLength) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.length > maxLength) return null;
  return text;
}

export function createGroupHandlers(db) {

  async function getGroupContext(groupIdRaw, sessionUserId) {
    const groupId = parseObjectId(groupIdRaw);
    if (!groupId) return { ok: false, status: 400, message: "Invalid group id" };

    const userObjectId = parseObjectId(sessionUserId);
    if (!userObjectId) return { ok: false, status: 401, message: "Session user invalid" };

    const user = await db.collection(COLLECTIONS.users).findOne({ _id: userObjectId }, { projection: { _id: 1, username: 1, first_name: 1, last_name: 1 } });
    if (!user) return { ok: false, status: 404, message: "Session user not found" };

    const group = await db.collection(COLLECTIONS.groups).findOne({ _id: groupId });
    if (!group) return { ok: false, status: 404, message: "Group not found" };

    const membership = await db.collection(COLLECTIONS.groupMembers).findOne({ group_id: groupId, user_id: user._id, ...activeMembershipFilter() });
    if (!membership) return { ok: false, status: 403, message: "You are not a participant of this group" };

    return { ok: true, groupId, user, group, membership };
  }

  async function deleteGroupCascade(groupId) {
    const groupFunding = await db.collection(COLLECTIONS.groupFunding).find({ group_id: groupId }, { projection: { _id: 1 } }).toArray();
    const fundingIds = groupFunding.map((funding) => funding._id);

    let groupExpenseIds = [];
    if (fundingIds.length) {
      const groupExpenses = await db.collection(COLLECTIONS.groupExpenses).find({ group_funding_id: { $in: fundingIds } }, { projection: { _id: 1 } }).toArray();
      groupExpenseIds = groupExpenses.map((expense) => expense._id);
    }

    if (groupExpenseIds.length) {
      await Promise.all([
        db.collection(COLLECTIONS.transactions).deleteMany({ group_expense_id: { $in: groupExpenseIds } }),
        db.collection(COLLECTIONS.groupExpenses).deleteMany({ _id: { $in: groupExpenseIds } })
      ]);
    }
    if (fundingIds.length) {
      await Promise.all([
        db.collection(COLLECTIONS.fundingParticipants).deleteMany({ group_funding_id: { $in: fundingIds } }),
        db.collection(COLLECTIONS.groupFunding).deleteMany({ _id: { $in: fundingIds } })
      ]);
    }

    await Promise.all([
      db.collection(COLLECTIONS.groupMessages).deleteMany({ group_id: groupId }),
      db.collection(COLLECTIONS.groupActivities).deleteMany({ group_id: groupId }),
      db.collection(COLLECTIONS.groupMembers).deleteMany({ group_id: groupId })
    ]);
    await db.collection(COLLECTIONS.groups).deleteOne({ _id: groupId });
  }

  async function handleGroups(req, res, session) {
    const userId = parseObjectId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    if (req.method === "GET") {
      const memberships = await db.collection(COLLECTIONS.groupMembers).aggregate([
        { $match: { user_id: userId, ...activeMembershipFilter() } },
        { $lookup: { from: COLLECTIONS.groups, localField: "group_id", foreignField: "_id", as: "group" } },
        { $unwind: "$group" },
        { $sort: { "group.created_at": -1 } },
        { $project: { _id: 0, group_id: "$group._id", name: "$group.name", address: "$group.address", created_at: "$group.created_at", role: "$role", status: "$status" } }
      ]).toArray();

      return sendJson(res, 200, {
        ok: true,
        session_username: session.user.username,
        groups: memberships.map((entry) => ({ group_id: String(entry.group_id), name: entry.name, address: entry.address ?? null, created_at: entry.created_at ?? null, role: entry.role, status: entry.status ?? null }))
      });
    }

    if (req.method === "POST") {
      let payload;
      try { payload = await readBody(req); } catch (error) {
        if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
        return badRequest(res, "Invalid JSON body");
      }

      const name = String(payload.name || "").trim();
      const address = String(payload.address || "").trim();
      if (!name) return badRequest(res, "Gruppenname ist erforderlich.");

      const now = new Date();
      const groupResult = await db.collection(COLLECTIONS.groups).insertOne({ name, address: address || null, created_at: now });
      await db.collection(COLLECTIONS.groupMembers).insertOne({ group_id: groupResult.insertedId, user_id: userId, role: "admin", status: "accepted" });

      return sendJson(res, 201, { ok: true, group: { group_id: String(groupResult.insertedId), name, address: address || null, role: "admin", status: "accepted", created_at: now } });
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

    const members = await db.collection(COLLECTIONS.groupMembers).aggregate([
      { $match: { group_id: context.groupId, ...visibleMembershipFilter() } },
      { $lookup: { from: COLLECTIONS.users, localField: "user_id", foreignField: "_id", as: "user" } },
      { $unwind: "$user" },
      { $sort: { "user.username": 1 } },
      { $project: { _id: 0, user_id: "$user._id", username: "$user.username", first_name: "$user.first_name", last_name: "$user.last_name", profileImage: "$user.profileImage", role: "$role", status: "$status" } }
    ]).toArray();

    const activities = await db.collection(COLLECTIONS.groupActivities).find({ group_id: context.groupId }, { projection: { _id: 1, info: 1, date: 1, created_at: 1 } }).sort({ date: -1, created_at: -1 }).toArray();
    const fundings = await db.collection(COLLECTIONS.groupFunding).find({ group_id: context.groupId }, { projection: { _id: 1, group_activity_id: 1, amount: 1, info: 1, created_at: 1 } }).sort({ created_at: -1 }).toArray();
    const activityById = new Map(activities.map((activity) => [String(activity._id), activity]));
    const fundingIds = fundings.map((funding) => funding._id);

    let participants = [];
    let expenses = [];
    let transactions = [];
    if (fundingIds.length) {
      participants = await db.collection(COLLECTIONS.fundingParticipants).aggregate([
        { $match: { group_funding_id: { $in: fundingIds } } },
        { $lookup: { from: COLLECTIONS.bankAccounts, localField: "bank_account_id", foreignField: "_id", as: "bank_account" } },
        { $unwind: "$bank_account" },
        { $lookup: { from: COLLECTIONS.users, localField: "bank_account.user_id", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        { $lookup: { from: COLLECTIONS.groupMembers, localField: "user._id", foreignField: "user_id", as: "membership" } },
        { $match: { membership: { $elemMatch: { group_id: context.groupId, $or: [{ status: "accepted" }, { status: "active" }, { status: null }, { status: { $exists: false } }] } } } },
        { $sort: { created_at: -1 } },
        { $project: { _id: 0, group_funding_id: 1, amount: 1, created_at: 1, user_id: "$user._id", username: "$user.username", first_name: "$user.first_name", last_name: "$user.last_name" } }
      ]).toArray();

      expenses = await db.collection(COLLECTIONS.groupExpenses).find({ group_funding_id: { $in: fundingIds } }, { projection: { _id: 1, group_funding_id: 1, amount: 1, info: 1, state: 1, cycle: 1, pay_date: 1, due_date: 1, created_at: 1 } }).sort({ created_at: -1 }).toArray();
      const expenseIds = expenses.map((expense) => expense._id);
      if (expenseIds.length) {
        transactions = await db.collection(COLLECTIONS.transactions).find({ group_expense_id: { $in: expenseIds } }, { projection: { _id: 1, group_expense_id: 1, created_at: 1 } }).sort({ created_at: -1 }).toArray();
      }
    }

    const participantsByFunding = new Map();
    for (const participant of participants) {
      const fundingKey = String(participant.group_funding_id);
      if (!participantsByFunding.has(fundingKey)) participantsByFunding.set(fundingKey, []);
      participantsByFunding.get(fundingKey).push(participant);
    }

    const expensesById = new Map(expenses.map((expense) => [String(expense._id), expense]));
    const fundingById = new Map(fundings.map((funding) => [String(funding._id), funding]));

    return sendJson(res, 200, {
      ok: true,
      group: { group_id: String(context.group._id), name: context.group.name, address: context.group.address ?? null, created_at: context.group.created_at ?? null },
      is_admin: context.membership.role === "admin",
      session_user_id: String(context.user._id),
      members: members.map((member) => ({ user_id: String(member.user_id), username: member.username, first_name: member.first_name ?? null, last_name: member.last_name ?? null, profileImage: member.profileImage ?? null, role: member.role, status: member.status ?? null })),
      activities: activities.map((activity) => ({ activity_id: String(activity._id), info: activity.info ?? null, date: activity.date ?? null, created_at: activity.created_at ?? null })),
      fundings: fundings.map((funding) => {
        const linkedActivity = funding.group_activity_id ? activityById.get(String(funding.group_activity_id)) : null;
        const contributions = participantsByFunding.get(String(funding._id)) ?? [];
        return {
          funding_id: String(funding._id), group_activity_id: funding.group_activity_id ? String(funding.group_activity_id) : null, amount: toNullableNumber(funding.amount), info: funding.info ?? null, created_at: funding.created_at ?? null,
          contributions: contributions.map((entry) => ({ user_id: String(entry.user_id), username: entry.username, first_name: entry.first_name ?? null, last_name: entry.last_name ?? null, amount: toNullableNumber(entry.amount), created_at: entry.created_at ?? null })),
          total_donated: Number(contributions.reduce((sum, entry) => sum + (toNullableNumber(entry.amount) ?? 0), 0).toFixed(2)),
          linked_activity: linkedActivity ? { activity_id: String(linkedActivity._id), info: linkedActivity.info ?? null, date: linkedActivity.date ?? null } : null
        };
      }),
      expenses: expenses.map((expense) => {
        const funding = fundingById.get(String(expense.group_funding_id));
        return { group_expense_id: String(expense._id), group_funding_id: String(expense.group_funding_id), funding_info: funding?.info ?? null, amount: toNullableNumber(expense.amount), info: expense.info ?? null, state: expense.state ?? null, cycle: expense.cycle ?? null, due_date: expense.due_date ?? expense.pay_date ?? null, pay_date: expense.pay_date ?? expense.due_date ?? null, created_at: expense.created_at ?? null };
      }),
      funding_transactions: transactions.map((transaction) => {
        const expense = expensesById.get(String(transaction.group_expense_id));
        const funding = expense ? fundingById.get(String(expense.group_funding_id)) : null;
        return { transaction_id: String(transaction._id), group_expense_id: String(transaction.group_expense_id), group_funding_id: expense ? String(expense.group_funding_id) : null, amount: expense ? toNullableNumber(expense.amount) : null, created_at: transaction.created_at ?? null, expense_info: expense?.info ?? null, funding_info: funding?.info ?? null };
      })
    });
  }

  async function handleCreateGroupActivity(req, res, groupIdRaw, session) {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
    let payload;
    try { payload = await readBody(req); } catch (error) {
      if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
      return badRequest(res, "Invalid JSON body");
    }
    const info = String(payload.info || "").trim();
    if (!info) return badRequest(res, "Activity info is required");
    const date = toNullableDate(payload.date);
    if (payload.date && !date) return badRequest(res, "Activity date is invalid");
    const createdAt = new Date();
    const insertResult = await db.collection(COLLECTIONS.groupActivities).insertOne({ group_id: context.groupId, info, date, created_at: createdAt });
    return sendJson(res, 201, { ok: true, activity: { activity_id: String(insertResult.insertedId), info, date, created_at: createdAt } });
  }

  async function handleCreateGroupFunding(req, res, groupIdRaw, session) {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
    let payload;
    try { payload = await readBody(req); } catch (error) {
      if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
      return badRequest(res, "Invalid JSON body");
    }

    const info = String(payload.info || "").trim() || null;
    let groupActivityId = null;
    const activityIdRaw = String(payload.group_activity_id || "").trim();
    if (activityIdRaw) {
      groupActivityId = parseObjectId(activityIdRaw);
      if (!groupActivityId) return badRequest(res, "Invalid linked activity id");
      const linkedActivity = await db.collection(COLLECTIONS.groupActivities).findOne({ _id: groupActivityId, group_id: context.groupId });
      if (!linkedActivity) return badRequest(res, "Linked activity does not exist in this group");
    }

    if (!groupActivityId) {
      const createdAt = new Date();
      const activityInsert = await db.collection(COLLECTIONS.groupActivities).insertOne({ group_id: context.groupId, info: info || "Funding activity", date: null, created_at: createdAt });
      groupActivityId = activityInsert.insertedId;
    }

    const createdAt = new Date();
    const amount = Decimal128.fromString("0.00");
    const insertResult = await db.collection(COLLECTIONS.groupFunding).insertOne({ group_id: context.groupId, group_activity_id: groupActivityId, amount, info, created_at: createdAt });
    return sendJson(res, 201, { ok: true, funding: { funding_id: String(insertResult.insertedId), group_activity_id: groupActivityId ? String(groupActivityId) : null, amount: 0, info, created_at: createdAt } });
  }

  async function handleDonateToFunding(req, res, groupIdRaw, fundingIdRaw, session) {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });

    const fundingId = parseObjectId(fundingIdRaw);
    if (!fundingId) return badRequest(res, "Invalid funding id");
    const funding = await db.collection(COLLECTIONS.groupFunding).findOne({ _id: fundingId, group_id: context.groupId }, { projection: { _id: 1, amount: 1, info: 1 } });
    if (!funding) return notFound(res, "Funding not found for this group");

    let payload;
    try { payload = await readBody(req); } catch (error) {
      if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
      return badRequest(res, "Invalid JSON body");
    }

    const normalizedAmount = parsePositiveAmount(payload.amount);
    if (normalizedAmount == null) return badRequest(res, "Donation amount must be a positive number");
    const amount = toDecimal(normalizedAmount);

    const donationBalance = await calculateDashboardStyleDonationBalance(db, context.user._id);
    const currentBalance = Math.max(0, donationBalance.availableDonationBalance);
    if (normalizedAmount > currentBalance) return badRequest(res, "Not enough available balance based on your dashboard entries for this donation");

    const bankAccount = donationBalance.userAccounts[0] ?? null;
    if (!bankAccount?._id) return badRequest(res, "No bank account available for this user");

    const existingParticipant = await db.collection(COLLECTIONS.fundingParticipants).findOne({ group_funding_id: fundingId, bank_account_id: bankAccount._id });
    const createdAt = new Date();
    let fundingParticipantId = null;

    if (existingParticipant) {
      fundingParticipantId = existingParticipant._id;
      const currentAmount = toNullableNumber(existingParticipant.amount) ?? 0;
      const nextAmount = Number((currentAmount + normalizedAmount).toFixed(2));
      await db.collection(COLLECTIONS.fundingParticipants).updateOne({ _id: existingParticipant._id }, { $set: { amount: toDecimal(nextAmount) } });
    } else {
      const insertParticipant = await db.collection(COLLECTIONS.fundingParticipants).insertOne({ group_funding_id: fundingId, bank_account_id: bankAccount._id, amount, created_at: createdAt });
      fundingParticipantId = insertParticipant.insertedId;
    }

    const currentFundingAmount = toNullableNumber(funding.amount) ?? 0;
    const updatedFundingAmount = Number((currentFundingAmount + normalizedAmount).toFixed(2));
    await db.collection(COLLECTIONS.groupFunding).updateOne({ _id: fundingId }, { $set: { amount: toDecimal(updatedFundingAmount) } });

    const donationLabel = funding.info ? `Funding donation: ${funding.info}` : "Funding donation";
    const donationExpense = await db.collection(COLLECTIONS.expenseEntries).insertOne({ bank_account_id: bankAccount._id, source: donationLabel, category: "other", amount, theo_amount: amount, spent_at: createdAt, due_date: createdAt, pay_date: createdAt, info: donationLabel, note: donationLabel, state: "open", recurrence: "once", cycle: "once", is_active: true, created_at: createdAt, updated_at: createdAt, group_funding_id: fundingId, funding_participant_id: fundingParticipantId });
    await db.collection(COLLECTIONS.transactions).insertOne({ private_expense_id: donationExpense.insertedId, created_at: createdAt });

    return sendJson(res, 201, { ok: true, donation: { funding_id: String(fundingId), amount: normalizedAmount, funding_total: updatedFundingAmount, bank_balance: Number((currentBalance - normalizedAmount).toFixed(2)) } });
  }

  async function handleCreateGroupExpense(req, res, groupIdRaw, session) {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
    if (context.membership.role !== "admin") return forbidden(res, "Only admins can create group expenses");

    let payload;
    try { payload = await readBody(req); } catch (error) {
      if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
      return badRequest(res, "Invalid JSON body");
    }

    const fundingId = parseObjectId(payload.group_funding_id);
    if (!fundingId) return badRequest(res, "A valid funding is required");
    const funding = await db.collection(COLLECTIONS.groupFunding).findOne({ _id: fundingId, group_id: context.groupId }, { projection: { _id: 1, amount: 1 } });
    if (!funding) return notFound(res, "Funding not found in this group");

    const normalizedAmount = parsePositiveAmount(payload.amount);
    if (normalizedAmount == null) return badRequest(res, "Expense amount must be a positive number");
    const payDate = toNullableDate(payload.due_date || payload.pay_date);
    if ((payload.due_date || payload.pay_date) && !payDate) return badRequest(res, "Expense due date is invalid");

    const info = String(payload.info || "").trim() || null;
    const fundingBalance = toNullableNumber(funding.amount) ?? 0;
    if (normalizedAmount > fundingBalance) return badRequest(res, "Funding balance is too low for this expense");

    const createdAt = new Date();
    const amountDecimal = toDecimal(normalizedAmount);
    const expenseResult = await db.collection(COLLECTIONS.groupExpenses).insertOne({ group_funding_id: fundingId, amount: amountDecimal, info, state: "paid", cycle: null, pay_date: payDate, due_date: payDate, created_at: createdAt });
    await db.collection(COLLECTIONS.transactions).insertOne({ group_expense_id: expenseResult.insertedId, created_at: createdAt });

    const updatedFundingBalance = Number((fundingBalance - normalizedAmount).toFixed(2));
    await db.collection(COLLECTIONS.groupFunding).updateOne({ _id: fundingId }, { $set: { amount: toDecimal(updatedFundingBalance) } });

    return sendJson(res, 201, { ok: true, expense: { group_expense_id: String(expenseResult.insertedId), group_funding_id: String(fundingId), amount: normalizedAmount, info, state: "paid", due_date: payDate, pay_date: payDate, created_at: createdAt, funding_balance: updatedFundingBalance } });
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

      const filter = { group_id: context.groupId };
      if (beforeMessageIdRaw) {
        const beforeMessageId = parseObjectId(beforeMessageIdRaw);
        if (!beforeMessageId) return badRequest(res, "Invalid before_message_id");
        const beforeMessage = await db.collection(COLLECTIONS.groupMessages).findOne({ _id: beforeMessageId, group_id: context.groupId }, { projection: { _id: 1, created_at: 1 } });
        if (!beforeMessage) return notFound(res, "Cursor message not found in this group");
        const beforeCreatedAt = beforeMessage.created_at ?? null;
        if (beforeCreatedAt) {
          filter.$or = [{ created_at: { $lt: beforeCreatedAt } }, { created_at: beforeCreatedAt, _id: { $lt: beforeMessage._id } }];
        } else {
          filter._id = { $lt: beforeMessage._id };
        }
      }

      const rows = await db.collection(COLLECTIONS.groupMessages).find(filter, { projection: { _id: 1, from_user_id: 1, message: 1, status: 1, edited: 1, created_at: 1, deleted_at: 1 } }).sort({ created_at: -1, _id: -1 }).limit(limit + 1).toArray();
      const hasOlder = rows.length > limit;
      const orderedRows = (hasOlder ? rows.slice(0, limit) : rows).reverse();
      const uniqueUserIds = [...new Set(orderedRows.map((entry) => String(entry.from_user_id)))].map((id) => parseObjectId(id)).filter(Boolean);
      const users = uniqueUserIds.length ? await db.collection(COLLECTIONS.users).find({ _id: { $in: uniqueUserIds } }, { projection: { _id: 1, username: 1, first_name: 1, last_name: 1, profileImage: 1 } }).toArray() : [];
      const usersById = new Map(users.map((user) => [String(user._id), user]));

      const messages = orderedRows.map((entry) => {
        const author = usersById.get(String(entry.from_user_id)) || null;
        return { message_id: String(entry._id), group_id: String(context.groupId), from_user_id: String(entry.from_user_id), username: author?.username || null, first_name: author?.first_name ?? null, last_name: author?.last_name ?? null, profileImage: author?.profileImage || null, message: entry.message ?? "", status: entry.status ?? null, edited: Boolean(entry.edited), created_at: entry.created_at ?? null, deleted_at: entry.deleted_at instanceof Date ? entry.deleted_at.toISOString() : null };
      });

      return sendJson(res, 200, { ok: true, messages, has_older: hasOlder });
    }

    let payload;
    try { payload = await readBody(req); } catch (error) {
      if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
      return badRequest(res, "Invalid JSON body");
    }

    const message = parseLongText(payload.message, ANSWER_MESSAGE_MAX_LENGTH);
    if (!message) return badRequest(res, "Message is required and must be short enough");
    if (detectBlockedMessageTerm(message)) return badRequest(res, "Die Nachricht enthaelt verbotene Begriffe und kann nicht gesendet werden.");

    const createdAt = new Date();
    const insertResult = await db.collection(COLLECTIONS.groupMessages).insertOne({ group_id: context.groupId, from_user_id: context.user._id, message, status: null, edited: false, created_at: createdAt });

    return sendJson(res, 201, { ok: true, message: { message_id: String(insertResult.insertedId), group_id: String(context.groupId), from_user_id: String(context.user._id), username: context.user.username || null, first_name: context.user.first_name ?? null, last_name: context.user.last_name ?? null, message, status: null, edited: false, created_at: createdAt } });
  }

  async function handleInviteUser(req, res, groupIdRaw, session) {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
    if (context.membership.role !== "admin") return forbidden(res, "Only admins can invite users");

    let payload;
    try { payload = await readBody(req); } catch (error) {
      if (error.message === "payload_too_large") return sendJson(res, 413, { ok: false, message: "Payload too large" });
      return badRequest(res, "Invalid JSON body");
    }

    const username = String(payload.username || "").trim().toLowerCase();
    if (!username) return badRequest(res, "Username is required");

    const inviteUser = await db.collection(COLLECTIONS.users).findOne({ username }, { projection: { _id: 1, username: 1, first_name: 1, last_name: 1 } });
    if (!inviteUser) return notFound(res, "User not found");

    const existingMembership = await db.collection(COLLECTIONS.groupMembers).findOne({ group_id: context.groupId, user_id: inviteUser._id });
    if (existingMembership) {
      if (existingMembership.status === "denied") {
        await db.collection(COLLECTIONS.groupMembers).updateOne({ _id: existingMembership._id }, { $set: { role: "member", status: "invited" } });
        return sendJson(res, 200, { ok: true, member: { user_id: String(inviteUser._id), username: inviteUser.username, first_name: inviteUser.first_name ?? null, last_name: inviteUser.last_name ?? null, role: "member", status: "invited" } });
      }
      if (existingMembership.status === "invited") return conflict(res, "User already has a pending invitation");
      return conflict(res, "User is already in this group");
    }

    await db.collection(COLLECTIONS.groupMembers).insertOne({ group_id: context.groupId, user_id: inviteUser._id, role: "member", status: "invited" });
    return sendJson(res, 201, { ok: true, member: { user_id: String(inviteUser._id), username: inviteUser.username, first_name: inviteUser.first_name ?? null, last_name: inviteUser.last_name ?? null, role: "member", status: "invited" } });
  }

  async function handleGetInvitations(req, res, session) {
    if (req.method !== "GET") { res.setHeader("Allow", "GET"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const userId = parseObjectId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    const invitations = await db.collection(COLLECTIONS.groupMembers).aggregate([
      { $match: { user_id: userId, status: "invited" } },
      { $lookup: { from: COLLECTIONS.groups, localField: "group_id", foreignField: "_id", as: "group" } },
      { $unwind: "$group" },
      { $sort: { "group.created_at": -1 } },
      { $project: { _id: 0, group_id: "$group._id", group_name: "$group.name", group_address: "$group.address", group_created_at: "$group.created_at", role: "$role", status: "$status" } }
    ]).toArray();

    return sendJson(res, 200, { ok: true, invitations: invitations.map((entry) => ({ group_id: String(entry.group_id), group_name: entry.group_name, group_address: entry.group_address ?? null, group_created_at: entry.group_created_at ?? null, role: entry.role, status: entry.status })) });
  }

  async function handleInvitationDecision(req, res, groupIdRaw, decision, session) {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    if (decision !== "accept" && decision !== "deny") return badRequest(res, "Invalid invitation decision");

    const groupId = parseObjectId(groupIdRaw);
    if (!groupId) return badRequest(res, "Invalid group id");
    const userId = parseObjectId(session.user.id);
    if (!userId) return unauthorized(res, "Session user invalid");

    const targetStatus = decision === "accept" ? "accepted" : "denied";
    const result = await db.collection(COLLECTIONS.groupMembers).updateOne({ group_id: groupId, user_id: userId, status: "invited" }, { $set: { status: targetStatus } });
    if (result.matchedCount === 0) return notFound(res, "Invitation not found or already handled");

    return sendJson(res, 200, { ok: true, status: targetStatus });
  }

  async function handleRemoveMember(req, res, groupIdRaw, userIdRaw, session) {
    if (req.method !== "DELETE") { res.setHeader("Allow", "DELETE"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
    if (context.membership.role !== "admin") return forbidden(res, "Only admins can remove participants");

    const targetUserId = parseObjectId(userIdRaw);
    if (!targetUserId) return badRequest(res, "Invalid user id");
    if (String(targetUserId) === String(context.user._id)) return badRequest(res, "You can only remove other participants");

    const deleteResult = await db.collection(COLLECTIONS.groupMembers).deleteOne({ group_id: context.groupId, user_id: targetUserId });
    if (deleteResult.deletedCount === 0) return notFound(res, "Participant not found in this group");
    return sendJson(res, 200, { ok: true });
  }

  async function handlePromoteMemberToAdmin(req, res, groupIdRaw, userIdRaw, session) {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });
    if (context.membership.role !== "admin") return forbidden(res, "Only admins can assign admin role");

    const targetUserId = parseObjectId(userIdRaw);
    if (!targetUserId) return badRequest(res, "Invalid user id");
    if (String(targetUserId) === String(context.user._id)) return badRequest(res, "You are already an admin");

    const targetMembership = await db.collection(COLLECTIONS.groupMembers).findOne({ group_id: context.groupId, user_id: targetUserId, ...activeMembershipFilter() });
    if (!targetMembership) return notFound(res, "Participant not found in this group");
    if (targetMembership.role === "admin") return conflict(res, "User is already admin");

    await db.collection(COLLECTIONS.groupMembers).updateOne({ _id: targetMembership._id }, { $set: { role: "admin" } });
    return sendJson(res, 200, { ok: true, role: "admin" });
  }

  async function handleLeaveGroup(req, res, groupIdRaw, session) {
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return sendJson(res, 405, { ok: false, message: "Method not allowed" }); }
    const context = await getGroupContext(groupIdRaw, session.user.id);
    if (!context.ok) return sendJson(res, context.status, { ok: false, message: context.message });

    const leaveResult = await db.collection(COLLECTIONS.groupMembers).deleteOne({ _id: context.membership._id });
    if (leaveResult.deletedCount === 0) return notFound(res, "Membership not found");

    if (context.membership.role === "admin") {
      const activeAdmins = await db.collection(COLLECTIONS.groupMembers).countDocuments({ group_id: context.groupId, role: "admin", ...activeMembershipFilter() });
      if (activeAdmins === 0) {
        const replacementAdmin = await db.collection(COLLECTIONS.groupMembers).findOne({ group_id: context.groupId, ...activeMembershipFilter() }, { sort: { _id: 1 } });
        if (replacementAdmin) await db.collection(COLLECTIONS.groupMembers).updateOne({ _id: replacementAdmin._id }, { $set: { role: "admin" } });
      }
    }

    const remainingMembers = await db.collection(COLLECTIONS.groupMembers).countDocuments({ group_id: context.groupId, ...activeMembershipFilter() });
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

  return {
    handleGroups, handleGroupDetail, handleCreateGroupActivity, handleCreateGroupFunding,
    handleDonateToFunding, handleCreateGroupExpense, handleGroupMessages,
    handleInviteUser, handleGetInvitations, handleInvitationDecision,
    handleRemoveMember, handlePromoteMemberToAdmin, handleLeaveGroup, handleDeleteGroup
  };
}
