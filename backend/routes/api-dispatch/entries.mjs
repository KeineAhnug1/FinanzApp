// @ts-check
import { isStateChangingMethod, checkCsrf } from "../../utils/csrf.mjs";
import { jsonResponse } from "../../utils/http.mjs";
import { parsePathParam } from "./common.mjs";

/** @param {import('./types.mjs').ApiRouteContext} ctx */
export async function dispatchEntryRoutes(ctx) {
  const { request, pathname, session, handlers } = ctx;
  if (isStateChangingMethod(request.method)) {
    if (!checkCsrf(request))
      return jsonResponse({ ok: false, message: "CSRF token invalid or missing" }, 403);
  }

  if (pathname === "/api/categories") return await handlers.handleCategories(request, session);
  if (pathname === "/api/income-entries")
    return await handlers.handleIncomeEntries(request, session);
  const incomeEntryId = parsePathParam(pathname, "/api/income-entries/");
  if (incomeEntryId) return await handlers.handleIncomeEntryById(request, incomeEntryId, session);
  if (pathname === "/api/expense-entries")
    return await handlers.handleExpenseEntries(request, session);
  const expenseEntryId = parsePathParam(pathname, "/api/expense-entries/");
  if (expenseEntryId)
    return await handlers.handleExpenseEntryById(request, expenseEntryId, session);

  return null;
}
