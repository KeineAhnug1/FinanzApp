// Uebersicht: Gruppierung/Rendering der Listen sowie Cashflow- und KPI-Berechnung.
import {
  appState,
  listState,
  cashflowChartState,
  overviewDistributionState,
  CATEGORY_LABELS,
} from "./state.js";
import { getLocale } from "./runtime.js";
import {
  formatMoney,
  formatDate,
  escapeHtml,
  normalizeSearch,
  recurrenceLabel,
  setText,
  setTrend,
} from "./helpers.js";
import { categoryLabel } from "./categories-controls.js";
import { t as sharedT } from "@shared/js/language-utils.js";

function cashflowT(key, fallback, params = {}) {
  const translated = sharedT(key, params);
  if (translated && translated !== key) return translated;
  if (!params || !Object.keys(params).length) return fallback;
  return String(fallback || "").replaceAll(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}

function entryMatchesQuery(entry, query, dateField) {
  if (!query) return true;
  const haystack = [
    entry.source,
    entry.category,
    entry.note,
    entry[dateField] ? formatDate(entry[dateField]) : "",
    recurrenceLabel(entry),
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

function buildHierarchicalGroups(entries, dateField) {
  const yearMap = new Map();

  for (const entry of entries) {
    const date = new Date(entry[dateField]);
    const yearKey = Number.isNaN(date.getTime()) ? "unknown" : String(date.getFullYear());
    const monthKey = Number.isNaN(date.getTime())
      ? "unknown"
      : monthKeyFromDate(new Date(date.getFullYear(), date.getMonth(), 1));
    const dayKey = Number.isNaN(date.getTime())
      ? "unknown"
      : dayKeyFromValue(entry[dateField]) || "unknown";

    if (!yearMap.has(yearKey)) {
      yearMap.set(yearKey, new Map());
    }
    const monthMap = yearMap.get(yearKey);

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, new Map());
    }
    const dayMap = monthMap.get(monthKey);

    if (!dayMap.has(dayKey)) {
      dayMap.set(dayKey, []);
    }
    dayMap.get(dayKey).push(entry);
  }

  return Array.from(yearMap.entries())
    .sort((a, b) => compareDescKey(a[0], b[0]))
    .map(([yearKey, monthMap]) => {
      const months = Array.from(monthMap.entries())
        .sort((a, b) => compareDescKey(a[0], b[0]))
        .map(([monthKey, dayMap]) => {
          const days = Array.from(dayMap.entries())
            .sort((a, b) => compareDescKey(a[0], b[0]))
            .map(([dayKey, dayEntries]) => ({
              key: dayKey,
              label:
                dayKey === "unknown"
                  ? cashflowT("without_date", "Ohne Datum")
                  : dayLabelFromKey(dayKey),
              entries: dayEntries,
              count: dayEntries.length,
              total: dayEntries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
            }));
          const monthEntries = days.flatMap((day) => day.entries);
          return {
            key: monthKey,
            label:
              monthKey === "unknown"
                ? cashflowT("without_month", "Ohne Monat")
                : monthLongLabelFromKey(monthKey),
            days,
            count: monthEntries.length,
            total: monthEntries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
          };
        });
      const yearEntries = months.flatMap((month) => month.days.flatMap((day) => day.entries));
      return {
        key: yearKey,
        label: yearKey === "unknown" ? cashflowT("cashflow.without_year", "Ohne Jahr") : yearKey,
        months,
        count: yearEntries.length,
        total: yearEntries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
      };
    });
}

function renderIncomeItem(entry) {
  const bankAccountLabel =
    appState.bankAccounts.find((account) => String(account.id) === String(entry.bank_account_id))
      ?.label || "";
  return `
    <li class="income-item" data-entry-id="${entry.id}">
      <div class="income-topline">
        <div>
          <span class="income-source">${escapeHtml(entry.source)}</span>
          <div class="income-tags">
            <span class="income-tag">${escapeHtml(categoryLabel(entry.category))}</span>
            ${bankAccountLabel ? `<span class="income-tag">${escapeHtml(bankAccountLabel)}</span>` : ""}
            <span class="income-tag">${recurrenceLabel(entry)}</span>
            ${
              entry.cycle !== "once"
                ? `<span class="income-tag">${entry.state === "completed" ? cashflowT("cashflow.completed", "Abgeschlossen") : entry.is_active ? cashflowT("cashflow.active", "Aktiv") : cashflowT("cashflow.paused", "Pausiert")}</span>`
                : ""
            }
          </div>
        </div>
        <span class="income-amount">${formatMoney(entry.amount)}</span>
      </div>
      <p class="income-meta">${formatDate(entry.received_at)}</p>
      ${entry.note ? `<p class="income-note">${escapeHtml(entry.note)}</p>` : ""}
      <div class="income-actions-inline">
        <button class="inline-action" type="button" data-action="edit" data-entry-id="${entry.id}">${cashflowT("edit", "Bearbeiten")}</button>
        <button class="inline-action delete" type="button" data-action="delete" data-entry-id="${entry.id}">${cashflowT("delete", "Löschen")}</button>
      </div>
    </li>
  `;
}

function renderExpenseItem(entry) {
  const bankAccountLabel =
    appState.bankAccounts.find((account) => String(account.id) === String(entry.bank_account_id))
      ?.label || "";
  return `
    <li class="income-item" data-entry-id="${entry.id}">
      <div class="income-topline">
        <div>
          <span class="income-source">${escapeHtml(entry.source || entry.category || cashflowT("expense", "Ausgabe"))}</span>
          <div class="income-tags">
            <span class="income-tag">${escapeHtml(categoryLabel(entry.category))}</span>
            ${bankAccountLabel ? `<span class="income-tag">${escapeHtml(bankAccountLabel)}</span>` : ""}
            <span class="income-tag">${recurrenceLabel(entry)}</span>
            ${
              entry.cycle !== "once"
                ? `<span class="income-tag">${entry.state === "completed" ? cashflowT("cashflow.completed", "Abgeschlossen") : entry.is_active ? cashflowT("cashflow.active", "Aktiv") : cashflowT("cashflow.paused", "Pausiert")}</span>`
                : ""
            }
          </div>
        </div>
        <span class="income-amount is-expense">${formatMoney(entry.amount)}</span>
      </div>
      <p class="income-meta">${formatDate(entry.spent_at)}</p>
      ${entry.note ? `<p class="income-note">${escapeHtml(entry.note)}</p>` : ""}
      <div class="income-actions-inline">
        <button class="inline-action" type="button" data-expense-action="edit" data-entry-id="${entry.id}">${cashflowT("edit", "Bearbeiten")}</button>
        <button class="inline-action delete" type="button" data-expense-action="delete" data-entry-id="${entry.id}">${cashflowT("delete", "Löschen")}</button>
      </div>
    </li>
  `;
}

function renderGroupedEntryList(list, grouped, expandedSet, renderer, emptyMessage) {
  if (!list) return;
  if (!grouped.length) {
    list.innerHTML = `<li><p class="income-empty">${escapeHtml(emptyMessage)}</p></li>`;
    return;
  }

  list.innerHTML = grouped
    .map((yearGroup) => {
      const yearOpen = expandedSet.has(`year:${yearGroup.key}`);
      return `
        <li class="month-group-item">
          <details class="year-group" data-group-key="year:${yearGroup.key}" ${yearOpen ? "open" : ""}>
            <summary class="month-summary">
              <span class="month-title">${escapeHtml(yearGroup.label)}</span>
              <span class="month-meta">${yearGroup.count} ${cashflowT("entries", "Eintraege")} • ${escapeHtml(formatMoney(yearGroup.total))}</span>
            </summary>
            <div class="year-content">
              ${yearGroup.months
                .map((monthGroup) => {
                  const monthOpen = expandedSet.has(`month:${monthGroup.key}`);
                  return `
                    <details class="month-group" data-group-key="month:${monthGroup.key}" ${monthOpen ? "open" : ""}>
                      <summary class="month-summary">
                        <span class="month-title">${escapeHtml(monthGroup.label)}</span>
                        <span class="month-meta">${monthGroup.count} ${cashflowT("entries", "Eintraege")} • ${escapeHtml(formatMoney(monthGroup.total))}</span>
                      </summary>
                      <ul class="month-entry-list">
                        ${monthGroup.days
                          .map((dayGroup) => {
                            const dayOpen = expandedSet.has(`day:${dayGroup.key}`);
                            return `
                              <li>
                                <details class="day-group" data-group-key="day:${dayGroup.key}" ${dayOpen ? "open" : ""}>
                                  <summary class="day-summary">
                                    <span class="day-title">${escapeHtml(dayGroup.label)}</span>
                                    <span class="month-meta">${dayGroup.count} ${cashflowT("entries", "Eintraege")} • ${escapeHtml(formatMoney(dayGroup.total))}</span>
                                  </summary>
                                  <ul class="month-entry-list">
                                    ${dayGroup.entries.map((entry) => renderer(entry)).join("")}
                                  </ul>
                                </details>
                              </li>
                            `;
                          })
                          .join("")}
                      </ul>
                    </details>
                  `;
                })
                .join("")}
            </div>
          </details>
        </li>
      `;
    })
    .join("");
}

export function renderIncomeList(entries) {
  const list = document.getElementById("income-list");
  if (!list) return;
  const query = normalizeSearch(listState.incomeSearch);
  const filtered = entries.filter((entry) => entryMatchesQuery(entry, query, "received_at"));
  const grouped = buildHierarchicalGroups(filtered, "received_at");
  const emptyMessage = query
    ? cashflowT("income.none_for_search", "Keine Einnahmen fuer diese Suche gefunden.")
    : cashflowT("income.none_yet", "Noch keine Einnahmen eingetragen.");
  renderGroupedEntryList(
    list,
    grouped,
    listState.incomeExpandedGroups,
    renderIncomeItem,
    emptyMessage
  );
}

export function renderExpenseList(entries) {
  const list = document.getElementById("expense-list");
  if (!list) return;
  const query = normalizeSearch(listState.expenseSearch);
  const filtered = entries.filter((entry) => entryMatchesQuery(entry, query, "spent_at"));
  const grouped = buildHierarchicalGroups(filtered, "spent_at");
  const emptyMessage = query
    ? cashflowT("expense.none_for_search", "Keine Ausgaben fuer diese Suche gefunden.")
    : cashflowT("expense.none_yet", "Noch keine Ausgaben eingetragen.");
  renderGroupedEntryList(
    list,
    grouped,
    listState.expenseExpandedGroups,
    renderExpenseItem,
    emptyMessage
  );
}

function recurrenceMonthlyContribution(entry) {
  const amount = Number(entry.amount) || 0;
  if (entry.state === "completed") return 0;
  if (entry.cycle === "monthly") return entry.is_active ? amount : 0;
  if (entry.cycle === "weekly") return entry.is_active ? amount * 4.33 : 0;
  if (entry.cycle === "yearly") return entry.is_active ? amount / 12 : 0;
  return 0;
}

function isDateInCurrentMonth(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function monthKeyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthKeyFromValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return monthKeyFromDate(date);
}

export function monthLabelFromKey(key) {
  const [yearRaw, monthRaw] = String(key).split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat(getLocale(), { month: "short" }).format(date).replace(".", "");
}

function monthLongLabelFromKey(key) {
  const [yearRaw, monthRaw] = String(key).split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat(getLocale(), { month: "long", year: "numeric" }).format(date);
}

function monthShortYearLabelFromKey(key) {
  const [yearRaw, monthRaw] = String(key).split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat(getLocale(), { month: "short", year: "2-digit" })
    .format(date)
    .replace(".", "");
}

function dayKeyFromValue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayLabelFromKey(key) {
  const [yearRaw, monthRaw, dayRaw] = String(key).split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat(getLocale(), {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function recentMonthKeys(count) {
  const now = new Date();
  const keys = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    keys.push(monthKeyFromDate(date));
  }
  return keys;
}

function monthDateFromKey(key) {
  const [yearRaw, monthRaw] = String(key).split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const date = new Date(year, month - 1, 1);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildMonthRangeKeys(startDate, endDate) {
  const keys = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  while (cursor <= end) {
    keys.push(monthKeyFromDate(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

function buildMonthKeysForYear(yearKey) {
  const year = Number(yearKey);
  if (!Number.isFinite(year)) return [];
  const keys = [];
  for (let month = 1; month <= 12; month += 1) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
  }
  return keys;
}

function timelineKeysForChart(incomeEntries, expenseEntries) {
  const points = [];
  for (const entry of incomeEntries) {
    const date = new Date(entry.received_at);
    if (!Number.isNaN(date.getTime())) points.push(date);
  }
  for (const entry of expenseEntries) {
    const date = new Date(entry.spent_at);
    if (!Number.isNaN(date.getTime())) points.push(date);
  }

  const now = new Date();
  const currentYear = now.getFullYear();
  const createdAt = new Date(appState.user?.created_at || "");
  const createdYear = Number.isNaN(createdAt.getTime()) ? null : createdAt.getFullYear();
  const minEntryYear = points.length ? Math.min(...points.map((date) => date.getFullYear())) : null;
  const maxEntryYear = points.length ? Math.max(...points.map((date) => date.getFullYear())) : null;

  const startYear = Number.isFinite(createdYear)
    ? createdYear
    : Number.isFinite(minEntryYear)
      ? minEntryYear
      : currentYear;
  const FUTURE_YEARS_AHEAD = 3;
  const endYearBase = Math.max(
    currentYear,
    Number.isFinite(maxEntryYear) ? maxEntryYear : currentYear,
    startYear
  );
  const endYear = endYearBase + FUTURE_YEARS_AHEAD;

  const keys = [];
  for (let year = startYear; year <= endYear; year += 1) {
    keys.push(String(year));
  }
  return keys;
}

function buildYearlyTotals(entries, yearKeys, dateField) {
  const monthKeys = yearKeys.flatMap((yearKey) => buildMonthKeysForYear(yearKey));
  const monthlyTotals = buildMonthlyTotals(entries, monthKeys, dateField);
  const yearlyTotals = Object.fromEntries(yearKeys.map((key) => [key, 0]));
  for (const yearKey of yearKeys) {
    const months = buildMonthKeysForYear(yearKey);
    yearlyTotals[yearKey] = Number(
      months.reduce((sum, monthKey) => sum + (monthlyTotals[monthKey] || 0), 0).toFixed(2)
    );
  }
  return yearlyTotals;
}

function niceStep(range, targetTicks = 5) {
  const rough = Math.max(1, range / targetTicks);
  const power = 10 ** Math.floor(Math.log10(rough));
  const scaled = rough / power;
  if (scaled <= 1) return 1 * power;
  if (scaled <= 2) return 2 * power;
  if (scaled <= 5) return 5 * power;
  return 10 * power;
}

function formatAxisMoney(value) {
  return formatMoney(value, { maximumFractionDigits: 0, minimumFractionDigits: 0 });
}

function buildMonthlyTotals(entries, keys, dateField) {
  const totals = Object.fromEntries(keys.map((key) => [key, 0]));

  for (const entry of entries) {
    const amount = Number(entry.amount) || 0;
    if (amount <= 0) continue;

    if (entry.cycle === "once") {
      const key = monthKeyFromValue(entry[dateField]);
      if (key && Object.prototype.hasOwnProperty.call(totals, key)) {
        totals[key] += amount;
      }
      continue;
    }

    const monthlyEquivalent = recurrenceMonthlyContribution(entry);
    if (monthlyEquivalent <= 0) continue;

    const startKey = monthKeyFromValue(entry[dateField]) || keys[0];
    for (const key of keys) {
      if (key >= startKey) totals[key] += monthlyEquivalent;
    }
  }

  return totals;
}

export function getMonthlyTotal(entries, dateField) {
  const oneTime = entries
    .filter((entry) => entry.cycle === "once" && isDateInCurrentMonth(entry[dateField]))
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

  const recurring = entries.reduce((sum, entry) => sum + recurrenceMonthlyContribution(entry), 0);
  return Number((oneTime + recurring).toFixed(2));
}

function buildIncomeSeries(keys, incomeEntries) {
  return buildMonthlyTotals(incomeEntries, keys, "received_at");
}

function dayKeyFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayDateFromKey(key) {
  const [yearRaw, monthRaw, dayRaw] = String(key).split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
    return null;
  return date;
}

function dayShortLabelFromKey(key) {
  const date = dayDateFromKey(key);
  if (!date) return key;
  return new Intl.DateTimeFormat(getLocale(), { day: "2-digit" }).format(date);
}

function buildDayKeysForMonth(monthKey) {
  const monthDate = monthDateFromKey(monthKey);
  if (!monthDate) return [];
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const keys = [];
  for (let day = 1; day <= lastDay; day += 1) {
    keys.push(dayKeyFromDate(new Date(year, month, day)));
  }
  return keys.filter(Boolean);
}

function buildHourKeysForDay(dayKey) {
  if (!dayDateFromKey(dayKey)) return [];
  const keys = [];
  for (let hour = 0; hour < 24; hour += 1) {
    keys.push(`${dayKey}T${String(hour).padStart(2, "0")}`);
  }
  return keys;
}

function hourLabelFromKey(key) {
  const [, hourRaw] = String(key).split("T");
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return key;
  return `${String(hour).padStart(2, "0")}:00`;
}

function hourShortLabelFromKey(key) {
  const [, hourRaw] = String(key).split("T");
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return key;
  return String(hour).padStart(2, "0");
}

function buildDailyTotals(entries, dayKeys, dateField) {
  const totals = Object.fromEntries(dayKeys.map((key) => [key, 0]));
  if (!dayKeys.length) return totals;

  const rangeStart = dayDateFromKey(dayKeys[0]);
  const rangeEnd = dayDateFromKey(dayKeys[dayKeys.length - 1]);
  if (!rangeStart || !rangeEnd) return totals;

  const rangeStartTime = rangeStart.getTime();
  const rangeEndTime = rangeEnd.getTime();
  const rangeMonthKey = monthKeyFromDate(rangeStart);

  for (const entry of entries) {
    const amount = Number(entry.amount) || 0;
    if (amount <= 0) continue;

    const startDate = new Date(entry[dateField]);
    if (Number.isNaN(startDate.getTime())) continue;
    const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const recurrence = String(entry.cycle || "once");

    if (recurrence === "once") {
      const key = dayKeyFromDate(startDay);
      if (key && Object.prototype.hasOwnProperty.call(totals, key)) totals[key] += amount;
      continue;
    }

    if (!entry.is_active) continue;

    if (recurrence === "weekly") {
      let cursor = new Date(startDay);
      while (cursor.getTime() < rangeStartTime) {
        cursor.setDate(cursor.getDate() + 7);
      }
      while (cursor.getTime() <= rangeEndTime) {
        const key = dayKeyFromDate(cursor);
        if (key && Object.prototype.hasOwnProperty.call(totals, key)) totals[key] += amount;
        cursor.setDate(cursor.getDate() + 7);
      }
      continue;
    }

    if (recurrence === "monthly") {
      const startMonthKey = monthKeyFromDate(startDay);
      if (rangeMonthKey < startMonthKey) continue;

      const monthDate = monthDateFromKey(rangeMonthKey);
      if (!monthDate) continue;
      const year = monthDate.getFullYear();
      const month = monthDate.getMonth();
      const daysInTargetMonth = new Date(year, month + 1, 0).getDate();
      const targetDay = Math.min(startDay.getDate(), daysInTargetMonth);
      const occurrence = new Date(year, month, targetDay);

      if (
        monthKeyFromDate(occurrence) === startMonthKey &&
        occurrence.getTime() < startDay.getTime()
      )
        continue;
      const key = dayKeyFromDate(occurrence);
      if (key && Object.prototype.hasOwnProperty.call(totals, key)) totals[key] += amount;
      continue;
    }

    if (recurrence === "yearly") {
      const monthDate = monthDateFromKey(rangeMonthKey);
      if (!monthDate) continue;
      const year = monthDate.getFullYear();
      const daysInTargetMonth = new Date(year, startDay.getMonth() + 1, 0).getDate();
      const targetDay = Math.min(startDay.getDate(), daysInTargetMonth);
      const occurrence = new Date(year, startDay.getMonth(), targetDay);
      if (occurrence.getTime() < startDay.getTime()) continue;
      const key = dayKeyFromDate(occurrence);
      if (key && Object.prototype.hasOwnProperty.call(totals, key)) totals[key] += amount;
    }
  }

  return totals;
}

function buildHourlyTotals(entries, hourKeys, dateField, selectedDayKey) {
  const totals = Object.fromEntries(hourKeys.map((key) => [key, 0]));
  if (!hourKeys.length || !selectedDayKey) return totals;
  const selectedDay = dayDateFromKey(selectedDayKey);
  if (!selectedDay) return totals;
  const selectedMonthKey = monthKeyFromDate(selectedDay);

  for (const entry of entries) {
    const amount = Number(entry.amount) || 0;
    if (amount <= 0) continue;

    const entryDate = new Date(entry[dateField]);
    if (Number.isNaN(entryDate.getTime())) continue;
    const startDay = new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate());
    const recurrence = String(entry.cycle || "once");

    if (recurrence === "once") {
      const entryDayKey = dayKeyFromDate(startDay);
      if (entryDayKey !== selectedDayKey) continue;
      const hour = entryDate.getHours();
      const key = `${selectedDayKey}T${String(hour).padStart(2, "0")}`;
      if (Object.prototype.hasOwnProperty.call(totals, key)) totals[key] += amount;
      continue;
    }

    if (!entry.is_active) continue;

    let occursToday = false;
    if (recurrence === "weekly") {
      if (selectedDay.getTime() >= startDay.getTime()) {
        const diffDays = Math.floor(
          (selectedDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)
        );
        occursToday = diffDays % 7 === 0;
      }
    } else if (recurrence === "monthly") {
      const daysInSelectedMonth = new Date(
        selectedDay.getFullYear(),
        selectedDay.getMonth() + 1,
        0
      ).getDate();
      const targetDay = Math.min(startDay.getDate(), daysInSelectedMonth);
      occursToday =
        selectedDay.getDate() === targetDay &&
        isMonthlyOccurrenceInMonth(startDay, selectedMonthKey);
    } else if (recurrence === "yearly") {
      occursToday =
        selectedDay.getMonth() === startDay.getMonth() &&
        selectedDay.getDate() === startDay.getDate() &&
        selectedDay.getTime() >= startDay.getTime();
    }

    if (!occursToday) continue;
    const recurringKey = `${selectedDayKey}T00`;
    if (Object.prototype.hasOwnProperty.call(totals, recurringKey)) totals[recurringKey] += amount;
  }

  return totals;
}

function chartLevelTitle(view) {
  if (view.level === "year") {
    return `${view.selectedYear} (${cashflowT("common.month", "Monat")})`;
  }
  if (view.level === "month") {
    return `${monthLongLabelFromKey(view.selectedMonthKey)} (Tage)`;
  }
  if (view.level === "day") {
    return `${cashflowT("cashflow.day_view", "Tagesansicht")}: ${dayLabelFromKey(view.selectedDayKey)}`;
  }
  return cashflowT("cashflow.overall_year_view", "Gesamtverlauf (Jahre)");
}

function chartLevelHint(view) {
  if (view.level === "year") {
    return cashflowT(
      "cashflow.hint_click_month",
      "Klicke auf einen Monat, um genauer reinzuzoomen."
    );
  }
  if (view.level === "month") {
    return cashflowT("cashflow.hint_click_day", "Klicke auf einen Tag fuer die Tagesansicht.");
  }
  if (view.level === "day") {
    return cashflowT(
      "cashflow.hint_day_hours",
      "Tagesansicht zeigt stundenweise Werte (00-23 Uhr)."
    );
  }
  return cashflowT("cashflow.hint_click_year", "Klicke auf ein Jahr, um die Monate zu sehen.");
}

function chartLabelForKey(level, key) {
  if (level === "timeline") return key;
  if (level === "year") return monthLongLabelFromKey(key);
  if (level === "day") return hourLabelFromKey(key);
  return dayLabelFromKey(key);
}

function resolveCashflowViewState(incomeEntries, expenseEntries) {
  const timelineKeys = timelineKeysForChart(incomeEntries, expenseEntries);
  const timelineSet = new Set(timelineKeys);
  const state = cashflowChartState || {
    level: "timeline",
    selectedYear: "",
    selectedMonthKey: "",
    selectedDayKey: "",
  };
  let level = state.level;
  let selectedYear = state.selectedYear;
  let selectedMonthKey = state.selectedMonthKey;
  let selectedDayKey = state.selectedDayKey;

  if (!selectedYear && selectedMonthKey) selectedYear = String(selectedMonthKey).split("-")[0];
  if (
    (level === "year" || level === "month" || level === "day") &&
    !timelineSet.has(selectedYear)
  ) {
    level = "timeline";
    selectedYear = "";
    selectedMonthKey = "";
    selectedDayKey = "";
  }

  if (level === "timeline") {
    state.level = "timeline";
    state.selectedYear = "";
    state.selectedMonthKey = "";
    state.selectedDayKey = "";
    return {
      level: "timeline",
      keyType: "year",
      keys: timelineKeys,
      selectedYear: "",
      selectedMonthKey: "",
      selectedDayKey: "",
    };
  }

  const monthKeys = buildMonthKeysForYear(selectedYear);
  if (!monthKeys.length) {
    state.level = "timeline";
    state.selectedYear = "";
    state.selectedMonthKey = "";
    state.selectedDayKey = "";
    return {
      level: "timeline",
      keyType: "year",
      keys: timelineKeys,
      selectedYear: "",
      selectedMonthKey: "",
      selectedDayKey: "",
    };
  }

  if (level === "year") {
    state.level = "year";
    state.selectedYear = selectedYear;
    state.selectedMonthKey = "";
    state.selectedDayKey = "";
    return {
      level: "year",
      keyType: "month",
      keys: monthKeys,
      selectedYear,
      selectedMonthKey: "",
      selectedDayKey: "",
    };
  }

  if (!monthKeys.includes(selectedMonthKey)) selectedMonthKey = monthKeys[0];
  const dayKeys = buildDayKeysForMonth(selectedMonthKey);
  if (!dayKeys.length) {
    state.level = "year";
    state.selectedYear = selectedYear;
    state.selectedMonthKey = "";
    state.selectedDayKey = "";
    return {
      level: "year",
      keyType: "month",
      keys: monthKeys,
      selectedYear,
      selectedMonthKey: "",
      selectedDayKey: "",
    };
  }

  if (level === "month") {
    state.level = "month";
    state.selectedYear = selectedYear;
    state.selectedMonthKey = selectedMonthKey;
    state.selectedDayKey = "";
    return {
      level: "month",
      keyType: "day",
      keys: dayKeys,
      selectedYear,
      selectedMonthKey,
      selectedDayKey: "",
    };
  }

  if (!dayKeys.includes(selectedDayKey)) {
    selectedDayKey = dayKeys[0];
  }

  state.level = "day";
  state.selectedYear = selectedYear;
  state.selectedMonthKey = selectedMonthKey;
  state.selectedDayKey = selectedDayKey;
  return {
    level: "day",
    keyType: "hour",
    keys: buildHourKeysForDay(selectedDayKey),
    selectedYear,
    selectedMonthKey,
    selectedDayKey,
  };
}

function buildSeriesForView(view, incomeEntries, expenseEntries) {
  if (view.keyType === "year") {
    const incomeTotals = buildYearlyTotals(incomeEntries, view.keys, "received_at");
    const expenseTotals = buildYearlyTotals(expenseEntries, view.keys, "spent_at");
    return {
      incomeValues: view.keys.map((key) => Number((incomeTotals[key] || 0).toFixed(2))),
      expenseValues: view.keys.map((key) => Number((expenseTotals[key] || 0).toFixed(2))),
    };
  }

  if (view.keyType === "month") {
    const incomeTotals = buildIncomeSeries(view.keys, incomeEntries);
    const expenseTotals = buildMonthlyTotals(expenseEntries, view.keys, "spent_at");
    return {
      incomeValues: view.keys.map((key) => Number((incomeTotals[key] || 0).toFixed(2))),
      expenseValues: view.keys.map((key) => Number((expenseTotals[key] || 0).toFixed(2))),
    };
  }

  if (view.keyType === "hour") {
    const hourlyIncomeTotals = buildHourlyTotals(
      incomeEntries,
      view.keys,
      "received_at",
      view.selectedDayKey
    );
    const hourlyExpenseTotals = buildHourlyTotals(
      expenseEntries,
      view.keys,
      "spent_at",
      view.selectedDayKey
    );
    return {
      incomeValues: view.keys.map((key) => Number((hourlyIncomeTotals[key] || 0).toFixed(2))),
      expenseValues: view.keys.map((key) => Number((hourlyExpenseTotals[key] || 0).toFixed(2))),
    };
  }

  const incomeTotals = buildDailyTotals(incomeEntries, view.keys, "received_at");
  const expenseTotals = buildDailyTotals(expenseEntries, view.keys, "spent_at");
  return {
    incomeValues: view.keys.map((key) => Number((incomeTotals[key] || 0).toFixed(2))),
    expenseValues: view.keys.map((key) => Number((expenseTotals[key] || 0).toFixed(2))),
  };
}

function polylinePoints(values, xForIndex, yForValue, options = {}) {
  const { startX = null } = options;
  const points = values.map((value, index) => `${xForIndex(index)},${yForValue(value)}`);
  if (points.length && Number.isFinite(startX)) {
    points.unshift(`${startX},${yForValue(values[0])}`);
  }
  return points.join(" ");
}

function renderCashflowBars(incomeEntries, expenseEntries) {
  const container = document.getElementById("cashflow-bars");
  if (!container) return;

  const view = resolveCashflowViewState(incomeEntries, expenseEntries);
  const { keys } = view;
  const { incomeValues, expenseValues } = buildSeriesForView(view, incomeEntries, expenseEntries);
  const savingsValues = keys.map((_, index) =>
    Number((incomeValues[index] - expenseValues[index]).toFixed(2))
  );
  const allValues = incomeValues.concat(expenseValues).concat(savingsValues);
  const maxValue = Math.max(...allValues, 0);
  const minValue = Math.min(...allValues, 0);
  const range = Math.max(1, maxValue - minValue);
  const isEmptySeries = maxValue === 0 && minValue === 0;

  const chartTitle = chartLevelTitle(view);
  const chartHint = chartLevelHint(view);
  const showBackToMonth = view.level === "day";
  const showBackToYear = view.level === "month";
  const showBackToTimeline =
    view.level === "year" || view.level === "month" || view.level === "day";

  const height = 280;
  const padLeft = 0;
  const padRight = 28;
  const padTop = 18;
  const padBottom = 44;
  const slotWidth =
    view.keyType === "year"
      ? 130
      : view.keyType === "month"
        ? 84
        : view.keyType === "hour"
          ? 36
          : 42;
  const minWidth =
    view.keyType === "year"
      ? 640
      : view.keyType === "month"
        ? 900
        : view.keyType === "hour"
          ? 860
          : 640;
  const width = Math.max(minWidth, padLeft + padRight + Math.max(keys.length - 1, 1) * slotWidth);
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const yStep = niceStep(range, 6);
  let yMin = Math.floor(minValue / yStep) * yStep;
  let yMax = Math.ceil(maxValue / yStep) * yStep;
  yMin = Math.min(yMin, 0);
  yMax = Math.max(yMax, 0);
  if (yMin === yMax) yMax = yMin + yStep;
  const yRange = Math.max(1, yMax - yMin);

  const firstPointOffset = 28;
  const effectiveWidth = Math.max(1, plotWidth - firstPointOffset);
  const xForIndex = (index) =>
    padLeft + firstPointOffset + (index * effectiveWidth) / Math.max(keys.length - 1, 1);
  const yForValue = (value) => padTop + ((yMax - value) / yRange) * plotHeight;
  const zeroY = yForValue(0);

  const ticks = [];
  for (let tick = yMin; tick <= yMax + yStep / 2; tick += yStep) {
    ticks.push(Number(tick.toFixed(2)));
  }

  const yGridLines = ticks
    .map((tick) => {
      const y = yForValue(tick);
      return `
        <line class="cashflow-grid" x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}"></line>
      `;
    })
    .join("");
  const yAxisLabels = ticks
    .map((tick) => {
      const y = yForValue(tick);
      return `<span class="cashflow-y-axis-label" style="top:${y}px">${escapeHtml(formatAxisMoney(tick))}</span>`;
    })
    .join("");

  const incomePolyline = polylinePoints(incomeValues, xForIndex, yForValue, { startX: padLeft });
  const expensePolyline = polylinePoints(expenseValues, xForIndex, yForValue, { startX: padLeft });
  const savingsPolyline = polylinePoints(savingsValues, xForIndex, yForValue, { startX: padLeft });

  const labels = keys
    .map((key, index) => {
      return `
        <text class="cashflow-x-label" x="${xForIndex(index)}" y="${height - 10}" text-anchor="middle">
        ${escapeHtml(
          view.keyType === "year"
            ? key
            : view.keyType === "month"
              ? monthShortYearLabelFromKey(key)
              : view.keyType === "hour"
                ? hourShortLabelFromKey(key)
                : dayShortLabelFromKey(key)
        )}
      </text>
    `;
    })
    .join("");

  const savingsDots = savingsValues
    .map(
      (value, index) =>
        `<circle class="cashflow-point-savings" data-point-index="${index}" cx="${xForIndex(index)}" cy="${yForValue(value)}" r="2.8"></circle>`
    )
    .join("");

  const incomeDotsWithIndex = incomeValues
    .map(
      (value, index) =>
        `<circle class="cashflow-point-income" data-point-index="${index}" cx="${xForIndex(index)}" cy="${yForValue(value)}" r="2.8"></circle>`
    )
    .join("");
  const expenseDotsWithIndex = expenseValues
    .map(
      (value, index) =>
        `<circle class="cashflow-point-expense" data-point-index="${index}" cx="${xForIndex(index)}" cy="${yForValue(value)}" r="2.8"></circle>`
    )
    .join("");

  const hoverZones = keys
    .map((_, index) => {
      const center = xForIndex(index);
      const left = index === 0 ? padLeft : (xForIndex(index - 1) + center) / 2;
      const right =
        index === keys.length - 1 ? width - padRight : (center + xForIndex(index + 1)) / 2;
      const zoneWidth = Math.max(8, right - left);
      const zoneClass = view.level === "day" ? "cashflow-hitzone" : "cashflow-hitzone is-drillable";
      return `<rect class="${zoneClass}" data-hover-index="${index}" x="${left}" y="${padTop}" width="${zoneWidth}" height="${plotHeight}"></rect>`;
    })
    .join("");

  const firstLabel = chartLabelForKey(view.level, keys[0]);
  const lastLabel = chartLabelForKey(view.level, keys[keys.length - 1]);
  container.setAttribute("aria-label", `Cashflow Verlauf von ${firstLabel} bis ${lastLabel}`);

  const actionButtons = [
    showBackToMonth
      ? `<button class="cashflow-drilldown-btn" type="button" data-cashflow-action="back-month">${cashflowT("cashflow.back_month", "Zur Monatsansicht")}</button>`
      : "",
    showBackToYear
      ? `<button class="cashflow-drilldown-btn" type="button" data-cashflow-action="back-year">${cashflowT("cashflow.back_year", "Zur Jahresansicht")}</button>`
      : "",
    showBackToTimeline
      ? `<button class="cashflow-drilldown-btn" type="button" data-cashflow-action="back-timeline">${cashflowT("cashflow.back_timeline", "Zur Gesamtansicht")}</button>`
      : "",
  ].join("");

  container.innerHTML = `
    <div class="cashflow-drilldown-head">
      <div>
        <p class="cashflow-drilldown-title">${escapeHtml(chartTitle)}</p>
        <p class="cashflow-drilldown-hint">${escapeHtml(chartHint)}</p>
      </div>
      <div class="cashflow-drilldown-actions">
        ${actionButtons}
      </div>
    </div>
    <div class="cashflow-plot-shell">
      <div class="cashflow-y-axis-panel" aria-hidden="true">
        <span class="cashflow-y-axis-line"></span>
        ${yAxisLabels}
      </div>
      <div class="cashflow-scroll">
        <svg class="cashflow-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${cashflowT("cashflow.chart_aria", "Linienverlauf fuer Einnahmen, Ausgaben und Erspartes")}">
          ${yGridLines}
          <line class="cashflow-axis" x1="${padLeft}" y1="${zeroY}" x2="${width - padRight}" y2="${zeroY}"></line>
          <line class="cashflow-hover-line" x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}"></line>
          <polyline class="cashflow-line-income" points="${incomePolyline}"></polyline>
          <polyline class="cashflow-line-expense" points="${expensePolyline}"></polyline>
          <polyline class="cashflow-line-savings" points="${savingsPolyline}"></polyline>
          ${incomeDotsWithIndex}
          ${expenseDotsWithIndex}
          ${savingsDots}
          ${hoverZones}
          ${labels}
        </svg>
      </div>
    </div>
    <div class="cashflow-legend" aria-hidden="true">
      <span class="cashflow-legend-item"><span class="cashflow-legend-dot income"></span>${cashflowT("income_short", "Einnahmen")}</span>
      <span class="cashflow-legend-item"><span class="cashflow-legend-dot expense"></span>${cashflowT("expenses_short", "Ausgaben")}</span>
      <span class="cashflow-legend-item"><span class="cashflow-legend-dot savings"></span>${cashflowT("cashflow.saved", "Erspartes")}</span>
    </div>
    ${isEmptySeries ? `<p class="bars-empty">${cashflowT("cashflow.no_data_selection", "Keine Daten fuer diese Auswahl vorhanden.")}</p>` : ""}
  `;

  const backMonthButton = container.querySelector('[data-cashflow-action="back-month"]');
  if (backMonthButton) {
    backMonthButton.addEventListener("click", () => {
      cashflowChartState.level = "month";
      cashflowChartState.selectedDayKey = "";
      updateFinanceCards(appState.user, appState.incomeEntries, appState.expenseEntries);
    });
  }

  const backYearButton = container.querySelector('[data-cashflow-action="back-year"]');
  if (backYearButton) {
    backYearButton.addEventListener("click", () => {
      cashflowChartState.level = "year";
      cashflowChartState.selectedDayKey = "";
      cashflowChartState.selectedMonthKey = "";
      updateFinanceCards(appState.user, appState.incomeEntries, appState.expenseEntries);
    });
  }

  const backTimelineButton = container.querySelector('[data-cashflow-action="back-timeline"]');
  if (backTimelineButton) {
    backTimelineButton.addEventListener("click", () => {
      cashflowChartState.level = "timeline";
      cashflowChartState.selectedYear = "";
      cashflowChartState.selectedMonthKey = "";
      cashflowChartState.selectedDayKey = "";
      updateFinanceCards(appState.user, appState.incomeEntries, appState.expenseEntries);
    });
  }

  if (isEmptySeries) return;

  const scrollArea = container.querySelector(".cashflow-scroll");
  const hoverLine = container.querySelector(".cashflow-hover-line");
  const zones = container.querySelectorAll(".cashflow-hitzone");
  if (!scrollArea || !hoverLine || !zones.length) return;

  const tooltip = document.createElement("div");
  tooltip.className = "cashflow-tooltip";
  tooltip.hidden = true;
  container.append(tooltip);

  const pointsByIndex = new Map();
  const allPoints = container.querySelectorAll(
    ".cashflow-point-income, .cashflow-point-expense, .cashflow-point-savings"
  );
  for (const point of allPoints) {
    const index = Number(point.dataset.pointIndex || "-1");
    if (index < 0) continue;
    if (!pointsByIndex.has(index)) pointsByIndex.set(index, []);
    pointsByIndex.get(index).push(point);
  }

  let activeIndex = -1;

  const setActivePoints = (index) => {
    if (activeIndex === index) return;

    if (pointsByIndex.has(activeIndex)) {
      for (const point of pointsByIndex.get(activeIndex)) {
        point.classList.remove("is-active");
      }
    }
    activeIndex = index;
    if (pointsByIndex.has(activeIndex)) {
      for (const point of pointsByIndex.get(activeIndex)) {
        point.classList.add("is-active");
      }
    }
  };

  const positionTooltip = (event) => {
    const bounds = container.getBoundingClientRect();
    let left = event.clientX - bounds.left + 12;
    let top = event.clientY - bounds.top - tooltip.offsetHeight - 12;

    const maxLeft = container.clientWidth - tooltip.offsetWidth - 8;
    left = Math.min(Math.max(8, left), Math.max(8, maxLeft));

    if (top < 8) {
      top = event.clientY - bounds.top + 12;
    }
    const maxTop = container.clientHeight - tooltip.offsetHeight - 8;
    top = Math.min(Math.max(8, top), Math.max(8, maxTop));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  const showHover = (index, event) => {
    const pointLabel = chartLabelForKey(view.level, keys[index]);
    const income = formatMoney(incomeValues[index]);
    const expense = formatMoney(expenseValues[index]);
    const savings = formatMoney(savingsValues[index]);

    tooltip.innerHTML = `
      <p class="cashflow-tooltip-title">${escapeHtml(pointLabel)}</p>
      <p class="cashflow-tooltip-row"><span>${cashflowT("income_short", "Einnahmen")}</span><strong>${escapeHtml(income)}</strong></p>
      <p class="cashflow-tooltip-row"><span>${cashflowT("expenses_short", "Ausgaben")}</span><strong>${escapeHtml(expense)}</strong></p>
      <p class="cashflow-tooltip-row"><span>${cashflowT("cashflow.saved_short", "Erspart")}</span><strong>${escapeHtml(savings)}</strong></p>
    `;
    tooltip.hidden = false;
    positionTooltip(event);

    const x = xForIndex(index);
    hoverLine.setAttribute("x1", String(x));
    hoverLine.setAttribute("x2", String(x));
    hoverLine.classList.add("is-visible");
    setActivePoints(index);
  };

  const hideHover = () => {
    tooltip.hidden = true;
    hoverLine.classList.remove("is-visible");
    setActivePoints(-1);
  };

  for (const zone of zones) {
    const index = Number(zone.dataset.hoverIndex || "-1");
    if (index < 0) continue;
    zone.addEventListener("mouseenter", (event) => showHover(index, event));
    zone.addEventListener("mousemove", (event) => showHover(index, event));
    zone.addEventListener("mouseleave", hideHover);
    zone.addEventListener("click", (event) => {
      showHover(index, event);
      if (view.level === "timeline") {
        cashflowChartState.level = "year";
        cashflowChartState.selectedYear = keys[index];
        cashflowChartState.selectedMonthKey = "";
        cashflowChartState.selectedDayKey = "";
        updateFinanceCards(appState.user, appState.incomeEntries, appState.expenseEntries);
        return;
      }
      if (view.level === "year") {
        cashflowChartState.level = "month";
        cashflowChartState.selectedYear = String(keys[index]).split("-")[0];
        cashflowChartState.selectedMonthKey = keys[index];
        cashflowChartState.selectedDayKey = "";
        updateFinanceCards(appState.user, appState.incomeEntries, appState.expenseEntries);
        return;
      }
      if (view.level === "month") {
        cashflowChartState.level = "day";
        cashflowChartState.selectedDayKey = keys[index];
        updateFinanceCards(appState.user, appState.incomeEntries, appState.expenseEntries);
      }
    });
  }

  scrollArea.addEventListener("mouseleave", hideHover);
  scrollArea.addEventListener("scroll", hideHover, { passive: true });
}

function shiftDayKey(dayKey, offsetDays) {
  const day = dayDateFromKey(dayKey);
  if (!day) return dayKey;
  const shifted = new Date(day.getFullYear(), day.getMonth(), day.getDate() + offsetDays);
  return dayKeyFromDate(shifted) || dayKey;
}

function periodContextFromChartState() {
  const now = new Date();
  const nowMonthKey = monthKeyFromDate(now);
  const nowDayKey = dayKeyFromDate(now);
  const nowYear = String(now.getFullYear());

  if (cashflowChartState.level === "day") {
    return {
      level: "day",
      title: cashflowT("dashboard.period.daily", "Taegliche"),
      dateFieldLabel: dayLabelFromKey(cashflowChartState.selectedDayKey || nowDayKey),
      monthKey: cashflowChartState.selectedMonthKey || nowMonthKey,
      dayKey: cashflowChartState.selectedDayKey || nowDayKey,
    };
  }

  if (cashflowChartState.level === "month") {
    return {
      level: "month",
      title: cashflowT("dashboard.period.monthly", "Monatliche"),
      dateFieldLabel: monthLongLabelFromKey(cashflowChartState.selectedMonthKey || nowMonthKey),
      monthKey: cashflowChartState.selectedMonthKey || nowMonthKey,
      dayKey: "",
    };
  }

  if (cashflowChartState.level === "year") {
    const selectedYear = String(cashflowChartState.selectedYear || nowYear);
    return {
      level: "year",
      title: cashflowT("dashboard.period.yearly", "Jaehrliche"),
      dateFieldLabel: selectedYear,
      monthKey: `${selectedYear}-01`,
      dayKey: `${selectedYear}-01-01`,
    };
  }

  return {
    level: "year",
    title: cashflowT("dashboard.period.yearly", "Jaehrliche"),
    dateFieldLabel: nowYear,
    monthKey: nowMonthKey,
    dayKey: nowDayKey,
  };
}

function isMonthlyOccurrenceInMonth(startDay, monthKey) {
  const targetMonth = monthDateFromKey(monthKey);
  if (!targetMonth) return false;
  const startMonthKey = monthKeyFromDate(startDay);
  if (monthKey < startMonthKey) return false;
  const daysInTargetMonth = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth() + 1,
    0
  ).getDate();
  const targetDay = Math.min(startDay.getDate(), daysInTargetMonth);
  const occurrence = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), targetDay);
  if (monthKey === startMonthKey && occurrence.getTime() < startDay.getTime()) return false;
  return true;
}

function countWeeklyOccurrencesInRange(startDay, rangeStart, rangeEnd) {
  if (rangeEnd.getTime() < startDay.getTime()) return 0;
  const cursor = new Date(startDay);
  while (cursor.getTime() < rangeStart.getTime()) {
    cursor.setDate(cursor.getDate() + 7);
  }
  let count = 0;
  while (cursor.getTime() <= rangeEnd.getTime()) {
    count += 1;
    cursor.setDate(cursor.getDate() + 7);
  }
  return count;
}

function entryContributionForPeriod(entry, dateField, period) {
  const amount = Number(entry.amount) || 0;
  if (amount <= 0) return 0;

  const rawDate = new Date(entry[dateField]);
  if (Number.isNaN(rawDate.getTime())) return 0;
  const startDay = new Date(rawDate.getFullYear(), rawDate.getMonth(), rawDate.getDate());
  const recurrence = String(entry.cycle || "once");

  if (recurrence === "once") {
    if (period.level === "day") {
      return dayKeyFromDate(startDay) === period.dayKey ? amount : 0;
    }
    if (period.level === "month") {
      return monthKeyFromDate(startDay) === period.monthKey ? amount : 0;
    }
    return startDay.getFullYear() === Number(period.dateFieldLabel) ? amount : 0;
  }

  if (!entry.is_active) return 0;

  if (recurrence === "monthly") {
    if (period.level === "day") {
      const day = dayDateFromKey(period.dayKey);
      if (!day) return 0;
      const targetDay = Math.min(
        startDay.getDate(),
        new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate()
      );
      const occurs =
        day.getDate() === targetDay && isMonthlyOccurrenceInMonth(startDay, monthKeyFromDate(day));
      return occurs ? amount : 0;
    }
    if (period.level === "month") {
      return isMonthlyOccurrenceInMonth(startDay, period.monthKey) ? amount : 0;
    }
    let yearly = 0;
    for (let month = 0; month < 12; month += 1) {
      const monthKey = `${period.dateFieldLabel}-${String(month + 1).padStart(2, "0")}`;
      if (isMonthlyOccurrenceInMonth(startDay, monthKey)) yearly += amount;
    }
    return yearly;
  }

  if (recurrence === "weekly") {
    if (period.level === "day") {
      const day = dayDateFromKey(period.dayKey);
      if (!day || day.getTime() < startDay.getTime()) return 0;
      const diffDays = Math.floor((day.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays % 7 === 0 ? amount : 0;
    }
    if (period.level === "month") {
      const monthDate = monthDateFromKey(period.monthKey);
      if (!monthDate) return 0;
      const rangeStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const rangeEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
      return countWeeklyOccurrencesInRange(startDay, rangeStart, rangeEnd) * amount;
    }
    const year = Number(period.dateFieldLabel);
    const rangeStart = new Date(year, 0, 1);
    const rangeEnd = new Date(year, 11, 31);
    return countWeeklyOccurrencesInRange(startDay, rangeStart, rangeEnd) * amount;
  }

  if (recurrence === "yearly") {
    if (period.level === "day") {
      const day = dayDateFromKey(period.dayKey);
      if (!day || day.getTime() < startDay.getTime()) return 0;
      return day.getMonth() === startDay.getMonth() && day.getDate() === startDay.getDate()
        ? amount
        : 0;
    }
    if (period.level === "month") {
      const monthDate = monthDateFromKey(period.monthKey);
      if (!monthDate) return 0;
      return monthDate.getMonth() === startDay.getMonth() ? amount : 0;
    }
    const year = Number(period.dateFieldLabel);
    return year >= startDay.getFullYear() ? amount : 0;
  }

  return 0;
}

function totalForPeriod(entries, dateField, period) {
  return Number(
    entries
      .reduce((sum, entry) => sum + entryContributionForPeriod(entry, dateField, period), 0)
      .toFixed(2)
  );
}

function previousPeriod(period) {
  if (period.level === "day") {
    return { ...period, dayKey: shiftDayKey(period.dayKey, -1) };
  }
  if (period.level === "month") {
    const monthDate = monthDateFromKey(period.monthKey);
    if (!monthDate) return period;
    const prev = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1);
    return {
      ...period,
      monthKey: monthKeyFromDate(prev),
      dateFieldLabel: monthLongLabelFromKey(monthKeyFromDate(prev)),
    };
  }
  return { ...period, dateFieldLabel: String(Number(period.dateFieldLabel) - 1) };
}

function categoryLabelForPie(categoryKeyValue) {
  if (typeof categoryLabel === "function") return categoryLabel(categoryKeyValue);
  return (
    CATEGORY_LABELS[categoryKeyValue] ||
    categoryKeyValue ||
    cashflowT("dashboard.pie.unknown_category", "Unbekannt")
  );
}

function buildDistributionByCategory(entries, dateField, period) {
  const totals = new Map();
  for (const entry of entries) {
    const value = entryContributionForPeriod(entry, dateField, period);
    if (value <= 0) continue;
    const key = String(entry.category || "other").trim() || "other";
    totals.set(key, (totals.get(key) || 0) + value);
  }
  return Array.from(totals.entries())
    .map(([key, value]) => ({
      key,
      value: Number(value.toFixed(2)),
      label: categoryLabelForPie(key),
    }))
    .sort((a, b) => b.value - a.value);
}

export function initOverviewPieControls() {
  const select = document.getElementById("overview-pie-mode");
  const label = document.getElementById("overview-pie-mode-label");
  const incomeOption = document.getElementById("overview-pie-mode-income");
  const expenseOption = document.getElementById("overview-pie-mode-expense");
  if (!select || select.dataset.bound === "1") return;
  if (label) label.textContent = cashflowT("dashboard.pie.mode_label", "Diagramm zeigt");
  if (incomeOption) incomeOption.textContent = cashflowT("dashboard.pie.mode_income", "Einnahmen");
  if (expenseOption)
    expenseOption.textContent = cashflowT("dashboard.pie.mode_expense", "Ausgaben");
  select.value = overviewDistributionState.mode;
  select.dataset.bound = "1";
  select.addEventListener("change", () => {
    overviewDistributionState.mode = select.value === "expense" ? "expense" : "income";
    updateFinanceCards(appState.user, appState.incomeEntries, appState.expenseEntries);
  });
}

function renderOverviewDistribution(period, incomeEntries, expenseEntries) {
  const container = document.getElementById("overview-pie-chart");
  const title = document.getElementById("distribution-title");
  const select = document.getElementById("overview-pie-mode");
  if (!container) return;

  if (select) select.value = overviewDistributionState.mode;
  const isIncome = overviewDistributionState.mode !== "expense";
  const modeLabel = isIncome
    ? cashflowT("dashboard.pie.mode_income", "Einnahmen")
    : cashflowT("dashboard.pie.mode_expense", "Ausgaben");
  const dataset = isIncome
    ? buildDistributionByCategory(incomeEntries, "received_at", period)
    : buildDistributionByCategory(expenseEntries, "spent_at", period);

  if (title) {
    title.textContent = cashflowT(
      "dashboard.pie.title_with_period",
      "{mode} nach Kategorien ({period})",
      {
        mode: modeLabel,
        period: period.dateFieldLabel,
      }
    );
  }

  if (!dataset.length) {
    container.innerHTML = `<p class="bars-empty">${escapeHtml(cashflowT("dashboard.pie.no_data_current", "Keine Daten fuer die aktuelle Auswahl vorhanden."))}</p>`;
    return;
  }

  const palette = isIncome
    ? ["#ef5b2a", "#f57c00", "#f9a825", "#f4a261", "#e76f51", "#f7b267", "#ff7043", "#d97706"]
    : ["#1565c0", "#0288d1", "#00acc1", "#1976d2", "#5c6bc0", "#4fc3f7", "#26a69a", "#64b5f6"];
  const total = dataset.reduce((sum, item) => sum + item.value, 0);
  const gradient = dataset
    .map((item, index) => {
      const start = dataset.slice(0, index).reduce((sum, cur) => sum + cur.value, 0);
      const end = start + item.value;
      const startPct = (start / total) * 100;
      const endPct = (end / total) * 100;
      return `${palette[index % palette.length]} ${startPct.toFixed(3)}% ${endPct.toFixed(3)}%`;
    })
    .join(", ");

  const legend = dataset
    .map((item, index) => {
      const percent = Math.round((item.value / total) * 100);
      return `
        <li class="overview-pie-legend-item">
          <span class="overview-pie-legend-dot" style="background:${palette[index % palette.length]}"></span>
          <span class="overview-pie-legend-label">${escapeHtml(item.label)}</span>
          <strong class="overview-pie-legend-value">${escapeHtml(formatMoney(item.value))} (${percent}%)</strong>
        </li>
      `;
    })
    .join("");

  container.innerHTML = `
    <div class="overview-pie-wrap">
      <div class="overview-pie-chart-visual" style="--pie-gradient: conic-gradient(${gradient})" aria-hidden="true"></div>
      <ul class="overview-pie-legend">${legend}</ul>
    </div>
  `;
}

export function updateFinanceCards(user, incomeEntries, expenseEntries) {
  const period = periodContextFromChartState();
  const previous = previousPeriod(period);

  const currentIncome = totalForPeriod(incomeEntries, "received_at", period);
  const currentExpense = totalForPeriod(expenseEntries, "spent_at", period);
  const previousIncome = totalForPeriod(incomeEntries, "received_at", previous);
  const previousExpense = totalForPeriod(expenseEntries, "spent_at", previous);

  const netLiquidity = Number((currentIncome - currentExpense).toFixed(2));
  const savingRate = currentIncome > 0 ? Math.round((netLiquidity / currentIncome) * 100) : 0;

  const periodPrefix = period.title;
  setText(
    "hero-label",
    `${periodPrefix} ${cashflowT("dashboard.hero.net_cashflow_suffix", "Netto-Cashflow")}`
  );
  setText("kpi-income-label", `${periodPrefix} ${cashflowT("income_short", "Einnahmen")}`);
  setText("kpi-expenses-label", `${periodPrefix} ${cashflowT("expenses_short", "Ausgaben")}`);
  setText(
    "kpi-saving-rate-label",
    `${periodPrefix} ${cashflowT("dashboard.kpi.saving_rate", "Sparquote")}`
  );
  setText(
    "kpi-liquid-label",
    cashflowT("dashboard.kpi.liquidity_with_period", "Liquiditaet ({period})", {
      period:
        period.level === "year"
          ? cashflowT("dashboard.period.year", "Jahr")
          : period.level === "month"
            ? cashflowT("dashboard.period.month", "Monat")
            : cashflowT("dashboard.period.day", "Tag"),
    })
  );

  setText("kpi-income", formatMoney(currentIncome));
  setTrend(
    "kpi-income-trend",
    currentIncome > previousIncome
      ? cashflowT("dashboard.kpi.over_period_above", "ueber Vorperiode")
      : currentIncome < previousIncome
        ? cashflowT("dashboard.kpi.over_period_below", "unter Vorperiode")
        : cashflowT("dashboard.kpi.over_period_same", "wie Vorperiode"),
    currentIncome > previousIncome ? "positive" : "neutral"
  );

  setText("kpi-expenses", formatMoney(currentExpense));
  setTrend(
    "kpi-expenses-trend",
    currentExpense > previousExpense
      ? cashflowT("dashboard.kpi.over_period_above", "ueber Vorperiode")
      : currentExpense < previousExpense
        ? cashflowT("dashboard.kpi.over_period_below", "unter Vorperiode")
        : cashflowT("dashboard.kpi.over_period_same", "wie Vorperiode"),
    "neutral"
  );

  setText("kpi-saving-rate", `${savingRate}%`);
  setTrend(
    "kpi-saving-rate-trend",
    savingRate >= 0
      ? cashflowT("after_expenses", "nach Abzug der Ausgaben")
      : cashflowT("more_expenses_than_income", "mehr Ausgaben als Einnahmen"),
    savingRate >= 0 ? "positive" : "neutral"
  );

  setText("kpi-liquid", formatMoney(netLiquidity));
  setTrend(
    "kpi-liquid-trend",
    netLiquidity >= 0
      ? cashflowT("dashboard.kpi.positive_close", "positiver Abschluss")
      : cashflowT("dashboard.kpi.negative_close", "negativer Abschluss"),
    netLiquidity >= 0 ? "positive" : "neutral"
  );

  setText("total-assets", formatMoney(netLiquidity));
  const totalEntries = incomeEntries.length + expenseEntries.length;
  setText(
    "hero-sub",
    totalEntries
      ? cashflowT(
          "dashboard.hero.entries_period",
          "{period}: {income} Einnahmen und {expense} Ausgaben erfasst",
          {
            period: period.dateFieldLabel,
            income: incomeEntries.length,
            expense: expenseEntries.length,
          }
        )
      : cashflowT(
          "no_bookings_detailed",
          "Noch keine Buchungen erfasst. Lege Einnahmen oder Ausgaben an."
        )
  );

  renderOverviewDistribution(period, incomeEntries, expenseEntries);
  renderCashflowBars(incomeEntries, expenseEntries);
}
