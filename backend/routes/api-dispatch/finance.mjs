import { parsePathParam } from "./common.mjs";

export async function dispatchFinanceRoutes(ctx) {
  const { req, res, pathname, url, session, handlers } = ctx;

  if (pathname === "/api/positions") {
    await handlers.handlePositions(req, res, url, session);
    return true;
  }

  if (pathname === "/api/bank-accounts") {
    await handlers.handleBankAccounts(req, res, session);
    return true;
  }

  const bankAccountId = parsePathParam(pathname, "/api/bank-accounts/");
  if (bankAccountId) {
    await handlers.handleBankAccountById(req, res, bankAccountId, session);
    return true;
  }

  if (pathname === "/api/share-accounts") {
    await handlers.handleShareAccounts(req, res, session);
    return true;
  }

  const shareAccountId = parsePathParam(pathname, "/api/share-accounts/");
  if (shareAccountId) {
    await handlers.handleShareAccountById(req, res, shareAccountId, session);
    return true;
  }

  if (pathname === "/api/debug/positions") {
    await handlers.handleDebugPositions(req, res, url, session);
    return true;
  }

  if (pathname.startsWith("/api/twelvedata")) {
    await handlers.handleTwelveDataProxy(req, res, pathname, url, session);
    return true;
  }

  if (pathname === "/api/stocks/search") {
    await handlers.handleStockSearchProxy(req, res, url, session);
    return true;
  }

  if (pathname === "/api/stocks/logo") {
    await handlers.handleStockLogoProxy(req, res, url, session);
    return true;
  }

  if (pathname === "/api/exchange-rates/latest") {
    await handlers.handleExchangeRates(req, res, url, session);
    return true;
  }

  if (pathname === "/api/user/account") {
    await handlers.handleDeleteUserAccount(req, res, session);
    return true;
  }

  return false;
}
