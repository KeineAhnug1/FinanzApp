// @ts-check

/** @param {import('./types.mjs').ApiRouteContext} ctx */
export async function dispatchUserRoutes(ctx) {
  const { request, pathname, session, handlers } = ctx;

  if (pathname === "/api/user/account")
    return await handlers.handleDeleteUserAccount(request, session);
  if (pathname === "/api/password/change")
    return await handlers.handlePasswordChange(request, session);
  if (pathname === "/api/user/profile-image")
    return await handlers.handleProfileImageUpload(request, session);

  return null;
}
