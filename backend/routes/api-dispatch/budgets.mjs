// @ts-check
import { isStateChangingMethod, checkCsrf } from "../../utils/csrf.mjs";
import { jsonResponse } from "../../utils/http.mjs";
import { parsePathParam } from "./common.mjs";

/** @param {import('./types.mjs').ApiRouteContext} ctx */
export async function dispatchBudgetRoutes(ctx) {
  const { request, pathname, session, handlers } = ctx;
  if (isStateChangingMethod(request.method)) {
    if (!checkCsrf(request))
      return jsonResponse({ ok: false, message: "CSRF token invalid or missing" }, 403);
  }

  if (pathname === "/api/budgets/status")
    return await handlers.handleBudgetStatus(request, session);
  if (pathname === "/api/budgets") return await handlers.handleBudgets(request, session);
  const budgetId = parsePathParam(pathname, "/api/budgets/");
  if (budgetId) return await handlers.handleBudgetById(request, budgetId, session);

  return null;
}
