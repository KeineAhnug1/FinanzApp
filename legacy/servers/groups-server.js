const http = require("http");
const path = require("path");
const { readFile } = require("fs/promises");
const { MongoClient, ObjectId, Decimal128 } = require("mongodb");
require("dotenv").config();

const PORT = Number(process.env.PORT || 3001);
const BASE_DB_NAME = process.env.MONGODB_DB || "finanzapp";
const DB_NAME = process.env.MONGODB_DB_V2 || `${BASE_DB_NAME}_v2`;
const MONGO_URI = process.env.MONGODB_URI;
const STATIC_ROOT = __dirname;
const SESSION_USERNAME = "anna";

if (!MONGO_URI) {
  throw new Error("MONGODB_URI is not set in the environment");
}

const client = new MongoClient(MONGO_URI);
let db;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("payload_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function toObjectId(value) {
  try {
    return new ObjectId(String(value));
  } catch {
    return null;
  }
}

function toNullableDate(value) {
  if (value == null || value === "") {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function toNullableNumber(value) {
  if (value == null) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "object" && typeof value.toString === "function") {
    const parsed = Number(value.toString());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function getSessionUser() {
  return db.collection("users").findOne(
    { username: SESSION_USERNAME },
    { projection: { _id: 1, username: 1, first_name: 1, last_name: 1 } }
  );
}

function activeMembershipFilter() {
  return {
    $or: [
      { status: "accepted" },
      { status: "active" },
      { status: null },
      { status: { $exists: false } }
    ]
  };
}

function visibleMembershipFilter() {
  return {
    $or: [
      { status: "accepted" },
      { status: "invited" },
      { status: "active" },
      { status: null },
      { status: { $exists: false } }
    ]
  };
}

async function handleGetSession(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const user = await getSessionUser();
  if (!user) {
    return sendJson(res, 404, { ok: false, message: "Session user not found" });
  }

  return sendJson(res, 200, {
    ok: true,
    session_user: {
      id: String(user._id),
      username: user.username,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null
    }
  });
}

async function getGroupContext(groupIdRaw) {
  const groupId = toObjectId(groupIdRaw);
  if (!groupId) {
    return { ok: false, status: 400, message: "Invalid group id" };
  }

  const user = await getSessionUser();
  if (!user) {
    return { ok: false, status: 404, message: "Session user not found" };
  }

  const group = await db.collection("groups").findOne({ _id: groupId });
  if (!group) {
    return { ok: false, status: 404, message: "Group not found" };
  }

  const membership = await db.collection("group_members").findOne({
    group_id: groupId,
    user_id: user._id,
    ...activeMembershipFilter()
  });
  if (!membership) {
    return { ok: false, status: 403, message: "You are not a participant of this group" };
  }

  return { ok: true, groupId, user, group, membership };
}

async function handleGroupDetail(req, res, groupIdRaw) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw);
  if (!context.ok) {
    return sendJson(res, context.status, { ok: false, message: context.message });
  }

  const members = await db.collection("group_members").aggregate([
    { $match: { group_id: context.groupId, ...visibleMembershipFilter() } },
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        as: "user"
      }
    },
    { $unwind: "$user" },
    { $sort: { "user.username": 1 } },
    {
      $project: {
        _id: 0,
        user_id: "$user._id",
        username: "$user.username",
        first_name: "$user.first_name",
        last_name: "$user.last_name",
        role: "$role",
        status: "$status"
      }
    }
  ]).toArray();

  const activities = await db.collection("group_activities").find(
    { group_id: context.groupId },
    { projection: { _id: 1, info: 1, date: 1, created_at: 1 } }
  ).sort({ date: -1, created_at: -1 }).toArray();

  const fundings = await db.collection("group_funding").find(
    { group_id: context.groupId },
    { projection: { _id: 1, group_activity_id: 1, amount: 1, info: 1, created_at: 1 } }
  ).sort({ created_at: -1 }).toArray();

  const activityById = new Map(
    activities.map((activity) => [String(activity._id), activity])
  );

  const fundingIds = fundings.map((funding) => funding._id);

  let participants = [];
  let expenses = [];
  let transactions = [];
  if (fundingIds.length) {
    participants = await db.collection("funding_participants").aggregate([
      { $match: { group_funding_id: { $in: fundingIds } } },
      {
        $lookup: {
          from: "group_members",
          localField: "group_member_id",
          foreignField: "_id",
          as: "member"
        }
      },
      { $unwind: "$member" },
      { $match: { "member.group_id": context.groupId } },
      {
        $lookup: {
          from: "users",
          localField: "member.user_id",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: "$user" },
      { $sort: { created_at: -1 } },
      {
        $project: {
          _id: 0,
          group_funding_id: 1,
          amount: 1,
          created_at: 1,
          user_id: "$user._id",
          username: "$user.username",
          first_name: "$user.first_name",
          last_name: "$user.last_name"
        }
      }
    ]).toArray();

    expenses = await db.collection("group_expenses").find(
      { group_funding_id: { $in: fundingIds } },
      { projection: { _id: 1, group_funding_id: 1, amount: 1, info: 1, state: 1, due_date: 1, created_at: 1 } }
    ).sort({ created_at: -1 }).toArray();

    const expenseIds = expenses.map((expense) => expense._id);
    if (expenseIds.length) {
      transactions = await db.collection("transactions").find(
        { group_expense_id: { $in: expenseIds } },
        { projection: { _id: 1, group_expense_id: 1, amount: 1, created_at: 1 } }
      ).sort({ created_at: -1 }).toArray();
    }
  }

  const participantsByFunding = new Map();
  for (const participant of participants) {
    const fundingKey = String(participant.group_funding_id);
    if (!participantsByFunding.has(fundingKey)) {
      participantsByFunding.set(fundingKey, []);
    }
    participantsByFunding.get(fundingKey).push(participant);
  }

  const expensesById = new Map(
    expenses.map((expense) => [String(expense._id), expense])
  );
  const fundingById = new Map(
    fundings.map((funding) => [String(funding._id), funding])
  );

  return sendJson(res, 200, {
    ok: true,
    group: {
      group_id: String(context.group._id),
      name: context.group.name,
      address: context.group.address ?? null,
      created_at: context.group.created_at ?? null
    },
    is_admin: context.membership.role === "admin",
    session_user_id: String(context.user._id),
    members: members.map((member) => ({
      user_id: String(member.user_id),
      username: member.username,
      first_name: member.first_name ?? null,
      last_name: member.last_name ?? null,
      role: member.role,
      status: member.status ?? null
    })),
    activities: activities.map((activity) => ({
      activity_id: String(activity._id),
      info: activity.info ?? null,
      date: activity.date ?? null,
      created_at: activity.created_at ?? null
    })),
    fundings: fundings.map((funding) => {
      const linkedActivity = funding.group_activity_id
        ? activityById.get(String(funding.group_activity_id))
        : null;
      const contributions = participantsByFunding.get(String(funding._id)) ?? [];
      return {
        funding_id: String(funding._id),
        group_activity_id: funding.group_activity_id ? String(funding.group_activity_id) : null,
        amount: toNullableNumber(funding.amount),
        info: funding.info ?? null,
        created_at: funding.created_at ?? null,
        contributions: contributions.map((entry) => ({
          user_id: String(entry.user_id),
          username: entry.username,
          first_name: entry.first_name ?? null,
          last_name: entry.last_name ?? null,
          amount: toNullableNumber(entry.amount),
          created_at: entry.created_at ?? null
        })),
        total_donated: Number(
          contributions.reduce((sum, entry) => sum + (toNullableNumber(entry.amount) ?? 0), 0).toFixed(2)
        ),
        linked_activity: linkedActivity
          ? {
            activity_id: String(linkedActivity._id),
            info: linkedActivity.info ?? null,
            date: linkedActivity.date ?? null
          }
          : null
      };
    }),
    expenses: expenses.map((expense) => {
      const funding = fundingById.get(String(expense.group_funding_id));
      return {
        group_expense_id: String(expense._id),
        group_funding_id: String(expense.group_funding_id),
        funding_info: funding?.info ?? null,
        amount: toNullableNumber(expense.amount),
        info: expense.info ?? null,
        state: expense.state ?? null,
        due_date: expense.due_date ?? null,
        created_at: expense.created_at ?? null
      };
    }),
    funding_transactions: transactions.map((transaction) => {
      const expense = expensesById.get(String(transaction.group_expense_id));
      const funding = expense ? fundingById.get(String(expense.group_funding_id)) : null;
      return {
        transaction_id: String(transaction._id),
        group_expense_id: String(transaction.group_expense_id),
        group_funding_id: expense ? String(expense.group_funding_id) : null,
        amount: toNullableNumber(transaction.amount),
        created_at: transaction.created_at ?? null,
        expense_info: expense?.info ?? null,
        funding_info: funding?.info ?? null
      };
    })
  });
}

