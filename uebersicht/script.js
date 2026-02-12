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
  connectedCallback() {
    this.render();

    const form = this.querySelector("form");
    const status = this.querySelector("#login-status");
    const submitButton = this.querySelector('button[type="submit"]');

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      const formData = new FormData(form);
      const email = String(formData.get("email") || "").trim().toLowerCase();
      const password = String(formData.get("password") || "");

      submitButton.disabled = true;
      setStatus(status, "idle", "Pruefe Login...");

      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ email, password })
        });

        const result = await response.json();
        if (!response.ok || !result.ok) {
          setStatus(status, "error", result.message || "E-Mail oder Passwort ist falsch.");
          return;
        }

        setStatus(status, "success", `Login erfolgreich: ${result.user.email}`);
      } catch {
        setStatus(status, "error", "Server nicht erreichbar.");
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  render() {
    this.innerHTML = `
      <section class="login-card">
        <span class="login-badge">FinanzApp Access</span>
        <h1 class="login-title">Willkommen zur FinanzApp</h1>
        <p class="login-subtitle">
          Melde dich mit deinen Zugangsdaten an und oeffne deine Finanzuebersicht.
        </p>

        <form class="login-form">
          <div>
            <label class="login-label" for="email">E-Mail</label>
            <input
              class="login-input"
              id="email"
              name="email"
              type="email"
              required
              autocomplete="email"
              placeholder="anna@example.com"
            />
          </div>

          <div>
            <label class="login-label" for="password">Passwort</label>
            <input
              class="login-input"
              id="password"
              name="password"
              type="password"
              required
              autocomplete="current-password"
              placeholder="anna_pw_hash"
            />
          </div>

          <button class="login-button" type="submit">Einloggen</button>
        </form>

        <p id="login-status" class="login-status"></p>
        <p class="seed-hint">
          Test: <code>anna@example.com</code> / <code>anna_pw_hash</code>
        </p>
      </section>
    `;
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

customElements.define("users-login", UsersLogin);
initThemeSwitcher();
