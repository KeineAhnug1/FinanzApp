// Login/Registrierung: Formular-Modi und API-Kommunikation.

function tr(key, fallback, params = {}) {
  const translated = window.FinanzAppLanguage?.t?.(key, params);
  if (translated && translated !== key) return translated;
  if (!params || !Object.keys(params).length) return fallback;
  return String(fallback || "").replaceAll(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}

class UsersLogin extends HTMLElement {
  constructor() {
    super();
    this.mode = "login";
    this.pendingEmail = "";
    this.flash = null;
    this.localeListener = () => {
      this.render();
      this.bindEvents();
    };
  }

  connectedCallback() {
    this.render();
    this.bindEvents();
    window.addEventListener("finanzapp:locale-changed", this.localeListener);
  }

  disconnectedCallback() {
    window.removeEventListener("finanzapp:locale-changed", this.localeListener);
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
          setStatus(status, "idle", tr("auth.checking_login", "Prüfe Login..."));
          await this.submitLogin(form, status);
          return;
        }
        if (this.mode === "register") {
          setStatus(status, "idle", tr("auth.preparing_account", "Konto wird vorbereitet..."));
          await this.submitRegister(form, status);
          return;
        }
        setStatus(status, "idle", tr("auth.verifying_code", "Code wird geprüft..."));
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

    if (result.status === 429) {
      startRateLimitCountdown(this, status, result.retryAfter ?? 60);
      return;
    }

    if (!result.ok) {
      setStatus(status, "error", result.message || tr("auth.login_failed", "E-Mail oder Passwort ist falsch."));
      return;
    }

    setStatus(status, "success", tr("auth.login_success", "Login erfolgreich: {email}", { email: result.user.email }));
    window.FinanzAppSession.setCurrentUserInStorage({
      ...result.user,
      logged_in_at: new Date().toISOString()
    });
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
      setStatus(status, "error", tr("auth.password_mismatch", "Passwort und Passwort-Wiederholung stimmen nicht überein."));
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

    if (result.status === 429) {
      startRateLimitCountdown(this, status, result.retryAfter ?? 60);
      return;
    }

    if (!result.ok) {
      setStatus(status, "error", result.message || tr("auth.register_failed", "Konto konnte nicht erstellt werden."));
      return;
    }

    this.pendingEmail = result.pending_email || email;
    this.mode = "verify";
    this.flash = {
      type: "success",
      text: result.message || tr("auth.verify_sent", "Verifizierungscode wurde versendet.")
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
      setStatus(status, "error", result.message || tr("auth.verify_failed", "Code konnte nicht verifiziert werden."));
      return;
    }

    this.pendingEmail = result.user?.email || email;
    this.mode = "login";
    this.flash = {
      type: "success",
      text: tr("auth.account_verified", "Konto erstellt und verifiziert. Bitte jetzt einloggen.")
    };
    this.render();
    this.bindEvents();
  }

  render() {
    const isLogin = this.mode === "login";
    const isRegister = this.mode === "register";

    this.innerHTML = `
      <section class="login-card">
        <h1 class="login-title">
          ${isLogin
            ? tr("auth.title_login", "Willkommen zurück")
            : isRegister
              ? tr("auth.title_register", "Konto erstellen")
              : tr("auth.title_verify", "E-Mail bestätigen")}
        </h1>
        <p class="login-subtitle">
          ${isLogin
            ? tr("auth.subtitle_login", "Melde dich mit deiner E-Mail und deinem Passwort an.")
            : isRegister
              ? tr("auth.subtitle_register", "Füll das Formular aus. Du erhältst danach einen Code per E-Mail.")
              : tr("auth.subtitle_verify", "Wir haben dir einen 6-stelligen Code gesendet. Bitte hier eingeben.")}
        </p>

        <form class="login-form">
          ${isLogin ? this.renderLoginFields() : isRegister ? this.renderRegisterFields() : this.renderVerifyFields()}
          <button class="login-button" type="submit">
            ${isLogin
              ? tr("auth.submit_login", "Einloggen")
              : isRegister
                ? tr("auth.submit_register", "Konto erstellen")
                : tr("auth.submit_verify", "Code bestätigen")}
          </button>
        </form>

        <p id="login-status" class="login-status"></p>
        <div class="auth-divider"></div>
        ${this.renderModeActions()}
      </section>
    `;
  }

  renderLoginFields() {
    return `
      <div>
        <label class="login-label" for="email">${tr("auth.email", "E-Mail")}</label>
        <input class="login-input" id="email" name="email" type="email" required autocomplete="email" placeholder="name@beispiel.de" />
      </div>
      <div>
        <label class="login-label" for="password">${tr("auth.password", "Passwort")}</label>
        <input class="login-input" id="password" name="password" type="password" required autocomplete="current-password" placeholder="${tr("auth.password_placeholder", "Passwort eingeben")}" />
      </div>
    `;
  }

  renderRegisterFields() {
    return `
      <div class="form-row">
        <div>
          <label class="login-label" for="first_name">${tr("auth.first_name", "Vorname")}</label>
          <input class="login-input" id="first_name" name="first_name" type="text" required placeholder="Anna" />
        </div>
        <div>
          <label class="login-label" for="last_name">${tr("auth.last_name", "Nachname")}</label>
          <input class="login-input" id="last_name" name="last_name" type="text" required placeholder="Schmidt" />
        </div>
      </div>
      <div>
        <label class="login-label" for="username">${tr("auth.username", "Username")}</label>
        <input class="login-input" id="username" name="username" type="text" required placeholder="anna" />
      </div>
      <div>
        <label class="login-label" for="email">${tr("auth.email", "E-Mail")}</label>
        <input class="login-input" id="email" name="email" type="email" required placeholder="name@beispiel.de" />
      </div>
      <div class="form-row">
        <div>
          <label class="login-label" for="password">${tr("auth.password", "Passwort")}</label>
          <input class="login-input" id="password" name="password" type="password" required minlength="8" placeholder="${tr("auth.password_min", "mind. 8 Zeichen")}" />
        </div>
        <div>
          <label class="login-label" for="confirm_password">${tr("auth.password_repeat", "Passwort wiederholen")}</label>
          <input class="login-input" id="confirm_password" name="confirm_password" type="password" required minlength="8" placeholder="${tr("auth.password_repeat_placeholder", "wiederholen")}" />
        </div>
      </div>
      <div>
        <label class="login-label" for="income">${tr("auth.monthly_income_optional", "Monatliches Einkommen (optional)")}</label>
        <input class="login-input" id="income" name="income" type="number" min="0" step="0.01" placeholder="0.00" />
      </div>
    `;
  }

  renderVerifyFields() {
    return `
      <div>
        <label class="login-label" for="email">${tr("auth.email", "E-Mail")}</label>
        <input class="login-input" id="email" name="email" type="email" required readonly value="${escapeAttribute(this.pendingEmail)}" />
      </div>
      <div>
        <label class="login-label" for="code">${tr("auth.verification_code", "Verifizierungscode")}</label>
        <input class="login-input verify-code-input" id="code" name="code" type="text" inputmode="numeric" maxlength="6" required placeholder="123456" />
      </div>
    `;
  }

  renderModeActions() {
    if (this.mode === "login") {
      return `<button class="auth-mode-link" type="button" data-auth-mode="register">${tr("auth.switch_to_register", "Kein Konto? Jetzt registrieren")}</button>`;
    }
    if (this.mode === "register") {
      return `<button class="auth-mode-link" type="button" data-auth-mode="login">${tr("auth.switch_to_login", "Schon ein Konto? Zum Login")}</button>`;
    }
    return `
      <div class="auth-mode-row">
        <button class="auth-mode-link" type="button" data-auth-mode="register">${tr("auth.verify_not_received", "Code nicht erhalten? Neu registrieren")}</button>
        <button class="auth-mode-link" type="button" data-auth-mode="login">${tr("auth.back_to_login", "Zurück zum Login")}</button>
      </div>
    `;
  }
}