async function handleDonateToFunding(req, res, groupIdRaw, fundingIdRaw) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw);
  if (!context.ok) {
    return sendJson(res, context.status, { ok: false, message: context.message });
  }

  const fundingId = toObjectId(fundingIdRaw);
  if (!fundingId) {
    return sendJson(res, 400, { ok: false, message: "Invalid funding id" });
  }

  const funding = await db.collection("group_funding").findOne(
    { _id: fundingId, group_id: context.groupId },
    { projection: { _id: 1, amount: 1 } }
  );
  if (!funding) {
    return sendJson(res, 404, { ok: false, message: "Funding not found for this group" });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") {
      return sendJson(res, 413, { ok: false, message: "Payload too large" });
    }
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const amountRaw = String(payload.amount ?? "").trim();
  const amountNumber = Number(amountRaw);
  if (!amountRaw || !Number.isFinite(amountNumber) || amountNumber <= 0) {
    return sendJson(res, 400, { ok: false, message: "Donation amount must be a positive number" });
  }
  const normalizedAmount = Number(amountNumber.toFixed(2));
  const amount = Decimal128.fromString(normalizedAmount.toFixed(2));

  const bankAccount = await db.collection("bank_accounts").findOne(
    { user_id: context.user._id },
    { projection: { _id: 1, balance: 1 } }
  );
  if (!bankAccount) {
    return sendJson(res, 404, { ok: false, message: "No bank account found for session user" });
  }

  const currentBalance = toNullableNumber(bankAccount.balance) ?? 0;
  if (normalizedAmount > currentBalance) {
    return sendJson(res, 400, { ok: false, message: "Not enough money on your bank account for this donation" });
  }

  const existingParticipant = await db.collection("funding_participants").findOne({
    group_funding_id: fundingId,
    group_member_id: context.membership._id
  });

  if (existingParticipant) {
    const currentAmount = toNullableNumber(existingParticipant.amount) ?? 0;
    const nextAmount = Number((currentAmount + normalizedAmount).toFixed(2));
    await db.collection("funding_participants").updateOne(
      { _id: existingParticipant._id },
      { $set: { amount: Decimal128.fromString(nextAmount.toFixed(2)) } }
    );
  } else {
    await db.collection("funding_participants").insertOne({
      group_funding_id: fundingId,
      group_member_id: context.membership._id,
      amount,
      created_at: new Date()
    });
  }

  const currentFundingAmount = toNullableNumber(funding.amount) ?? 0;
  const updatedFundingAmount = Number((currentFundingAmount + normalizedAmount).toFixed(2));
  await db.collection("group_funding").updateOne(
    { _id: fundingId },
    { $set: { amount: Decimal128.fromString(updatedFundingAmount.toFixed(2)) } }
  );

  const updatedBankBalance = Number((currentBalance - normalizedAmount).toFixed(2));
  await db.collection("bank_accounts").updateOne(
    { _id: bankAccount._id },
    { $set: { balance: Decimal128.fromString(updatedBankBalance.toFixed(2)) } }
  );

  return sendJson(res, 201, {
    ok: true,
    donation: {
      funding_id: String(fundingId),
      amount: normalizedAmount,
      funding_total: updatedFundingAmount,
      bank_balance: updatedBankBalance
    }
  });
}

