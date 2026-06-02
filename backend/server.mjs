// @ts-check
import "dotenv/config";
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { DATABASE_URL, MIME_BY_EXT, PORT, SESSION_COOKIE_NAME, SESSION_TTL_MINUTES } from "./config/runtime.mjs";
import { dispatchApiRoute } from "./routes/api-dispatch.mjs";
import { isProtectedUiPath, redirectUiRoot, resolveStaticPath } from "./routes/ui-routes.mjs";
import { sendJson } from "./utils/http.mjs";
import { createSessionStore } from "./utils/session-store.mjs";
import { initRateLimiter } from "./utils/rate-limit.mjs";
import { migratePlaintextPasswords, createAuthHandlers } from "./handlers/auth.mjs";
import { createUserHandlers } from "./handlers/user.mjs";
import { createFinanceHandlers } from "./handlers/finance.mjs";
import { createBudgetHandlers } from "./handlers/budgets.mjs";
import { createGroupHandlers } from "./handlers/groups.mjs";
import { createForumHandlers } from "./handlers/forum.mjs";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

if (!DATABASE_URL) throw new Error("DATABASE_URL is not set in the environment");
if (!PORT || !Number.isFinite(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error(`PORT is invalid: "${process.env.PORT}"`);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const sessionStore = createSessionStore({ cookieName: SESSION_COOKIE_NAME, ttlMinutes: SESSION_TTL_MINUTES });
const { init, buildSessionCookie, clearSessionCookie, createSession, destroySession, getSessionRecord, gcSessions } = sessionStore;

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} pathname
 */
async function handleStatic(req, res, pathname) {
  let requestPath;
  try {
    requestPath = pathname === "/" ? "/" : decodeURIComponent(pathname);
  } catch {
    res.statusCode = 400;
    res.end("Bad request");
    return;
  }
  if (pathname.length > 2048 || pathname.includes("\0")) {
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
    const isHashed = filePath.includes(`${path.sep}assets${path.sep}`);
    const cacheControl = isHashed
      ? "public, max-age=31536000, immutable"
      : "no-cache";
    res.writeHead(200, {
      "Content-Type": /** @type {Record<string,string>} */ (MIME_BY_EXT)[ext] || "application/octet-stream",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "SAMEORIGIN"
    });
    if (req.method === "HEAD") { res.end(); return; }
    res.end(file);
  } catch (/** @type {unknown} */ err) {
    const error = /** @type {NodeJS.ErrnoException} */ (err);
    if (error.code === "ENOENT") { res.statusCode = 404; res.end("Not found"); return; }
    res.statusCode = 500;
    res.end("Internal server error");
  }
}

async function start() {
  initRateLimiter(sendJson);

  // Test database connection
  try {
    await pool.query("SELECT 1");
    console.log("[db] PostgreSQL connection established.");
  } catch (/** @type {unknown} */ err) {
    const error = /** @type {Error & { message: string; code?: string }} */ (err);
    console.error("[db] Connection error details:", error.message, error.code);
    throw new Error(`PostgreSQL connection failed: ${error.message}`, { cause: err });
  }

  await init(pool);
  await migratePlaintextPasswords(pool);
  setInterval(() => gcSessions().catch(() => {}), 30 * 60 * 1000);

  const authHandlers = createAuthHandlers({ pool, buildSessionCookie, clearSessionCookie, createSession, destroySession, getSessionRecord, SESSION_COOKIE_NAME });
  const userHandlers = createUserHandlers({ pool, destroySession, clearSessionCookie });
  const financeHandlers = createFinanceHandlers(pool);
  const budgetHandlers = createBudgetHandlers(pool);
  const groupHandlers = createGroupHandlers(pool);
  const forumHandlers = createForumHandlers(pool);

  const { getSessionUser, requireSessionUser, handleLogin, handleSession, handleLogout, handleRegister, handleRegisterVerify, handlePasswordForgot, handlePasswordReset } = authHandlers;

  const API_HANDLERS = {
    ...financeHandlers,
    ...budgetHandlers,
    ...groupHandlers,
    ...forumHandlers,
    ...userHandlers
  };

  const server = http.createServer(async (req, res) => {
    const logEnabled = process.env.REQUEST_LOG === "true" || process.env.NODE_ENV !== "production";
    const startedAt = Date.now();
    if (logEnabled) {
      res.on("finish", () => {
        try {
          const url = new URL(req.url || "/", "http://localhost");
          const ms = Date.now() - startedAt;
          // Keep log concise: METHOD PATH -> STATUS DURATIONms
          console.log(`${req.method} ${url.pathname} -> ${res.statusCode} ${ms}ms`);
        } catch {
          void 0;
        }
      });
    }
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
    await pool.end();
  }

  process.on("SIGINT", async () => { await shutdown(); process.exit(0); });
  process.on("SIGTERM", async () => { await shutdown(); process.exit(0); });
}

start().catch(async (error) => {
  console.error("Server startup failed:", error);
  await pool.end();
  process.exit(1);
});
