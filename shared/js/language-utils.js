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
    "settings.reset_done": {
      "de-DE": "Einstellungen zurueckgesetzt.",
      "en-US": "Settings reset.",
      "en-GB": "Settings reset.",
      "fr-FR": "Parametres reinitialises."
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
    nav_dashboard: { "de-DE": "Dashboard", "en-US": "Dashboard", "en-GB": "Dashboard", "fr-FR": "Tableau de bord" },
    nav_groups: { "de-DE": "Gruppen", "en-US": "Groups", "en-GB": "Groups", "fr-FR": "Groupes" },
    nav_stocks: { "de-DE": "Aktien", "en-US": "Stocks", "en-GB": "Stocks", "fr-FR": "Actions" },
    theme_mode: { "de-DE": "Farbmodus", "en-US": "Color mode", "en-GB": "Colour mode", "fr-FR": "Mode couleur" },
    theme_light: { "de-DE": "Hell", "en-US": "Light", "en-GB": "Light", "fr-FR": "Clair" },
    theme_dark: { "de-DE": "Dunkel", "en-US": "Dark", "en-GB": "Dark", "fr-FR": "Sombre" },
    theme_auto: { "de-DE": "Auto", "en-US": "Auto", "en-GB": "Auto", "fr-FR": "Auto" },
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
    depot: { "de-DE": "Depot", "en-US": "Portfolio", "en-GB": "Portfolio", "fr-FR": "Portefeuille" },
    total_portfolio: { "de-DE": "Gesamtsdepot", "en-US": "Total Portfolio", "en-GB": "Total Portfolio", "fr-FR": "Portefeuille total" },
    single_analysis: { "de-DE": "Einzelanalyse", "en-US": "Single Analysis", "en-GB": "Single Analysis", "fr-FR": "Analyse individuelle" },
    outlook: { "de-DE": "Zukunftsaussicht", "en-US": "Outlook", "en-GB": "Outlook", "fr-FR": "Perspectives" },
    groupings: { "de-DE": "Gruppierungen", "en-US": "Groupings", "en-GB": "Groupings", "fr-FR": "Regroupements" },
    common_stock: { "de-DE": "Stammaktie", "en-US": "Common Stock", "en-GB": "Common Stock", "fr-FR": "Action ordinaire" },
    preferred_stock: { "de-DE": "Vorzugsaktie", "en-US": "Preferred Stock", "en-GB": "Preferred Stock", "fr-FR": "Action privilegiee" },
    all_accounts: { "de-DE": "Alle Konten", "en-US": "All Accounts", "en-GB": "All Accounts", "fr-FR": "Tous les comptes" },
    real_estate: { "de-DE": "Immobilien", "en-US": "Real Estate", "en-GB": "Real Estate", "fr-FR": "Immobilier" },
    depositary_receipts: { "de-DE": "Hinterlegungsscheine", "en-US": "Depositary Receipts", "en-GB": "Depositary Receipts", "fr-FR": "Certificats de depot" },
    partnerships: { "de-DE": "Personengesellschaften", "en-US": "Partnerships", "en-GB": "Partnerships", "fr-FR": "Partenariats" },
    closed_end_funds: { "de-DE": "Geschlossene Fonds", "en-US": "Closed-end Funds", "en-GB": "Closed-end Funds", "fr-FR": "Fonds fermes" },
    etns: { "de-DE": "ETNs", "en-US": "ETNs", "en-GB": "ETNs", "fr-FR": "ETNs" },
    bank_account: { "de-DE": "Bankkonto", "en-US": "Bank account", "en-GB": "Bank account", "fr-FR": "Compte bancaire" },
    bank_account_select_aria: {
      "de-DE": "Bankkonto auswaehlen",
      "en-US": "Select bank account",
      "en-GB": "Select bank account",
      "fr-FR": "Selectionner un compte bancaire"
    },
    login_loading: { "de-DE": "Login wird geladen...", "en-US": "Loading login...", "en-GB": "Loading login...", "fr-FR": "Chargement de la connexion..." },
    login: { "de-DE": "Login", "en-US": "Login", "en-GB": "Login", "fr-FR": "Connexion" },
    dashboard_brand_sub: { "de-DE": "Uebersicht", "en-US": "Overview", "en-GB": "Overview", "fr-FR": "Apercu" },
    sections: { "de-DE": "Bereiche", "en-US": "Sections", "en-GB": "Sections", "fr-FR": "Sections" },
    monthly_net_cashflow: {
      "de-DE": "Monatlicher Netto-Cashflow",
      "en-US": "Monthly net cash flow",
      "en-GB": "Monthly net cash flow",
      "fr-FR": "Flux de tresorerie net mensuel"
    },
    no_bookings_yet: {
      "de-DE": "Noch keine Buchungen erfasst.",
      "en-US": "No bookings recorded yet.",
      "en-GB": "No bookings recorded yet.",
      "fr-FR": "Aucune operation enregistree pour le moment."
    },
    monthly_income: { "de-DE": "Monatliche Einnahmen", "en-US": "Monthly income", "en-GB": "Monthly income", "fr-FR": "Revenus mensuels" },
    monthly_expenses: { "de-DE": "Monatliche Ausgaben", "en-US": "Monthly expenses", "en-GB": "Monthly expenses", "fr-FR": "Depenses mensuelles" },
    no_data: { "de-DE": "Keine Daten", "en-US": "No data", "en-GB": "No data", "fr-FR": "Aucune donnee" },
    savings_rate: { "de-DE": "Sparquote", "en-US": "Savings rate", "en-GB": "Savings rate", "fr-FR": "Taux d'epargne" },
    monthly_liquidity: { "de-DE": "Liquiditaet (Monat)", "en-US": "Liquidity (month)", "en-GB": "Liquidity (month)", "fr-FR": "Liquidite (mois)" },
    income_minus_expense: { "de-DE": "Einnahmen - Ausgaben", "en-US": "Income - expenses", "en-GB": "Income - expenses", "fr-FR": "Revenus - depenses" },
    cashflow_history: { "de-DE": "Cashflow Verlauf", "en-US": "Cash flow history", "en-GB": "Cash flow history", "fr-FR": "Historique des flux de tresorerie" },
    no_history_data: {
      "de-DE": "Noch keine Verlaufsdaten vorhanden.",
      "en-US": "No history data available yet.",
      "en-GB": "No history data available yet.",
      "fr-FR": "Aucune donnee historique disponible pour le moment."
    },
    today_focus: { "de-DE": "Heute im Fokus", "en-US": "Today's focus", "en-GB": "Today's focus", "fr-FR": "Focus du jour" },
    paused_recurrences: {
      "de-DE": "Pausierte Wiederholungen",
      "en-US": "Paused recurrences",
      "en-GB": "Paused recurrences",
      "fr-FR": "Recurrences en pause"
    },
    current_month_income: {
      "de-DE": "Einnahmen laufender Monat",
      "en-US": "Current month income",
      "en-GB": "Current month income",
      "fr-FR": "Revenus du mois en cours"
    },
    current_month_expense: {
      "de-DE": "Ausgaben laufender Monat",
      "en-US": "Current month expenses",
      "en-GB": "Current month expenses",
      "fr-FR": "Depenses du mois en cours"
    },
    monthly_base_income: {
      "de-DE": "Monatliche Basiseinnahme",
      "en-US": "Monthly base income",
      "en-GB": "Monthly base income",
      "fr-FR": "Revenu mensuel de base"
    },
    base_income_hint: {
      "de-DE": "Wird fuer die Uebersicht genutzt und kann jederzeit angepasst werden.",
      "en-US": "Used for the overview and can be changed anytime.",
      "en-GB": "Used for the overview and can be changed anytime.",
      "fr-FR": "Utilise pour l'apercu et modifiable a tout moment."
    },
    amount_eur: { "de-DE": "Betrag (EUR)", "en-US": "Amount (EUR)", "en-GB": "Amount (EUR)", "fr-FR": "Montant (EUR)" },
    save_monthly_income: {
      "de-DE": "Monatseinnahme speichern",
      "en-US": "Save monthly income",
      "en-GB": "Save monthly income",
      "fr-FR": "Enregistrer le revenu mensuel"
    },
    record_income: { "de-DE": "Einnahme erfassen", "en-US": "Record income", "en-GB": "Record income", "fr-FR": "Ajouter un revenu" },
    source: { "de-DE": "Quelle", "en-US": "Source", "en-GB": "Source", "fr-FR": "Source" },
    category: { "de-DE": "Kategorie", "en-US": "Category", "en-GB": "Category", "fr-FR": "Categorie" },
    custom_category: { "de-DE": "Eigene Kategorie", "en-US": "Custom category", "en-GB": "Custom category", "fr-FR": "Categorie personnalisee" },
    date: { "de-DE": "Datum", "en-US": "Date", "en-GB": "Date", "fr-FR": "Date" },
    recurrence: { "de-DE": "Wiederholung", "en-US": "Recurrence", "en-GB": "Recurrence", "fr-FR": "Recurrence" },
    status: { "de-DE": "Status", "en-US": "Status", "en-GB": "Status", "fr-FR": "Statut" },
    active_recurrence_only: {
      "de-DE": "Aktiv (nur fuer wiederkehrend)",
      "en-US": "Active (for recurring only)",
      "en-GB": "Active (for recurring only)",
      "fr-FR": "Actif (uniquement pour les recurrents)"
    },
    note_optional: { "de-DE": "Notiz (optional)", "en-US": "Note (optional)", "en-GB": "Note (optional)", "fr-FR": "Note (optionnel)" },
    save_income: { "de-DE": "Einnahme speichern", "en-US": "Save income", "en-GB": "Save income", "fr-FR": "Enregistrer le revenu" },
    cancel_editing: { "de-DE": "Bearbeitung abbrechen", "en-US": "Cancel editing", "en-GB": "Cancel editing", "fr-FR": "Annuler la modification" },
    manage_custom_categories: {
      "de-DE": "Eigene Kategorien verwalten",
      "en-US": "Manage custom categories",
      "en-GB": "Manage custom categories",
      "fr-FR": "Gerer les categories personnalisees"
    },
    no_custom_categories: {
      "de-DE": "Keine eigenen Kategorien vorhanden.",
      "en-US": "No custom categories available.",
      "en-GB": "No custom categories available.",
      "fr-FR": "Aucune categorie personnalisee disponible."
    },
    latest_income: { "de-DE": "Letzte Einnahmen", "en-US": "Latest income", "en-GB": "Latest income", "fr-FR": "Derniers revenus" },
    list_search_hint: {
      "de-DE": "Monat aufklappen, Eintraege durchsuchen, dann bearbeiten oder loeschen.",
      "en-US": "Expand month, search entries, then edit or delete.",
      "en-GB": "Expand month, search entries, then edit or delete.",
      "fr-FR": "Developpez le mois, recherchez les entrees, puis modifiez ou supprimez."
    },
    search_income_placeholder: {
      "de-DE": "Einnahmen durchsuchen (Quelle, Kategorie, Notiz...)",
      "en-US": "Search income (source, category, note...)",
      "en-GB": "Search income (source, category, note...)",
      "fr-FR": "Rechercher des revenus (source, categorie, note...)"
    },
    record_expense: { "de-DE": "Ausgabe erfassen", "en-US": "Record expense", "en-GB": "Record expense", "fr-FR": "Ajouter une depense" },
    save_expense: { "de-DE": "Ausgabe speichern", "en-US": "Save expense", "en-GB": "Save expense", "fr-FR": "Enregistrer la depense" },
    latest_expenses: { "de-DE": "Letzte Ausgaben", "en-US": "Latest expenses", "en-GB": "Latest expenses", "fr-FR": "Dernieres depenses" },
    search_expense_placeholder: {
      "de-DE": "Ausgaben durchsuchen (Quelle, Kategorie, Notiz...)",
      "en-US": "Search expenses (source, category, note...)",
      "en-GB": "Search expenses (source, category, note...)",
      "fr-FR": "Rechercher des depenses (source, categorie, note...)"
    },
    delete_entry_confirm: { "de-DE": "Eintrag loeschen?", "en-US": "Delete entry?", "en-GB": "Delete entry?", "fr-FR": "Supprimer l'entree ?" },
    delete_irreversible: {
      "de-DE": "Diese Aktion kann nicht rueckgaengig gemacht werden.",
      "en-US": "This action cannot be undone.",
      "en-GB": "This action cannot be undone.",
      "fr-FR": "Cette action ne peut pas etre annulee."
    },
    cancel: { "de-DE": "Abbrechen", "en-US": "Cancel", "en-GB": "Cancel", "fr-FR": "Annuler" },
    delete: { "de-DE": "Loeschen", "en-US": "Delete", "en-GB": "Delete", "fr-FR": "Supprimer" },
    without_category: { "de-DE": "Ohne Kategorie", "en-US": "Without category", "en-GB": "Without category", "fr-FR": "Sans categorie" },
    custom_category_option: {
      "de-DE": "Eigene Kategorie...",
      "en-US": "Custom category...",
      "en-GB": "Custom category...",
      "fr-FR": "Categorie personnalisee..."
    },
    without_date: { "de-DE": "Ohne Datum", "en-US": "Without date", "en-GB": "Without date", "fr-FR": "Sans date" },
    without_month: { "de-DE": "Ohne Monat", "en-US": "Without month", "en-GB": "Without month", "fr-FR": "Sans mois" },
    no_income_search_results: {
      "de-DE": "Keine Einnahmen fuer diese Suche gefunden.",
      "en-US": "No income found for this search.",
      "en-GB": "No income found for this search.",
      "fr-FR": "Aucun revenu trouve pour cette recherche."
    },
    no_income_entries_yet: {
      "de-DE": "Noch keine Einnahmen eingetragen.",
      "en-US": "No income entries yet.",
      "en-GB": "No income entries yet.",
      "fr-FR": "Aucune entree de revenu pour le moment."
    },
    no_expense_search_results: {
      "de-DE": "Keine Ausgaben fuer diese Suche gefunden.",
      "en-US": "No expenses found for this search.",
      "en-GB": "No expenses found for this search.",
      "fr-FR": "Aucune depense trouvee pour cette recherche."
    },
    no_expense_entries_yet: {
      "de-DE": "Noch keine Ausgaben eingetragen.",
      "en-US": "No expense entries yet.",
      "en-GB": "No expense entries yet.",
      "fr-FR": "Aucune entree de depense pour le moment."
    },
    after_expenses: {
      "de-DE": "nach Abzug der Ausgaben",
      "en-US": "after expenses",
      "en-GB": "after expenses",
      "fr-FR": "apres les depenses"
    },
    more_expenses_than_income: {
      "de-DE": "mehr Ausgaben als Einnahmen",
      "en-US": "more expenses than income",
      "en-GB": "more expenses than income",
      "fr-FR": "plus de depenses que de revenus"
    },
    positive_month_result: {
      "de-DE": "positiver Monatsabschluss",
      "en-US": "positive month result",
      "en-GB": "positive month result",
      "fr-FR": "resultat mensuel positif"
    },
    negative_month_result: {
      "de-DE": "negativer Monatsabschluss",
      "en-US": "negative month result",
      "en-GB": "negative month result",
      "fr-FR": "resultat mensuel negatif"
    },
    no_bookings_detailed: {
      "de-DE": "Noch keine Buchungen erfasst. Lege Einnahmen oder Ausgaben an.",
      "en-US": "No bookings yet. Create income or expense entries.",
      "en-GB": "No bookings yet. Create income or expense entries.",
      "fr-FR": "Aucune operation pour le moment. Creez des revenus ou depenses."
    },
    edit_active_message: {
      "de-DE": "Bearbeitung aktiv. Aendere Werte und speichere.",
      "en-US": "Editing active. Change values and save.",
      "en-GB": "Editing active. Change values and save.",
      "fr-FR": "Modification active. Changez les valeurs puis enregistrez."
    },
    entry_could_not_be_deleted: {
      "de-DE": "Eintrag konnte nicht geloescht werden.",
      "en-US": "Entry could not be deleted.",
      "en-GB": "Entry could not be deleted.",
      "fr-FR": "L'entree n'a pas pu etre supprimee."
    },
    expense_deleted: { "de-DE": "Ausgabe geloescht.", "en-US": "Expense deleted.", "en-GB": "Expense deleted.", "fr-FR": "Depense supprimee." },
    editing_cancelled: { "de-DE": "Bearbeitung abgebrochen.", "en-US": "Editing cancelled.", "en-GB": "Editing cancelled.", "fr-FR": "Modification annulee." },
    updating_expense: { "de-DE": "Aktualisiere Ausgabe...", "en-US": "Updating expense...", "en-GB": "Updating expense...", "fr-FR": "Mise a jour de la depense..." },
    saving_expense: { "de-DE": "Speichere Ausgabe...", "en-US": "Saving expense...", "en-GB": "Saving expense...", "fr-FR": "Enregistrement de la depense..." },
    save_failed: { "de-DE": "Speichern fehlgeschlagen.", "en-US": "Save failed.", "en-GB": "Save failed.", "fr-FR": "Echec de l'enregistrement." },
    expense_updated: { "de-DE": "Ausgabe aktualisiert.", "en-US": "Expense updated.", "en-GB": "Expense updated.", "fr-FR": "Depense mise a jour." },
    expense_saved: { "de-DE": "Ausgabe gespeichert.", "en-US": "Expense saved.", "en-GB": "Expense saved.", "fr-FR": "Depense enregistree." },
    income_deleted: { "de-DE": "Einnahme geloescht.", "en-US": "Income deleted.", "en-GB": "Income deleted.", "fr-FR": "Revenu supprime." },
    updating_income: { "de-DE": "Aktualisiere Einnahme...", "en-US": "Updating income...", "en-GB": "Updating income...", "fr-FR": "Mise a jour du revenu..." },
    saving_income: { "de-DE": "Speichere Einnahme...", "en-US": "Saving income...", "en-GB": "Saving income...", "fr-FR": "Enregistrement du revenu..." },
    income_updated: { "de-DE": "Einnahme aktualisiert.", "en-US": "Income updated.", "en-GB": "Income updated.", "fr-FR": "Revenu mis a jour." },
    income_saved: { "de-DE": "Einnahme gespeichert.", "en-US": "Income saved.", "en-GB": "Income saved.", "fr-FR": "Revenu enregistre." },
    enter_number_gte_zero: {
      "de-DE": "Bitte eine Zahl >= 0 eingeben.",
      "en-US": "Please enter a number >= 0.",
      "en-GB": "Please enter a number >= 0.",
      "fr-FR": "Veuillez saisir un nombre >= 0."
    },
    saving_monthly_income: {
      "de-DE": "Speichere Monatseinnahme...",
      "en-US": "Saving monthly income...",
      "en-GB": "Saving monthly income...",
      "fr-FR": "Enregistrement du revenu mensuel..."
    },
    monthly_income_save_failed: {
      "de-DE": "Monatseinnahme konnte nicht gespeichert werden.",
      "en-US": "Monthly income could not be saved.",
      "en-GB": "Monthly income could not be saved.",
      "fr-FR": "Le revenu mensuel n'a pas pu etre enregistre."
    },
    monthly_income_updated: {
      "de-DE": "Monatseinnahme aktualisiert.",
      "en-US": "Monthly income updated.",
      "en-GB": "Monthly income updated.",
      "fr-FR": "Revenu mensuel mis a jour."
    },
    category_delete_confirm: {
      "de-DE": "Kategorie loeschen?",
      "en-US": "Delete category?",
      "en-GB": "Delete category?",
      "fr-FR": "Supprimer la categorie ?"
    },
    category_delete_button: {
      "de-DE": "Kategorie loeschen",
      "en-US": "Delete category",
      "en-GB": "Delete category",
      "fr-FR": "Supprimer la categorie"
    },
    category_could_not_be_deleted: {
      "de-DE": "Kategorie konnte nicht geloescht werden.",
      "en-US": "Category could not be deleted.",
      "en-GB": "Category could not be deleted.",
      "fr-FR": "La categorie n'a pas pu etre supprimee."
    },
    create_group_now: { "de-DE": "Gruppe wird erstellt...", "en-US": "Creating group...", "en-GB": "Creating group...", "fr-FR": "Creation du groupe..." },
    group_created_with_admin: {
      "de-DE": "Gruppe erstellt und du wurdest als Admin hinzugefuegt.",
      "en-US": "Group created and you were added as admin.",
      "en-GB": "Group created and you were added as admin.",
      "fr-FR": "Groupe cree et vous avez ete ajoute comme admin."
    },
    linked_activity_none: {
      "de-DE": "Keine verknuepfte Aktivitaet",
      "en-US": "No linked activity",
      "en-GB": "No linked activity",
      "fr-FR": "Aucune activite liee"
    },
    select_funding: { "de-DE": "Finanzierung waehlen", "en-US": "Select funding", "en-GB": "Select funding", "fr-FR": "Selectionner un financement" },
    funding_entry: { "de-DE": "Finanzierungseintrag", "en-US": "Funding entry", "en-GB": "Funding entry", "fr-FR": "Entree de financement" },
    no_fundings_yet: { "de-DE": "Noch keine Finanzierungen.", "en-US": "No fundings yet.", "en-GB": "No fundings yet.", "fr-FR": "Aucun financement pour le moment." },
    no_paid_expenses_yet: {
      "de-DE": "Noch keine aus Finanzierungen bezahlten Ausgaben.",
      "en-US": "No expenses paid from fundings yet.",
      "en-GB": "No expenses paid from fundings yet.",
      "fr-FR": "Aucune depense payee via financements pour le moment."
    },
    group_expense: { "de-DE": "Gruppenausgabe", "en-US": "Group expense", "en-GB": "Group expense", "fr-FR": "Depense de groupe" },
    funding_payment: { "de-DE": "Finanzierungszahlung", "en-US": "Funding payment", "en-GB": "Funding payment", "fr-FR": "Paiement de financement" },
    no_funding_payments_yet: {
      "de-DE": "Noch keine Finanzierungszahlungen.",
      "en-US": "No funding payments yet.",
      "en-GB": "No funding payments yet.",
      "fr-FR": "Aucun paiement de financement pour le moment."
    },
    no_memberships_for_user: {
      "de-DE": "Keine Gruppenmitgliedschaften fuer deinen Sitzungsnutzer gefunden.",
      "en-US": "No group memberships found for your session user.",
      "en-GB": "No group memberships found for your session user.",
      "fr-FR": "Aucune adhesion de groupe trouvee pour l'utilisateur de session."
    },
    no_open_invitations: {
      "de-DE": "Keine offenen Einladungen.",
      "en-US": "No open invitations.",
      "en-GB": "No open invitations.",
      "fr-FR": "Aucune invitation ouverte."
    },
    overview_title: { "de-DE": "FinanzApp Uebersicht", "en-US": "FinanzApp Overview", "en-GB": "FinanzApp Overview", "fr-FR": "FinanzApp Apercu" },
    dashboard_copy_modern: {
      "de-DE": "Moderne Finanzuebersicht fuer Alltag und WG.",
      "en-US": "Modern finance overview for everyday life and shared flats.",
      "en-GB": "Modern finance overview for everyday life and shared flats.",
      "fr-FR": "Apercu financier moderne pour le quotidien et la colocation."
    },
    dashboard_copy_track: {
      "de-DE": "Verfolge Ausgaben, offene Forderungen und Sparziele zentral in einem klaren Dashboard.",
      "en-US": "Track expenses, open claims, and savings goals centrally in a clear dashboard.",
      "en-GB": "Track expenses, open claims, and savings goals centrally in a clear dashboard.",
      "fr-FR": "Suivez depenses, creances ouvertes et objectifs d'epargne dans un tableau clair."
    },
    account_flows: { "de-DE": "Account-Flows", "en-US": "Account flows", "en-GB": "Account flows", "fr-FR": "Flux de compte" },
    login_register: { "de-DE": "Login + Registrierung", "en-US": "Login + Registration", "en-GB": "Login + Registration", "fr-FR": "Connexion + inscription" },
    with_email_verification: {
      "de-DE": "inkl. E-Mail-Verifizierung",
      "en-US": "including email verification",
      "en-GB": "including email verification",
      "fr-FR": "avec verification e-mail"
    },
    data_source: { "de-DE": "Datenbasis", "en-US": "Data source", "en-GB": "Data source", "fr-FR": "Source de donnees" },
    mongodb_live: { "de-DE": "MongoDB Live", "en-US": "MongoDB Live", "en-GB": "MongoDB Live", "fr-FR": "MongoDB Live" },
    real_datasets_only: { "de-DE": "Nur echte Datensaetze", "en-US": "Only real datasets", "en-GB": "Only real datasets", "fr-FR": "Uniquement de vraies donnees" },
    dynamic_metrics: { "de-DE": "Dynamische Kennzahlen", "en-US": "Dynamic metrics", "en-GB": "Dynamic metrics", "fr-FR": "Indicateurs dynamiques" },
    from_saved_entries: { "de-DE": "aus deinen gespeicherten Eintraegen", "en-US": "from your saved entries", "en-GB": "from your saved entries", "fr-FR": "a partir de vos entrees enregistrees" },
    start_section: { "de-DE": "Start-Bereich", "en-US": "Start section", "en-GB": "Start section", "fr-FR": "Section de depart" },
    new_income: { "de-DE": "Neue Einnahmen", "en-US": "New income", "en-GB": "New income", "fr-FR": "Nouveaux revenus" },
    new_expenses: { "de-DE": "Neue Ausgaben", "en-US": "New expenses", "en-GB": "New expenses", "fr-FR": "Nouvelles depenses" },
    once: { "de-DE": "Einmalig", "en-US": "One-time", "en-GB": "One-off", "fr-FR": "Unique" },
    weekly: { "de-DE": "Woechentlich", "en-US": "Weekly", "en-GB": "Weekly", "fr-FR": "Hebdomadaire" },
    monthly: { "de-DE": "Monatlich", "en-US": "Monthly", "en-GB": "Monthly", "fr-FR": "Mensuel" },
    euro_label: { "de-DE": "Euro (EUR)", "en-US": "Euro (EUR)", "en-GB": "Euro (EUR)", "fr-FR": "Euro (EUR)" },
    usd_label: { "de-DE": "US-Dollar (USD)", "en-US": "US Dollar (USD)", "en-GB": "US Dollar (USD)", "fr-FR": "Dollar US (USD)" },
    gbp_label: { "de-DE": "Pfund (GBP)", "en-US": "Pound (GBP)", "en-GB": "Pound (GBP)", "fr-FR": "Livre (GBP)" },
    chf_label: { "de-DE": "Schweizer Franken (CHF)", "en-US": "Swiss Franc (CHF)", "en-GB": "Swiss Franc (CHF)", "fr-FR": "Franc suisse (CHF)" },
    placeholder_income_source: {
      "de-DE": "z. B. Gehalt, Freelance, Rueckzahlung",
      "en-US": "e.g. Salary, freelance, refund",
      "en-GB": "e.g. Salary, freelance, refund",
      "fr-FR": "ex. salaire, freelance, remboursement"
    },
    placeholder_custom_income_category: {
      "de-DE": "z. B. Vermietung",
      "en-US": "e.g. rental income",
      "en-GB": "e.g. rental income",
      "fr-FR": "ex. revenus locatifs"
    },
    placeholder_income_note: {
      "de-DE": "z. B. Bonus fuer Projekt X",
      "en-US": "e.g. Bonus for project X",
      "en-GB": "e.g. Bonus for project X",
      "fr-FR": "ex. bonus pour projet X"
    },
    placeholder_expense_source: {
      "de-DE": "z. B. Vermieter, Supermarkt, Stromanbieter",
      "en-US": "e.g. Landlord, supermarket, utility provider",
      "en-GB": "e.g. Landlord, supermarket, utility provider",
      "fr-FR": "ex. proprietaire, supermarche, fournisseur d'energie"
    },
    placeholder_custom_expense_category: {
      "de-DE": "z. B. Versicherungen",
      "en-US": "e.g. insurance",
      "en-GB": "e.g. insurance",
      "fr-FR": "ex. assurances"
    },
    placeholder_expense_note: {
      "de-DE": "z. B. Abschlag Strom",
      "en-US": "e.g. electricity instalment",
      "en-GB": "e.g. electricity instalment",
      "fr-FR": "ex. acompte electricite"
    },
    create_new_group: { "de-DE": "Neue Gruppe erstellen", "en-US": "Create new group", "en-GB": "Create new group", "fr-FR": "Creer un nouveau groupe" },
    close: { "de-DE": "Schliessen", "en-US": "Close", "en-GB": "Close", "fr-FR": "Fermer" },
    group_name: { "de-DE": "Gruppenname", "en-US": "Group name", "en-GB": "Group name", "fr-FR": "Nom du groupe" },
    address_optional: { "de-DE": "Adresse (optional)", "en-US": "Address (optional)", "en-GB": "Address (optional)", "fr-FR": "Adresse (optionnel)" },
    group_tabs_aria: { "de-DE": "Gruppen-Detailtabs", "en-US": "Group detail tabs", "en-GB": "Group detail tabs", "fr-FR": "Onglets detail du groupe" },
    activities_group: { "de-DE": "Gruppenaktivitaeten", "en-US": "Group activities", "en-GB": "Group activities", "fr-FR": "Activites de groupe" },
    create_activity: { "de-DE": "Aktivitaet erstellen", "en-US": "Create activity", "en-GB": "Create activity", "fr-FR": "Creer une activite" },
    new_group_activity: { "de-DE": "Neue Gruppenaktivitaet", "en-US": "New group activity", "en-GB": "New group activity", "fr-FR": "Nouvelle activite de groupe" },
    date_optional: { "de-DE": "Datum (optional)", "en-US": "Date (optional)", "en-GB": "Date (optional)", "fr-FR": "Date (optionnel)" },
    placeholder_group_activity: { "de-DE": "z. B. Kochabend am Samstag", "en-US": "e.g. Cooking evening on Saturday", "en-GB": "e.g. Cooking evening on Saturday", "fr-FR": "ex. soiree cuisine samedi" },
    create_funding: { "de-DE": "Finanzierung erstellen", "en-US": "Create funding", "en-GB": "Create funding", "fr-FR": "Creer un financement" },
    funding_expenses: { "de-DE": "Finanzierungs-Ausgaben", "en-US": "Funding expenses", "en-GB": "Funding expenses", "fr-FR": "Depenses de financement" },
    funding_transactions: { "de-DE": "Finanzierungs-Transaktionen", "en-US": "Funding transactions", "en-GB": "Funding transactions", "fr-FR": "Transactions de financement" },
    funding_info_optional: { "de-DE": "Finanzierungsinfo (optional)", "en-US": "Funding info (optional)", "en-GB": "Funding info (optional)", "fr-FR": "Infos financement (optionnel)" },
    link_existing_activity_optional: {
      "de-DE": "Mit vorhandener Aktivitaet verknuepfen (optional)",
      "en-US": "Link with existing activity (optional)",
      "en-GB": "Link with existing activity (optional)",
      "fr-FR": "Lier a une activite existante (optionnel)"
    },
    placeholder_funding_info: {
      "de-DE": "z. B. Gemeinsames Lebensmittelbudget",
      "en-US": "e.g. Shared grocery budget",
      "en-GB": "e.g. Shared grocery budget",
      "fr-FR": "ex. budget courses commun"
    },
    donate: { "de-DE": "Spenden", "en-US": "Donate", "en-GB": "Donate", "fr-FR": "Donner" },
    donate_to_funding: { "de-DE": "An Finanzierung spenden", "en-US": "Donate to funding", "en-GB": "Donate to funding", "fr-FR": "Donner au financement" },
    donation_amount: { "de-DE": "Spendenbetrag", "en-US": "Donation amount", "en-GB": "Donation amount", "fr-FR": "Montant du don" },
    create_paid_expense_admin: {
      "de-DE": "Bezahlte Ausgabe erstellen (Admin)",
      "en-US": "Create paid expense (admin)",
      "en-GB": "Create paid expense (admin)",
      "fr-FR": "Creer depense payee (admin)"
    },
    funding_for_expense: { "de-DE": "Finanzierung fuer Ausgabe", "en-US": "Funding for expense", "en-GB": "Funding for expense", "fr-FR": "Financement pour depense" },
    expense_amount: { "de-DE": "Ausgabenbetrag", "en-US": "Expense amount", "en-GB": "Expense amount", "fr-FR": "Montant de la depense" },
    expense_info_optional: { "de-DE": "Ausgabeninfo (optional)", "en-US": "Expense info (optional)", "en-GB": "Expense info (optional)", "fr-FR": "Infos depense (optionnel)" },
    due_date_optional: { "de-DE": "Faelligkeitsdatum (optional)", "en-US": "Due date (optional)", "en-GB": "Due date (optional)", "fr-FR": "Date d'echeance (optionnel)" },
    create_paid_expense: { "de-DE": "Bezahlte Ausgabe erstellen", "en-US": "Create paid expense", "en-GB": "Create paid expense", "fr-FR": "Creer depense payee" },
    placeholder_group_expense_info: { "de-DE": "z. B. Neue Kuechenausstattung", "en-US": "e.g. New kitchen equipment", "en-GB": "e.g. New kitchen equipment", "fr-FR": "ex. nouvel equipement de cuisine" },
    open_invitations_user: {
      "de-DE": "Offene Gruppeneinladungen fuer deinen Nutzer.",
      "en-US": "Open group invitations for your user.",
      "en-GB": "Open group invitations for your user.",
      "fr-FR": "Invitations de groupe ouvertes pour votre utilisateur."
    },
    invite_by_username: { "de-DE": "Per Nutzername einladen", "en-US": "Invite by username", "en-GB": "Invite by username", "fr-FR": "Inviter par nom d'utilisateur" },
    choose_group_for_detail: {
      "de-DE": "Waehle eine deiner Gruppen aus, um Teilnehmende und Gruppendaten zu sehen.",
      "en-US": "Select one of your groups to see participants and group data.",
      "en-GB": "Select one of your groups to see participants and group data.",
      "fr-FR": "Selectionnez un groupe pour voir participants et donnees du groupe."
    },
    choose_funding_for_detail: {
      "de-DE": "Waehle eine Finanzierung aus, um die Detailansicht zu oeffnen.",
      "en-US": "Select funding to open detail view.",
      "en-GB": "Select funding to open detail view.",
      "fr-FR": "Selectionnez un financement pour ouvrir la vue detaillee."
    },
    dashboard_title_login: { "de-DE": "FinanzApp Login", "en-US": "FinanzApp Login", "en-GB": "FinanzApp Login", "fr-FR": "Connexion FinanzApp" },
    income_short: { "de-DE": "Einnahmen", "en-US": "Income", "en-GB": "Income", "fr-FR": "Revenus" },
    expenses_short: { "de-DE": "Ausgaben", "en-US": "Expenses", "en-GB": "Expenses", "fr-FR": "Depenses" },
    salary_short: { "de-DE": "Gehalt", "en-US": "Salary", "en-GB": "Salary", "fr-FR": "Salaire" },
    freelance_short: { "de-DE": "Freelance", "en-US": "Freelance", "en-GB": "Freelance", "fr-FR": "Freelance" },
    refund_short: { "de-DE": "Rueckzahlung", "en-US": "Refund", "en-GB": "Refund", "fr-FR": "Remboursement" },
    investment_short: { "de-DE": "Kapitalertraege", "en-US": "Investment returns", "en-GB": "Investment returns", "fr-FR": "Rendements d'investissement" },
    bonus_short: { "de-DE": "Bonus", "en-US": "Bonus", "en-GB": "Bonus", "fr-FR": "Prime" },
    rent_short: { "de-DE": "Miete", "en-US": "Rent", "en-GB": "Rent", "fr-FR": "Loyer" },
    groceries_short: { "de-DE": "Lebensmittel", "en-US": "Groceries", "en-GB": "Groceries", "fr-FR": "Courses" },
    utilities_short: { "de-DE": "Nebenkosten", "en-US": "Utilities", "en-GB": "Utilities", "fr-FR": "Charges" },
    mobility_short: { "de-DE": "Mobilitaet", "en-US": "Mobility", "en-GB": "Mobility", "fr-FR": "Mobilite" },
    health_short: { "de-DE": "Gesundheit", "en-US": "Health", "en-GB": "Health", "fr-FR": "Sante" },
    leisure_short: { "de-DE": "Freizeit", "en-US": "Leisure", "en-GB": "Leisure", "fr-FR": "Loisirs" },
    other_short: { "de-DE": "Sonstiges", "en-US": "Other", "en-GB": "Other", "fr-FR": "Autre" },
    etfs_short: { "de-DE": "ETFs", "en-US": "ETFs", "en-GB": "ETFs", "fr-FR": "ETFs" },
    bank_account_select_aria_utf8: {
      "de-DE": "Bankkonto auswählen",
      "en-US": "Select bank account",
      "en-GB": "Select bank account",
      "fr-FR": "Selectionner un compte bancaire"
    },
    stock_api_limit_hint: {
      "de-DE": "Falls keine Aktienkurse angezeigt werden liegt dies an der vollständigen Auslastung des API Keys.",
      "en-US": "If no stock prices are shown, the API key is likely fully exhausted.",
      "en-GB": "If no stock prices are shown, the API key is likely fully exhausted.",
      "fr-FR": "Si aucun cours n'apparait, la cle API est probablement totalement utilisee."
    }
  };

  const tokenLookup = new Map();
  function registerToken(rawValue, key) {
    const normalized = String(rawValue || "").trim();
    if (!normalized) return;
    tokenLookup.set(normalized, key);
  }

  for (const [key, locales] of Object.entries(PHRASES)) {
    for (const value of Object.values(locales)) registerToken(value, key);
  }
  for (const [key, locales] of Object.entries(MESSAGES)) {
    for (const value of Object.values(locales)) {
      if (String(value).includes("{")) continue;
      registerToken(value, key);
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
    const key = tokenLookup.get(trimmed);
    if (!key) return source;
    const replacement =
      PHRASES[key]?.[locale] ||
      PHRASES[key]?.[DEFAULT_LOCALE] ||
      MESSAGES[key]?.[locale] ||
      MESSAGES[key]?.[DEFAULT_LOCALE] ||
      trimmed;
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
