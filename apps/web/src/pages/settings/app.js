import '@shared/unified-ui.css';
import './style.css';
import '@shared/js/topbar.js';
import { getLocale, setLocale } from '@shared/js/language-utils.js';
import { fetchSessionUser, setCurrentUserInStorage, clearCurrentUserFromStorage, initialsFromUser, logoutAndRedirect } from '@shared/js/session-utils.js';
import { toastSuccess } from '@shared/js/api-client.js';
import { initThemeSwitcher, initDesign, initContrast, getStoredDesign, saveAndApplyDesign } from '@shared/js/theme-utils.js';

const SETTINGS_STORAGE_PREFIX = "finanzapp.dashboardSettings";

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
  const initials = initialsFromUser(user) || "U";
  const since = user.created_at ? new Date(user.created_at).toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" }) : "-";

  const avatar = document.getElementById("profil-avatar-large");
  if (avatar) {
    if (user.profileImage) {
      avatar.innerHTML = `<img src="${user.profileImage}" alt="Profilbild" />`;
    } else {
      avatar.textContent = initials;
    }
  }

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

/* ── Profilbild hochladen ── */
function initProfileImageUpload() {
  const editBtn = document.getElementById("profil-avatar-edit-btn");
  const fileInput = document.getElementById("profil-image-input");
  const statusEl = document.getElementById("profil-image-status");

  if (!editBtn || !fileInput) return;

  editBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      statusEl.textContent = "Nur JPEG, PNG und WebP sind erlaubt.";
      statusEl.className = "form-status is-error";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      statusEl.textContent = "Datei ist zu groß (max. 2 MB).";
      statusEl.className = "form-status is-error";
      return;
    }

    statusEl.textContent = "Wird hochgeladen…";
    statusEl.className = "form-status";

    try {
      const base64 = await compressImage(file, 200, 200);

      const response = await fetch("/api/user/profile-image", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileImage: base64 })
      });
      const data = await response.json();

      if (response.ok && data.ok) {
        const avatar = document.getElementById("profil-avatar-large");
        if (avatar) avatar.innerHTML = `<img src="${base64}" alt="Profilbild" />`;

        const topbarAvatars = document.querySelectorAll("[data-profile-avatar]");
        for (const el of topbarAvatars) {
          el.innerHTML = `<img src="${base64}" alt="Profilbild" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`;
        }

        try {
          const stored = window.sessionStorage.getItem("finanzapp.currentUser");
          if (stored) {
            const parsed = JSON.parse(stored);
            parsed.profileImage = base64;
            window.sessionStorage.setItem("finanzapp.currentUser", JSON.stringify(parsed));
          }
        } catch { /* ignore */ }

        statusEl.textContent = "Profilbild gespeichert.";
        statusEl.className = "form-status is-success";
        toastSuccess(statusEl.textContent);
      } else {
        statusEl.textContent = data.message || "Fehler beim Hochladen.";
        statusEl.className = "form-status is-error";
      }
    } catch {
      statusEl.textContent = "Ein Fehler ist aufgetreten. Bitte versuche es erneut.";
      statusEl.className = "form-status is-error";
    } finally {
      fileInput.value = "";
    }
  });
}

/** Compresses an image File to a Base64 data URL at max maxW×maxH px. */
function compressImage(file, maxW, maxH) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lesefehler"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Bildfehler"));
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ── Design-Karten ── */
function initDesignCards() {
  const currentDesign = getStoredDesign() || "classic";
  const cards = document.querySelectorAll(".design-card");

  for (const card of cards) {
    const design = card.dataset.design;
    const isActive = design === currentDesign;
    card.classList.toggle("is-active", isActive);
    card.setAttribute("aria-pressed", String(isActive));

    card.addEventListener("click", () => {
      saveAndApplyDesign(design);
      for (const c of cards) {
        const active = c.dataset.design === design;
        c.classList.toggle("is-active", active);
        c.setAttribute("aria-pressed", String(active));
      }
    });
  }
}

/* ── Sprache ── */
function initSpracheForm(userId) {
  const form = document.getElementById("sprache-form");
  const localeSelect = document.getElementById("einst-locale");
  const status = document.getElementById("sprache-status");
  if (!form || !localeSelect || !status) return;

  const settings = loadSettings(userId);
  const currentLocale = getLocale(userId) || settings.locale || "de-DE";

  localeSelect.value = currentLocale;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextLocale = localeSelect.value;
    const prevLocale = getLocale(userId) || currentLocale;

    saveSettings(userId, { locale: nextLocale });

    setLocale(nextLocale, { userId });

    status.textContent = "Einstellungen gespeichert.";
    status.className = "form-status is-success";
    toastSuccess(status.textContent);

    if (nextLocale !== prevLocale) {
      window.setTimeout(() => window.location.reload(), 600);
    }
  });
}

/* ── Passwort ändern ── */
function initPasswordChange() {
  const form = document.getElementById("pw-change-form");
  const btn = document.getElementById("pw-change-btn");
  const status = document.getElementById("pw-change-status");
  if (!form || !status) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const currentPassword = document.getElementById("pw-current").value;
    const newPassword = document.getElementById("pw-new").value;
    const confirmPassword = document.getElementById("pw-new-confirm").value;

    status.className = "form-status";
    status.textContent = "";

    if (newPassword !== confirmPassword) {
      status.textContent = "Die neuen Passwörter stimmen nicht überein.";
      status.className = "form-status is-error";
      return;
    }
    if (newPassword.length < 8) {
      status.textContent = "Neues Passwort muss mindestens 8 Zeichen haben.";
      status.className = "form-status is-error";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Wird gespeichert…";

    try {
      const response = await fetch("/api/password/change", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
      });
      const data = await response.json();

      if (response.ok && data.ok) {
        form.reset();
        status.textContent = "Passwort erfolgreich geändert.";
        status.className = "form-status is-success";
        toastSuccess(status.textContent);
      } else if (data.code === "wrong_password") {
        status.textContent = "Das aktuelle Passwort ist falsch.";
        status.className = "form-status is-error";
      } else {
        status.textContent = data.message || "Fehler beim Ändern des Passworts.";
        status.className = "form-status is-error";
      }
    } catch {
      status.textContent = "Ein Fehler ist aufgetreten. Bitte versuche es erneut.";
      status.className = "form-status is-error";
    } finally {
      btn.disabled = false;
      btn.textContent = "Passwort ändern";
    }
  });
}

/* ── Abmelden ── */
function initLogout() {
  const logoutBtn = document.getElementById("logout-btn");
  if (!logoutBtn) return;
  logoutBtn.addEventListener("click", () => {
    logoutAndRedirect();
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
        clearCurrentUserFromStorage();
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
  initThemeSwitcher();
  initDesign();
  initContrast();

  initDesignCards();
  initPasswordChange();
  initLogout();
  initDeleteAccount();
  initSectionHighlight();
  initProfileImageUpload();

  try {
    const user = await fetchSessionUser();
    setCurrentUserInStorage(user);
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
