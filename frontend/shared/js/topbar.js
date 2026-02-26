/**
 * Shared Topbar:
 * - Einheitliche Navigation
 * - Profilmenu + Logout
 * - Globales Settings-Panel (Währung + Sprache) außerhalb vom Dashboard
 */
(function initSharedTopbar() {
  window.FinanzAppSharedTopbar = true;
  const SETTINGS_STORAGE_PREFIX = "finanzapp.dashboardSettings";
  const SIDENAV_COLLAPSED_STORAGE_KEY = "finanzapp.sideNav.collapsed";
  const MOBILE_BREAKPOINT = 960;
  const DEFAULT_SETTINGS = { currency: "EUR", locale: "de-DE", themeMode: "auto" };
  const THEME_OPTIONS = new Set(["light", "dark", "auto"]);
  const CURRENCIES = [
    { value: "EUR", labelKey: "euro_label", fallback: "Euro (EUR)" },
    { value: "USD", labelKey: "usd_label", fallback: "US-Dollar (USD)" },
    { value: "GBP", labelKey: "gbp_label", fallback: "Pfund (GBP)" },
    { value: "CHF", labelKey: "chf_label", fallback: "Schweizer Franken (CHF)" }
  ];
  const NAV_ITEMS = [
    {
      href: "/dashboard.html",
      labelKey: "nav_dashboard",
      fallback: "Dashboard",
      key: "dashboard",
      iconPath: "/shared/images/nav-dashboard.svg"
    },
    {
      href: "/konten/",
      labelKey: "nav_accounts",
      fallback: "Kontenverwaltung",
      key: "accounts",
      iconPath: "/shared/images/nav-accounts.svg"
    },
    {
      href: "/groups/",
      labelKey: "nav_groups",
      fallback: "Gruppen",
      key: "groups",
      iconPath: "/shared/images/nav-groups.svg"
    },
    {
      href: "/aktien/",
      labelKey: "nav_stocks",
      fallback: "Aktien",
      key: "stocks",
      iconPath: "/shared/images/nav-stocks.svg"
    },
    {
      href: "/fragen/",
      labelKey: "nav_questions",
      fallback: "Fragen",
      key: "questions",
      iconPath: "/shared/images/nav-questions.svg"
    }
  ];

  function t(key, fallback, params = {}) {
    const translated = window.FinanzAppLanguage?.t?.(key, params);
    if (translated && translated !== key) return translated;
    if (!params || !Object.keys(params).length) return fallback;
    return String(fallback || "").replaceAll(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
  }

  function normalizePath(pathname) {
    const raw = String(pathname || "/").trim();
    if (!raw) return "/";
    if (raw === "/groups") return "/groups/";
    if (raw === "/aktien") return "/aktien/";
    if (raw === "/konten") return "/konten/";
    if (raw === "/fragen") return "/fragen/";
    return raw;
  }

  function currentNavKey() {
    const path = normalizePath(window.location.pathname);
    if (path === "/dashboard.html") return "dashboard";
    if (path.startsWith("/groups/")) return "groups";
    if (path.startsWith("/aktien/")) return "stocks";
    if (path.startsWith("/konten/")) return "accounts";
    if (path.startsWith("/fragen/")) return "questions";
    return "";
  }

  function currentBrandSub() {
    const path = normalizePath(window.location.pathname);
    if (path === "/dashboard.html") return t("nav_dashboard", "Dashboard");
    if (path.startsWith("/groups/")) return t("nav_groups", "Gruppen");
    if (path.startsWith("/aktien/")) return t("nav_stocks", "Aktien");
    if (path.startsWith("/konten/")) return t("nav_accounts", "Kontenverwaltung");
    if (path.startsWith("/fragen/")) return t("nav_questions", "Fragen");
    return t("topbar.brand", "FinanzApp");
  }

  function findTopbar() {
    return document.querySelector(".dash-topbar, .page-topbar, .layout-toolbar");
  }

  function findControls(topbar) {
    return topbar?.querySelector(".header-controls, .topbar-right, .toolbar-actions") || null;
  }

  function updateBrandSub(topbar) {
    const sub = topbar?.querySelector(".brand-sub");
    if (!sub) return;
    sub.textContent = currentBrandSub();
  }

  function navMarkup() {
    const activeKey = currentNavKey();
    return NAV_ITEMS.map((item) => {
      const active = item.key === activeKey ? " is-active" : "";
      if (item.key === activeKey) {
        return `
          <span class="app-nav-link${active}" aria-current="page">
            <span class="app-nav-icon"><img class="app-nav-icon-img" src="${item.iconPath}" alt="" aria-hidden="true"></span>
            <span class="app-nav-label">${t(item.labelKey, item.fallback)}</span>
          </span>
        `;
      }
      return `
        <a class="app-nav-link${active}" href="${item.href}">
          <span class="app-nav-icon"><img class="app-nav-icon-img" src="${item.iconPath}" alt="" aria-hidden="true"></span>
          <span class="app-nav-label">${t(item.labelKey, item.fallback)}</span>
        </a>
      `;
    }).join("");
  }

  function disableActiveNavLinkClicks() {
    if (document.documentElement.dataset.activeNavClickGuardBound === "1") return;
    document.documentElement.dataset.activeNavClickGuardBound = "1";
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const activeLink = target.closest("a.app-nav-link.is-active");
      if (!activeLink) return;
      event.preventDefault();
    });
  }

  function ensureSidebar(topbar, controls) {
    if (!topbar || !controls) return;
    document.body.classList.add("has-shared-sidebar");
    const existingTopbarNav = controls.querySelector(".app-nav-links");
    if (existingTopbarNav) existingTopbarNav.remove();

    let sideNav = document.querySelector(".app-side-nav");
    if (!sideNav) {
      sideNav = document.createElement("aside");
      sideNav.className = "app-side-nav";
      sideNav.innerHTML = `
        <div class="app-side-nav-head">
          <button class="side-nav-collapse-toggle" type="button" aria-expanded="true" aria-label="${t("topbar.menu", "Menue")}">
            <span class="side-nav-collapse-icon" aria-hidden="true">&#9776;</span>
          </button>
          <span class="side-nav-title">${t("topbar.brand", "FinanzApp")}</span>
        </div>
        <nav class="app-nav-links" aria-label="${t("nav_app", "App-Navigation")}"></nav>
        <div class="app-side-nav-after-links"></div>
        <div class="app-side-nav-bottom"></div>
      `;
      document.body.prepend(sideNav);
    }
    const nav = sideNav.querySelector(".app-nav-links");
    if (nav) nav.innerHTML = navMarkup();
    const sideNavAfterLinks = sideNav.querySelector(".app-side-nav-after-links");
    const sideNavBottom = sideNav.querySelector(".app-side-nav-bottom");

    if (sideNavAfterLinks) {
      const settingsWrap = controls.querySelector(".settings-wrap");
      if (settingsWrap) sideNavAfterLinks.appendChild(settingsWrap);
    }

    if (sideNavBottom) {
      const profileWrap = controls.querySelector(".profile-wrap");
      if (profileWrap) sideNavBottom.appendChild(profileWrap);
    }

    let isCollapsed = false;
    try {
      isCollapsed = window.localStorage.getItem(SIDENAV_COLLAPSED_STORAGE_KEY) === "1";
    } catch {
      isCollapsed = false;
    }

    const collapseButton = sideNav.querySelector(".side-nav-collapse-toggle");
    const applyCollapsedState = (collapsed) => {
      document.body.classList.toggle("side-nav-collapsed", collapsed);
      if (collapseButton) {
        collapseButton.setAttribute("aria-expanded", String(!collapsed));
      }
    };
    applyCollapsedState(isCollapsed);

    if (collapseButton && collapseButton.dataset.bound !== "1") {
      collapseButton.dataset.bound = "1";
      collapseButton.addEventListener("click", () => {
        const nextCollapsed = !document.body.classList.contains("side-nav-collapsed");
        applyCollapsedState(nextCollapsed);
        try {
          window.localStorage.setItem(SIDENAV_COLLAPSED_STORAGE_KEY, nextCollapsed ? "1" : "0");
        } catch {
          // ignore storage failures
        }
      });
    }

    sideNav.id = "app-side-nav";
    let toggle = document.querySelector(".side-nav-mobile-toggle");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "side-nav-mobile-toggle";
      toggle.innerHTML = `
        <span class="nav-toggle-icon" aria-hidden="true">&#9776;</span>
        <span class="sr-only">${t("topbar.menu", "Menue")}</span>
      `;
      document.body.appendChild(toggle);
    }
    toggle.setAttribute("aria-controls", "app-side-nav");
    const closeMenu = () => {
      document.body.classList.remove("side-nav-open");
      toggle.setAttribute("aria-expanded", "false");
      const icon = toggle.querySelector(".nav-toggle-icon");
      if (icon) icon.innerHTML = "&#9776;";
    };

    const openMenu = () => {
      document.body.classList.add("side-nav-open");
      toggle.setAttribute("aria-expanded", "true");
      const icon = toggle.querySelector(".nav-toggle-icon");
      if (icon) icon.innerHTML = "&times;";
    };

    if (toggle.dataset.bound !== "1") {
      toggle.dataset.bound = "1";
      toggle.addEventListener("click", () => {
        const isOpen = document.body.classList.contains("side-nav-open");
        if (isOpen) closeMenu();
        else openMenu();
      });

      sideNav.addEventListener("click", (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest("a")) closeMenu();
      });

      document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (window.innerWidth > MOBILE_BREAKPOINT) return;
        if (!sideNav.contains(target) && !toggle.contains(target)) closeMenu();
      });

      window.addEventListener("resize", () => {
        if (window.innerWidth > MOBILE_BREAKPOINT) closeMenu();
      });
    }

    closeMenu();
  }

  function settingsStorageKey(userId) {
    return `${SETTINGS_STORAGE_PREFIX}.${userId || "anonymous"}`;
  }

  function loadSettings(userId) {
    try {
      const raw = window.localStorage.getItem(settingsStorageKey(userId));
      const parsed = raw ? JSON.parse(raw) : {};
      const currency = CURRENCIES.some((item) => item.value === parsed?.currency) ? parsed.currency : DEFAULT_SETTINGS.currency;
      const locale = window.FinanzAppLanguage?.LOCALES?.includes(parsed?.locale) ? parsed.locale : (window.FinanzAppLanguage?.getLocale?.(userId) || DEFAULT_SETTINGS.locale);
      const themeMode = window.FinanzAppTheme?.getStoredThemeMode?.() || DEFAULT_SETTINGS.themeMode;
      return { ...parsed, currency, locale, themeMode };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(userId, nextSettings) {
    const key = settingsStorageKey(userId);
    let merged = {};
    try {
      const raw = window.localStorage.getItem(key);
      merged = raw ? JSON.parse(raw) : {};
    } catch {
      merged = {};
    }
    merged.currency = nextSettings.currency;
    merged.locale = nextSettings.locale;
    merged.themeMode = THEME_OPTIONS.has(nextSettings.themeMode) ? nextSettings.themeMode : DEFAULT_SETTINGS.themeMode;
    window.localStorage.setItem(key, JSON.stringify(merged));
  }

  function createGlobalSettingsMarkup() {
    return `
      <button id="settings-btn" class="settings-btn" type="button" aria-expanded="false" aria-controls="settings-panel" aria-label="${t("settings", "Einstellungen")}">
        <span class="settings-icon" aria-hidden="true">&#9881;</span>
        <span class="settings-btn-label">${t("settings", "Einstellungen")}</span>
      </button>
      <div id="settings-panel" class="settings-panel" hidden>
        <p class="settings-title">${t("settings", "Einstellungen")}</p>
        <form id="settings-form" class="settings-form">
          <div>
            <label class="field-label" for="settings-currency">${t("display_currency", "Anzeige-Währung")}</label>
            <select class="field-input" id="settings-currency" name="currency">
              ${CURRENCIES.map((item) => `<option value="${item.value}">${t(item.labelKey, item.fallback)}</option>`).join("")}
            </select>
          </div>
          <div>
            <label class="field-label" for="settings-locale">${t("language_number_format", "Sprache & Zahlenformat")}</label>
            <select class="field-input" id="settings-locale" name="locale"></select>
          </div>
          <div>
            <label class="field-label" for="settings-theme-mode">${t("theme_mode", "Farbmodus")}</label>
            <select class="field-input" id="settings-theme-mode" name="theme_mode">
              <option value="light">${t("theme_light", "Hell")}</option>
              <option value="dark">${t("theme_dark", "Dunkel")}</option>
              <option value="auto">${t("theme_auto", "Systemdesign")}</option>
            </select>
          </div>
          <div class="settings-actions">
            <button class="submit-income" type="submit">${t("save", "Speichern")}</button>
            <button id="settings-reset-btn" class="settings-reset-btn" type="button">${t("reset", "Zurücksetzen")}</button>
          </div>
        </form>
        <p id="settings-status" class="form-status"></p>
      </div>
    `;
  }

  function renderLocaleOptions(select) {
    if (!select) return;
    const locales = Array.from(window.FinanzAppLanguage?.LOCALES || ["de-DE", "en-US", "en-GB", "fr-FR", "es-ES"]);
    select.innerHTML = locales
      .map((locale) => `<option value="${locale}">${window.FinanzAppLanguage?.t?.(`locale.${locale}`) || locale}</option>`)
      .join("");
  }

  function renderThemeOptions(select) {
    if (!select) return;
    select.innerHTML = [
      { value: "light", key: "theme_light", fallback: "Hell" },
      { value: "dark", key: "theme_dark", fallback: "Dunkel" },
      { value: "auto", key: "theme_auto", fallback: "Systemdesign" }
    ].map((option) => `<option value="${option.value}">${t(option.key, option.fallback)}</option>`).join("");
  }

  function initGlobalSettings(topbar, sessionUser) {
    const path = normalizePath(window.location.pathname);
    if (path === "/dashboard.html") return; // Dashboard nutzt seine eigene bestehende Logik.

    const controls = findControls(topbar);
    if (!controls) return;

    const legacyWrap = controls.querySelector(".global-settings-wrap");
    if (legacyWrap) legacyWrap.remove();

    // Settings koennen bereits von ensureSidebar in die Side-Nav verschoben worden sein.
    // In dem Fall nicht erneut erzeugen, sonst entstehen doppelte Einstellungen.
    if (!document.querySelector(".settings-wrap")) {
      const wrap = document.createElement("div");
      wrap.className = "settings-wrap";
      wrap.innerHTML = createGlobalSettingsMarkup();
      const profileWrap = controls.querySelector(".profile-wrap");
      if (profileWrap) {
        controls.insertBefore(wrap, profileWrap);
      } else {
        controls.appendChild(wrap);
      }
    }

    const settingsBtn = document.getElementById("settings-btn");
    const settingsPanel = document.getElementById("settings-panel");
    const settingsForm = document.getElementById("settings-form");
    const resetBtn = document.getElementById("settings-reset-btn");
    const status = document.getElementById("settings-status");
    const currency = document.getElementById("settings-currency");
    const locale = document.getElementById("settings-locale");
    const themeMode = document.getElementById("settings-theme-mode");
    if (!settingsBtn || !settingsPanel || !settingsForm || !resetBtn || !status || !currency || !locale || !themeMode) return;

    const userId = String(sessionUser?.id || "anonymous");
    renderLocaleOptions(locale);
    renderThemeOptions(themeMode);

    const applyFormValues = () => {
      const settings = loadSettings(userId);
      currency.value = settings.currency;
      locale.value = settings.locale;
      themeMode.value = settings.themeMode;
      status.textContent = "";
      status.classList.remove("is-error", "is-success");
    };

    const close = () => {
      settingsPanel.hidden = true;
      settingsBtn.setAttribute("aria-expanded", "false");
    };

    settingsBtn.addEventListener("click", () => {
      const willOpen = settingsPanel.hidden;
      if (willOpen) applyFormValues();
      settingsPanel.hidden = !willOpen;
      settingsBtn.setAttribute("aria-expanded", String(willOpen));
    });

    settingsForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const currentLocale = String(window.FinanzAppLanguage?.getLocale?.(userId) || DEFAULT_SETTINGS.locale);
      const nextSettings = {
        currency: String(currency.value || DEFAULT_SETTINGS.currency).toUpperCase(),
        locale: String(locale.value || DEFAULT_SETTINGS.locale),
        themeMode: THEME_OPTIONS.has(themeMode.value) ? themeMode.value : DEFAULT_SETTINGS.themeMode
      };
      saveSettings(userId, nextSettings);
      if (window.FinanzAppTheme?.saveAndApplyThemeMode) {
        window.FinanzAppTheme.saveAndApplyThemeMode(nextSettings.themeMode);
      }
      if (window.FinanzAppLanguage?.setLocale) {
        window.FinanzAppLanguage.setLocale(nextSettings.locale, { userId });
      }
      status.textContent = t("settings.saved", "Einstellungen gespeichert.");
      status.classList.remove("is-error");
      status.classList.add("is-success");
      if (nextSettings.locale !== currentLocale) {
        window.location.reload();
      }
    });

    resetBtn.addEventListener("click", () => {
      const resetSettings = { ...DEFAULT_SETTINGS };
      saveSettings(userId, resetSettings);
      if (window.FinanzAppTheme?.saveAndApplyThemeMode) {
        window.FinanzAppTheme.saveAndApplyThemeMode(resetSettings.themeMode);
      }
      if (window.FinanzAppLanguage?.setLocale) {
        window.FinanzAppLanguage.setLocale(resetSettings.locale, { userId });
      }
      applyFormValues();
      status.textContent = t("settings.reset_done", "Einstellungen zurückgesetzt.");
      status.classList.remove("is-error");
      status.classList.add("is-success");
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!settingsPanel.contains(target) && !settingsBtn.contains(target)) close();
    });

    window.addEventListener("finanzapp:locale-changed", () => {
      renderLocaleOptions(locale);
      renderThemeOptions(themeMode);
      applyFormValues();
    });
  }

  function fillProfileElements(sessionUser) {
    const profileName = `${sessionUser.first_name || ""} ${sessionUser.last_name || ""}`.trim() || sessionUser.username || t("topbar.user_fallback", "Nutzer");
    const avatarInitials = window.FinanzAppSession.initialsFromUser(sessionUser);

    const profileNameElements = document.querySelectorAll("[data-profile-name], #profile-name");
    for (const element of profileNameElements) element.textContent = profileName;

    const menuNameElements = document.querySelectorAll("[data-profile-menu-name], #menu-name");
    for (const element of menuNameElements) element.textContent = profileName;

    const mailElements = document.querySelectorAll("[data-profile-menu-mail], #menu-mail");
    for (const element of mailElements) element.textContent = sessionUser.email || "-";

    const avatarElements = document.querySelectorAll("[data-profile-avatar], #profile-avatar");
    for (const element of avatarElements) element.textContent = avatarInitials;
  }

  function initProfileMenus() {
    const wraps = document.querySelectorAll(".profile-wrap");
    for (const wrap of wraps) {
      const button = wrap.querySelector(".profile-btn");
      const menu = wrap.querySelector(".profile-menu");
      const logout = wrap.querySelector(".logout-btn");
      if (!button || !menu || !logout) continue;

      button.addEventListener("click", () => {
        const willOpen = menu.hidden;
        for (const otherWrap of wraps) {
          const otherMenu = otherWrap.querySelector(".profile-menu");
          const otherButton = otherWrap.querySelector(".profile-btn");
          if (otherMenu) otherMenu.hidden = true;
          if (otherButton) otherButton.setAttribute("aria-expanded", "false");
        }
        menu.hidden = !willOpen;
        button.setAttribute("aria-expanded", String(willOpen));
      });

    }

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      for (const wrap of wraps) {
        const button = wrap.querySelector(".profile-btn");
        const menu = wrap.querySelector(".profile-menu");
        if (!button || !menu) continue;
        if (!wrap.contains(target)) {
          menu.hidden = true;
          button.setAttribute("aria-expanded", "false");
        }
      }
    });

    if (document.documentElement.dataset.logoutBound !== "1") {
      document.documentElement.dataset.logoutBound = "1";
      document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const logoutButton = target.closest(".logout-btn");
        if (!logoutButton) return;
        event.preventDefault();
        window.FinanzAppSession.logoutAndRedirect();
      });
    }
  }

  async function initTopbar() {
    const topbar = findTopbar();
    if (!topbar) return;

    const controls = findControls(topbar);
    if (controls && !controls.classList.contains("header-controls")) {
      controls.classList.add("header-controls");
    }

    updateBrandSub(topbar);
    ensureSidebar(topbar, controls);

    if (window.FinanzAppTheme?.initThemeSwitcher) {
      window.FinanzAppTheme.initThemeSwitcher();
    }

    initProfileMenus();
    disableActiveNavLinkClicks();

    try {
      const sessionUser = await window.FinanzAppSession.fetchSessionUser();
      fillProfileElements(sessionUser);
      window.FinanzAppSession.setCurrentUserInStorage(sessionUser);
      initGlobalSettings(topbar, sessionUser);
      ensureSidebar(topbar, controls);
    } catch {
      // Seitenzugriffe sind serverseitig geschuetzt.
    }
  }

  initTopbar();
})();
