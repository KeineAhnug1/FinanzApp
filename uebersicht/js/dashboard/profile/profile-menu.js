// Profil-Menue: Anzeige des Nutzers und Abmelden aus der Session.
function initialsFromUser(user) {
  const first = String(user.first_name || user.username || "U").charAt(0).toUpperCase();
  const last = String(user.last_name || "").charAt(0).toUpperCase();
  return `${first}${last}`.trim();
}
function hydrateProfile(user) {
  const profileName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username || "Nutzer";
  setText("profile-name", profileName);
  setText("menu-name", profileName);
  setText("menu-mail", user.email || "-");
  const avatar = document.getElementById("profile-avatar");
  if (avatar) avatar.textContent = initialsFromUser(user);
}
function initProfileMenu() {
  const profileBtn = document.getElementById("profile-btn");
  const profileMenu = document.getElementById("profile-menu");
  const logoutBtn = document.getElementById("logout-btn");
  if (!profileBtn || !profileMenu || !logoutBtn) return;

  profileBtn.addEventListener("click", () => {
    const willOpen = profileMenu.hidden;
    if (willOpen) {
      const settingsPanel = document.getElementById("settings-panel");
      const settingsBtn = document.getElementById("settings-btn");
      if (settingsPanel) settingsPanel.hidden = true;
      if (settingsBtn) settingsBtn.setAttribute("aria-expanded", "false");
    }
    profileMenu.hidden = !willOpen;
    profileBtn.setAttribute("aria-expanded", String(willOpen));
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (!profileMenu.contains(target) && !profileBtn.contains(target)) {
      profileMenu.hidden = true;
      profileBtn.setAttribute("aria-expanded", "false");
    }
  });

  logoutBtn.addEventListener("click", async () => {
    try {
      await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      // no-op: lokales Logout wird trotzdem durchgefuehrt
    }
    window.sessionStorage.removeItem(USER_STORAGE_KEY);
    window.location.assign("/");
  });
}
