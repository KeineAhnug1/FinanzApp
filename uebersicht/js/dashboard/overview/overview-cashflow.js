// Uebersicht: Gruppierung/Rendering der Listen sowie Cashflow- und KPI-Berechnung.
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

function buildHierarchicalGroups(entries, dateField) {
  const yearMap = new Map();

  for (const entry of entries) {
    const date = new Date(entry[dateField]);
    const yearKey = Number.isNaN(date.getTime()) ? "unknown" : String(date.getFullYear());
    const monthKey = Number.isNaN(date.getTime()) ? "unknown" : monthKeyFromDate(new Date(date.getFullYear(), date.getMonth(), 1));
    const dayKey = Number.isNaN(date.getTime()) ? "unknown" : dayKeyFromValue(entry[dateField]) || "unknown";

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
              label: dayKey === "unknown" ? "Ohne Datum" : dayLabelFromKey(dayKey),
              entries: dayEntries,
              count: dayEntries.length,
              total: dayEntries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
            }));
          const monthEntries = days.flatMap((day) => day.entries);
          return {
            key: monthKey,
            label: monthKey === "unknown" ? "Ohne Monat" : monthLongLabelFromKey(monthKey),
            days,
            count: monthEntries.length,
            total: monthEntries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
          };
        });
      const yearEntries = months.flatMap((month) => month.days.flatMap((day) => day.entries));
      return {
        key: yearKey,
        label: yearKey === "unknown" ? "Ohne Jahr" : yearKey,
        months,
        count: yearEntries.length,
        total: yearEntries.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
      };
    });
}

function renderIncomeItem(entry) {
  return `
    <li class="income-item" data-entry-id="${entry.id}">
      <div class="income-topline">
        <div>
          <span class="income-source">${escapeHtml(entry.source)}</span>
          <div class="income-tags">
            <span class="income-tag">${escapeHtml(categoryLabel(entry.category))}</span>
            <span class="income-tag">${recurrenceLabel(entry.recurrence)}</span>
            ${
              entry.recurrence !== "once"
                ? `<span class="income-tag">${entry.is_active ? "Aktiv" : "Pausiert"}</span>`
                : ""
            }
          </div>
        </div>
        <span class="income-amount">${formatMoney(entry.amount)}</span>
      </div>
      <p class="income-meta">${formatDate(entry.received_at)}</p>
      ${entry.note ? `<p class="income-note">${escapeHtml(entry.note)}</p>` : ""}
      <div class="income-actions-inline">
        <button class="inline-action" type="button" data-action="edit" data-entry-id="${entry.id}">Bearbeiten</button>
        <button class="inline-action delete" type="button" data-action="delete" data-entry-id="${entry.id}">Loeschen</button>
      </div>
    </li>
  `;
}

function renderExpenseItem(entry) {
  return `
    <li class="income-item" data-entry-id="${entry.id}">
      <div class="income-topline">
        <div>
          <span class="income-source">${escapeHtml(entry.source || entry.category || "Ausgabe")}</span>
          <div class="income-tags">
            <span class="income-tag">${escapeHtml(categoryLabel(entry.category))}</span>
            <span class="income-tag">${recurrenceLabel(entry.recurrence)}</span>
            ${
              entry.recurrence !== "once"
                ? `<span class="income-tag">${entry.is_active ? "Aktiv" : "Pausiert"}</span>`
                : ""
            }
          </div>
        </div>
        <span class="income-amount is-expense">${formatMoney(entry.amount)}</span>
      </div>
      <p class="income-meta">${formatDate(entry.spent_at)}</p>
      ${entry.note ? `<p class="income-note">${escapeHtml(entry.note)}</p>` : ""}
      <div class="income-actions-inline">
        <button class="inline-action" type="button" data-expense-action="edit" data-entry-id="${entry.id}">Bearbeiten</button>
        <button class="inline-action delete" type="button" data-expense-action="delete" data-entry-id="${entry.id}">Loeschen</button>
      </div>
    </li>
  `;
}

