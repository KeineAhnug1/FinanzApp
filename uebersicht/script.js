const THEME_STORAGE_KEY = "finanzapp.themeMode";
const THEME_OPTIONS = new Set(["light", "dark", "auto"]);
const prefersDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

function getStoredThemeMode() {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored && THEME_OPTIONS.has(stored)) {
    return stored;
  }
  return "auto";
}

function resolveTheme(mode) {
  if (mode === "auto") {
    return prefersDarkQuery.matches ? "dark" : "light";
  }
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
      if (!mode || !THEME_OPTIONS.has(mode)) {
        return;
      }
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
      applyTheme(mode);
    });
  }

  const handleSchemeChange = () => {
    const mode = getStoredThemeMode();
    if (mode === "auto") {
      applyTheme(mode);
    }
  };

  if (typeof prefersDarkQuery.addEventListener === "function") {
    prefersDarkQuery.addEventListener("change", handleSchemeChange);
  } else if (typeof prefersDarkQuery.addListener === "function") {
    prefersDarkQuery.addListener(handleSchemeChange);
  }
}

class UsersLogin extends HTMLElement {
  constructor() {
    super();
    this.mode = "login";
    this.pendingEmail = "";
    this.flash = null;
  }

  connectedCallback() {
    this.render();
    this.bindEvents();
  }

