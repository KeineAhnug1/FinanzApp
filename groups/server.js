const http = require("http");
const path = require("path");
const { readFile } = require("fs/promises");
const { MongoClient, ObjectId } = require("mongodb");
require("dotenv").config();

const PORT = Number(process.env.PORT || 3001);
const DB_NAME = process.env.MONGODB_DB || "finanzapp";
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

async function getSessionUser() {
  return db.collection("users").findOne(
    { username: SESSION_USERNAME },
    { projection: { _id: 1, username: 1, first_name: 1, last_name: 1 } }
  );
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
    user_id: user._id
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
    { $match: { group_id: context.groupId } },
    {
      $lookup: {
        from: "users",
        localField: "user_id",
        foreignField: "_id",
        as: "user"
      }
    },
    { $unwind: "$user" },
    { $sort: { joined_at: 1 } },
    {
      $project: {
        _id: 0,
        user_id: "$user._id",
        username: "$user.username",
        first_name: "$user.first_name",
        last_name: "$user.last_name",
        role: "$role",
        joined_at: "$joined_at"
      }
    }
  ]).toArray();

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
      joined_at: member.joined_at
    }))
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
    return sendJson(res, 409, { ok: false, message: "User is already in this group" });
  }

  const joinedAt = new Date();
  await db.collection("group_members").insertOne({
    group_id: context.groupId,
    user_id: inviteUser._id,
    role: "member",
    joined_at: joinedAt
  });

  return sendJson(res, 201, {
    ok: true,
    member: {
      user_id: String(inviteUser._id),
      username: inviteUser.username,
      first_name: inviteUser.first_name ?? null,
      last_name: inviteUser.last_name ?? null,
      role: "member",
      joined_at: joinedAt
    }
  });
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

  const expenses = await db.collection("expenses").find(
    { group_id: context.groupId },
    { projection: { _id: 1 } }
  ).toArray();
  const expenseIds = expenses.map((expense) => expense._id);

  let expenseShareIds = [];
  if (expenseIds.length) {
    const expenseShares = await db.collection("expense_shares").find(
      { expense_id: { $in: expenseIds } },
      { projection: { _id: 1 } }
    ).toArray();
    expenseShareIds = expenseShares.map((share) => share._id);
  }

  let requestIds = [];
  if (expenseShareIds.length) {
    const requests = await db.collection("requests").find(
      { expense_share_id: { $in: expenseShareIds } },
      { projection: { _id: 1 } }
    ).toArray();
    requestIds = requests.map((request) => request._id);
  }

  if (requestIds.length) {
    await db.collection("transactions").deleteMany({ request_id: { $in: requestIds } });
  }
  if (expenseShareIds.length) {
    await db.collection("transactions").deleteMany({ expense_share_id: { $in: expenseShareIds } });
  }
  if (requestIds.length) {
    await db.collection("requests").deleteMany({ _id: { $in: requestIds } });
  }
  if (expenseShareIds.length) {
    await db.collection("expense_shares").deleteMany({ _id: { $in: expenseShareIds } });
  }
  if (expenseIds.length) {
    await db.collection("expenses").deleteMany({ _id: { $in: expenseIds } });
  }

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
      { $match: { user_id: user._id } },
      {
        $lookup: {
          from: "groups",
          localField: "group_id",
          foreignField: "_id",
          as: "group"
        }
      },
      { $unwind: "$group" },
      { $sort: { joined_at: -1 } },
      {
        $project: {
          _id: 0,
          group_id: "$group._id",
          name: "$group.name",
          address: "$group.address",
          created_at: "$group.created_at",
          role: "$role",
          joined_at: "$joined_at"
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
        joined_at: entry.joined_at
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
      joined_at: now
    });

    return sendJson(res, 201, {
      ok: true,
      group: {
        group_id: String(groupResult.insertedId),
        name,
        address: address || null,
        role: "admin",
        joined_at: now,
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

    const inviteMatch = url.pathname.match(/^\/api\/groups\/([^/]+)\/invite$/);
    if (inviteMatch) {
      return await handleInviteUser(req, res, inviteMatch[1]);
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