async function handleCreateGroupExpense(req, res, groupIdRaw) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw);
  if (!context.ok) {
    return sendJson(res, context.status, { ok: false, message: context.message });
  }
  if (context.membership.role !== "admin") {
    return sendJson(res, 403, { ok: false, message: "Only admins can create group expenses" });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") {
      return sendJson(res, 413, { ok: false, message: "Payload too large" });
    }
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const fundingId = toObjectId(payload.group_funding_id);
  if (!fundingId) {
    return sendJson(res, 400, { ok: false, message: "A valid funding is required" });
  }

  const funding = await db.collection("group_funding").findOne({
    _id: fundingId,
    group_id: context.groupId
  }, {
    projection: { _id: 1, amount: 1 }
  });
  if (!funding) {
    return sendJson(res, 404, { ok: false, message: "Funding not found in this group" });
  }

  const amountRaw = String(payload.amount ?? "").trim();
  const amountNumber = Number(amountRaw);
  if (!amountRaw || !Number.isFinite(amountNumber) || amountNumber <= 0) {
    return sendJson(res, 400, { ok: false, message: "Expense amount must be a positive number" });
  }
  const normalizedAmount = Number(amountNumber.toFixed(2));

  const dueDate = toNullableDate(payload.due_date);
  if (payload.due_date && !dueDate) {
    return sendJson(res, 400, { ok: false, message: "Expense due date is invalid" });
  }

  const info = String(payload.info || "").trim() || null;
  const fundingBalance = toNullableNumber(funding.amount) ?? 0;
  if (normalizedAmount > fundingBalance) {
    return sendJson(res, 400, { ok: false, message: "Funding balance is too low for this expense" });
  }

  const createdAt = new Date();
  const amountDecimal = Decimal128.fromString(normalizedAmount.toFixed(2));
  const expenseResult = await db.collection("group_expenses").insertOne({
    group_funding_id: fundingId,
    amount: amountDecimal,
    info,
    state: "paid",
    due_date: dueDate,
    created_at: createdAt
  });

  await db.collection("transactions").insertOne({
    group_expense_id: expenseResult.insertedId,
    amount: amountDecimal,
    created_at: createdAt
  });

  const updatedFundingBalance = Number((fundingBalance - normalizedAmount).toFixed(2));
  await db.collection("group_funding").updateOne(
    { _id: fundingId },
    { $set: { amount: Decimal128.fromString(updatedFundingBalance.toFixed(2)) } }
  );

  return sendJson(res, 201, {
    ok: true,
    expense: {
      group_expense_id: String(expenseResult.insertedId),
      group_funding_id: String(fundingId),
      amount: normalizedAmount,
      info,
      state: "paid",
      due_date: dueDate,
      created_at: createdAt,
      funding_balance: updatedFundingBalance
    }
  });
}

