// @ts-check
const sUserStorageKey = "finanzapp.currentUser";

export function initialsFromUser(oUser) {
  const sFirstInitial = String(oUser?.first_name || oUser?.username || "U").charAt(0).toUpperCase();
  const sLastInitial = String(oUser?.last_name || "").charAt(0).toUpperCase();
  return `${sFirstInitial}${sLastInitial}`.trim() || "U";
}

export function getCurrentUserFromStorage() {
  const sRawUser = window.sessionStorage.getItem(sUserStorageKey);
  if (!sRawUser) return null;
  try {
    return JSON.parse(sRawUser);
  } catch {
    return null;
  }
}

export function setCurrentUserInStorage(oNextUser) {
  if (!oNextUser) return null;
  const oCurrentUser = getCurrentUserFromStorage() || {};
  const oMergedUser = { ...oCurrentUser, ...oNextUser };
  window.sessionStorage.setItem(sUserStorageKey, JSON.stringify(oMergedUser));
  return oMergedUser;
}

export function clearCurrentUserFromStorage() {
  window.sessionStorage.removeItem(sUserStorageKey);
}

export async function fetchSessionUser() {
  const oSessionResponse = await fetch("/api/session", { credentials: "same-origin" });
  const oSessionPayload = await oSessionResponse.json();
  if (!oSessionResponse.ok || !oSessionPayload?.ok || !oSessionPayload?.session_user) {
    throw new Error(oSessionPayload?.message || "Session konnte nicht geladen werden.");
  }
  return oSessionPayload.session_user;
}

export async function logoutAndRedirect() {
  try {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
  } catch {
    // no-op
  }
  clearCurrentUserFromStorage();
  window.location.assign("/");
}
