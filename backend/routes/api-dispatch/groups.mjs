// @ts-check
import { isStateChangingMethod, checkCsrf } from "../../utils/csrf.mjs";
import { jsonResponse } from "../../utils/http.mjs";

/** @param {import('./types.mjs').ApiRouteContext} ctx */
export async function dispatchGroupRoutes(ctx) {
  const { request, pathname, session, handlers } = ctx;
  if (isStateChangingMethod(request.method)) {
    if (!checkCsrf(request))
      return jsonResponse({ ok: false, message: "CSRF token invalid or missing" }, 403);
  }

  if (pathname === "/api/groups") return await handlers.handleGroups(request, session);
  if (pathname === "/api/inbox/invitations")
    return await handlers.handleGetInvitations(request, session);

  const invitationDecisionMatch = pathname.match(
    /^\/api\/inbox\/invitations\/([^/]+)\/(accept|deny)$/
  );
  if (invitationDecisionMatch)
    return await handlers.handleInvitationDecision(
      request,
      invitationDecisionMatch[1],
      invitationDecisionMatch[2],
      session
    );

  const inviteMatch = pathname.match(/^\/api\/groups\/([^/]+)\/invite$/);
  if (inviteMatch) return await handlers.handleInviteUser(request, inviteMatch[1], session);

  const createActivityMatch = pathname.match(/^\/api\/groups\/([^/]+)\/activities$/);
  if (createActivityMatch)
    return await handlers.handleCreateGroupActivity(request, createActivityMatch[1], session);

  const createFundingMatch = pathname.match(/^\/api\/groups\/([^/]+)\/funding$/);
  if (createFundingMatch)
    return await handlers.handleCreateGroupFunding(request, createFundingMatch[1], session);

  const donateMatch = pathname.match(/^\/api\/groups\/([^/]+)\/funding\/([^/]+)\/donate$/);
  if (donateMatch)
    return await handlers.handleDonateToFunding(request, donateMatch[1], donateMatch[2], session);

  const createExpenseMatch = pathname.match(/^\/api\/groups\/([^/]+)\/expenses$/);
  if (createExpenseMatch)
    return await handlers.handleCreateGroupExpense(request, createExpenseMatch[1], session);

  const groupMessagesMatch = pathname.match(/^\/api\/groups\/([^/]+)\/messages$/);
  if (groupMessagesMatch)
    return await handlers.handleGroupMessages(request, groupMessagesMatch[1], session);

  const groupMessageItemMatch = pathname.match(/^\/api\/groups\/([^/]+)\/messages\/([^/]+)$/);
  if (groupMessageItemMatch)
    return await handlers.handleDeleteGroupMessage(
      request,
      groupMessageItemMatch[1],
      groupMessageItemMatch[2],
      session
    );

  const promoteAdminMatch = pathname.match(
    /^\/api\/groups\/([^/]+)\/members\/([^/]+)\/promote-admin$/
  );
  if (promoteAdminMatch)
    return await handlers.handlePromoteMemberToAdmin(
      request,
      promoteAdminMatch[1],
      promoteAdminMatch[2],
      session
    );

  const leaveGroupMatch = pathname.match(/^\/api\/groups\/([^/]+)\/leave$/);
  if (leaveGroupMatch) return await handlers.handleLeaveGroup(request, leaveGroupMatch[1], session);

  const removeMemberMatch = pathname.match(/^\/api\/groups\/([^/]+)\/members\/([^/]+)$/);
  if (removeMemberMatch)
    return await handlers.handleRemoveMember(
      request,
      removeMemberMatch[1],
      removeMemberMatch[2],
      session
    );

  const groupMatch = pathname.match(/^\/api\/groups\/([^/]+)$/);
  if (groupMatch) {
    if (request.method === "GET")
      return await handlers.handleGroupDetail(request, groupMatch[1], session);
    if (request.method === "DELETE")
      return await handlers.handleDeleteGroup(request, groupMatch[1], session);
    return jsonResponse({ ok: false, message: "Method not allowed" }, 405, {
      Allow: "GET, DELETE",
    });
  }

  return null;
}