async function postJson(url, payload) {
  const request = window.FinanzAppApi?.requestJson;
  if (typeof request !== "function") {
    return { ok: false, status: 0, message: tr("auth.server_unreachable", "Server nicht erreichbar.") };
  }
  try {
    const result = await request(url, {
      method: "POST",
      credentials: "same-origin",
      body: payload
    });
    const retryAfter = Number(result.retryAfter) || null;
    return { ...result.data, ok: result.ok, status: result.status, retryAfter };
  } catch {
    return { ok: false, status: 0, message: tr("auth.server_unreachable", "Server nicht erreichbar.") };
  }
}

function startRateLimitCountdown(component, statusEl, seconds) {
  const submitButton = component.querySelector('button[type="submit"]');
  let remaining = Math.max(1, Math.ceil(seconds));

  const update = () => {
    setStatus(statusEl, "error", tr(
      "auth.rate_limited",
      "Zu viele Versuche. Bitte warte {s} Sekunde(n).",
      { s: remaining }
    ));
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = tr("auth.rate_limited_btn", "Warte {s}s…", { s: remaining });
    }
  };

  update();
  const interval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(interval);
      setStatus(statusEl, "idle", "");
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = component.mode === "login"
          ? tr("auth.submit_login", "Einloggen")
          : tr("auth.submit_register", "Konto erstellen");
      }
    } else {
      update();
    }
  }, 1000);
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
window.FinanzAppTheme.initThemeSwitcher();

(async () => {
  try {
    const request = window.FinanzAppApi?.requestJsonMerged;
    const payload = typeof request === "function"
      ? await request("/api/session", { credentials: "same-origin" })
      : null;
    if (payload?.ok && payload.session_user) {
      window.FinanzAppSession.setCurrentUserInStorage(payload.session_user);
      window.location.assign("/dashboard.html");
    }
  } catch {
    // Keine aktive Session: Login-Seite normal anzeigen.
  }
})();
