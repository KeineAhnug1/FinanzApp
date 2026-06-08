// @ts-check
import { dispatchBudgetRoutes } from "./api-dispatch/budgets.mjs";
import { dispatchEntryRoutes } from "./api-dispatch/entries.mjs";
import { dispatchFinanceRoutes } from "./api-dispatch/finance.mjs";
import { dispatchGroupRoutes } from "./api-dispatch/groups.mjs";
import { dispatchQuestionRoutes } from "./api-dispatch/questions.mjs";
import { dispatchUserRoutes } from "./api-dispatch/user.mjs";
import { jsonResponse } from "../utils/http.mjs";

/** @param {import('./api-dispatch/types.mjs').ApiRouteContext} ctx */
export async function dispatchApiRoute(ctx) {
  let result;
  result = await dispatchUserRoutes(ctx); if (result) return result;
  result = await dispatchFinanceRoutes(ctx); if (result) return result;
  result = await dispatchBudgetRoutes(ctx); if (result) return result;
  result = await dispatchGroupRoutes(ctx); if (result) return result;
  result = await dispatchQuestionRoutes(ctx); if (result) return result;
  result = await dispatchEntryRoutes(ctx); if (result) return result;
  return jsonResponse({ ok: false, message: "API route not found" }, 404);
}
