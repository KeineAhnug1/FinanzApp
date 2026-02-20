(function initFinanzAppLanguage() {
  const STORAGE_KEY = "finanzapp.locale";
  const DASHBOARD_SETTINGS_PREFIX = "finanzapp.dashboardSettings";
  const DEFAULT_LOCALE = "de-DE";
  const LOCALES = new Set(["de-DE", "en-US", "en-GB", "fr-FR"]);

  const MESSAGES = {
    "settings.title": {
      "de-DE": "Sprache",
      "en-US": "Language",
      "en-GB": "Language",
      "fr-FR": "Langue"
    },
    "settings.aria": {
      "de-DE": "Spracheinstellungen",
      "en-US": "Language settings",
      "en-GB": "Language settings",
      "fr-FR": "Parametres de langue"
    },
    "settings.save": {
      "de-DE": "Anwenden",
      "en-US": "Apply",
      "en-GB": "Apply",
      "fr-FR": "Appliquer"
    },
    "settings.saved": {
      "de-DE": "Sprache aktualisiert.",
      "en-US": "Language updated.",
      "en-GB": "Language updated.",
      "fr-FR": "Langue mise a jour."
    },
    "locale.de-DE": { "de-DE": "Deutsch (Deutschland)", "en-US": "German (Germany)", "en-GB": "German (Germany)", "fr-FR": "Allemand (Allemagne)" },
    "locale.en-US": { "de-DE": "Englisch (USA)", "en-US": "English (US)", "en-GB": "English (US)", "fr-FR": "Anglais (USA)" },
    "locale.en-GB": { "de-DE": "Englisch (UK)", "en-US": "English (UK)", "en-GB": "English (UK)", "fr-FR": "Anglais (UK)" },
    "locale.fr-FR": { "de-DE": "Franzoesisch (FR)", "en-US": "French (FR)", "en-GB": "French (FR)", "fr-FR": "Francais (FR)" },
    "groups.address": { "de-DE": "Adresse: {value}", "en-US": "Address: {value}", "en-GB": "Address: {value}", "fr-FR": "Adresse : {value}" },
    "groups.created": { "de-DE": "Erstellt: {value}", "en-US": "Created: {value}", "en-GB": "Created: {value}", "fr-FR": "Cree : {value}" },
    "groups.inbox.aria": {
      "de-DE": "Posteingang mit {count} offenen Einladungen",
      "en-US": "Inbox with {count} pending invitations",
      "en-GB": "Inbox with {count} pending invitations",
      "fr-FR": "Boite de reception avec {count} invitations en attente"
    },
    "groups.inbox.default": { "de-DE": "Posteingang", "en-US": "Inbox", "en-GB": "Inbox", "fr-FR": "Boite de reception" },
    "groups.status.accepted": { "de-DE": "akzeptiert", "en-US": "accepted", "en-GB": "accepted", "fr-FR": "accepte" },
    "groups.status.denied": { "de-DE": "abgelehnt", "en-US": "denied", "en-GB": "denied", "fr-FR": "refuse" },
    "groups.status.pending": { "de-DE": "ausstehend", "en-US": "pending", "en-GB": "pending", "fr-FR": "en attente" },
    "groups.you": { "de-DE": "(du)", "en-US": "(you)", "en-GB": "(you)", "fr-FR": "(vous)" },
    "groups.na": { "de-DE": "k. A.", "en-US": "n/a", "en-GB": "n/a", "fr-FR": "n/a" }
  };

  const PHRASES = {
    nav_app: { "de-DE": "App-Navigation", "en-US": "App navigation", "en-GB": "App navigation", "fr-FR": "Navigation de l'application" },
    nav_groups: { "de-DE": "Gruppen", "en-US": "Groups", "en-GB": "Groups", "fr-FR": "Groupes" },
    theme_mode: { "de-DE": "Farbmodus", "en-US": "Color mode", "en-GB": "Colour mode", "fr-FR": "Mode couleur" },
    theme_light: { "de-DE": "Hell", "en-US": "Light", "en-GB": "Light", "fr-FR": "Clair" },
    theme_dark: { "de-DE": "Dunkel", "en-US": "Dark", "en-GB": "Dark", "fr-FR": "Sombre" },
    profile: { "de-DE": "Profil", "en-US": "Profile", "en-GB": "Profile", "fr-FR": "Profil" },
    logout: { "de-DE": "Abmelden", "en-US": "Logout", "en-GB": "Logout", "fr-FR": "Deconnexion" },
    groups_title: { "de-DE": "Gruppen | FinanzApp", "en-US": "Groups | FinanzApp", "en-GB": "Groups | FinanzApp", "fr-FR": "Groupes | FinanzApp" },
    groups_brand: { "de-DE": "FinanzApp Gruppen", "en-US": "FinanzApp Groups", "en-GB": "FinanzApp Groups", "fr-FR": "FinanzApp Groupes" },
    your_groups: { "de-DE": "Deine Gruppen", "en-US": "Your Groups", "en-GB": "Your Groups", "fr-FR": "Vos groupes" },
    select_group_detail: { "de-DE": "Waehle eine Gruppe aus, um die Detailansicht zu oeffnen.", "en-US": "Select one group to open the detail view.", "en-GB": "Select one group to open the detail view.", "fr-FR": "Selectionnez un groupe pour ouvrir la vue detaillee." },
    create_group: { "de-DE": "Gruppe erstellen", "en-US": "Create Group", "en-GB": "Create Group", "fr-FR": "Creer un groupe" },
    inbox: { "de-DE": "Posteingang", "en-US": "Inbox", "en-GB": "Inbox", "fr-FR": "Boite de reception" },
    back: { "de-DE": "Zurueck", "en-US": "Back", "en-GB": "Back", "fr-FR": "Retour" },
    leave_group: { "de-DE": "Gruppe verlassen", "en-US": "Leave Group", "en-GB": "Leave Group", "fr-FR": "Quitter le groupe" },
    invite_user: { "de-DE": "Nutzer einladen", "en-US": "Invite User", "en-GB": "Invite User", "fr-FR": "Inviter un utilisateur" },
    members: { "de-DE": "Mitglieder", "en-US": "Members", "en-GB": "Members", "fr-FR": "Membres" },
    activities: { "de-DE": "Aktivitaeten", "en-US": "Activities", "en-GB": "Activities", "fr-FR": "Activites" },
    fundings: { "de-DE": "Finanzierungen", "en-US": "Fundings", "en-GB": "Fundings", "fr-FR": "Financements" },
    participants: { "de-DE": "Teilnehmende", "en-US": "Participants", "en-GB": "Participants", "fr-FR": "Participants" },
    admin_actions: { "de-DE": "Admin-Aktionen", "en-US": "Admin Actions", "en-GB": "Admin Actions", "fr-FR": "Actions admin" },
    delete_group: { "de-DE": "Diese Gruppe loeschen", "en-US": "Delete this group", "en-GB": "Delete this group", "fr-FR": "Supprimer ce groupe" },
    settings: { "de-DE": "Einstellungen", "en-US": "Settings", "en-GB": "Settings", "fr-FR": "Parametres" },
    save: { "de-DE": "Speichern", "en-US": "Save", "en-GB": "Save", "fr-FR": "Enregistrer" },
    reset: { "de-DE": "Zuruecksetzen", "en-US": "Reset", "en-GB": "Reset", "fr-FR": "Reinitialiser" },
    language_number_format: { "de-DE": "Sprache & Zahlenformat", "en-US": "Language & number format", "en-GB": "Language & number format", "fr-FR": "Langue et format numerique" },
    display_currency: { "de-DE": "Anzeige-Waehrung", "en-US": "Display currency", "en-GB": "Display currency", "fr-FR": "Devise d'affichage" },
    stock_view_title: { "de-DE": "Aktienansicht", "en-US": "Stock View", "en-GB": "Stock View", "fr-FR": "Vue des actions" },
    stock_view_page_title: { "de-DE": "Aktienansicht | FinanzApp", "en-US": "Stock View | FinanzApp", "en-GB": "Stock View | FinanzApp", "fr-FR": "Vue des actions | FinanzApp" },
    real_estate: { "de-DE": "Immobilien", "en-US": "Real Estate", "en-GB": "Real Estate", "fr-FR": "Immobilier" },
    depositary_receipts: { "de-DE": "Hinterlegungsscheine", "en-US": "Depositary Receipts", "en-GB": "Depositary Receipts", "fr-FR": "Certificats de depot" },
    partnerships: { "de-DE": "Personengesellschaften", "en-US": "Partnerships", "en-GB": "Partnerships", "fr-FR": "Partenariats" },
    closed_end_funds: { "de-DE": "Geschlossene Fonds", "en-US": "Closed-end Funds", "en-GB": "Closed-end Funds", "fr-FR": "Fonds fermes" },
    login_loading: { "de-DE": "Login wird geladen...", "en-US": "Loading login...", "en-GB": "Loading login...", "fr-FR": "Chargement de la connexion..." }
  };

  const phraseLookup = new Map();
  for (const [key, locales] of Object.entries(PHRASES)) {
    for (const value of Object.values(locales)) {
      phraseLookup.set(String(value).trim(), key);
    }
  }

  function normalizeLocale(value) {
    const locale = String(value || "").trim();
    return LOCALES.has(locale) ? locale : DEFAULT_LOCALE;
  }

  function getCurrentUserId() {
    try {
      const raw = window.sessionStorage.getItem("finanzapp.currentUser");
      if (!raw) return null;
      const user = JSON.parse(raw);
      return user?.id || null;
    } catch {
      return null;
    }
  }

  function dashboardSettingsKey(userId) {
    return `${DASHBOARD_SETTINGS_PREFIX}.${userId || "anonymous"}`;
  }

  function readDashboardLocale(userId) {
    try {
      const raw = window.localStorage.getItem(dashboardSettingsKey(userId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return normalizeLocale(parsed?.locale);
    } catch {
      return null;
    }
  }

  function writeDashboardLocale(userId, locale) {
    try {
      const key = dashboardSettingsKey(userId);
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : {};
      parsed.locale = locale;
      window.localStorage.setItem(key, JSON.stringify(parsed));
    } catch {
      // ignore
    }
  }

  function getLocale(userId) {
    const storedRaw = window.localStorage.getItem(STORAGE_KEY);
    if (storedRaw && LOCALES.has(storedRaw)) return storedRaw;
    const dashboardLocale = readDashboardLocale(userId || getCurrentUserId());
    return dashboardLocale || DEFAULT_LOCALE;
  }

  function format(template, params = {}) {
    return String(template).replaceAll(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
  }

  function t(key, params = {}) {
    const locale = getLocale();
    const entry = MESSAGES[key];
    if (!entry) return key;
    const template = entry[locale] || entry[DEFAULT_LOCALE] || "";
    return format(template, params);
  }

  function translateToken(raw, locale) {
    const source = String(raw || "");
    const trimmed = source.trim();
    if (!trimmed) return source;
    const key = phraseLookup.get(trimmed);
    if (!key) return source;
    const replacement = PHRASES[key]?.[locale] || PHRASES[key]?.[DEFAULT_LOCALE] || trimmed;
    return source.replace(trimmed, replacement);
  }

  function applyTranslations(root = document.body) {
    if (!root) return;
    const locale = getLocale();
    document.documentElement.lang = locale;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const parentName = node.parentElement?.tagName;
      if (parentName !== "SCRIPT" && parentName !== "STYLE") {
        const translated = translateToken(node.nodeValue, locale);
        if (translated !== node.nodeValue) node.nodeValue = translated;
      }
      node = walker.nextNode();
    }

    const attrNames = ["placeholder", "aria-label", "title"];
    const elements = root.querySelectorAll("*");
    for (const element of elements) {
      for (const attr of attrNames) {
        const value = element.getAttribute(attr);
        if (!value) continue;
        const translated = translateToken(value, locale);
        if (translated !== value) element.setAttribute(attr, translated);
      }
    }
  }

  let applying = false;
  function safeApply(root) {
    if (applying) return;
    applying = true;
    try {
      applyTranslations(root);
    } finally {
      applying = false;
    }
  }

  function setLocale(nextLocale, options = {}) {
    const locale = normalizeLocale(nextLocale);
    const userId = options.userId || getCurrentUserId();
    window.localStorage.setItem(STORAGE_KEY, locale);
    if (userId) writeDashboardLocale(userId, locale);
    safeApply(document.body);
    if (!options.silent) {
      window.dispatchEvent(new CustomEvent("finanzapp:locale-changed", { detail: { locale } }));
    }
    return locale;
  }

  function init() {
    safeApply(document.body);

    const observer = new MutationObserver(() => {
      safeApply(document.body);
    });
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["placeholder", "aria-label", "title"]
      });
    }

    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY) return;
      safeApply(document.body);
      window.dispatchEvent(new CustomEvent("finanzapp:locale-changed", { detail: { locale: getLocale() } }));
    });

    window.addEventListener("finanzapp:locale-changed", () => {
      safeApply(document.body);
    });
  }

  window.FinanzAppLanguage = {
    LOCALES,
    getLocale,
    setLocale,
    applyTranslations: safeApply,
    t
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