async function handleCreateGroupActivity(req, res, groupIdRaw) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw);
  if (!context.ok) {
    return sendJson(res, context.status, { ok: false, message: context.message });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") {
      return sendJson(res, 413, { ok: false, message: "Payload too large" });
    }
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const info = String(payload.info || "").trim();
  if (!info) {
    return sendJson(res, 400, { ok: false, message: "Activity info is required" });
  }

  const date = toNullableDate(payload.date);
  if (payload.date && !date) {
    return sendJson(res, 400, { ok: false, message: "Activity date is invalid" });
  }

  const createdAt = new Date();
  const insertResult = await db.collection("group_activities").insertOne({
    group_id: context.groupId,
    info,
    date,
    created_at: createdAt
  });

  return sendJson(res, 201, {
    ok: true,
    activity: {
      activity_id: String(insertResult.insertedId),
      info,
      date,
      created_at: createdAt
    }
  });
}

async function handleCreateGroupFunding(req, res, groupIdRaw) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw);
  if (!context.ok) {
    return sendJson(res, context.status, { ok: false, message: context.message });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") {
      return sendJson(res, 413, { ok: false, message: "Payload too large" });
    }
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const info = String(payload.info || "").trim() || null;
  const amountRaw = String(payload.amount ?? "").trim();
  const amountNumber = amountRaw ? Number(amountRaw) : null;
  if (amountRaw && (!Number.isFinite(amountNumber) || amountNumber < 0)) {
    return sendJson(res, 400, { ok: false, message: "Funding amount must be a non-negative number" });
  }
  const amount = amountNumber == null ? null : Decimal128.fromString(amountNumber.toFixed(2));

  let groupActivityId = null;
  const activityIdRaw = String(payload.group_activity_id || "").trim();
  if (activityIdRaw) {
    groupActivityId = toObjectId(activityIdRaw);
    if (!groupActivityId) {
      return sendJson(res, 400, { ok: false, message: "Invalid linked activity id" });
    }
    const linkedActivity = await db.collection("group_activities").findOne({
      _id: groupActivityId,
      group_id: context.groupId
    });
    if (!linkedActivity) {
      return sendJson(res, 400, { ok: false, message: "Linked activity does not exist in this group" });
    }
  }

  if (!info && amount == null && !groupActivityId) {
    return sendJson(res, 400, {
      ok: false,
      message: "Funding needs at least amount, info or a linked activity"
    });
  }

  const createdAt = new Date();
  const insertResult = await db.collection("group_funding").insertOne({
    group_id: context.groupId,
    group_activity_id: groupActivityId,
    amount,
    info,
    created_at: createdAt
  });

  return sendJson(res, 201, {
    ok: true,
    funding: {
      funding_id: String(insertResult.insertedId),
      group_activity_id: groupActivityId ? String(groupActivityId) : null,
      amount: amountNumber,
      info,
      created_at: createdAt
    }
  });
}