  bindEvents() {
    const form = this.querySelector("form");
    const status = this.querySelector("#login-status");
    const submitButton = this.querySelector('button[type="submit"]');
    const modeButtons = this.querySelectorAll("[data-auth-mode]");

    for (const button of modeButtons) {
      button.addEventListener("click", () => {
        const targetMode = button.dataset.authMode;
        if (targetMode === "login" || targetMode === "register" || targetMode === "verify") {
          this.mode = targetMode;
          this.flash = null;
          this.render();
          this.bindEvents();
        }
      });
    }

    if (this.mode === "login" && this.pendingEmail) {
      const emailInput = this.querySelector("#email");
      if (emailInput) {
        emailInput.value = this.pendingEmail;
      }
    }

    if (this.flash) {
      setStatus(status, this.flash.type, this.flash.text);
      this.flash = null;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submitButton.disabled = true;

      try {
        if (this.mode === "login") {
          setStatus(status, "idle", "Pruefe Login...");
          await this.submitLogin(form, status);
          return;
        }
        if (this.mode === "register") {
          setStatus(status, "idle", "Konto wird vorbereitet...");
          await this.submitRegister(form, status);
          return;
        }
        setStatus(status, "idle", "Code wird geprueft...");
        await this.submitVerify(form, status);
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  async submitLogin(form, status) {
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");

    const result = await postJson("/api/login", { email, password });
    if (!result.ok) {
      setStatus(status, "error", result.message || "E-Mail oder Passwort ist falsch.");
      return;
    }

    setStatus(status, "success", `Login erfolgreich: ${result.user.email}`);
    window.sessionStorage.setItem(
      "finanzapp.currentUser",
      JSON.stringify({
        ...result.user,
        logged_in_at: new Date().toISOString()
      })
    );
    window.setTimeout(() => {
      window.location.assign("/dashboard.html");
    }, 240);
  }

  async submitRegister(form, status) {
    const formData = new FormData(form);
    const firstName = String(formData.get("first_name") || "").trim();
    const lastName = String(formData.get("last_name") || "").trim();
    const username = String(formData.get("username") || "").trim().toLowerCase();
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirm_password") || "");
    const incomeRaw = String(formData.get("income") || "").trim();
    const income = incomeRaw === "" ? 0 : Number(incomeRaw.replace(",", "."));

    if (password !== confirmPassword) {
      setStatus(status, "error", "Passwort und Passwort-Wiederholung stimmen nicht ueberein.");
      return;
    }

    const result = await postJson("/api/register", {
      first_name: firstName,
      last_name: lastName,
      username,
      email,
      password,
      income
    });

    if (!result.ok) {
      setStatus(status, "error", result.message || "Konto konnte nicht erstellt werden.");
      return;
    }

    this.pendingEmail = result.pending_email || email;
    this.mode = "verify";
    this.flash = {
      type: "success",
      text: result.message || "Verifizierungscode wurde versendet."
    };

    this.render();
    this.bindEvents();
  }

  async submitVerify(form, status) {
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const code = String(formData.get("code") || "").trim();

    const result = await postJson("/api/register/verify", { email, code });
    if (!result.ok) {
      setStatus(status, "error", result.message || "Code konnte nicht verifiziert werden.");
      return;
    }

    this.pendingEmail = result.user?.email || email;
    this.mode = "login";
    this.flash = {
      type: "success",
      text: "Konto erstellt und verifiziert. Bitte jetzt einloggen."
    };
    this.render();
    this.bindEvents();
  }

  render() {
    const isLogin = this.mode === "login";
    const isRegister = this.mode === "register";

    this.innerHTML = `
      <section class="login-card">
        <span class="login-badge">FinanzApp Access</span>
        <h1 class="login-title">
          ${isLogin ? "Willkommen zur FinanzApp" : isRegister ? "Neues Konto erstellen" : "E-Mail verifizieren"}
        </h1>
        <p class="login-subtitle">
          ${
            isLogin
              ? "Melde dich mit deinen Zugangsdaten an und oeffne deine Finanzuebersicht."
              : isRegister
                ? "Lege deinen Account an. Danach bestaetigst du ihn mit einem Code per E-Mail."
                : "Wir haben dir einen 6-stelligen Code gesendet. Bitte hier eingeben."
          }
        </p>

        <form class="login-form">
          ${isLogin ? this.renderLoginFields() : isRegister ? this.renderRegisterFields() : this.renderVerifyFields()}
          <button class="login-button" type="submit">
            ${isLogin ? "Einloggen" : isRegister ? "Konto erstellen" : "Code bestaetigen"}
          </button>
        </form>

        <p id="login-status" class="login-status"></p>
        ${this.renderModeActions()}
      </section>
    `;
  }

  renderLoginFields() {
    return `
      <div>
        <label class="login-label" for="email">E-Mail</label>
        <input class="login-input" id="email" name="email" type="email" required autocomplete="email" placeholder="name@beispiel.de" />
      </div>
      <div>
        <label class="login-label" for="password">Passwort</label>
        <input class="login-input" id="password" name="password" type="password" required autocomplete="current-password" placeholder="Passwort eingeben" />
      </div>
    `;
  }

  renderRegisterFields() {
    return `
      <div class="form-row">
        <div>
          <label class="login-label" for="first_name">Vorname</label>
          <input class="login-input" id="first_name" name="first_name" type="text" required placeholder="Anna" />
        </div>
        <div>
          <label class="login-label" for="last_name">Nachname</label>
          <input class="login-input" id="last_name" name="last_name" type="text" required placeholder="Schmidt" />
        </div>
      </div>
      <div>
        <label class="login-label" for="username">Username</label>
        <input class="login-input" id="username" name="username" type="text" required placeholder="anna" />
      </div>
      <div>
        <label class="login-label" for="email">E-Mail</label>
        <input class="login-input" id="email" name="email" type="email" required placeholder="name@beispiel.de" />
      </div>
      <div class="form-row">
        <div>
          <label class="login-label" for="password">Passwort</label>
          <input class="login-input" id="password" name="password" type="password" required minlength="6" placeholder="mind. 6 Zeichen" />
        </div>
        <div>
          <label class="login-label" for="confirm_password">Passwort wiederholen</label>
          <input class="login-input" id="confirm_password" name="confirm_password" type="password" required minlength="6" placeholder="wiederholen" />
        </div>
      </div>
      <div>
        <label class="login-label" for="income">Monatliches Einkommen (optional)</label>
        <input class="login-input" id="income" name="income" type="number" min="0" step="0.01" placeholder="0.00" />
      </div>
    `;
  }

  renderVerifyFields() {
    return `
      <div>
        <label class="login-label" for="email">E-Mail</label>
        <input class="login-input" id="email" name="email" type="email" required readonly value="${escapeAttribute(this.pendingEmail)}" />
      </div>
      <div>
        <label class="login-label" for="code">Verifizierungscode</label>
        <input class="login-input verify-code-input" id="code" name="code" type="text" inputmode="numeric" maxlength="6" required placeholder="123456" />
      </div>
    `;
  }

  renderModeActions() {
    if (this.mode === "login") {
      return '<button class="auth-mode-link" type="button" data-auth-mode="register">Kein Konto? Jetzt registrieren</button>';
    }
    if (this.mode === "register") {
      return '<button class="auth-mode-link" type="button" data-auth-mode="login">Schon ein Konto? Zum Login</button>';
    }
    return `
      <div class="auth-mode-row">
        <button class="auth-mode-link" type="button" data-auth-mode="register">Code nicht erhalten? Neu registrieren</button>
        <button class="auth-mode-link" type="button" data-auth-mode="login">Zurueck zum Login</button>
      </div>
    `;
  }
}

async function postJson(url, payload) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }
    return {
      ok: response.ok && Boolean(data.ok),
      status: response.status,
      ...data
    };
  } catch {
    return { ok: false, status: 0, message: "Server nicht erreichbar." };
  }
}

function setStatus(element, type, text) {
  element.textContent = text;
  element.classList.remove("is-success", "is-error");
  if (type === "success") {
    element.classList.add("is-success");
  }
  if (type === "error") {
    element.classList.add("is-error");
  }
}

function escapeAttribute(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

customElements.define("users-login", UsersLogin);
initThemeSwitcher();
