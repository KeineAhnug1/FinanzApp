// @ts-check
import { parsePathParam } from "./common.mjs";

/** @param {import('./types.mjs').ApiRouteContext} ctx */
export async function dispatchBudgetRoutes(ctx) {
  const { req, res, pathname, session, handlers } = ctx;

  if (pathname === "/api/budgets/status") {
    await handlers.handleBudgetStatus(req, res, session);
    return true;
  }

  if (pathname === "/api/budgets") {
    await handlers.handleBudgets(req, res, session);
    return true;
  }

  const budgetId = parsePathParam(pathname, "/api/budgets/");
  if (budgetId) {
    await handlers.handleBudgetById(req, res, budgetId, session);
    return true;
  }

  return false;
}