async function handleInviteUser(req, res, groupIdRaw) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw);
  if (!context.ok) {
    return sendJson(res, context.status, { ok: false, message: context.message });
  }
  if (context.membership.role !== "admin") {
    return sendJson(res, 403, { ok: false, message: "Only admins can invite users" });
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    if (error.message === "payload_too_large") {
      return sendJson(res, 413, { ok: false, message: "Payload too large" });
    }
    return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
  }

  const username = String(payload.username || "").trim().toLowerCase();
  if (!username) {
    return sendJson(res, 400, { ok: false, message: "Username is required" });
  }

  const inviteUser = await db.collection("users").findOne(
    { username },
    { projection: { _id: 1, username: 1, first_name: 1, last_name: 1 } }
  );
  if (!inviteUser) {
    return sendJson(res, 404, { ok: false, message: "User not found" });
  }

  const existingMembership = await db.collection("group_members").findOne({
    group_id: context.groupId,
    user_id: inviteUser._id
  });
  if (existingMembership) {
    if (existingMembership.status === "denied") {
      await db.collection("group_members").updateOne(
        { _id: existingMembership._id },
        { $set: { role: "member", status: "invited" } }
      );

      return sendJson(res, 200, {
        ok: true,
        member: {
          user_id: String(inviteUser._id),
          username: inviteUser.username,
          first_name: inviteUser.first_name ?? null,
          last_name: inviteUser.last_name ?? null,
          role: "member",
          status: "invited"
        }
      });
    }

    if (existingMembership.status === "invited") {
      return sendJson(res, 409, { ok: false, message: "User already has a pending invitation" });
    }

    return sendJson(res, 409, { ok: false, message: "User is already in this group" });
  }

  await db.collection("group_members").insertOne({
    group_id: context.groupId,
    user_id: inviteUser._id,
    role: "member",
    status: "invited"
  });

  return sendJson(res, 201, {
    ok: true,
    member: {
      user_id: String(inviteUser._id),
      username: inviteUser.username,
      first_name: inviteUser.first_name ?? null,
      last_name: inviteUser.last_name ?? null,
      role: "member",
      status: "invited"
    }
  });
}

async function handleGetInvitations(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const user = await getSessionUser();
  if (!user) {
    return sendJson(res, 404, { ok: false, message: "Session user not found" });
  }

  const invitations = await db.collection("group_members").aggregate([
    { $match: { user_id: user._id, status: "invited" } },
    {
      $lookup: {
        from: "groups",
        localField: "group_id",
        foreignField: "_id",
        as: "group"
      }
    },
    { $unwind: "$group" },
    { $sort: { "group.created_at": -1 } },
    {
      $project: {
        _id: 0,
        group_id: "$group._id",
        group_name: "$group.name",
        group_address: "$group.address",
        group_created_at: "$group.created_at",
        role: "$role",
        status: "$status"
      }
    }
  ]).toArray();

  return sendJson(res, 200, {
    ok: true,
    invitations: invitations.map((entry) => ({
      group_id: String(entry.group_id),
      group_name: entry.group_name,
      group_address: entry.group_address ?? null,
      group_created_at: entry.group_created_at ?? null,
      role: entry.role,
      status: entry.status
    }))
  });
}

async function handleInvitationDecision(req, res, groupIdRaw, decision) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  if (decision !== "accept" && decision !== "deny") {
    return sendJson(res, 400, { ok: false, message: "Invalid invitation decision" });
  }

  const groupId = toObjectId(groupIdRaw);
  if (!groupId) {
    return sendJson(res, 400, { ok: false, message: "Invalid group id" });
  }

  const user = await getSessionUser();
  if (!user) {
    return sendJson(res, 404, { ok: false, message: "Session user not found" });
  }

  const targetStatus = decision === "accept" ? "accepted" : "denied";
  const result = await db.collection("group_members").updateOne({
    group_id: groupId,
    user_id: user._id,
    status: "invited"
  }, {
    $set: { status: targetStatus }
  });

  if (result.matchedCount === 0) {
    return sendJson(res, 404, { ok: false, message: "Invitation not found or already handled" });
  }

  return sendJson(res, 200, { ok: true, status: targetStatus });
}

