import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";
import { COLLECTIONS, DB_NAME, MIME_BY_EXT, MONGO_URI, PORT, SESSION_COOKIE_NAME, SESSION_TTL_MINUTES } from "./config/runtime.mjs";
import { dispatchApiRoute } from "./routes/api-dispatch.mjs";
import { isProtectedUiPath, redirectUiRoot, resolveStaticPath } from "./routes/ui-routes.mjs";
import { sendJson } from "./utils/http.mjs";
import { createSessionStore } from "./utils/session-store.mjs";
import { initRateLimiter } from "./utils/rate-limit.mjs";
import { migratePlaintextPasswords, createAuthHandlers } from "./handlers/auth.mjs";
import { createUserHandlers } from "./handlers/user.mjs";
import { createFinanceHandlers } from "./handlers/finance.mjs";
import { createGroupHandlers } from "./handlers/groups.mjs";
import { createForumHandlers } from "./handlers/forum.mjs";
import { generateFinzbroChatAnswer } from "./handlers/forum.mjs";
import { createMessageHandlers } from "./handlers/messages.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

if (!MONGO_URI) throw new Error("MONGODB_URI is not set in the environment");
if (!PORT || !Number.isFinite(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`PORT is invalid: "${process.env.PORT}"`);
}

const client = new MongoClient(MONGO_URI);
let db;

const sessionStore = createSessionStore({ cookieName: SESSION_COOKIE_NAME, ttlMinutes: SESSION_TTL_MINUTES });
const { init, buildSessionCookie, clearSessionCookie, createSession, destroySession, getSessionRecord } = sessionStore;

async function handleStatic(req, res, pathname) {
  let requestPath = "/";
  try {
    requestPath = pathname === "/" ? "/" : decodeURIComponent(pathname);
  } catch {
    res.statusCode = 400;
    res.end("Bad request");
    return;
  }
  const normalized = path.normalize(requestPath).replace(/^([/\\])+/, "");
  const filePath = resolveStaticPath(PROJECT_ROOT, `/${normalized}`);
  const relativePath = path.relative(PROJECT_ROOT, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const isImmutable = [".css", ".js", ".mjs", ".png", ".ico", ".svg"].includes(ext);
    const cacheControl = isImmutable ? "public, max-age=86400" : "no-cache";
    res.writeHead(200, {
      "Content-Type": MIME_BY_EXT[ext] || "application/octet-stream",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN"
    });
    if (req.method === "HEAD") { res.end(); return; }
    res.end(file);
  } catch (error) {
    if (error.code === "ENOENT") { res.statusCode = 404; res.end("Not found"); return; }
    res.statusCode = 500;
    res.end("Internal server error");
  }
}

async function ensureIndexes() {
  await db.collection(COLLECTIONS.emailVerifications).createIndex({ email: 1 }, { unique: true, name: "email_verifications_email_unique" });
  await db.collection(COLLECTIONS.emailVerifications).createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: "email_verifications_expires_ttl" });
  await db.collection(COLLECTIONS.passwordResets).createIndex({ email: 1 }, { unique: true, name: "password_resets_email_unique" });
  await db.collection(COLLECTIONS.passwordResets).createIndex({ expires_at: 1 }, { expireAfterSeconds: 0, name: "password_resets_expires_ttl" });
  await db.collection(COLLECTIONS.incomeEntries).createIndex({ bank_account_id: 1, pay_date: -1, created_at: -1 }, { name: "income_bank_account_date_idx" });
  await db.collection(COLLECTIONS.incomeEntries).createIndex({ bank_account_id: 1, cycle: 1, state: 1 }, { name: "income_bank_account_cycle_state_idx" });
  await db.collection(COLLECTIONS.expenseEntries).createIndex({ bank_account_id: 1, pay_date: -1, created_at: -1 }, { name: "private_expenses_bank_account_date_idx" });
  await db.collection(COLLECTIONS.expenseEntries).createIndex({ bank_account_id: 1, cycle: 1, state: 1 }, { name: "private_expenses_bank_account_cycle_state_idx" });
  await db.collection(COLLECTIONS.expenseEntries).createIndex({ legacy_expense_entry_id: 1 }, { unique: true, sparse: true, name: "private_expenses_legacy_expense_entry_unique" });
  await db.collection(COLLECTIONS.shareAccounts).createIndex({ user_id: 1, created_at: 1 }, { name: "share_accounts_user_created_idx" });
  await db.collection(COLLECTIONS.userCategories).createIndex({ user_id: 1, kind: 1, key: 1 }, { unique: true, name: "user_categories_user_kind_key_unique" });
  await db.collection(COLLECTIONS.globalQuestions).createIndex({ created_at: -1 }, { name: "global_questions_created_idx" });
  await db.collection(COLLECTIONS.globalQuestions).createIndex({ from_user_id: 1, created_at: -1 }, { name: "global_questions_from_user_created_idx" });
  await db.collection(COLLECTIONS.globalAnswers).createIndex({ question_id: 1, created_at: -1 }, { name: "global_answers_question_created_idx" });
  await db.collection(COLLECTIONS.globalAnswers).createIndex({ from_user_id: 1, created_at: -1 }, { name: "global_answers_from_user_created_idx" });
  await db.collection(COLLECTIONS.questionLikes).createIndex({ user_id: 1, question_id: 1 }, { unique: true, name: "question_likes_unique_pair" });
  await db.collection(COLLECTIONS.answerLikes).createIndex({ answer_id: 1, user_id: 1 }, { unique: true, name: "answer_likes_unique_pair" });
}

