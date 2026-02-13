(() => {
  const THEME_STORAGE_KEY = "finanzapp.themeMode";
  const THEME_OPTIONS = new Set(["light", "dark", "auto"]);
  const prefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function getStoredThemeMode() {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && THEME_OPTIONS.has(stored)) return stored;
    return "auto";
  }

  function resolveTheme(mode) {
    if (mode === "auto") return prefersDarkQuery.matches ? "dark" : "light";
    return mode;
  }

  function updateThemeButtons(mode) {
    const buttons = document.querySelectorAll(".theme-option");
    for (const button of buttons) {
      const isActive = button.dataset.themeChoice === mode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }
  }

  function applyTheme(mode) {
    const resolved = resolveTheme(mode);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themeMode = mode;
    updateThemeButtons(mode);
  }

  function initThemeSwitcher() {
    applyTheme(getStoredThemeMode());
    const buttons = document.querySelectorAll(".theme-option");
    for (const button of buttons) {
      button.addEventListener("click", () => {
        const mode = button.dataset.themeChoice;
        if (!mode || !THEME_OPTIONS.has(mode)) return;
        window.localStorage.setItem(THEME_STORAGE_KEY, mode);
        applyTheme(mode);
      });
    }

    const handleSchemeChange = () => {
      const mode = getStoredThemeMode();
      if (mode === "auto") applyTheme(mode);
    };

    if (typeof prefersDarkQuery.addEventListener === "function") {
      prefersDarkQuery.addEventListener("change", handleSchemeChange);
    } else if (typeof prefersDarkQuery.addListener === "function") {
      prefersDarkQuery.addListener(handleSchemeChange);
    }
  }

  function initialsFromUser(user) {
    const first = String(user.first_name || user.username || "U").charAt(0).toUpperCase();
    const last = String(user.last_name || "").charAt(0).toUpperCase();
    return `${first}${last}`.trim() || "U";
  }

  function fillProfile(user) {
    const profileName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username || "Nutzer";
    for (const el of document.querySelectorAll("[data-profile-name]")) el.textContent = profileName;
    for (const el of document.querySelectorAll("[data-profile-menu-name]")) el.textContent = profileName;
    for (const el of document.querySelectorAll("[data-profile-menu-mail]")) el.textContent = user.email || "-";
    for (const el of document.querySelectorAll("[data-profile-avatar]")) el.textContent = initialsFromUser(user);
  }

  async function loadSessionUser() {
    const response = await fetch("/api/session", { credentials: "same-origin" });
    const payload = await response.json();
    if (!response.ok || !payload?.ok || !payload?.session_user) {
      throw new Error(payload?.message || "Session konnte nicht geladen werden.");
    }
    fillProfile(payload.session_user);
  }

  function initProfileMenus() {
    const wraps = document.querySelectorAll(".profile-wrap");
    for (const wrap of wraps) {
      const btn = wrap.querySelector(".profile-btn");
      const menu = wrap.querySelector(".profile-menu");
      const logoutBtn = wrap.querySelector(".logout-btn");
      if (!btn || !menu || !logoutBtn) continue;

      btn.addEventListener("click", () => {
        const willOpen = menu.hidden;
        for (const otherWrap of wraps) {
          const otherMenu = otherWrap.querySelector(".profile-menu");
          const otherBtn = otherWrap.querySelector(".profile-btn");
          if (otherMenu) otherMenu.hidden = true;
          if (otherBtn) otherBtn.setAttribute("aria-expanded", "false");
        }
        menu.hidden = !willOpen;
        btn.setAttribute("aria-expanded", String(willOpen));
      });

      logoutBtn.addEventListener("click", async () => {
        try {
          await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
        } catch {
          // no-op
        }
        window.sessionStorage.removeItem("finanzapp.currentUser");
        window.location.assign("/");
      });
    }

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      for (const wrap of wraps) {
        const btn = wrap.querySelector(".profile-btn");
        const menu = wrap.querySelector(".profile-menu");
        if (!btn || !menu) continue;
        if (!wrap.contains(target)) {
          menu.hidden = true;
          btn.setAttribute("aria-expanded", "false");
        }
      }
    });
  }

  async function initTopbar() {
    initThemeSwitcher();
    initProfileMenus();
    try {
      await loadSessionUser();
    } catch {
      // Session wird serverseitig geschuetzt; ignorieren falls nicht verfuegbar.
    }
  }

  initTopbar();
})();
