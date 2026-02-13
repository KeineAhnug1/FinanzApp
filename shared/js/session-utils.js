/**
 * Shared Session/User Utilities fuer alle FinanzApp-Seiten.
 * Zentralisiert Session-Lesen, User-Profil-Helfer und Logout.
 */
(function initSharedSessionUtilities() {
  const sUserStorageKey = "finanzapp.currentUser";

  /**
   * Liefert Initialen aus einem User-Objekt.
   * @param {{first_name?: string, last_name?: string, username?: string}} oUser Userdaten.
   * @returns {string} Initialen fuer Avatar-Darstellung.
   */
  function fnInitialsFromUser(oUser) {
    const sFirstInitial = String(oUser?.first_name || oUser?.username || "U").charAt(0).toUpperCase();
    const sLastInitial = String(oUser?.last_name || "").charAt(0).toUpperCase();
    return `${sFirstInitial}${sLastInitial}`.trim() || "U";
  }

  /**
   * Liest den aktuellen User aus sessionStorage.
   * @returns {any|null} Geparster User oder null.
   */
  function fnGetCurrentUserFromStorage() {
    const sRawUser = window.sessionStorage.getItem(sUserStorageKey);
    if (!sRawUser) return null;
    try {
      return JSON.parse(sRawUser);
    } catch {
      return null;
    }
  }

  /**
   * Merged und speichert den aktuellen User in sessionStorage.
   * @param {object} oNextUser Neue Userdaten.
   * @returns {object|null} Gespeicherter User.
   */
  function fnSetCurrentUserInStorage(oNextUser) {
    if (!oNextUser) return null;
    const oCurrentUser = fnGetCurrentUserFromStorage() || {};
    const oMergedUser = { ...oCurrentUser, ...oNextUser };
    window.sessionStorage.setItem(sUserStorageKey, JSON.stringify(oMergedUser));
    return oMergedUser;
  }

  /**
   * Entfernt den aktuellen User aus sessionStorage.
   */
  function fnClearCurrentUserFromStorage() {
    window.sessionStorage.removeItem(sUserStorageKey);
  }

  /**
   * Laedt den Session-User serverseitig ueber `/api/session`.
   * @returns {Promise<object>} Session-User vom Backend.
   * @throws {Error} Falls Session nicht gueltig ist.
   */
  async function fnFetchSessionUser() {
    const oSessionResponse = await fetch("/api/session", { credentials: "same-origin" });
    const oSessionPayload = await oSessionResponse.json();
    if (!oSessionResponse.ok || !oSessionPayload?.ok || !oSessionPayload?.session_user) {
      throw new Error(oSessionPayload?.message || "Session konnte nicht geladen werden.");
    }
    return oSessionPayload.session_user;
  }

  /**
   * Fuehrt Logout ueber API aus und loescht den lokal gespeicherten User.
   */
  async function fnLogoutAndRedirect() {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      // no-op: lokales Logout wird trotzdem ausgefuehrt
    }
    fnClearCurrentUserFromStorage();
    window.location.assign("/");
  }

  window.FinanzAppSession = {
    getCurrentUserFromStorage: fnGetCurrentUserFromStorage,
    setCurrentUserInStorage: fnSetCurrentUserInStorage,
    clearCurrentUserFromStorage: fnClearCurrentUserFromStorage,
    fetchSessionUser: fnFetchSessionUser,
    initialsFromUser: fnInitialsFromUser,
    logoutAndRedirect: fnLogoutAndRedirect
  };
})();
