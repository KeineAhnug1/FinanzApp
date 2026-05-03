export async function dispatchUserRoutes(ctx) {
  const { req, res, pathname, session, handlers } = ctx;

  if (pathname === "/api/user/account") {
    await handlers.handleDeleteUserAccount(req, res, session);
    return true;
  }

  if (pathname === "/api/password/change") {
    await handlers.handlePasswordChange(req, res, session);
    return true;
  }

  if (pathname === "/api/user/profile-image") {
    await handlers.handleProfileImageUpload(req, res, session);
    return true;
  }

  return false;
}
