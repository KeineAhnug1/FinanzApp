(function initEinstellungenPage() {
  const SETTINGS_STORAGE_PREFIX = "finanzapp.dashboardSettings";
  const DESIGN_OPTIONS = new Set(["classic", "ocean", "forest", "sunset"]);
  const CURRENCIES = ["EUR", "USD", "GBP", "CHF"];

  function settingsKey(userId) {
    return `${SETTINGS_STORAGE_PREFIX}.${userId || "anonymous"}`;
  }

  function loadSettings(userId) {
    try {
      const raw = window.localStorage.getItem(settingsKey(userId));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveSettings(userId, patch) {
    const existing = loadSettings(userId);
    window.localStorage.setItem(settingsKey(userId), JSON.stringify({ ...existing, ...patch }));
  }

  /* ── Profil befüllen ── */
  function fillProfile(user) {
    const fullName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username || "Nutzer";
    const initials = window.FinanzAppSession?.initialsFromUser?.(user) || "U";
    const since = user.created_at ? new Date(user.created_at).toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" }) : "-";

    const avatar = document.getElementById("profil-avatar-large");
    if (avatar) avatar.textContent = initials;

    const fullnameEl = document.getElementById("profil-fullname");
    if (fullnameEl) fullnameEl.textContent = fullName;

    const emailTop = document.getElementById("profil-email-top");
    if (emailTop) emailTop.textContent = user.email || "-";

    const usernameEl = document.getElementById("profil-username");
    if (usernameEl) usernameEl.textContent = user.username || "-";

    const emailEl = document.getElementById("profil-email");
    if (emailEl) emailEl.textContent = user.email || "-";

    const sinceEl = document.getElementById("profil-since");
    if (sinceEl) sinceEl.textContent = since;
  }

  /* ── Design-Karten ── */
  function initDesignCards() {
    const currentDesign = window.FinanzAppTheme?.getStoredDesign?.() || "classic";
    const cards = document.querySelectorAll(".design-card");

    for (const card of cards) {
      const design = card.dataset.design;
      const isActive = design === currentDesign;
      card.classList.toggle("is-active", isActive);
      card.setAttribute("aria-pressed", String(isActive));

      card.addEventListener("click", () => {
        window.FinanzAppTheme?.saveAndApplyDesign?.(design);
        for (const c of cards) {
          const active = c.dataset.design === design;
          c.classList.toggle("is-active", active);
          c.setAttribute("aria-pressed", String(active));
        }
      });
    }
  }

  /* ── Sprache & Währung ── */
  function initSpracheForm(userId) {
    const form = document.getElementById("sprache-form");
    const localeSelect = document.getElementById("einst-locale");
    const currencySelect = document.getElementById("einst-currency");
    const status = document.getElementById("sprache-status");
    if (!form || !localeSelect || !currencySelect || !status) return;

    const settings = loadSettings(userId);
    const currentLocale = window.FinanzAppLanguage?.getLocale?.(userId) || settings.locale || "de-DE";
    const currentCurrency = settings.currency || "EUR";

    localeSelect.value = currentLocale;
    if (CURRENCIES.includes(currentCurrency)) currencySelect.value = currentCurrency;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const nextLocale = localeSelect.value;
      const nextCurrency = currencySelect.value;
      const prevLocale = window.FinanzAppLanguage?.getLocale?.(userId) || currentLocale;

      saveSettings(userId, { locale: nextLocale, currency: nextCurrency });

      if (window.FinanzAppLanguage?.setLocale) {
        window.FinanzAppLanguage.setLocale(nextLocale, { userId });
      }

      status.textContent = "Einstellungen gespeichert.";
      status.className = "form-status is-success";

      if (nextLocale !== prevLocale) {
        window.setTimeout(() => window.location.reload(), 600);
      }
    });
  }

  /* ── Abmelden ── */
  function initLogout() {
    const logoutBtn = document.getElementById("logout-btn");
    if (!logoutBtn) return;
    logoutBtn.addEventListener("click", () => {
      window.FinanzAppSession?.logoutAndRedirect?.();
    });
  }

  /* ── Konto löschen ── */
  function initDeleteAccount() {
    const openBtn = document.getElementById("open-delete-modal");
    const modal = document.getElementById("delete-modal");
    const cancelBtn = document.getElementById("delete-cancel-btn");
    const confirmCheck = document.getElementById("delete-confirm-check");
    const confirmBtn = document.getElementById("delete-confirm-btn");
    const errorEl = document.getElementById("delete-modal-error");

    if (!openBtn || !modal || !cancelBtn || !confirmCheck || !confirmBtn) return;

    const openModal = () => {
      confirmCheck.checked = false;
      confirmBtn.disabled = true;
      if (errorEl) errorEl.hidden = true;
      modal.hidden = false;
      cancelBtn.focus();
    };

    const closeModal = () => {
      modal.hidden = true;
    };

    openBtn.addEventListener("click", openModal);
    cancelBtn.addEventListener("click", closeModal);

    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) closeModal();
    });

    confirmCheck.addEventListener("change", () => {
      confirmBtn.disabled = !confirmCheck.checked;
    });

    confirmBtn.addEventListener("click", async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Wird gelöscht…";
      if (errorEl) errorEl.hidden = true;

      try {
        const response = await fetch("/api/user/account", {
          method: "DELETE",
          credentials: "same-origin"
        });
        const data = await response.json();

        if (response.ok && data.ok) {
          window.FinanzAppSession?.clearCurrentUserFromStorage?.();
          window.location.assign("/");
        } else {
          throw new Error(data.message || "Fehler beim Löschen.");
        }
      } catch (error) {
        if (errorEl) {
          errorEl.textContent = error.message || "Ein Fehler ist aufgetreten.";
          errorEl.hidden = false;
        }
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Konto löschen";
      }
    });
  }

  /* ── Seitennavigation aktiv setzen ── */
  function initSectionHighlight() {
    const sections = document.querySelectorAll(".einst-section");
    const navLinks = document.querySelectorAll(".einst-nav-link");

    if (!sections.length || !navLinks.length) return;

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const link of navLinks) {
          link.classList.toggle("is-active", link.getAttribute("href") === `#${entry.target.id}`);
        }
      }
    }, { rootMargin: "-30% 0px -60% 0px" });

    for (const section of sections) observer.observe(section);
  }

  /* ── Init ── */
  async function init() {
    if (window.FinanzAppTheme?.initThemeSwitcher) {
      window.FinanzAppTheme.initThemeSwitcher();
    }
    if (window.FinanzAppTheme?.initDesign) {
      window.FinanzAppTheme.initDesign();
    }

    initDesignCards();
    initLogout();
    initDeleteAccount();
    initSectionHighlight();

    try {
      const user = await window.FinanzAppSession.fetchSessionUser();
      window.FinanzAppSession.setCurrentUserInStorage(user);
      fillProfile(user);
      initSpracheForm(user.id);
    } catch {
      window.location.assign("/");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
