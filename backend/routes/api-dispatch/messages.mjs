export async function dispatchMessageRoutes(ctx) {
  const { req, res, pathname, url, session, handlers, sendJson } = ctx;

  if (pathname === "/api/messages/conversations") {
    await handlers.handleGetConversations(req, res, session);
    return true;
  }

  if (pathname === "/api/messages/send") {
    await handlers.handleSendMessage(req, res, session);
    return true;
  }

  if (pathname === "/api/messages/unread-count") {
    await handlers.handleUnreadCount(req, res, session);
    return true;
  }

  if (pathname === "/api/users/search") {
    await handlers.handleUserSearch(req, res, url, session);
    return true;
  }

  const conversationMatch = pathname.match(/^\/api\/messages\/conversation\/([^/]+)$/);
  if (conversationMatch) {
    await handlers.handleGetConversation(req, res, conversationMatch[1], session);
    return true;
  }

  const privateMessageMatch = pathname.match(/^\/api\/messages\/([^/]+)$/);
  if (privateMessageMatch && req.method === "DELETE") {
    await handlers.handleDeletePrivateMessage(req, res, privateMessageMatch[1], session);
    return true;
  }

  return false;
}
