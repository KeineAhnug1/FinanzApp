// @ts-check
import { t as _t } from './language-utils.js';
import { initialsFromUser, fetchSessionUser, setCurrentUserInStorage } from './session-utils.js';
import { initThemeSwitcher } from './theme-utils.js';
const SIDENAV_COLLAPSED_STORAGE_KEY = "finanzapp.sideNav.collapsed";
const SUB_NAV_CLOSE_DURATION_MS = 180;
const EMBEDDED_QUERY_PARAM = "embedded";
const MOBILE_BREAKPOINT = 960;
const HOMEPAGE_PATH = "/pages/homepage/";
const NAV_ITEMS = [
  {
    href: "/pages/dashboard/dashboard.html",
    labelKey: "nav_dashboard",
    fallback: "Dashboard",
    key: "dashboard",
    iconPath: "/shared/images/nav-dashboard.svg"
  },
  {
    href: "/pages/accounts/",
    labelKey: "nav_accounts",
    fallback: "Kontenverwaltung",
    key: "accounts",
    iconPath: "/shared/images/nav-accounts.svg"
  },
  {
    href: "/pages/groups/",
    labelKey: "nav_groups",
    fallback: "Gruppen",
    key: "groups",
    iconPath: "/shared/images/nav-groups.svg"
  },
  {
    href: "/pages/stocks/",
    labelKey: "nav_stocks",
    fallback: "Aktien",
    key: "stocks",
    iconPath: "/shared/images/nav-stocks.svg"
  },
  {
    href: "/pages/questions/",
    labelKey: "nav_questions",
    fallback: "Fragen",
    key: "questions",
    iconPath: "/shared/images/nav-messages.svg"
  }
];
const SUB_NAV_ITEMS = {
};
const NAV_PATHS = new Set([
  "/pages/dashboard/dashboard.html",
  "/pages/accounts/",
  "/pages/groups/",
  "/pages/stocks/",
  "/pages/questions/"
]);
let contentFrame = null;
let contentFrameHost = null;
let isSoftNavigating = false;

function t(key, fallback, params = {}) {
  const translated = _t(key, params);
  if (translated && translated !== key) return translated;
  if (!params || !Object.keys(params).length) return fallback;
  return String(fallback || "").replaceAll(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}

function isEmbeddedPageContext() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get(EMBEDDED_QUERY_PARAM) === "1") return true;
  } catch {
    // ignore malformed query
  }
  return window.self !== window.top;
}

function removeTopbarForEmbeddedContext() {
  const topbar = findTopbar();
  if (topbar) topbar.remove();
  document.body.classList.remove("has-shared-sidebar", "side-nav-open", "side-nav-collapsed");
  document.body.classList.add("app-embedded-page");
  const mobileToggle = document.querySelector(".side-nav-mobile-toggle");
  if (mobileToggle) mobileToggle.remove();
  const sideNav = document.querySelector(".app-side-nav");
  if (sideNav) sideNav.remove();
}

function normalizePath(pathname) {
  const raw = String(pathname || "/").trim();
  if (!raw) return "/";
  if (raw === "/groups") return "/pages/groups/";
  if (raw === "/stocks") return "/pages/stocks/";
  if (raw === "/accounts") return "/pages/accounts/";
  if (raw === "/questions") return "/pages/questions/";
  return raw;
}

function currentNavKey(pathname) {
  const path = normalizePath(pathname || window.location.pathname);
  if (path === "/pages/dashboard/dashboard.html") return "dashboard";
  if (path.startsWith("/pages/groups/")) return "groups";
  if (path.startsWith("/pages/stocks/")) return "stocks";
  if (path.startsWith("/pages/accounts/")) return "accounts";
  if (path.startsWith("/pages/questions/")) return "questions";
  return "";
}