function renderGroupedEntryList(list, grouped, expandedSet, renderer, emptyMessage) {
  if (!list) return;
  if (!grouped.length) {
    list.innerHTML = `<li><p class="income-empty">${emptyMessage}</p></li>`;
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
              <span class="month-meta">${yearGroup.count} Eintraege • ${escapeHtml(formatMoney(yearGroup.total))}</span>
            </summary>
            <div class="year-content">
              ${yearGroup.months
                .map((monthGroup) => {
                  const monthOpen = expandedSet.has(`month:${monthGroup.key}`);
                  return `
                    <details class="month-group" data-group-key="month:${monthGroup.key}" ${monthOpen ? "open" : ""}>
                      <summary class="month-summary">
                        <span class="month-title">${escapeHtml(monthGroup.label)}</span>
                        <span class="month-meta">${monthGroup.count} Eintraege • ${escapeHtml(formatMoney(monthGroup.total))}</span>
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
                                    <span class="month-meta">${dayGroup.count} Eintraege • ${escapeHtml(formatMoney(dayGroup.total))}</span>
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

function renderIncomeList(entries) {
  const list = document.getElementById("income-list");
  if (!list) return;
  const query = normalizeSearch(listState.incomeSearch);
  const filtered = entries.filter((entry) => entryMatchesQuery(entry, query, "received_at"));
  const grouped = buildHierarchicalGroups(filtered, "received_at");
  const emptyMessage = query
    ? "Keine Einnahmen fuer diese Suche gefunden."
    : "Noch keine Einnahmen eingetragen.";
  renderGroupedEntryList(list, grouped, listState.incomeExpandedGroups, renderIncomeItem, emptyMessage);
}

function renderExpenseList(entries) {
  const list = document.getElementById("expense-list");
  if (!list) return;
  const query = normalizeSearch(listState.expenseSearch);
  const filtered = entries.filter((entry) => entryMatchesQuery(entry, query, "spent_at"));
  const grouped = buildHierarchicalGroups(filtered, "spent_at");
  const emptyMessage = query
    ? "Keine Ausgaben fuer diese Suche gefunden."
    : "Noch keine Ausgaben eingetragen.";
  renderGroupedEntryList(list, grouped, listState.expenseExpandedGroups, renderExpenseItem, emptyMessage);
}

function recurrenceMonthlyContribution(entry) {
  const amount = Number(entry.amount) || 0;
  if (entry.recurrence === "monthly") return entry.is_active ? amount : 0;
  if (entry.recurrence === "weekly") return entry.is_active ? amount * 4.33 : 0;
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

function monthLabelFromKey(key) {
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
  return new Intl.DateTimeFormat(getLocale(), { month: "short", year: "numeric" }).format(date).replace(".", "");
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
  return new Intl.DateTimeFormat(getLocale(), { day: "2-digit", month: "long", year: "numeric" }).format(date);
}

function recentMonthKeys(count) {
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

function buildMonthRangeKeys(startDate, endDate) {
  const keys = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  while (cursor <= end) {
    keys.push(monthKeyFromDate(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
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

  if (!points.length) return recentMonthKeys(12);

  const now = new Date();
  const endDate = new Date(
    Math.max(
      ...points.map((date) => new Date(date.getFullYear(), date.getMonth(), 1).getTime()),
      new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    )
  );
  let startDate = new Date(
    Math.min(...points.map((date) => new Date(date.getFullYear(), date.getMonth(), 1).getTime()))
  );

  let keys = buildMonthRangeKeys(startDate, endDate);
  if (keys.length < 12) {
    startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 11, 1);
    keys = buildMonthRangeKeys(startDate, endDate);
  }
  if (keys.length > 48) {
    startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 47, 1);
    keys = buildMonthRangeKeys(startDate, endDate);
  }
  return keys;
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
  try {
    return new Intl.NumberFormat(getLocale(), {
      style: "currency",
      currency: getCurrency(),
      maximumFractionDigits: 0
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(value)} EUR`;
  }
}

function buildMonthlyTotals(entries, keys, dateField) {
  const totals = Object.fromEntries(keys.map((key) => [key, 0]));

  for (const entry of entries) {
    const amount = Number(entry.amount) || 0;
    if (amount <= 0) continue;

    if (entry.recurrence === "once") {
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

function getMonthlyTotal(entries, dateField) {
  const oneTime = entries
    .filter((entry) => entry.recurrence === "once" && isDateInCurrentMonth(entry[dateField]))
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0);

  const recurring = entries.reduce((sum, entry) => sum + recurrenceMonthlyContribution(entry), 0);
  return Number((oneTime + recurring).toFixed(2));
}

function buildIncomeSeries(keys, incomeEntries, baseIncome) {
  const totals = buildMonthlyTotals(incomeEntries, keys, "received_at");
  if (!incomeEntries.length && baseIncome > 0) {
    for (const key of keys) {
      totals[key] = baseIncome;
    }
  }
  return totals;
}

function polylinePoints(values, xForIndex, yForValue) {
  return values
    .map((value, index) => `${xForIndex(index)},${yForValue(value)}`)
    .join(" ");
}

function renderCashflowBars(incomeEntries, expenseEntries, baseIncome) {
  const container = document.getElementById("cashflow-bars");
  if (!container) return;

  const keys = timelineKeysForChart(incomeEntries, expenseEntries);
  const incomeTotals = buildIncomeSeries(keys, incomeEntries, baseIncome);
  const expenseTotals = buildMonthlyTotals(expenseEntries, keys, "spent_at");
  const incomeValues = keys.map((key) => Number((incomeTotals[key] || 0).toFixed(2)));
  const expenseValues = keys.map((key) => Number((expenseTotals[key] || 0).toFixed(2)));
  const savingsValues = keys.map((key, index) => Number((incomeValues[index] - expenseValues[index]).toFixed(2)));
  const allValues = incomeValues.concat(expenseValues).concat(savingsValues);
  const maxValue = Math.max(...allValues, 0);
  const minValue = Math.min(...allValues, 0);
  const range = Math.max(1, maxValue - minValue);

  if (maxValue === 0 && minValue === 0) {
    container.innerHTML = '<p class="bars-empty">Noch keine Verlaufsdaten vorhanden.</p>';
    return;
  }

  const height = 280;
  const padLeft = 86;
  const padRight = 28;
  const padTop = 18;
  const padBottom = 44;
  const slotWidth = 84;
  const width = Math.max(900, padLeft + padRight + Math.max(keys.length - 1, 1) * slotWidth);
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const yStep = niceStep(range, 6);
  let yMin = Math.floor(minValue / yStep) * yStep;
  let yMax = Math.ceil(maxValue / yStep) * yStep;
  yMin = Math.min(yMin, 0);
  yMax = Math.max(yMax, 0);
  if (yMin === yMax) yMax = yMin + yStep;
  const yRange = Math.max(1, yMax - yMin);

  const xForIndex = (index) => padLeft + (index * plotWidth) / Math.max(keys.length - 1, 1);
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
        <text class="cashflow-y-label" x="${padLeft - 10}" y="${y}" text-anchor="end" dominant-baseline="central">${escapeHtml(formatAxisMoney(tick))}</text>
      `;
    })
    .join("");

  const incomePolyline = polylinePoints(incomeValues, xForIndex, yForValue);
  const expensePolyline = polylinePoints(expenseValues, xForIndex, yForValue);
  const savingsPolyline = polylinePoints(savingsValues, xForIndex, yForValue);

  const labels = keys
    .map((key, index) => `
      <text class="cashflow-x-label" x="${xForIndex(index)}" y="${height - 10}" text-anchor="middle">
        ${escapeHtml(monthShortYearLabelFromKey(key))}
      </text>
    `)
    .join("");

  const savingsDots = savingsValues
    .map((value, index) => `<circle class="cashflow-point-savings" data-point-index="${index}" cx="${xForIndex(index)}" cy="${yForValue(value)}" r="2.8"></circle>`)
    .join("");

  const incomeDotsWithIndex = incomeValues
    .map((value, index) => `<circle class="cashflow-point-income" data-point-index="${index}" cx="${xForIndex(index)}" cy="${yForValue(value)}" r="2.8"></circle>`)
    .join("");
  const expenseDotsWithIndex = expenseValues
    .map((value, index) => `<circle class="cashflow-point-expense" data-point-index="${index}" cx="${xForIndex(index)}" cy="${yForValue(value)}" r="2.8"></circle>`)
    .join("");

  const hoverZones = keys
    .map((_, index) => {
      const center = xForIndex(index);
      const left = index === 0 ? padLeft : (xForIndex(index - 1) + center) / 2;
      const right = index === keys.length - 1 ? width - padRight : (center + xForIndex(index + 1)) / 2;
      const zoneWidth = Math.max(8, right - left);
      return `<rect class="cashflow-hitzone" data-hover-index="${index}" x="${left}" y="${padTop}" width="${zoneWidth}" height="${plotHeight}"></rect>`;
    })
    .join("");

  const firstLabel = monthLongLabelFromKey(keys[0]);
  const lastLabel = monthLongLabelFromKey(keys[keys.length - 1]);
  container.setAttribute("aria-label", `Cashflow Verlauf von ${firstLabel} bis ${lastLabel}`);

  container.innerHTML = `
    <div class="cashflow-scroll">
      <svg class="cashflow-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Linienverlauf fuer Einnahmen, Ausgaben und Erspartes">
        ${yGridLines}
        <line class="cashflow-axis" x1="${padLeft}" y1="${padTop}" x2="${padLeft}" y2="${height - padBottom}"></line>
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
    <div class="cashflow-legend" aria-hidden="true">
      <span class="cashflow-legend-item"><span class="cashflow-legend-dot income"></span>Einnahmen</span>
      <span class="cashflow-legend-item"><span class="cashflow-legend-dot expense"></span>Ausgaben</span>
      <span class="cashflow-legend-item"><span class="cashflow-legend-dot savings"></span>Erspartes</span>
    </div>
  `;

  const scrollArea = container.querySelector(".cashflow-scroll");
  const hoverLine = container.querySelector(".cashflow-hover-line");
  const zones = container.querySelectorAll(".cashflow-hitzone");
  if (!scrollArea || !hoverLine || !zones.length) return;

  const tooltip = document.createElement("div");
  tooltip.className = "cashflow-tooltip";
  tooltip.hidden = true;
  container.append(tooltip);

  const pointsByIndex = new Map();
  const allPoints = container.querySelectorAll(".cashflow-point-income, .cashflow-point-expense, .cashflow-point-savings");
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
    const month = monthLongLabelFromKey(keys[index]);
    const income = formatMoney(incomeValues[index]);
    const expense = formatMoney(expenseValues[index]);
    const savings = formatMoney(savingsValues[index]);

    tooltip.innerHTML = `
      <p class="cashflow-tooltip-title">${escapeHtml(month)}</p>
      <p class="cashflow-tooltip-row"><span>Einnahmen</span><strong>${escapeHtml(income)}</strong></p>
      <p class="cashflow-tooltip-row"><span>Ausgaben</span><strong>${escapeHtml(expense)}</strong></p>
      <p class="cashflow-tooltip-row"><span>Erspart</span><strong>${escapeHtml(savings)}</strong></p>
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
    zone.addEventListener("click", (event) => showHover(index, event));
  }

  scrollArea.addEventListener("mouseleave", hideHover);
  scrollArea.addEventListener("scroll", hideHover, { passive: true });
}

function updateFinanceCards(user, incomeEntries, expenseEntries) {
  const baseIncome = Number(user.income) || 0;
  const hasIncomeEntries = incomeEntries.length > 0;
  const monthlyIncomeFromEntries = getMonthlyTotal(incomeEntries, "received_at");
  const monthlyIncome = Number((hasIncomeEntries ? monthlyIncomeFromEntries : (baseIncome > 0 ? baseIncome : 0)).toFixed(2));
  const monthlyExpense = getMonthlyTotal(expenseEntries, "spent_at");
  const netLiquidity = Number((monthlyIncome - monthlyExpense).toFixed(2));
  const savingRate = monthlyIncome > 0
    ? Math.round((netLiquidity / monthlyIncome) * 100)
    : 0;

  const keys = recentMonthKeys(2);
  const incomeTotals = buildIncomeSeries(keys, incomeEntries, baseIncome);
  const expenseTotals = buildMonthlyTotals(expenseEntries, keys, "spent_at");
  const currentIncome = Number((incomeTotals[keys[1]] || 0).toFixed(2));
  const previousIncome = Number((incomeTotals[keys[0]] || 0).toFixed(2));
  const currentExpense = Number((expenseTotals[keys[1]] || 0).toFixed(2));
  const previousExpense = Number((expenseTotals[keys[0]] || 0).toFixed(2));

  const pausedRecurring = incomeEntries
    .concat(expenseEntries)
    .filter((entry) => entry.recurrence !== "once" && !entry.is_active)
    .length;

  setText("kpi-income", formatMoney(monthlyIncome));
  setTrend(
    "kpi-income-trend",
    currentIncome > previousIncome ? "ueber Vormonat" : currentIncome < previousIncome ? "unter Vormonat" : "wie Vormonat",
    currentIncome > previousIncome ? "positive" : "neutral"
  );

  setText("kpi-expenses", formatMoney(monthlyExpense));
  setTrend(
    "kpi-expenses-trend",
    currentExpense > previousExpense ? "ueber Vormonat" : currentExpense < previousExpense ? "unter Vormonat" : "wie Vormonat",
    "neutral"
  );

  setText("kpi-saving-rate", `${savingRate}%`);
  setTrend("kpi-saving-rate-trend", savingRate >= 0 ? "nach Abzug der Ausgaben" : "mehr Ausgaben als Einnahmen", savingRate >= 0 ? "positive" : "neutral");

  setText("kpi-liquid", formatMoney(netLiquidity));
  setTrend("kpi-liquid-trend", netLiquidity >= 0 ? "positiver Monatsabschluss" : "negativer Monatsabschluss", netLiquidity >= 0 ? "positive" : "neutral");

  setText("total-assets", formatMoney(netLiquidity));
  setText("focus-paused", String(pausedRecurring));
  setText("focus-month-income", formatMoney(monthlyIncome));
  setText("focus-month-expense", formatMoney(monthlyExpense));

  const totalEntries = incomeEntries.length + expenseEntries.length;
  setText(
    "hero-sub",
    totalEntries
      ? `${incomeEntries.length} Einnahmen und ${expenseEntries.length} Ausgaben erfasst`
      : "Noch keine Buchungen erfasst. Lege Einnahmen oder Ausgaben an."
  );

  renderCashflowBars(incomeEntries, expenseEntries, baseIncome);
}
