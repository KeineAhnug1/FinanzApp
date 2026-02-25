function parsePathParam(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return null;
  const rawValue = pathname.slice(prefix.length);
  if (!rawValue) return null;
  return decodeURIComponent(rawValue);
}

export async function dispatchApiRoute(ctx) {
  const { req, res, url, pathname, session, handlers, sendJson } = ctx;

  if (pathname === "/api/categories") return await handlers.handleCategories(req, res, session);
  if (pathname === "/api/income-entries") return await handlers.handleIncomeEntries(req, res, session);
  const incomeEntryId = parsePathParam(pathname, "/api/income-entries/");
  if (incomeEntryId) return await handlers.handleIncomeEntryById(req, res, incomeEntryId, session);
  if (pathname === "/api/expense-entries") return await handlers.handleExpenseEntries(req, res, session);
  const expenseEntryId = parsePathParam(pathname, "/api/expense-entries/");
  if (expenseEntryId) return await handlers.handleExpenseEntryById(req, res, expenseEntryId, session);
  if (pathname === "/api/user-income") return await handlers.handleUserIncome(req, res, session);
  if (pathname === "/api/questions") return await handlers.handleQuestions(req, res, session, url);

  if (pathname === "/api/groups") return await handlers.handleGroups(req, res, session);
  if (pathname === "/api/inbox/invitations") return await handlers.handleGetInvitations(req, res, session);

  const invitationDecisionMatch = pathname.match(/^\/api\/inbox\/invitations\/([^/]+)\/(accept|deny)$/);
  if (invitationDecisionMatch) {
    return await handlers.handleInvitationDecision(req, res, invitationDecisionMatch[1], invitationDecisionMatch[2], session);
  }

  const inviteMatch = pathname.match(/^\/api\/groups\/([^/]+)\/invite$/);
  if (inviteMatch) return await handlers.handleInviteUser(req, res, inviteMatch[1], session);

  const createActivityMatch = pathname.match(/^\/api\/groups\/([^/]+)\/activities$/);
  if (createActivityMatch) return await handlers.handleCreateGroupActivity(req, res, createActivityMatch[1], session);

  const createFundingMatch = pathname.match(/^\/api\/groups\/([^/]+)\/funding$/);
  if (createFundingMatch) return await handlers.handleCreateGroupFunding(req, res, createFundingMatch[1], session);

  const donateMatch = pathname.match(/^\/api\/groups\/([^/]+)\/funding\/([^/]+)\/donate$/);
  if (donateMatch) return await handlers.handleDonateToFunding(req, res, donateMatch[1], donateMatch[2], session);

  const createExpenseMatch = pathname.match(/^\/api\/groups\/([^/]+)\/expenses$/);
  if (createExpenseMatch) return await handlers.handleCreateGroupExpense(req, res, createExpenseMatch[1], session);

  const promoteAdminMatch = pathname.match(/^\/api\/groups\/([^/]+)\/members\/([^/]+)\/promote-admin$/);
  if (promoteAdminMatch) return await handlers.handlePromoteMemberToAdmin(req, res, promoteAdminMatch[1], promoteAdminMatch[2], session);

  const leaveGroupMatch = pathname.match(/^\/api\/groups\/([^/]+)\/leave$/);
  if (leaveGroupMatch) return await handlers.handleLeaveGroup(req, res, leaveGroupMatch[1], session);

  const removeMemberMatch = pathname.match(/^\/api\/groups\/([^/]+)\/members\/([^/]+)$/);
  if (removeMemberMatch) return await handlers.handleRemoveMember(req, res, removeMemberMatch[1], removeMemberMatch[2], session);

  const groupMatch = pathname.match(/^\/api\/groups\/([^/]+)$/);
  if (groupMatch) {
    if (req.method === "GET") return await handlers.handleGroupDetail(req, res, groupMatch[1], session);
    if (req.method === "DELETE") return await handlers.handleDeleteGroup(req, res, groupMatch[1], session);
    res.setHeader("Allow", "GET, DELETE");
    return sendJson(res, 405, { ok: false, message: "Method not allowed" });
  }

  const questionAnswerMatch = pathname.match(/^\/api\/questions\/([^/]+)\/answers$/);
  if (questionAnswerMatch) return await handlers.handleQuestionAnswerCreate(req, res, questionAnswerMatch[1], session);

  const questionLikeMatch = pathname.match(/^\/api\/questions\/([^/]+)\/like$/);
  if (questionLikeMatch) return await handlers.handleQuestionLike(req, res, questionLikeMatch[1], session);

  const questionByIdMatch = pathname.match(/^\/api\/questions\/([^/]+)$/);
  if (questionByIdMatch) return await handlers.handleQuestionById(req, res, questionByIdMatch[1], session);

  const answerLikeMatch = pathname.match(/^\/api\/answers\/([^/]+)\/like$/);
  if (answerLikeMatch) return await handlers.handleAnswerLike(req, res, answerLikeMatch[1], session);

  const answerByIdMatch = pathname.match(/^\/api\/answers\/([^/]+)$/);
  if (answerByIdMatch) return await handlers.handleAnswerById(req, res, answerByIdMatch[1], session);

  if (pathname === "/api/positions") return await handlers.handlePositions(req, res, url, session);
  if (pathname === "/api/bank-accounts") return await handlers.handleBankAccounts(req, res, session);
  const bankAccountId = parsePathParam(pathname, "/api/bank-accounts/");
  if (bankAccountId) return await handlers.handleBankAccountById(req, res, bankAccountId, session);
  if (pathname === "/api/share-accounts") return await handlers.handleShareAccounts(req, res, session);
  const shareAccountId = parsePathParam(pathname, "/api/share-accounts/");
  if (shareAccountId) return await handlers.handleShareAccountById(req, res, shareAccountId, session);
  if (pathname === "/api/debug/positions") return await handlers.handleDebugPositions(req, res, url, session);
  if (pathname.startsWith("/api/twelvedata")) return await handlers.handleTwelveDataProxy(req, res, pathname, url, session);
  if (pathname === "/api/stocks/search") return await handlers.handleStockSearchProxy(req, res, url, session);
  if (pathname === "/api/exchange-rates/latest") return await handlers.handleExchangeRates(req, res, url, session);

  return sendJson(res, 404, { ok: false, message: "API route not found" });
}
