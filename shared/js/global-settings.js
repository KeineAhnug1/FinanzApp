(function initGlobalSettingsMenu() {
  function createLocaleSelect() {
    const select = document.createElement("select");
    select.className = "field-input";
    select.id = "global-locale-select";

    const locales = ["de-DE", "en-US", "en-GB", "fr-FR"];
    for (const locale of locales) {
      const option = document.createElement("option");
      option.value = locale;
      option.textContent = window.FinanzAppLanguage.t(`locale.${locale}`);
      select.appendChild(option);
    }

    select.value = window.FinanzAppLanguage.getLocale();
    return select;
  }

  function createSettingsWrap() {
    const wrap = document.createElement("div");
    wrap.className = "settings-wrap global-settings-wrap";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "settings-btn";
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-label", window.FinanzAppLanguage.t("settings.aria"));
    button.innerHTML = '<span class="settings-icon" aria-hidden="true">&#9881;</span>';

    const panel = document.createElement("div");
    panel.className = "settings-panel";
    panel.hidden = true;

    const title = document.createElement("p");
    title.className = "settings-title";
    title.textContent = window.FinanzAppLanguage.t("settings.title");

    const form = document.createElement("form");
    form.className = "settings-form";

    const field = document.createElement("div");
    const label = document.createElement("label");
    label.className = "field-label";
    label.setAttribute("for", "global-locale-select");
    label.textContent = window.FinanzAppLanguage.t("settings.title");

    const localeSelect = createLocaleSelect();

    field.appendChild(label);
    field.appendChild(localeSelect);

    const actions = document.createElement("div");
    actions.className = "settings-actions";

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "submit-income";
    submit.textContent = window.FinanzAppLanguage.t("settings.save");

    actions.appendChild(submit);

    const status = document.createElement("p");
    status.className = "form-status";

    form.appendChild(field);
    form.appendChild(actions);

    panel.appendChild(title);
    panel.appendChild(form);
    panel.appendChild(status);

    button.addEventListener("click", () => {
      const willOpen = panel.hidden;
      panel.hidden = !willOpen;
      button.setAttribute("aria-expanded", String(willOpen));
      if (willOpen) {
        localeSelect.value = window.FinanzAppLanguage.getLocale();
        status.textContent = "";
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      window.FinanzAppLanguage.setLocale(localeSelect.value);
      status.textContent = window.FinanzAppLanguage.t("settings.saved");
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!wrap.contains(target)) {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
      }
    });

    wrap.appendChild(button);
    wrap.appendChild(panel);

    function refreshLocaleOptions() {
      const options = Array.from(localeSelect.options);
      for (const option of options) {
        option.textContent = window.FinanzAppLanguage.t(`locale.${option.value}`);
      }
      localeSelect.value = window.FinanzAppLanguage.getLocale();
    }

    window.addEventListener("finanzapp:locale-changed", () => {
      button.setAttribute("aria-label", window.FinanzAppLanguage.t("settings.aria"));
      title.textContent = window.FinanzAppLanguage.t("settings.title");
      label.textContent = window.FinanzAppLanguage.t("settings.title");
      submit.textContent = window.FinanzAppLanguage.t("settings.save");
      refreshLocaleOptions();
    });

    return wrap;
  }

  function init() {
    if (!window.FinanzAppLanguage) return;
    const containers = document.querySelectorAll(".toolbar-actions, .topbar-right, .header-controls");
    for (const container of containers) {
      if (!(container instanceof HTMLElement)) continue;
      if (container.querySelector("#settings-btn, .global-settings-wrap")) continue;
      container.appendChild(createSettingsWrap());
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
