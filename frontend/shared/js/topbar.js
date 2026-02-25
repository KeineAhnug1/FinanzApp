/**
 * Shared Topbar:
 * - Einheitliche Navigation
 * - Profilmenu + Logout
 * - Globales Settings-Panel (Währung + Sprache) außerhalb vom Dashboard
 */
(function initSharedTopbar() {
  const SETTINGS_STORAGE_PREFIX = "finanzapp.dashboardSettings";
  const DEFAULT_SETTINGS = { currency: "EUR", locale: "de-DE" };
  const CURRENCIES = [
    { value: "EUR", labelKey: "euro_label", fallback: "Euro (EUR)" },
    { value: "USD", labelKey: "usd_label", fallback: "US-Dollar (USD)" },
    { value: "GBP", labelKey: "gbp_label", fallback: "Pfund (GBP)" },
    { value: "CHF", labelKey: "chf_label", fallback: "Schweizer Franken (CHF)" }
  ];
  const NAV_ITEMS = [
    { href: "/dashboard.html", labelKey: "nav_dashboard", fallback: "Dashboard", key: "dashboard" },
    { href: "/konten/", labelKey: "nav_accounts", fallback: "Kontenverwaltung", key: "accounts" },
    { href: "/groups/", labelKey: "nav_groups", fallback: "Gruppen", key: "groups" },
    { href: "/aktien/", labelKey: "nav_stocks", fallback: "Aktien", key: "stocks" },
    { href: "/fragen/", labelKey: "nav_questions", fallback: "Fragen", key: "questions" }
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

  function ensureNav(controls) {
    if (!controls) return;
    let nav = controls.querySelector(".app-nav-links");
    if (!nav) {
      nav = document.createElement("nav");
      nav.className = "app-nav-links";
      nav.setAttribute("aria-label", t("nav_app", "App-Navigation"));
      controls.prepend(nav);
    }

    const activeKey = currentNavKey();
    nav.innerHTML = NAV_ITEMS.map((item) => {
      const active = item.key === activeKey ? " is-active" : "";
      return `<a class="app-nav-link${active}" href="${item.href}">${t(item.labelKey, item.fallback)}</a>`;
    }).join("");
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
      return { ...parsed, currency, locale };
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
    window.localStorage.setItem(key, JSON.stringify(merged));
  }

  function createGlobalSettingsMarkup() {
    return `
      <button id="settings-btn" class="settings-btn" type="button" aria-expanded="false" aria-controls="settings-panel" aria-label="${t("settings", "Einstellungen")}">
        <span class="settings-icon" aria-hidden="true">&#9881;</span>
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

  function initGlobalSettings(topbar, sessionUser) {
    const path = normalizePath(window.location.pathname);
    if (path === "/dashboard.html") return; // Dashboard nutzt seine eigene bestehende Logik.

    const controls = findControls(topbar);
    if (!controls) return;

    const legacyWrap = controls.querySelector(".global-settings-wrap");
    if (legacyWrap) legacyWrap.remove();

    if (!controls.querySelector(".settings-wrap")) {
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

    const settingsBtn = topbar.querySelector("#settings-btn");
    const settingsPanel = topbar.querySelector("#settings-panel");
    const settingsForm = topbar.querySelector("#settings-form");
    const resetBtn = topbar.querySelector("#settings-reset-btn");
    const status = topbar.querySelector("#settings-status");
    const currency = topbar.querySelector("#settings-currency");
    const locale = topbar.querySelector("#settings-locale");
    if (!settingsBtn || !settingsPanel || !settingsForm || !resetBtn || !status || !currency || !locale) return;

    const userId = String(sessionUser?.id || "anonymous");
    renderLocaleOptions(locale);

    const applyFormValues = () => {
      const settings = loadSettings(userId);
      currency.value = settings.currency;
      locale.value = settings.locale;
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
      const nextSettings = {
        currency: String(currency.value || DEFAULT_SETTINGS.currency).toUpperCase(),
        locale: String(locale.value || DEFAULT_SETTINGS.locale)
      };
      saveSettings(userId, nextSettings);
      if (window.FinanzAppLanguage?.setLocale) {
        window.FinanzAppLanguage.setLocale(nextSettings.locale, { userId });
      }
      status.textContent = t("settings.saved", "Einstellungen gespeichert.");
      status.classList.remove("is-error");
      status.classList.add("is-success");
    });

    resetBtn.addEventListener("click", () => {
      const resetSettings = { ...DEFAULT_SETTINGS };
      saveSettings(userId, resetSettings);
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
      applyFormValues();
    });
  }

  function fillProfileElements(sessionUser) {
    const profileName = `${sessionUser.first_name || ""} ${sessionUser.last_name || ""}`.trim() || sessionUser.username || t("topbar.user_fallback", "Nutzer");
    const avatarInitials = window.FinanzAppSession.initialsFromUser(sessionUser);

    const profileNameElements = document.querySelectorAll("[data-profile-name]");
    for (const element of profileNameElements) element.textContent = profileName;

    const menuNameElements = document.querySelectorAll("[data-profile-menu-name]");
    for (const element of menuNameElements) element.textContent = profileName;

    const mailElements = document.querySelectorAll("[data-profile-menu-mail]");
    for (const element of mailElements) element.textContent = sessionUser.email || "-";

    const avatarElements = document.querySelectorAll("[data-profile-avatar]");
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

      logout.addEventListener("click", () => {
        window.FinanzAppSession.logoutAndRedirect();
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
  }

  async function initTopbar() {
    const topbar = findTopbar();
    if (!topbar) return;

    const controls = findControls(topbar);
    if (controls && !controls.classList.contains("header-controls")) {
      controls.classList.add("header-controls");
    }

    updateBrandSub(topbar);
    ensureNav(controls);

    if (window.FinanzAppTheme?.initThemeSwitcher) {
      window.FinanzAppTheme.initThemeSwitcher();
    }

    initProfileMenus();

    try {
      const sessionUser = await window.FinanzAppSession.fetchSessionUser();
      fillProfileElements(sessionUser);
      window.FinanzAppSession.setCurrentUserInStorage(sessionUser);
      initGlobalSettings(topbar, sessionUser);
    } catch {
      // Seitenzugriffe sind serverseitig geschuetzt.
    }
  }

  initTopbar();
})();