async function start() {
  initRateLimiter(sendJson);
  await client.connect();
  db = client.db(DB_NAME);

  await init(db);
  await migratePlaintextPasswords(db);
  await ensureIndexes();

  const authHandlers = createAuthHandlers({ db, buildSessionCookie, clearSessionCookie, createSession, destroySession, getSessionRecord, SESSION_COOKIE_NAME });
  const userHandlers = createUserHandlers({ db, destroySession, clearSessionCookie });
  const financeHandlers = createFinanceHandlers(db);
  const groupHandlers = createGroupHandlers(db);
  const forumHandlers = createForumHandlers(db);
  const messageHandlers = createMessageHandlers(db, {
    ensureFinzbroUserId: forumHandlers.ensureFinzbroUserId,
    generateFinzbroChatAnswer
  });

  const { getSessionUser, requireSessionUser, handleLogin, handleSession, handleLogout, handleRegister, handleRegisterVerify, handlePasswordForgot, handlePasswordReset } = authHandlers;

  const API_HANDLERS = {
    ...financeHandlers,
    ...groupHandlers,
    ...forumHandlers,
    ...messageHandlers,
    ...userHandlers
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const pathname = url.pathname;

      if (pathname === "/api/login") return await handleLogin(req, res);
      if (pathname === "/api/register") return await handleRegister(req, res);
      if (pathname === "/api/register/verify") return await handleRegisterVerify(req, res);
      if (pathname === "/api/session") return await handleSession(req, res);
      if (pathname === "/api/logout") return await handleLogout(req, res);
      if (pathname === "/api/password/forgot") return await handlePasswordForgot(req, res);
      if (pathname === "/api/password/reset") return await handlePasswordReset(req, res);

      if (isProtectedUiPath(pathname)) {
        const session = await getSessionUser(req);
        if (!session) { res.writeHead(302, { Location: "/" }); res.end(); return; }
      }

      if (redirectUiRoot(pathname, res)) return;

      if (pathname.startsWith("/api/")) {
        const session = await requireSessionUser(req, res);
        if (!session) return;
        return await dispatchApiRoute({ req, res, url, pathname, session, sendJson, handlers: API_HANDLERS });
      }

      if (req.method !== "GET" && req.method !== "HEAD") {
        res.setHeader("Allow", "GET, HEAD, POST, PATCH, DELETE");
        return sendJson(res, 405, { ok: false, message: "Method not allowed" });
      }

      return await handleStatic(req, res, pathname);
    } catch (error) {
      console.error("Request failed:", error);
      return sendJson(res, 500, { ok: false, message: "Internal server error" });
    }
  });

  server.listen(PORT, () => {
    console.log(`FinanzApp läuft auf http://localhost:${PORT}`);
  });

  async function shutdown() {
    await new Promise((resolve) => server.close(resolve));
    await client.close();
  }

  process.on("SIGINT", async () => { await shutdown(); process.exit(0); });
  process.on("SIGTERM", async () => { await shutdown(); process.exit(0); });
}

start().catch(async (error) => {
  console.error("Server startup failed:", error);
  await client.close();
  process.exit(1);
});