function currentBrandSub() {
  const path = normalizePath(window.location.pathname);
  if (path === "/pages/dashboard/dashboard.html") return t("nav_dashboard", "Dashboard");
  if (path.startsWith("/pages/groups/")) return t("nav_groups", "Gruppen");
  if (path.startsWith("/pages/stocks/")) return t("nav_stocks", "Aktien");
  if (path.startsWith("/pages/accounts/")) return t("nav_accounts", "Kontenverwaltung");
  if (path.startsWith("/pages/questions/")) return t("nav_questions", "Fragen");
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

function ensureTopbarBrandLink(topbar) {
  const topbarLeft = topbar?.querySelector(".topbar-left");
  if (!topbarLeft) return;

  const existingLink = topbarLeft.querySelector(".brand-link");
  if (existingLink instanceof HTMLAnchorElement) {
    existingLink.href = HOMEPAGE_PATH;
    return;
  }

  const brandMark = topbarLeft.querySelector(".brand-mark");
  const brandSub = topbarLeft.querySelector(".brand-sub");
  if (!brandMark && !brandSub) return;

  const brandLink = document.createElement("a");
  brandLink.className = "brand-link";
  brandLink.href = HOMEPAGE_PATH;
  brandLink.setAttribute("aria-label", t("topbar.brand", "FinanzApp"));
  if (brandMark) brandLink.appendChild(brandMark);
  if (brandSub) brandLink.appendChild(brandSub);
  topbarLeft.prepend(brandLink);
}

function subNavMarkup(parentKey, activeSubKey = "", isOpen = false) {
  const subItems = SUB_NAV_ITEMS[parentKey] || [];
  if (!subItems.length) return "";
  const openClass = isOpen ? " is-open" : "";
  return `
    <div class="app-sub-nav${openClass}" aria-label="${t("sections", "Bereiche")}" data-parent-key="${parentKey}">
      ${subItems.map((subItem) => {
        const sSubKey = String(subItem.key || "").toLowerCase();
        const isSubActive = String(activeSubKey || "").toLowerCase() === sSubKey;
        const activeClass = isSubActive ? " is-active" : "";
        const currentAttr = isSubActive ? ' aria-current="page"' : "";
        return `<a class="app-sub-nav-link${activeClass}" href="${subItem.href}"${currentAttr}>${t(subItem.labelKey, subItem.fallback)}</a>`;
      }).join("")}
    </div>
  `;
}

function activeSubKeys(activeKey, activeHash) {
  let activeDashboardSubKey = activeHash;
  if (activeKey === "dashboard" && !activeDashboardSubKey) {
    try {
      const stored = String(window.localStorage.getItem("finanzapp.dashboardView") || "").trim().toLowerCase();
      activeDashboardSubKey = stored || "overview";
    } catch {
      activeDashboardSubKey = "overview";
    }
  }
  const activeStocksSubKey = activeKey === "stocks" ? (activeHash || "depot") : activeHash;
  const activeAccountsSubKey = activeKey === "accounts" ? "accounts" : "";
  const activeGroupsSubKey = activeKey === "groups" ? "groups" : "";
  return { activeDashboardSubKey, activeStocksSubKey, activeAccountsSubKey, activeGroupsSubKey };
}

function navMarkup() {
  const activeKey = currentNavKey();
  const activeHash = String(window.location.hash || "").trim().replace(/^#/, "").toLowerCase();
  const { activeDashboardSubKey, activeStocksSubKey, activeAccountsSubKey, activeGroupsSubKey } = activeSubKeys(activeKey, activeHash);
  return NAV_ITEMS.map((item) => {
    const isActive = item.key === activeKey;
    const activeClass = isActive ? " is-active" : "";
    const sActiveSubKey =
      item.key === "dashboard" ? activeDashboardSubKey
      : item.key === "stocks" ? activeStocksSubKey
      : item.key === "accounts" ? activeAccountsSubKey
      : item.key === "groups" ? activeGroupsSubKey
      : activeHash;
    const isSubNavParent = Boolean(SUB_NAV_ITEMS[item.key]?.length);
    const subMarkup = isSubNavParent ? subNavMarkup(item.key, sActiveSubKey, isActive) : "";

    const iconHtml = `<span class="app-nav-icon"><img class="app-nav-icon-img" src="${item.iconPath}" alt="" aria-hidden="true"></span>`;
    const labelHtml = `<span class="app-nav-label">${t(item.labelKey, item.fallback)}</span>`;
    const chevronHtml = isSubNavParent
      ? `<span class="app-nav-chevron" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`
      : "";

    if (!item.href) {
      return `
        <div class="app-nav-item">
          <button class="app-nav-link${activeClass}" type="button" data-subnav-toggle="${item.key}" aria-expanded="${isActive ? "true" : "false"}">
            ${iconHtml}
            ${labelHtml}
            ${chevronHtml}
          </button>
          ${subMarkup}
        </div>
      `;
    }
    if (isActive) {
      return `
        <div class="app-nav-item">
          <span class="app-nav-link${activeClass}" aria-current="page">
            ${iconHtml}
            ${labelHtml}
          </span>
          ${subMarkup}
        </div>
      `;
    }
    return `
      <div class="app-nav-item">
        <a class="app-nav-link${activeClass}" href="${item.href}">
          ${iconHtml}
          ${labelHtml}
        </a>
      </div>
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

function bindSubNavToggle() {
  if (document.documentElement.dataset.subNavToggleBound === "1") return;
  document.documentElement.dataset.subNavToggleBound = "1";
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest("button.app-nav-link[data-subnav-toggle]");
    if (!btn) return;
    const parentKey = btn.dataset.subnavToggle;
    const subNav = btn.closest(".app-nav-item")?.querySelector(`.app-sub-nav[data-parent-key="${parentKey}"]`);
    if (!(subNav instanceof HTMLElement)) return;
    const isOpen = subNav.classList.contains("is-open");
    if (isOpen) {
      subNav.classList.remove("is-open");
      subNav.classList.add("is-closing");
      btn.setAttribute("aria-expanded", "false");
      window.setTimeout(() => subNav.classList.remove("is-closing"), SUB_NAV_CLOSE_DURATION_MS);
    } else {
      subNav.classList.add("is-open");
      subNav.classList.remove("is-closing");
      btn.setAttribute("aria-expanded", "true");
    }
  });
}

function refreshSidebarNav() {
  const nav = document.querySelector(".app-side-nav .app-nav-links");
  if (!nav) return;
  const activeHash = String(window.location.hash || "").trim().replace(/^#/, "").toLowerCase();
  const signature = `${normalizePath(window.location.pathname)}|${activeHash || "-"}`;
  if (nav.dataset.signature === signature) return;

  const openKeys = new Set(
    Array.from(nav.querySelectorAll(".app-sub-nav.is-open[data-parent-key]"))
      .map((el) => el.dataset.parentKey)
  );

  nav.innerHTML = navMarkup();
  nav.dataset.signature = signature;

  for (const key of openKeys) {
    const subNav = nav.querySelector(`.app-sub-nav[data-parent-key="${key}"]`);
    const btn = nav.querySelector(`button.app-nav-link[data-subnav-toggle="${key}"]`);
    if (subNav && !subNav.classList.contains("is-open")) {
      subNav.classList.add("is-open");
      subNav.classList.remove("is-closing");
      if (btn) btn.setAttribute("aria-expanded", "true");
    }
  }
}

function canSoftNavigateTo(url) {
  if (!(url instanceof URL)) return false;
  if (url.origin !== window.location.origin) return false;
  return NAV_PATHS.has(normalizePath(url.pathname));
}

function toEmbeddedUrl(url) {
  const embeddedUrl = new URL(url.href);
  embeddedUrl.searchParams.set(EMBEDDED_QUERY_PARAM, "1");
  return embeddedUrl;
}

function ensureContentFrameShell() {
  if (contentFrameHost && contentFrame && document.body.contains(contentFrameHost)) return;
  const sideNav = document.querySelector(".app-side-nav");
  const mobileToggle = document.querySelector(".side-nav-mobile-toggle");
  const topbar = findTopbar();
  const keep = new Set([sideNav, mobileToggle, topbar].filter(Boolean));

  contentFrameHost = document.createElement("main");
  contentFrameHost.className = "app-content-frame-wrap";
  contentFrame = document.createElement("iframe");
  contentFrame.className = "app-content-frame";
  contentFrame.title = t("sections", "Bereiche");
  contentFrame.setAttribute("loading", "eager");
  contentFrameHost.appendChild(contentFrame);

  const children = Array.from(document.body.children);
  for (const child of children) {
    if (keep.has(child)) continue;
    child.remove();
  }
  document.body.appendChild(contentFrameHost);
  document.body.classList.add("app-shell-frame-mode");
}

function syncSidebarAfterSoftNavigation() {
  updateBrandSub(findTopbar());
  refreshSidebarNav();
  ensureBottomNav();
}

function navigateInContentFrame(targetUrl, options = {}) {
  const { pushState = true } = options;
  if (!(targetUrl instanceof URL)) return;
  if (!canSoftNavigateTo(targetUrl)) {
    window.location.assign(targetUrl.pathname + targetUrl.search + targetUrl.hash);
    return;
  }

  ensureContentFrameShell();
  if (!contentFrame) return;
  const currentUrl = new URL(window.location.href);
  const isSameDocumentTarget = normalizePath(targetUrl.pathname) === normalizePath(currentUrl.pathname)
    && targetUrl.search === currentUrl.search;

  if (isSameDocumentTarget && contentFrame.contentWindow) {
    if (pushState) {
      window.history.pushState({ appSoftNav: true }, "", targetUrl.pathname + targetUrl.search + targetUrl.hash);
    }
    syncSidebarAfterSoftNavigation();
    const embeddedTarget = toEmbeddedUrl(targetUrl);
    contentFrame.contentWindow.location.replace(
      embeddedTarget.pathname + embeddedTarget.search + embeddedTarget.hash
    );
    return;
  }

  if (isSoftNavigating) return;
  isSoftNavigating = true;
  document.body.classList.add("app-shell-frame-loading");

  if (pushState) {
    window.history.pushState({ appSoftNav: true }, "", targetUrl.pathname + targetUrl.search + targetUrl.hash);
  }
  syncSidebarAfterSoftNavigation();

  const onLoad = () => {
    isSoftNavigating = false;
    document.body.classList.remove("app-shell-frame-loading");
    contentFrame?.removeEventListener("load", onLoad);
    if (releaseTimer) window.clearTimeout(releaseTimer);
  };
  const releaseTimer = window.setTimeout(() => {
    isSoftNavigating = false;
    document.body.classList.remove("app-shell-frame-loading");
    contentFrame?.removeEventListener("load", onLoad);
  }, 1600);

  contentFrame.addEventListener("load", onLoad);
  contentFrame.src = toEmbeddedUrl(targetUrl).toString();
}

function bindSidebarSoftNavigation() {
  if (document.documentElement.dataset.sidebarSoftNavigationBound === "1") return;
  document.documentElement.dataset.sidebarSoftNavigationBound = "1";

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest(".app-side-nav a[href]");
    if (!(link instanceof HTMLAnchorElement)) return;
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    let nextUrl;
    try {
      nextUrl = new URL(link.href, window.location.origin);
    } catch {
      return;
    }
    if (!canSoftNavigateTo(nextUrl)) return;

    const currentUrl = new URL(window.location.href);
    const samePathAndQuery = normalizePath(nextUrl.pathname) === normalizePath(currentUrl.pathname)
      && nextUrl.search === currentUrl.search;
    const sameTarget = samePathAndQuery && nextUrl.hash === currentUrl.hash;
    if (sameTarget) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    if (samePathAndQuery) {
      navigateInContentFrame(nextUrl, { pushState: true });
      return;
    }

    navigateInContentFrame(nextUrl, { pushState: true });
  });

  window.addEventListener("popstate", () => {
    if (!document.body.classList.contains("app-shell-frame-mode")) return;
    navigateInContentFrame(new URL(window.location.href), { pushState: false });
  });
}

function ensureBottomNav() {
  if (window.innerWidth > MOBILE_BREAKPOINT) return;

  let bottomNav = document.querySelector(".app-bottom-nav");
  if (!bottomNav) {
    bottomNav = document.createElement("nav");
    bottomNav.className = "app-bottom-nav";
    bottomNav.setAttribute("aria-label", t("nav_app", "App-Navigation"));
    document.body.appendChild(bottomNav);
  }

  const activeKey = currentNavKey();
  bottomNav.innerHTML = NAV_ITEMS.map((item) => {
    const isActive = item.key === activeKey;
    const activeClass = isActive ? " is-active" : "";
    const currentAttr = isActive ? ' aria-current="page"' : "";
    const iconHtml = `<span class="app-bottom-nav-icon"><img src="${item.iconPath}" alt="" aria-hidden="true"></span>`;
    const labelHtml = `<span class="app-bottom-nav-label">${t(item.labelKey, item.fallback)}</span>`;

    if (isActive) {
      return `<span class="app-bottom-nav-item${activeClass}"${currentAttr}>${iconHtml}${labelHtml}</span>`;
    }
    return `<a class="app-bottom-nav-item${activeClass}" href="${item.href}">${iconHtml}${labelHtml}</a>`;
  }).join("");

  document.body.classList.add("has-bottom-nav");
}

function bindBottomNavSoftNavigation() {
  if (document.documentElement.dataset.bottomNavSoftNavBound === "1") return;
  document.documentElement.dataset.bottomNavSoftNavBound = "1";

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest(".app-bottom-nav a[href]");
    if (!(link instanceof HTMLAnchorElement)) return;
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    let nextUrl;
    try {
      nextUrl = new URL(link.href, window.location.origin);
    } catch {
      return;
    }
    if (!canSoftNavigateTo(nextUrl)) return;

    const currentUrl = new URL(window.location.href);
    const sameTarget =
      normalizePath(nextUrl.pathname) === normalizePath(currentUrl.pathname) &&
      nextUrl.search === currentUrl.search &&
      nextUrl.hash === currentUrl.hash;
    if (sameTarget) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    navigateInContentFrame(nextUrl, { pushState: true });
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
        <a class="side-nav-title side-nav-title-link" href="${HOMEPAGE_PATH}">${t("topbar.brand", "FinanzApp")}</a>
      </div>
      <nav class="app-nav-links" aria-label="${t("nav_app", "App-Navigation")}"></nav>
      <div class="app-side-nav-bottom"></div>
    `;
    document.body.prepend(sideNav);
  }
  const nav = sideNav.querySelector(".app-nav-links");
  if (nav) refreshSidebarNav();
  const sideNavBottom = sideNav.querySelector(".app-side-nav-bottom");

  if (sideNavBottom) {
    const profileWrap = controls.querySelector(".profile-wrap");
    if (profileWrap) sideNavBottom.appendChild(profileWrap);
  }

  let isCollapsed = false;
  try {
    isCollapsed = window.localStorage.getItem(SIDENAV_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    // keep default
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
      if (!(target instanceof Element)) return;
      if (target.closest("a")) closeMenu();
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

function initGlobalSettings(topbar) {
  // Settings-Tab entfernt – Einstellungen sind über den User-Button unten links erreichbar.
  // Bestehende Settings-Wraps entfernen, falls vorhanden.
  const controls = findControls(topbar);
  if (controls) {
    const legacyWrap = controls.querySelector(".global-settings-wrap");
    if (legacyWrap) legacyWrap.remove();
  }
  const settingsWrap = document.querySelector(".settings-wrap");
  if (settingsWrap) settingsWrap.remove();
}

function fillProfileElements(sessionUser) {
  const profileName = `${sessionUser.first_name || ""} ${sessionUser.last_name || ""}`.trim() || sessionUser.username || t("topbar.user_fallback", "Nutzer");
  const avatarInitials = initialsFromUser(sessionUser);

  const profileNameElements = document.querySelectorAll("[data-profile-name], #profile-name");
  for (const element of profileNameElements) element.textContent = profileName;

  const menuNameElements = document.querySelectorAll("[data-profile-menu-name], #menu-name");
  for (const element of menuNameElements) element.textContent = profileName;

  const mailElements = document.querySelectorAll("[data-profile-menu-mail], #menu-mail");
  for (const element of mailElements) element.textContent = sessionUser.email || "-";

  const avatarElements = document.querySelectorAll("[data-profile-avatar], #profile-avatar");
  for (const element of avatarElements) {
    if (sessionUser.profileImage) {
      element.textContent = "";
      const img = document.createElement("img");
      img.src = sessionUser.profileImage;
      img.alt = "Profilbild";
      img.style.cssText = "width:100%;height:100%;object-fit:cover;border-radius:50%;";
      element.appendChild(img);
    } else {
      element.textContent = avatarInitials;
    }
  }
}

function initProfileMenus() {
  const wraps = document.querySelectorAll(".profile-wrap");
  for (const wrap of wraps) {
    const button = wrap.querySelector(".profile-btn");
    const menu = wrap.querySelector(".profile-menu");

    // Dropdown-Menü dauerhaft ausblenden
    if (menu) menu.hidden = true;

    if (!button || button.dataset.bound === "1") continue;
    button.dataset.bound = "1";

    if (menu) {
      const logout = menu.querySelector(".logout-btn");
      if (logout) logout.remove();
    }

    button.setAttribute("aria-label", t("nav_settings", "Einstellungen"));
    button.addEventListener("click", () => {
      window.location.href = "/pages/settings/";
    });
  }
}

async function initTopbar() {
  if (isEmbeddedPageContext()) {
    removeTopbarForEmbeddedContext();
    return;
  }

  const topbar = findTopbar();
  if (!topbar) return;

  ensureTopbarBrandLink(topbar);
  const controls = findControls(topbar);
  if (controls && !controls.classList.contains("header-controls")) {
    controls.classList.add("header-controls");
  }

  updateBrandSub(topbar);
  // Settings-Wraps sofort entfernen, bevor die Sidebar gebaut wird
  for (const el of document.querySelectorAll(".settings-wrap, .global-settings-wrap")) el.remove();
  ensureSidebar(topbar, controls);
  ensureBottomNav();
  window.addEventListener("hashchange", () => {
    updateBrandSub(topbar);
    ensureSidebar(topbar, controls);
    ensureBottomNav();
  });

  initThemeSwitcher();

  initProfileMenus();
  disableActiveNavLinkClicks();
  bindSubNavToggle();
  bindSidebarSoftNavigation();
  bindBottomNavSoftNavigation();

  window.addEventListener("resize", () => {
    ensureBottomNav();
  });

  try {
    const sessionUser = await fetchSessionUser();
    fillProfileElements(sessionUser);
    setCurrentUserInStorage(sessionUser);
    initGlobalSettings(topbar, sessionUser);
    ensureSidebar(topbar, controls);
  } catch {
    // Seitenzugriffe sind serverseitig geschuetzt.
  }
}

export { initTopbar };

initTopbar();
