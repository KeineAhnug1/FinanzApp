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

  // Dropdown-Menü ausblenden – User-Button navigiert direkt zu den Einstellungen
  if (profileMenu) profileMenu.hidden = true;

  if (!profileBtn) return;

  profileBtn.setAttribute("aria-label", "Einstellungen");
  profileBtn.addEventListener("click", () => {
    window.location.href = "/einstellungen/";
  });
}

function initDashboardMobileNav() {
  const controls = document.querySelector(".dash-topbar .topbar-right");
  const nav = controls?.querySelector(".app-nav-links");
  if (!controls || !nav) return;

  if (!nav.id) nav.id = "dashboard-topbar-nav";

  let toggle = controls.querySelector(".nav-toggle");
  if (!toggle) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "nav-toggle";
    toggle.innerHTML = '<span class="nav-toggle-icon" aria-hidden="true">&#9776;</span><span class="nav-toggle-label">Menue</span>';
    controls.insertBefore(toggle, nav);
  }
  toggle.setAttribute("aria-controls", nav.id);

  const closeMenu = () => {
    controls.classList.remove("is-nav-open");
    toggle.setAttribute("aria-expanded", "false");
    const icon = toggle.querySelector(".nav-toggle-icon");
    if (icon) icon.innerHTML = "&#9776;";
  };

  const openMenu = () => {
    controls.classList.add("is-nav-open");
    toggle.setAttribute("aria-expanded", "true");
    const icon = toggle.querySelector(".nav-toggle-icon");
    if (icon) icon.innerHTML = "&times;";
  };

  if (toggle.dataset.bound !== "1") {
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", () => {
      const isOpen = controls.classList.contains("is-nav-open");
      if (isOpen) closeMenu();
      else openMenu();
    });

    nav.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("a")) closeMenu();
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!controls.contains(target)) closeMenu();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 960) closeMenu();
    });
  }

  closeMenu();
}
