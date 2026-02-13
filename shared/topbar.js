/**
 * Shared Topbar Initialisierung:
 * - Theme-Switcher
 * - Profil-Datenanzeige
 * - Profilmenu + Logout
 */
(function initSharedTopbar() {
  /**
   * Schreibt Session-Userdaten in alle Profilelemente der Topbar.
   * @param {{first_name?: string, last_name?: string, username?: string, email?: string}} oSessionUser Userdaten.
   */
  function fnFillProfileElements(oSessionUser) {
    const sProfileName = `${oSessionUser.first_name || ""} ${oSessionUser.last_name || ""}`.trim() || oSessionUser.username || "Nutzer";
    const sAvatarInitials = window.FinanzAppSession.initialsFromUser(oSessionUser);

    const aProfileNameElements = document.querySelectorAll("[data-profile-name]");
    for (const oProfileNameElement of aProfileNameElements) oProfileNameElement.textContent = sProfileName;

    const aProfileMenuNameElements = document.querySelectorAll("[data-profile-menu-name]");
    for (const oProfileMenuNameElement of aProfileMenuNameElements) oProfileMenuNameElement.textContent = sProfileName;

    const aProfileMenuMailElements = document.querySelectorAll("[data-profile-menu-mail]");
    for (const oProfileMenuMailElement of aProfileMenuMailElements) oProfileMenuMailElement.textContent = oSessionUser.email || "-";

    const aProfileAvatarElements = document.querySelectorAll("[data-profile-avatar]");
    for (const oProfileAvatarElement of aProfileAvatarElements) oProfileAvatarElement.textContent = sAvatarInitials;
  }

  /**
   * Initialisiert das Oeffnen/Schliessen aller Profilmenues.
   * Zudem wird Logout an den zentralen Session-Handler gebunden.
   */
  function fnInitProfileMenus() {
    const aProfileWraps = document.querySelectorAll(".profile-wrap");
    for (const oProfileWrap of aProfileWraps) {
      const oProfileButton = oProfileWrap.querySelector(".profile-btn");
      const oProfileMenu = oProfileWrap.querySelector(".profile-menu");
      const oLogoutButton = oProfileWrap.querySelector(".logout-btn");
      if (!oProfileButton || !oProfileMenu || !oLogoutButton) continue;

      oProfileButton.addEventListener("click", () => {
        const bWillOpen = oProfileMenu.hidden;

        for (const oOtherProfileWrap of aProfileWraps) {
          const oOtherProfileMenu = oOtherProfileWrap.querySelector(".profile-menu");
          const oOtherProfileButton = oOtherProfileWrap.querySelector(".profile-btn");
          if (oOtherProfileMenu) oOtherProfileMenu.hidden = true;
          if (oOtherProfileButton) oOtherProfileButton.setAttribute("aria-expanded", "false");
        }

        oProfileMenu.hidden = !bWillOpen;
        oProfileButton.setAttribute("aria-expanded", String(bWillOpen));
      });

      oLogoutButton.addEventListener("click", () => {
        window.FinanzAppSession.logoutAndRedirect();
      });
    }

    document.addEventListener("click", (oEvent) => {
      const oTarget = oEvent.target;
      if (!(oTarget instanceof Node)) return;

      for (const oProfileWrap of aProfileWraps) {
        const oProfileButton = oProfileWrap.querySelector(".profile-btn");
        const oProfileMenu = oProfileWrap.querySelector(".profile-menu");
        if (!oProfileButton || !oProfileMenu) continue;
        if (!oProfileWrap.contains(oTarget)) {
          oProfileMenu.hidden = true;
          oProfileButton.setAttribute("aria-expanded", "false");
        }
      }
    });
  }

  /**
   * Hauptinitialisierung:
   * - Theme-Hooks laden
   * - Profilmenus binden
   * - Session-User laden und anzeigen
   */
  async function fnInitTopbar() {
    if (window.FinanzAppTheme?.initThemeSwitcher) {
      window.FinanzAppTheme.initThemeSwitcher();
    }

    fnInitProfileMenus();

    try {
      const oSessionUser = await window.FinanzAppSession.fetchSessionUser();
      fnFillProfileElements(oSessionUser);
      window.FinanzAppSession.setCurrentUserInStorage(oSessionUser);
    } catch {
      // Seitenzugriffe sind serverseitig geschuetzt.
    }
  }

  fnInitTopbar();
})();