async function handleRemoveMember(req, res, groupIdRaw, userIdRaw) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw);
  if (!context.ok) {
    return sendJson(res, context.status, { ok: false, message: context.message });
  }
  if (context.membership.role !== "admin") {
    return sendJson(res, 403, { ok: false, message: "Only admins can remove participants" });
  }

  const targetUserId = toObjectId(userIdRaw);
  if (!targetUserId) {
    return sendJson(res, 400, { ok: false, message: "Invalid user id" });
  }
  if (String(targetUserId) === String(context.user._id)) {
    return sendJson(res, 400, { ok: false, message: "You can only remove other participants" });
  }

  const deleteResult = await db.collection("group_members").deleteOne({
    group_id: context.groupId,
    user_id: targetUserId
  });
  if (deleteResult.deletedCount === 0) {
    return sendJson(res, 404, { ok: false, message: "Participant not found in this group" });
  }

  return sendJson(res, 200, { ok: true });
}

async function handleDeleteGroup(req, res, groupIdRaw) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const context = await getGroupContext(groupIdRaw);
  if (!context.ok) {
    return sendJson(res, context.status, { ok: false, message: context.message });
  }
  if (context.membership.role !== "admin") {
    return sendJson(res, 403, { ok: false, message: "Only admins can delete groups" });
  }

  const groupFunding = await db.collection("group_funding").find(
    { group_id: context.groupId },
    { projection: { _id: 1 } }
  ).toArray();
  const fundingIds = groupFunding.map((funding) => funding._id);

  let groupExpenseIds = [];
  if (fundingIds.length) {
    const groupExpenses = await db.collection("group_expenses").find(
      { group_funding_id: { $in: fundingIds } },
      { projection: { _id: 1 } }
    ).toArray();
    groupExpenseIds = groupExpenses.map((expense) => expense._id);
  }

  if (groupExpenseIds.length) {
    await db.collection("transactions").deleteMany({ group_expense_id: { $in: groupExpenseIds } });
    await db.collection("group_expenses").deleteMany({ _id: { $in: groupExpenseIds } });
  }
  if (fundingIds.length) {
    await db.collection("funding_participants").deleteMany({ group_funding_id: { $in: fundingIds } });
    await db.collection("group_funding").deleteMany({ _id: { $in: fundingIds } });
  }

  await db.collection("group_activities").deleteMany({ group_id: context.groupId });

  await db.collection("group_members").deleteMany({ group_id: context.groupId });
  await db.collection("groups").deleteOne({ _id: context.groupId });

  return sendJson(res, 200, { ok: true });
}

