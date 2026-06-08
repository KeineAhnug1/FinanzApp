// @ts-check
// Central router for Cloudflare Pages Functions (no HTTP server)
import { jsonResponse, parseCookies } from "./utils/http.mjs";
import { createKvSessionStore } from "./utils/session-kv.mjs";
import { SESSION_COOKIE_NAME, SESSION_TTL_MINUTES } from "./config/runtime.mjs";
import { dispatchApiRoute } from "./routes/api-dispatch.mjs";
import { createAuthHandlers } from "./handlers/auth.mjs";
import { createUserHandlers } from "./handlers/user.mjs";
import { createFinanceHandlers } from "./handlers/finance.mjs";
import { createBudgetHandlers } from "./handlers/budgets.mjs";
import { createGroupHandlers } from "./handlers/groups.mjs";
import { createForumHandlers } from "./handlers/forum.mjs";

/**
 * @param {Request} request
 * @param {import("pg").Pool} pool
 * @param {Record<string, string | undefined> & { SESSIONS: KVNamespace }} env
 * @returns {Promise<Response>}
 */
export async function handleApiRequest(request, pool, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  const isSecure = env.NODE_ENV === "production" || env.SESSION_SECURE_COOKIE === "true";
  const ttlMinutes = Number(env.SESSION_TTL_MINUTES || SESSION_TTL_MINUTES);

  const kvStore = createKvSessionStore({ ttlMinutes, cookieName: SESSION_COOKIE_NAME });
  const kv = env.SESSIONS;

  const buildSessionCookie = (token) => kvStore.buildSessionCookie(token, isSecure);
  const clearSessionCookie = () => kvStore.clearSessionCookie(isSecure);

  const authHandlers = createAuthHandlers({
    pool, kv, buildSessionCookie, clearSessionCookie,
    createSession: kvStore.createSession,
    destroySession: kvStore.destroySession,
    getSessionRecord: kvStore.getSessionRecord,
    env
  });

  // Auth routes (no session required)
  if (pathname === "/api/login") return await authHandlers.handleLogin(request);
  if (pathname === "/api/register") return await authHandlers.handleRegister(request);
  if (pathname === "/api/register/verify") return await authHandlers.handleRegisterVerify(request);
  if (pathname === "/api/session") return await authHandlers.handleSession(request);
  if (pathname === "/api/logout") return await authHandlers.handleLogout(request);
  if (pathname === "/api/password/forgot") return await authHandlers.handlePasswordForgot(request);
  if (pathname === "/api/password/reset") return await authHandlers.handlePasswordReset(request);

  // All remaining /api/* routes require authentication
  const sessionResult = await authHandlers.requireSessionUser(request);
  if (sessionResult instanceof Response) return sessionResult;
  const session = /** @type {{ token: string; user: Record<string, unknown> }} */ (sessionResult);

  const financeHandlers = createFinanceHandlers(pool);
  const budgetHandlers = createBudgetHandlers(pool);
  const groupHandlers = createGroupHandlers(pool);
  const forumHandlers = createForumHandlers(pool);
  const userHandlers = createUserHandlers({ pool, kv, destroySession: kvStore.destroySession, clearSessionCookie });

  const API_HANDLERS = {
    ...financeHandlers,
    ...budgetHandlers,
    ...groupHandlers,
    ...forumHandlers,
    ...userHandlers
  };

  return await dispatchApiRoute({
    request,
    url,
    pathname,
    session: /** @type {any} */ (session),
    handlers: API_HANDLERS
  });
}
