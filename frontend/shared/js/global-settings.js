(function initGlobalSettingsMenu() {
  const THEME_OPTIONS = new Set(["light", "dark", "auto"]);

  function createLocaleSelect() {
    const select = document.createElement("select");
    select.className = "field-input";
    select.id = "global-locale-select";

    const locales = Array.from(window.FinanzAppLanguage?.LOCALES || ["de-DE", "en-US", "en-GB", "fr-FR", "es-ES"]);
    for (const locale of locales) {
      const option = document.createElement("option");
      option.value = locale;
      option.textContent = window.FinanzAppLanguage.t(`locale.${locale}`);
      select.appendChild(option);
    }

    select.value = window.FinanzAppLanguage.getLocale();
    return select;
  }

  function createThemeSelect() {
    const select = document.createElement("select");
    select.className = "field-input";
    select.id = "global-theme-select";

    const options = [
      { value: "light", key: "theme_light", fallback: "Hell" },
      { value: "dark", key: "theme_dark", fallback: "Dunkel" },
      { value: "auto", key: "theme_auto", fallback: "Systemdesign" }
    ];

    for (const optionData of options) {
      const option = document.createElement("option");
      option.value = optionData.value;
      option.dataset.i18nKey = optionData.key;
      option.dataset.fallback = optionData.fallback;
      option.textContent = window.FinanzAppLanguage.t(optionData.key) || optionData.fallback;
      select.appendChild(option);
    }

    select.value = window.FinanzAppTheme?.getStoredThemeMode?.() || "auto";
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

    const localeField = document.createElement("div");
    const localeLabel = document.createElement("label");
    localeLabel.className = "field-label";
    localeLabel.setAttribute("for", "global-locale-select");
    localeLabel.textContent = window.FinanzAppLanguage.t("language_number_format");

    const localeSelect = createLocaleSelect();
    const themeSelect = createThemeSelect();

    localeField.appendChild(localeLabel);
    localeField.appendChild(localeSelect);

    const themeField = document.createElement("div");
    const themeLabel = document.createElement("label");
    themeLabel.className = "field-label";
    themeLabel.setAttribute("for", "global-theme-select");
    themeLabel.textContent = window.FinanzAppLanguage.t("theme_mode");
    themeField.appendChild(themeLabel);
    themeField.appendChild(themeSelect);

    const actions = document.createElement("div");
    actions.className = "settings-actions";

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "submit-income";
    submit.textContent = window.FinanzAppLanguage.t("settings.save");

    actions.appendChild(submit);

    const status = document.createElement("p");
    status.className = "form-status";

    form.appendChild(localeField);
    form.appendChild(themeField);
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
        themeSelect.value = window.FinanzAppTheme?.getStoredThemeMode?.() || "auto";
        status.textContent = "";
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      window.FinanzAppLanguage.setLocale(localeSelect.value);
      const mode = THEME_OPTIONS.has(themeSelect.value) ? themeSelect.value : "auto";
      if (window.FinanzAppTheme?.saveAndApplyThemeMode) {
        window.FinanzAppTheme.saveAndApplyThemeMode(mode);
      }
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
      localeLabel.textContent = window.FinanzAppLanguage.t("language_number_format");
      themeLabel.textContent = window.FinanzAppLanguage.t("theme_mode");
      submit.textContent = window.FinanzAppLanguage.t("settings.save");
      refreshLocaleOptions();
      for (const option of Array.from(themeSelect.options)) {
        const key = option.dataset.i18nKey || "";
        const fallback = option.dataset.fallback || option.value;
        option.textContent = window.FinanzAppLanguage.t(key) || fallback;
      }
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
