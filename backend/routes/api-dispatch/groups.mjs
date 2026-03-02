export async function dispatchGroupRoutes(ctx) {
  const { req, res, pathname, session, handlers, sendJson } = ctx;

  if (pathname === "/api/groups") {
    await handlers.handleGroups(req, res, session);
    return true;
  }

  if (pathname === "/api/inbox/invitations") {
    await handlers.handleGetInvitations(req, res, session);
    return true;
  }

  const invitationDecisionMatch = pathname.match(/^\/api\/inbox\/invitations\/([^/]+)\/(accept|deny)$/);
  if (invitationDecisionMatch) {
    await handlers.handleInvitationDecision(req, res, invitationDecisionMatch[1], invitationDecisionMatch[2], session);
    return true;
  }

  const inviteMatch = pathname.match(/^\/api\/groups\/([^/]+)\/invite$/);
  if (inviteMatch) {
    await handlers.handleInviteUser(req, res, inviteMatch[1], session);
    return true;
  }

  const createActivityMatch = pathname.match(/^\/api\/groups\/([^/]+)\/activities$/);
  if (createActivityMatch) {
    await handlers.handleCreateGroupActivity(req, res, createActivityMatch[1], session);
    return true;
  }

  const createFundingMatch = pathname.match(/^\/api\/groups\/([^/]+)\/funding$/);
  if (createFundingMatch) {
    await handlers.handleCreateGroupFunding(req, res, createFundingMatch[1], session);
    return true;
  }

  const donateMatch = pathname.match(/^\/api\/groups\/([^/]+)\/funding\/([^/]+)\/donate$/);
  if (donateMatch) {
    await handlers.handleDonateToFunding(req, res, donateMatch[1], donateMatch[2], session);
    return true;
  }

  const createExpenseMatch = pathname.match(/^\/api\/groups\/([^/]+)\/expenses$/);
  if (createExpenseMatch) {
    await handlers.handleCreateGroupExpense(req, res, createExpenseMatch[1], session);
    return true;
  }

  const groupMessagesMatch = pathname.match(/^\/api\/groups\/([^/]+)\/messages$/);
  if (groupMessagesMatch) {
    await handlers.handleGroupMessages(req, res, groupMessagesMatch[1], session);
    return true;
  }

  const promoteAdminMatch = pathname.match(/^\/api\/groups\/([^/]+)\/members\/([^/]+)\/promote-admin$/);
  if (promoteAdminMatch) {
    await handlers.handlePromoteMemberToAdmin(req, res, promoteAdminMatch[1], promoteAdminMatch[2], session);
    return true;
  }

  const leaveGroupMatch = pathname.match(/^\/api\/groups\/([^/]+)\/leave$/);
  if (leaveGroupMatch) {
    await handlers.handleLeaveGroup(req, res, leaveGroupMatch[1], session);
    return true;
  }

  const removeMemberMatch = pathname.match(/^\/api\/groups\/([^/]+)\/members\/([^/]+)$/);
  if (removeMemberMatch) {
    await handlers.handleRemoveMember(req, res, removeMemberMatch[1], removeMemberMatch[2], session);
    return true;
  }

  const groupMatch = pathname.match(/^\/api\/groups\/([^/]+)$/);
  if (groupMatch) {
    if (req.method === "GET") {
      await handlers.handleGroupDetail(req, res, groupMatch[1], session);
      return true;
    }

    if (req.method === "DELETE") {
      await handlers.handleDeleteGroup(req, res, groupMatch[1], session);
      return true;
    }

    res.setHeader("Allow", "GET, DELETE");
    sendJson(res, 405, { ok: false, message: "Method not allowed" });
    return true;
  }

  return false;
}