async function handleGroups(req, res) {
  if (req.method === "GET") {
    const user = await getSessionUser();
    if (!user) {
      return sendJson(res, 404, { ok: false, message: "Session user not found" });
    }

    const memberships = await db.collection("group_members").aggregate([
      { $match: { user_id: user._id, ...activeMembershipFilter() } },
      {
        $lookup: {
          from: "groups",
          localField: "group_id",
          foreignField: "_id",
          as: "group"
        }
      },
      { $unwind: "$group" },
      { $sort: { "group.created_at": -1 } },
      {
        $project: {
          _id: 0,
          group_id: "$group._id",
          name: "$group.name",
          address: "$group.address",
          created_at: "$group.created_at",
          role: "$role",
          status: "$status"
        }
      }
    ]).toArray();

    return sendJson(res, 200, {
      ok: true,
      session_username: SESSION_USERNAME,
      groups: memberships.map((entry) => ({
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
    let payload;
    try {
      payload = await readBody(req);
    } catch (error) {
      if (error.message === "payload_too_large") {
        return sendJson(res, 413, { ok: false, message: "Payload too large" });
      }
      return sendJson(res, 400, { ok: false, message: "Invalid JSON body" });
    }

    const name = String(payload.name || "").trim();
    const address = String(payload.address || "").trim();

    if (!name) {
      return sendJson(res, 400, { ok: false, message: "Group name is required" });
    }

    const user = await getSessionUser();
    if (!user) {
      return sendJson(res, 404, { ok: false, message: "Session user not found" });
    }

    const now = new Date();
    const groupResult = await db.collection("groups").insertOne({
      name,
      address: address || null,
      created_at: now
    });

    await db.collection("group_members").insertOne({
      group_id: groupResult.insertedId,
      user_id: user._id,
      role: "admin",
      status: "accepted"
    });

    return sendJson(res, 201, {
      ok: true,
      group: {
        group_id: String(groupResult.insertedId),
        name,
        address: address || null,
        role: "admin",
        status: "accepted",
        created_at: now
      }
    });
  }

  res.setHeader("Allow", "GET, POST");
  return sendJson(res, 405, { ok: false, message: "Method not allowed" });
}

async function handleStatic(req, res, pathname) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const safeRelative = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(STATIC_ROOT, safeRelative);

  if (!filePath.startsWith(STATIC_ROOT)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    res.end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.statusCode = 500;
    res.end("Internal server error");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host || "localhost";
    const url = new URL(req.url || "/", `http://${host}`);

    if (url.pathname === "/api/session") {
      return await handleGetSession(req, res);
    }

    if (url.pathname === "/api/groups") {
      return await handleGroups(req, res);
    }

    if (url.pathname === "/api/inbox/invitations") {
      return await handleGetInvitations(req, res);
    }

    const invitationDecisionMatch = url.pathname.match(/^\/api\/inbox\/invitations\/([^/]+)\/(accept|deny)$/);
    if (invitationDecisionMatch) {
      return await handleInvitationDecision(req, res, invitationDecisionMatch[1], invitationDecisionMatch[2]);
    }

    const inviteMatch = url.pathname.match(/^\/api\/groups\/([^/]+)\/invite$/);
    if (inviteMatch) {
      return await handleInviteUser(req, res, inviteMatch[1]);
    }

    const createActivityMatch = url.pathname.match(/^\/api\/groups\/([^/]+)\/activities$/);
    if (createActivityMatch) {
      return await handleCreateGroupActivity(req, res, createActivityMatch[1]);
    }

    const createFundingMatch = url.pathname.match(/^\/api\/groups\/([^/]+)\/funding$/);
    if (createFundingMatch) {
      return await handleCreateGroupFunding(req, res, createFundingMatch[1]);
    }

    const donateMatch = url.pathname.match(/^\/api\/groups\/([^/]+)\/funding\/([^/]+)\/donate$/);
    if (donateMatch) {
      return await handleDonateToFunding(req, res, donateMatch[1], donateMatch[2]);
    }

    const createExpenseMatch = url.pathname.match(/^\/api\/groups\/([^/]+)\/expenses$/);
    if (createExpenseMatch) {
      return await handleCreateGroupExpense(req, res, createExpenseMatch[1]);
    }

    const removeMemberMatch = url.pathname.match(/^\/api\/groups\/([^/]+)\/members\/([^/]+)$/);
    if (removeMemberMatch) {
      return await handleRemoveMember(req, res, removeMemberMatch[1], removeMemberMatch[2]);
    }

    const groupMatch = url.pathname.match(/^\/api\/groups\/([^/]+)$/);
    if (groupMatch) {
      if (req.method === "GET") {
        return await handleGroupDetail(req, res, groupMatch[1]);
      }
      if (req.method === "DELETE") {
        return await handleDeleteGroup(req, res, groupMatch[1]);
      }
      res.setHeader("Allow", "GET, DELETE");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD, POST, DELETE");
      return sendJson(res, 405, { ok: false, message: "Method not allowed" });
    }

    return await handleStatic(req, res, url.pathname);
  } catch (error) {
    console.error("Request failed:", error);
    return sendJson(res, 500, { ok: false, message: "Internal server error" });
  }
});

async function start() {
  await client.connect();
  db = client.db(DB_NAME);

  server.listen(PORT, () => {
    console.log(`Groups app running on http://localhost:${PORT}`);
  });
}

async function shutdown() {
  await new Promise((resolve) => server.close(resolve));
  await client.close();
}

process.on("SIGINT", async () => {
  await shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await shutdown();
  process.exit(0);
});

start().catch(async (error) => {
  console.error("Server startup failed:", error);
  await client.close();
  process.exit(1);
});
