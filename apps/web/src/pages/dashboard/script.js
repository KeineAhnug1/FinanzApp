import '@shared/unified-ui.css';
import './style.css';
// Login/Registrierung: Formular-Modi und API-Kommunikation.
import { t as sharedT } from '@shared/js/language-utils.js';
import { setCurrentUserInStorage } from '@shared/js/session-utils.js';
import { requestJson, requestJsonMerged } from '@shared/js/api-client.js';
import { initThemeSwitcher } from '@shared/js/theme-utils.js';

function tr(key, fallback, params = {}) {
  const translated = sharedT(key, params);
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
    this.codeExpiryRemaining = 0;
    this.codeExpiryInterval = null;
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
    this.stopCodeExpiry();
  }

  startCodeExpiry(seconds) {
    this.stopCodeExpiry();
    this.codeExpiryRemaining = Math.max(1, Math.ceil(seconds));
    this.updateExpiryDisplay();
    this.codeExpiryInterval = setInterval(() => {
      this.codeExpiryRemaining--;
      if (this.codeExpiryRemaining <= 0) {
        this.stopCodeExpiry();
        this.updateExpiryDisplay();
      } else {
        this.updateExpiryDisplay();
      }
    }, 1000);
  }

  stopCodeExpiry() {
    if (this.codeExpiryInterval) {
      clearInterval(this.codeExpiryInterval);
      this.codeExpiryInterval = null;
    }
  }

  updateExpiryDisplay() {
    const el = this.querySelector("#code-expiry");
    if (!el) return;
    if (this.codeExpiryRemaining <= 0) {
      el.textContent = tr("auth.code_expired", "Code abgelaufen. Bitte neuen Code anfordern.");
      el.classList.remove("is-warning");
      el.classList.add("is-expired");
      return;
    }
    const min = Math.floor(this.codeExpiryRemaining / 60);
    const sec = this.codeExpiryRemaining % 60;
    const timeStr = min > 0 ? `${min}:${String(sec).padStart(2, "0")}` : `${sec}s`;
    el.textContent = tr("auth.code_expires_in", "Code gültig für {time}", { time: timeStr });
    el.classList.remove("is-expired");
    el.classList.add("is-warning");
  }

  bindEvents() {
    const form = this.querySelector("form");
    const status = this.querySelector("#login-status");
    const submitButton = this.querySelector('button[type="submit"]');
    const modeButtons = this.querySelectorAll("[data-auth-mode]");

    for (const button of modeButtons) {
      button.addEventListener("click", () => {
        const targetMode = button.dataset.authMode;
        if (targetMode === "login" || targetMode === "register" || targetMode === "verify" || targetMode === "forgot" || targetMode === "reset") {
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

    if (this.codeExpiryRemaining > 0 || this.codeExpiryInterval) {
      this.updateExpiryDisplay();
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
        if (this.mode === "forgot") {
          setStatus(status, "idle", "Code wird angefordert...");
          await this.submitForgot(form, status);
          return;
        }
        if (this.mode === "reset") {
          setStatus(status, "idle", "Passwort wird zurückgesetzt...");
          await this.submitReset(form, status);
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
    setCurrentUserInStorage({
      ...result.user,
      logged_in_at: new Date().toISOString()
    });
    window.setTimeout(() => {
      window.location.assign("/pages/dashboard/dashboard.html");
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

    if (password !== confirmPassword) {
      setStatus(status, "error", tr("auth.password_mismatch", "Passwort und Passwort-Wiederholung stimmen nicht überein."));
      return;
    }

    const result = await postJson("/api/register", {
      first_name: firstName,
      last_name: lastName,
      username,
      email,
      password
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

    const expiry = Number(result.expires_in_seconds);
    if (expiry > 0) this.startCodeExpiry(expiry);
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

  async submitForgot(form, status) {
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim().toLowerCase();

    const result = await postJson("/api/password/forgot", { email });

    if (result.status === 429) {
      startRateLimitCountdown(this, status, result.retryAfter ?? 60);
      return;
    }

    this.pendingEmail = email;
    this.mode = "reset";
    this.flash = {
      type: "success",
      text: result.message || "Falls ein Konto existiert, wurde ein Code versendet."
    };
    this.render();
    this.bindEvents();

    const expiry = Number(result.expires_in_seconds);
    if (expiry > 0) this.startCodeExpiry(expiry);
  }

  async submitReset(form, status) {
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const code = String(formData.get("code") || "").trim();
    const newPassword = String(formData.get("new_password") || "");
    const confirmPassword = String(formData.get("confirm_password") || "");

    if (newPassword !== confirmPassword) {
      setStatus(status, "error", "Die neuen Passwörter stimmen nicht überein.");
      return;
    }
    if (newPassword.length < 8) {
      setStatus(status, "error", "Neues Passwort muss mindestens 8 Zeichen haben.");
      return;
    }

    const result = await postJson("/api/password/reset", { email, code, new_password: newPassword });

    if (result.status === 429) {
      startRateLimitCountdown(this, status, result.retryAfter ?? 60);
      return;
    }

    if (!result.ok) {
      setStatus(status, "error", result.message || "Fehler beim Zurücksetzen.");
      return;
    }

    this.pendingEmail = email;
    this.mode = "login";
    this.flash = {
      type: "success",
      text: "Passwort erfolgreich zurückgesetzt. Bitte jetzt einloggen."
    };
    this.render();
    this.bindEvents();
  }

  render() {
    const isLogin = this.mode === "login";
    const isRegister = this.mode === "register";
    const isForgot = this.mode === "forgot";
    const isReset = this.mode === "reset";

    let title, subtitle, fields, submitLabel;
    if (isLogin) {
      title = tr("auth.title_login", "Willkommen zurück");
      subtitle = tr("auth.subtitle_login", "Melde dich mit deiner E-Mail und deinem Passwort an.");
      fields = this.renderLoginFields();
      submitLabel = tr("auth.submit_login", "Einloggen");
    } else if (isRegister) {
      title = tr("auth.title_register", "Konto erstellen");
      subtitle = tr("auth.subtitle_register", "Füll das Formular aus. Du erhältst danach einen Code per E-Mail.");
      fields = this.renderRegisterFields();
      submitLabel = tr("auth.submit_register", "Konto erstellen");
    } else if (isForgot) {
      title = "Passwort vergessen";
      subtitle = "Gib deine E-Mail-Adresse ein. Wir senden dir einen Code zum Zurücksetzen.";
      fields = this.renderForgotFields();
      submitLabel = "Code anfordern";
    } else if (isReset) {
      title = "Neues Passwort setzen";
      subtitle = "Gib den Code aus der E-Mail und dein neues Passwort ein.";
      fields = this.renderResetFields();
      submitLabel = "Passwort zurücksetzen";
    } else {
      title = tr("auth.title_verify", "E-Mail bestätigen");
      subtitle = tr("auth.subtitle_verify", "Wir haben dir einen 6-stelligen Code gesendet. Bitte hier eingeben.");
      fields = this.renderVerifyFields();
      submitLabel = tr("auth.submit_verify", "Code bestätigen");
    }

    this.innerHTML = `
      <section class="login-card">
        <h1 class="login-title">${title}</h1>
        <p class="login-subtitle">${subtitle}</p>

        <form class="login-form">
          ${fields}
          <button class="login-button" type="submit">${submitLabel}</button>
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
        <div class="login-label-row">
          <label class="login-label" for="password">${tr("auth.password", "Passwort")}</label>
          <button class="auth-mode-link auth-mode-link--inline" type="button" tabindex="-1" data-auth-mode="forgot">Vergessen?</button>
        </div>
        <input class="login-input" id="password" name="password" type="password" required autocomplete="current-password" placeholder="${tr("auth.password_placeholder", "Passwort eingeben")}" />
      </div>
    `;
  }

  renderForgotFields() {
    return `
      <div>
        <label class="login-label" for="email">${tr("auth.email", "E-Mail")}</label>
        <input class="login-input" id="email" name="email" type="email" required autocomplete="email" placeholder="name@beispiel.de" value="${escapeAttribute(this.pendingEmail)}" />
      </div>
    `;
  }

  renderResetFields() {
    return `
      <div>
        <label class="login-label" for="email">${tr("auth.email", "E-Mail")}</label>
        <input class="login-input" id="email" name="email" type="email" required autocomplete="email" value="${escapeAttribute(this.pendingEmail)}" />
      </div>
      <div>
        <label class="login-label" for="code">Code aus der E-Mail</label>
        <input class="login-input verify-code-input" id="code" name="code" type="text" inputmode="numeric" maxlength="6" required placeholder="123456" />
      </div>
      <p id="code-expiry" class="code-expiry"></p>
      <div>
        <label class="login-label" for="new_password">Neues Passwort</label>
        <input class="login-input" id="new_password" name="new_password" type="password" required minlength="8" autocomplete="new-password" placeholder="${tr("auth.password_min", "mind. 8 Zeichen")}" />
      </div>
      <div>
        <label class="login-label" for="confirm_password">Neues Passwort bestätigen</label>
        <input class="login-input" id="confirm_password" name="confirm_password" type="password" required minlength="8" autocomplete="new-password" placeholder="wiederholen" />
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
      <p id="code-expiry" class="code-expiry"></p>
    `;
  }

  renderModeActions() {
    if (this.mode === "login") {
      return `<button class="auth-mode-link" type="button" data-auth-mode="register">${tr("auth.switch_to_register", "Kein Konto? Jetzt registrieren")}</button>`;
    }
    if (this.mode === "register") {
      return `<button class="auth-mode-link" type="button" data-auth-mode="login">${tr("auth.switch_to_login", "Schon ein Konto? Zum Login")}</button>`;
    }
    if (this.mode === "forgot") {
      return `<button class="auth-mode-link" type="button" data-auth-mode="login">${tr("auth.back_to_login", "Zurück zum Login")}</button>`;
    }
    if (this.mode === "reset") {
      return `
        <div class="auth-mode-row">
          <button class="auth-mode-link" type="button" data-auth-mode="forgot">Code erneut anfordern</button>
          <button class="auth-mode-link" type="button" data-auth-mode="login">${tr("auth.back_to_login", "Zurück zum Login")}</button>
        </div>
      `;
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
  try {
    const result = await requestJson(url, {
      method: "POST",
      credentials: "same-origin",
      body: payload
    });
    const retryAfter = Number(result.retryAfter) || null;
    const message = result.data?.message || result.message;
    return { ...result.data, ok: result.ok, status: result.status, retryAfter, message };
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
initThemeSwitcher();

(async () => {
  try {
    const payload = await requestJsonMerged("/api/session", { credentials: "same-origin" });
    if (payload?.ok && payload.session_user) {
      setCurrentUserInStorage(payload.session_user);
      window.location.assign("/pages/dashboard/dashboard.html");
    }
  } catch {
    // Keine aktive Session: Login-Seite normal anzeigen.
  }
})();
