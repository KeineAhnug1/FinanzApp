import { dispatchEntryRoutes } from "./api-dispatch/entries.mjs";
import { dispatchFinanceRoutes } from "./api-dispatch/finance.mjs";
import { dispatchGroupRoutes } from "./api-dispatch/groups.mjs";
import { dispatchMessageRoutes } from "./api-dispatch/messages.mjs";
import { dispatchQuestionRoutes } from "./api-dispatch/questions.mjs";
import { dispatchUserRoutes } from "./api-dispatch/user.mjs";

export async function dispatchApiRoute(ctx) {
  if (await dispatchEntryRoutes(ctx)) return;
  if (await dispatchGroupRoutes(ctx)) return;
  if (await dispatchQuestionRoutes(ctx)) return;
  if (await dispatchFinanceRoutes(ctx)) return;
  if (await dispatchMessageRoutes(ctx)) return;
  if (await dispatchUserRoutes(ctx)) return;

  const { res, sendJson } = ctx;
  return sendJson(res, 404, { ok: false, message: "API route not found" });
}
