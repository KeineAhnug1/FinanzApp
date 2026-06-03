// @ts-check
import { dispatchBudgetRoutes } from "./api-dispatch/budgets.mjs";
import { dispatchEntryRoutes } from "./api-dispatch/entries.mjs";
import { dispatchFinanceRoutes } from "./api-dispatch/finance.mjs";
import { dispatchGroupRoutes } from "./api-dispatch/groups.mjs";
import { dispatchQuestionRoutes } from "./api-dispatch/questions.mjs";
import { dispatchUserRoutes } from "./api-dispatch/user.mjs";

/** @param {import('./api-dispatch/types.mjs').ApiRouteContext} ctx */
export async function dispatchApiRoute(ctx) {
  // Order grouped by domain to minimize accidental shadowing and aid discoverability
  if (await dispatchUserRoutes(ctx)) return;
  if (await dispatchFinanceRoutes(ctx)) return;
  if (await dispatchBudgetRoutes(ctx)) return;
  if (await dispatchGroupRoutes(ctx)) return;
  if (await dispatchQuestionRoutes(ctx)) return;
  if (await dispatchEntryRoutes(ctx)) return;

  const { res, sendJson } = ctx;
  return sendJson(res, 404, { ok: false, message: "API route not found" });
}
