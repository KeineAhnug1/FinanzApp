// UI-Helfer: Formatierung und kleine DOM-Werkzeuge fuer wiederverwendbare Aufgaben.
function formatMoney(value, options = {}) {
  const amount = Number(value) || 0;
  const locale = options.locale || getLocale();
  const currency = options.currency || getCurrency();
  const maxFractionDigits = Number.isFinite(options.maximumFractionDigits) ? options.maximumFractionDigits : 2;
  const minFractionDigits = Number.isFinite(options.minimumFractionDigits) ? options.minimumFractionDigits : undefined;

  if (window.FinanzAppCurrency?.formatFromEur) {
    return window.FinanzAppCurrency.formatFromEur(amount, {
      locale,
      currency,
      maximumFractionDigits: maxFractionDigits,
      minimumFractionDigits: minFractionDigits
    });
  }

  try {
    const formatOptions = {
      style: "currency",
      currency,
      maximumFractionDigits: maxFractionDigits
    };
    if (Number.isFinite(minFractionDigits)) {
      formatOptions.minimumFractionDigits = minFractionDigits;
    }
    return new Intl.NumberFormat(locale, formatOptions).format(amount);
  } catch {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2
    }).format(amount);
  }
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }).format(date);
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function setTrend(id, text, tone = "neutral") {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = text;
  node.classList.remove("positive", "neutral");
  node.classList.add(tone === "positive" ? "positive" : "neutral");
}

function setStatus(statusId, type, text) {
  const node = document.getElementById(statusId);
  if (!node) return;
  node.textContent = text;
  node.classList.remove("is-success", "is-error");
  if (type === "success") node.classList.add("is-success");
  if (type === "error") node.classList.add("is-error");
}

function recurrenceLabel(recurrence) {
  if (recurrence === "weekly") return "Woechentlich";
  if (recurrence === "monthly") return "Monatlich";
  return "Einmalig";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function entryMatchesQuery(entry, query, dateField) {
  if (!query) return true;
  const haystack = [
    entry.source,
    entry.category,
    entry.note,
    entry[dateField] ? formatDate(entry[dateField]) : "",
    recurrenceLabel(entry.recurrence)
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function compareDescKey(a, b) {
  if (a === "unknown") return 1;
  if (b === "unknown") return -1;
  return b.localeCompare(a);
}
