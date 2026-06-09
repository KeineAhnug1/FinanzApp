// UI-Helfer: Formatierung und kleine DOM-Werkzeuge fuer wiederverwendbare Aufgaben.
import { getLocale } from "./runtime.js";
import { formatFromEur } from "@shared/js/currency-utils.js";
import { toastSuccess, toastError } from "@shared/js/api-client.js";

export function formatMoney(value, options = {}) {
  const amount = Number(value) || 0;
  const locale = options.locale || getLocale();
  const maxFractionDigits = Number.isFinite(options.maximumFractionDigits)
    ? options.maximumFractionDigits
    : 2;
  const minFractionDigits = Number.isFinite(options.minimumFractionDigits)
    ? options.minimumFractionDigits
    : undefined;

  return formatFromEur(amount, {
    locale,
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: minFractionDigits,
  });
}

export function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: "medium" }).format(date);
}

export function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

export function setTrend(id, text, tone = "neutral") {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = text;
  node.classList.remove("positive", "neutral");
  node.classList.add(tone === "positive" ? "positive" : "neutral");
}

export function setStatus(statusId, type, text) {
  const node = document.getElementById(statusId);
  if (!node) return;
  node.textContent = text;
  node.classList.remove("is-success", "is-error");
  if (type === "success") {
    node.classList.add("is-success");
    if (text) toastSuccess(text);
  }
  if (type === "error") {
    node.classList.add("is-error");
    if (text) toastError(text);
  }
}

export function cycleLabel(cycle) {
  if (cycle === "weekly") return "Woechentlich";
  if (cycle === "monthly") return "Monatlich";
  if (cycle === "yearly") return "Jaehrlich";
  return "Einmalig";
}

export function recurrenceLabel(entry) {
  if (entry.cycle === "once") return cycleLabel("once");
  const label = cycleLabel(entry.cycle);
  if (entry.recurrence == null || entry.recurrence === 0) return label;
  return `${label} (${entry.recurrence}x)`;
}

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function normalizeSearch(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function setButtonLoading(buttonEl, isLoading) {
  if (!buttonEl) return;
  if (isLoading) {
    buttonEl.disabled = true;
    buttonEl.classList.add("btn-loading");
  } else {
    buttonEl.disabled = false;
    buttonEl.classList.remove("btn-loading");
  }
}

export function initInlineValidation(formEl) {
  if (!formEl) return;
  const inputs = formEl.querySelectorAll("input[required], select[required], textarea[required]");
  for (const input of inputs) {
    input.addEventListener("blur", () => input.classList.add("touched"));
  }
  formEl.addEventListener("submit", () => {
    for (const input of inputs) input.classList.add("touched");
  });
  formEl.addEventListener("reset", () => {
    for (const input of inputs) input.classList.remove("touched");
  });
}
