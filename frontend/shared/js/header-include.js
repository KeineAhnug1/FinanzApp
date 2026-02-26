(function initSharedHeaderInclude() {
  const PARTIAL_URL = "/shared/partials/topbar.html";

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

  function defaultSubTitle(activeKey) {
    if (activeKey === "dashboard") return "Dashboard";
    if (activeKey === "accounts") return "Kontenverwaltung";
    if (activeKey === "groups") return "Gruppen";
    if (activeKey === "stocks") return "Aktien";
    if (activeKey === "questions") return "Fragen";
    return "FinanzApp";
  }

  function applyHeaderConfig(header) {
    const activeKey = header.dataset.headerActive || currentNavKey();
    const sub = header.dataset.headerSub || defaultSubTitle(activeKey);
    const withSettings = header.dataset.headerWithSettings === "true";

    const subNode = header.querySelector(".brand-sub");
    if (subNode) subNode.textContent = sub;

    const navLinks = header.querySelectorAll(".app-nav-link[data-nav-key]");
    for (const link of navLinks) {
      const isActive = link.getAttribute("data-nav-key") === activeKey;
      link.classList.toggle("is-active", isActive);
    }

    if (!withSettings) {
      const settingsWrap = header.querySelector(".settings-wrap");
      if (settingsWrap) settingsWrap.remove();
    }
  }

  async function renderSharedHeaders() {
    const headers = document.querySelectorAll("header[data-shared-header]");
    if (!headers.length) return;

    let markup = "";
    const response = await fetch(PARTIAL_URL, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`Header partial konnte nicht geladen werden (${response.status}).`);
    markup = await response.text();

    for (const header of headers) {
      header.innerHTML = markup;
      applyHeaderConfig(header);
    }
  }

  window.FinanzAppHeaderReady = renderSharedHeaders().catch((error) => {
    console.error(error);
  });
})();
