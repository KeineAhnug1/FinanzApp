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
      submitButton.style.opacity = "0.75";
      submitButton.style.cursor = "not-allowed";
      status.textContent = "Pruefe Login...";
      status.style.color = "#475467";

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
          status.textContent = result.message || "E-Mail oder Passwort ist falsch.";
          status.style.color = "#b42318";
          return;
        }

        status.textContent = `Login erfolgreich: ${result.user.email}`;
        status.style.color = "#146c43";
      } catch {
        status.textContent = "Server nicht erreichbar.";
        status.style.color = "#b42318";
      } finally {
        submitButton.disabled = false;
        submitButton.style.opacity = "1";
        submitButton.style.cursor = "pointer";
      }
    });
  }

  render() {
    this.innerHTML = `
      <section style="width:min(420px,92vw);background:#fff;border:1px solid #d9e0ea;border-radius:12px;padding:24px;box-shadow:0 8px 24px rgba(15,23,42,.08)">
        <h1 style="margin:0 0 8px;font-size:1.35rem">Anmeldung</h1>
        <p style="margin:0 0 16px;color:#475467;font-size:.95rem">
          Mit <code>email</code> und <code>password</code> anmelden.
        </p>
        <form>
          <label for="email" style="display:block;margin-bottom:6px;font-weight:600">E-Mail</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autocomplete="email"
            placeholder="anna@example.com"
            style="width:100%;padding:10px 12px;border:1px solid #cfd8e3;border-radius:8px;box-sizing:border-box"
          />

          <label for="password" style="display:block;margin:14px 0 6px;font-weight:600">Passwort</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autocomplete="current-password"
            placeholder="anna_pw_hash"
            style="width:100%;padding:10px 12px;border:1px solid #cfd8e3;border-radius:8px;box-sizing:border-box"
          />

          <button
            type="submit"
            style="width:100%;margin-top:16px;padding:11px 14px;border:0;background:#1f6feb;color:#fff;border-radius:8px;cursor:pointer;font-weight:600"
          >
            Einloggen
          </button>
        </form>
        <p id="login-status" style="min-height:1.2em;margin:14px 0 0;font-size:.95rem"></p>
      </section>
    `;
  }
}

customElements.define("users-login", UsersLogin);
