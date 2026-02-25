import { parsePathParam } from "./common.mjs";

export async function dispatchEntryRoutes(ctx) {
  const { req, res, pathname, session, handlers } = ctx;

  if (pathname === "/api/categories") {
    await handlers.handleCategories(req, res, session);
    return true;
  }

  if (pathname === "/api/income-entries") {
    await handlers.handleIncomeEntries(req, res, session);
    return true;
  }

  const incomeEntryId = parsePathParam(pathname, "/api/income-entries/");
  if (incomeEntryId) {
    await handlers.handleIncomeEntryById(req, res, incomeEntryId, session);
    return true;
  }

  if (pathname === "/api/expense-entries") {
    await handlers.handleExpenseEntries(req, res, session);
    return true;
  }

  const expenseEntryId = parsePathParam(pathname, "/api/expense-entries/");
  if (expenseEntryId) {
    await handlers.handleExpenseEntryById(req, res, expenseEntryId, session);
    return true;
  }

  return false;
}
