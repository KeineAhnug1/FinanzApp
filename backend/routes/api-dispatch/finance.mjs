// @ts-check
import { isStateChangingMethod, checkCsrf } from "../../utils/csrf.mjs";
import { jsonResponse } from "../../utils/http.mjs";

/** @param {import('./types.mjs').ApiRouteContext} ctx */
export async function dispatchFinanceRoutes(ctx) {
  const { request, pathname, url, session, handlers } = ctx;
  if (isStateChangingMethod(request.method)) {
    if (!checkCsrf(request)) return jsonResponse({ ok: false, message: "CSRF token invalid or missing" }, 403);
  }

  if (pathname === "/api/positions") return await handlers.handlePositions(request, url, session);
  if (pathname === "/api/bank-accounts") return await handlers.handleBankAccounts(request, session);
  const bankAccountId = parsePathParam(pathname, "/api/bank-accounts/");
  if (bankAccountId) return await handlers.handleBankAccountById(request, bankAccountId, session);
  if (pathname === "/api/share-accounts") return await handlers.handleShareAccounts(request, session);
  const shareAccountId = parsePathParam(pathname, "/api/share-accounts/");
  if (shareAccountId) return await handlers.handleShareAccountById(request, shareAccountId, session);
  if (pathname === "/api/debug/positions") return await handlers.handleDebugPositions(request, url, session);
  if (pathname.startsWith("/api/twelvedata")) return await handlers.handleTwelveDataProxy(request, pathname, url, session);
  if (pathname === "/api/stocks/search") return await handlers.handleStockSearchProxy(request, url, session);
  if (pathname === "/api/stocks/logo") return await handlers.handleStockLogoProxy(request, url, session);
  if (pathname === "/api/transactions") return await handlers.handleTransactions(request, session);

  return null;
}

function parsePathParam(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return null;
  const rawValue = pathname.slice(prefix.length);
  if (!rawValue) return null;
  return decodeURIComponent(rawValue);
}
