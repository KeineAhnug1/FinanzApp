import {
	fnT,
	fnShowError,
	fnFmtMoney,
	fnFmtNumber,
	fnFmtDateFromTimestamp,
	fnGetLocale,
	fnNormalizeAccountId,
	fnIsAllAccountsSelected,
	fnGetShareAccountLabel,
	fnGetCommonTradingExchanges,
	fnGetTradingExchange,
	fnSetTradingExchange,
	fnBuildStockLogoUrl,
	fnRefreshStockLogoTheme,
	fnRenderShareAccountOptions,
	fnLoadShareAccounts,
	fnLoadBankAccounts,
	fnLoadPositions,
	fnLoadAllStocksCatalog,
	fnSearchStocksViaBackend,
	fnPersistBoughtPosition,
	fnPersistSoldPosition,
	fnApplySoldPositions,
	fnGetPositionShareAccountId,
	fnPromptBankAccountSelection,
	fnCreateDashboardTradeEntry,
	fnApiRequestWithEndpoints,
	fnApiUpdateAccount,
	fnApiDeleteAccount,
	sActiveView,
	aShareAccounts,
	aBankAccounts,
	sSelectedShareAccountId,
	setSelectedShareAccountId,
	aShareAccountsCrudEndpoints,
	aBankAccountsEndpoints,
} from './state-api.js';

import {
	fnToMsFromTimestamp,
	fnToMsFromTdDatetime,
	fnRangeToQuery,
	fnAggregateOwnedSymbols,
	fnBuildSeriesPointsForPositions,
	fnWithFixedDateRange,
	fnGetLatestPriceBySymbolWithFallback,
	fnLoadSeriesForSymbols,
	fnBuildZeroFallbackSeries,
	fnIntervalToStepMs,
	fnEscapeHtml,
} from './domain.js';

import {
	fnClearCanvas,
	fnDrawLineChart,
	fnDrawPieChart,
	fnRenderPieLegend,
	fnGetPieSliceIndexAtPoint,
	fnBuildDepotComposition,
} from './charts.js';

import { fnRenderView } from './views.js';

// [DEPOT] 9) Gesamtsdepot-Funktionen
// Nur für data-view=\"depot\".
// =====================================================

/**
 * Laedt aktuelle Kurse je Symbol fuer die uebergebenen Tabellenzeilen.
 * Scope: [SHARED]
 * @param {Array<{sSymbol: string}>} aRows
 * @returns {Promise<Map<string, number>>}
 */
async function fnLoadCurrentPricesBySymbol(aRows) {
	const mCurrentPriceBySymbol = new Map();
	const aSymbols = [...new Set((aRows || []).map((oRow) => String(oRow?.sSymbol || "").trim().toUpperCase()).filter(Boolean))];
	await Promise.all(
		aSymbols.map(async (sSymbol) => {
			try {
				const oQuoteResult = await fnGetLatestPriceBySymbolWithFallback(sSymbol);
				const nPrice = Number(oQuoteResult?.nPrice);
				if (Number.isFinite(nPrice) && nPrice > 0) {
					mCurrentPriceBySymbol.set(sSymbol, nPrice);
				}
			} catch {
				// Kurs fuer dieses Symbol nicht verfuegbar.
			}
		})
	);
	return mCurrentPriceBySymbol;
}

/**
 * Berechnet die prozentuale Entwicklung seit Kauf.
 * Scope: [SHARED]
 * @param {number} nAvgBuyPrice
 * @param {number} nCurrentPrice
 * @returns {number}
 */
function fnComputeDevelopmentPctSinceBuy(nAvgBuyPrice, nCurrentPrice) {
	const nAvg = Number(nAvgBuyPrice);
	const nCurrent = Number(nCurrentPrice);
	if (!Number.isFinite(nAvg) || nAvg <= 0) return Number.NaN;
	if (!Number.isFinite(nCurrent) || nCurrent <= 0) return Number.NaN;
	return ((nCurrent - nAvg) / nAvg) * 100;
}

/**
 * Formatiert Prozentwerte mit Vorzeichen.
 * Scope: [SHARED]
 * @param {number} nValue
 * @returns {string}
 */
function fnFmtSignedPct(nValue) {
	if (!Number.isFinite(nValue)) return "—";
	const oFormatter = new Intl.NumberFormat(fnGetLocale(), {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	const sPrefix = nValue > 0 ? "+" : "";
	return `${sPrefix}${oFormatter.format(nValue)}%`;
}

/**
 * Formatiert Geldwerte mit Vorzeichen.
 * Scope: [SHARED]
 * @param {number} nValue
 * @returns {string}
 */
function fnFmtSignedMoney(nValue) {
	if (!Number.isFinite(nValue)) return "—";
	if (nValue === 0) return fnFmtMoney(0, "USD");
	const sPrefix = nValue > 0 ? "+" : "-";
	return `${sPrefix}${fnFmtMoney(Math.abs(nValue), "USD")}`;
}

/**
 * Rendert die Entwicklungsspalte fuer eine Tabellenzeile.
 * Scope: [SHARED]
 * @param {{sSymbol: string, nAvgBuyPrice: number}} oRow
 * @param {Map<string, number>} mCurrentPriceBySymbol
 * @param {"absolute"|"percent"} [sDisplayMode="absolute"]
 * @returns {string}
 */
function fnBuildDevelopmentCellHtml(oRow, mCurrentPriceBySymbol, sDisplayMode = "absolute", mRangeDevelopmentBySymbol = null) {
	const sSymbol = String(oRow?.sSymbol || "").trim().toUpperCase();
	let nDevelopmentAbs;
	let nDevelopmentPct;

	const oRangeDevelopment = mRangeDevelopmentBySymbol instanceof Map
		? mRangeDevelopmentBySymbol.get(sSymbol)
		: null;
	if (mRangeDevelopmentBySymbol instanceof Map) {
		if (oRangeDevelopment && Number.isFinite(Number(oRangeDevelopment.nAbs))) {
			nDevelopmentAbs = Number(oRangeDevelopment.nAbs);
			nDevelopmentPct = Number(oRangeDevelopment.nPct);
		} else {
			return `<span class="stock-performance stock-performance--neutral is-clickable" data-display-mode="absolute">—</span>`;
		}
	} else {
		const nAvgBuyPrice = Number(oRow?.nAvgBuyPrice);
		const nCurrentPrice = Number(mCurrentPriceBySymbol?.get(sSymbol));
		nDevelopmentAbs = Number.isFinite(nCurrentPrice) && Number.isFinite(nAvgBuyPrice)
			? (nCurrentPrice - nAvgBuyPrice)
			: Number.NaN;
		nDevelopmentPct = fnComputeDevelopmentPctSinceBuy(nAvgBuyPrice, nCurrentPrice);
	}

	if (!Number.isFinite(nDevelopmentPct)) {
		return `<span class="stock-performance stock-performance--neutral is-clickable" data-display-mode="absolute">—</span>`;
	}
	const sClassName = nDevelopmentAbs > 0
		? "stock-performance--positive"
		: (nDevelopmentAbs < 0 ? "stock-performance--negative" : "stock-performance--neutral");
	const sText = sDisplayMode === "percent" ? fnFmtSignedPct(nDevelopmentPct) : fnFmtSignedMoney(nDevelopmentAbs);
	return `<span class="stock-performance ${sClassName} is-clickable" data-display-mode="${fnEscapeHtml(sDisplayMode)}">${fnEscapeHtml(sText)}</span>`;
}

function fnBuildRangeDevelopmentBySymbol(aRows, aPositions, mSeriesBySymbol, oQuery, sRange) {
	const mDevelopmentBySymbol = new Map();
	for (const oRow of aRows || []) {
		const sSymbol = String(oRow?.sSymbol || "").trim().toUpperCase();
		if (!sSymbol) continue;

		const aSymbolPositions = (aPositions || []).filter((oPosition) => {
			return String(oPosition?.symbol || "").trim().toUpperCase() === sSymbol;
		});
		if (!aSymbolPositions.length) continue;

		const aSymbolRawPoints = fnBuildSeriesPointsForPositions(aSymbolPositions, mSeriesBySymbol, false);
		const aSymbolRangePoints = fnWithFixedDateRange(aSymbolRawPoints, oQuery, false, sRange);
		if (!aSymbolRangePoints.length) continue;

		const iRangeStartMs = fnToMsFromTdDatetime(aSymbolRangePoints[0]?.t);
		const iStepMs = Math.max(60 * 1000, fnIntervalToStepMs(oQuery?.interval));
		const iPurchaseInRangeThresholdMs = Number.isFinite(iRangeStartMs)
			? (iRangeStartMs - iStepMs)
			: Number.NaN;

		let nAbsSum = 0;
		let nBasisSum = 0;

		for (const oPosition of aSymbolPositions) {
			const aPositionRawPoints = fnBuildSeriesPointsForPositions([oPosition], mSeriesBySymbol, false);
			const aPositionRangePoints = fnWithFixedDateRange(aPositionRawPoints, oQuery, false, sRange);
			if (!aPositionRangePoints.length) continue;

			const oFirstPoint = aPositionRangePoints[0];
			const oLastPoint = aPositionRangePoints[aPositionRangePoints.length - 1];
			const nFirstPnl = Number(oFirstPoint?.pnl);
			const nLastPnl = Number(oLastPoint?.pnl);
			const nFirstTotal = Number(oFirstPoint?.total);
			const nLastInvested = Number(oLastPoint?.invested);
			const iPurchaseMs = fnToMsFromTimestamp(oPosition?.created_at);
			const bPurchasedInRange = Number.isFinite(iPurchaseMs)
				&& Number.isFinite(iPurchaseInRangeThresholdMs)
				&& iPurchaseMs >= iPurchaseInRangeThresholdMs;

			if (!Number.isFinite(nLastPnl)) continue;

			if (bPurchasedInRange) {
				nAbsSum += nLastPnl;
				if (Number.isFinite(nLastInvested) && nLastInvested > 0) {
					nBasisSum += nLastInvested;
				}
				continue;
			}

			if (!Number.isFinite(nFirstPnl)) continue;
			nAbsSum += (nLastPnl - nFirstPnl);
			if (Number.isFinite(nFirstTotal) && nFirstTotal > 0) {
				nBasisSum += nFirstTotal;
			}
		}

		const nPct = nBasisSum > 0 ? (nAbsSum / nBasisSum) * 100 : Number.NaN;
		mDevelopmentBySymbol.set(sSymbol, { nAbs: nAbsSum, nPct });
	}
	return mDevelopmentBySymbol;
}

/**
 * Initialisiert die Gesamtdepot-Ansicht inkl. Tabelle, Range-Buttons und Chart.
 * Scope: [DEPOT]
 * Variablen:
 * - `aPositions`: Geladene Positionen.
 * - `sActiveRange`: Aktuell ausgewählter Zeitraum.
 * - `bPnlOnly`: Ob Gewinn/Verlust statt Depotwert angezeigt wird.
 * - Diverse `el...`: Referenzen auf KPIs, Tabelle und Canvas.
 */
let _resizeCleanup = null;
export async function fnInitDepotView() {
	if (_resizeCleanup) { _resizeCleanup(); _resizeCleanup = null; }
	const elDepotInfo = document.getElementById("depotInfo");
	const elHoldingsTbody = document.querySelector("#holdingsTable tbody");
	const elHoldingsDevelopmentHeader = document.getElementById("holdingsDevelopmentHeader");
	const elDepotShareAccountSelect = document.getElementById("depotShareAccountSelect");

	const elKTotal = document.getElementById("k_total");
	const elKTotalLabel = document.getElementById("k_total_label");
	const elKProfitLossLabel = document.getElementById("k_profit_loss_label");
	const elKProfitLoss = document.getElementById("k_profit_loss");
	const elKProfitLossCard = document.getElementById("k_profit_loss_card");
	const elPnlOnly = document.getElementById("k_pnl_only");
	const elShowPie = document.getElementById("k_show_pie");

	const elCanvas = document.getElementById("depotChart");
	const oCtx = elCanvas?.getContext("2d");
	const elPieCanvas = document.getElementById("depotPieChart");
	const oPieCtx = elPieCanvas?.getContext("2d");
	const elPieLegend = document.getElementById("depotPieLegend");
	const elPiePanel = document.getElementById("depotPiePanel");
	const elChartLayout = document.querySelector(".depot-chart-layout");

	if (!elDepotInfo || !elHoldingsTbody || !elDepotShareAccountSelect || !elKTotal || !elKTotalLabel || !elKProfitLoss || !elKProfitLossCard || !elPnlOnly || !elShowPie || !elCanvas || !oCtx || !elPieCanvas || !oPieCtx || !elPieLegend || !elPiePanel || !elChartLayout) {
		fnShowError("Depot-Ansicht konnte nicht korrekt initialisiert werden (fehlende DOM-Elemente).");
		return;
	}

	fnRenderShareAccountOptions(elDepotShareAccountSelect, true);
	elDepotShareAccountSelect.addEventListener("change", () => {
		setSelectedShareAccountId(String(elDepotShareAccountSelect.value || "").trim());
		fnRenderView(sActiveView);
	});

	let aPieItemsCurrent = [];
	let iSelectedPieIndex = -1;
	let nPieSelectScale = 0;
	let iAnimFrame = 0;
	let aLastDepotChartPoints = [];
	let bLastDepotPnlOnly = false;
	let iResizeAnimFrame = 0;
	let sProfitLossDisplayMode = "absolute";
	let nProfitLossAbs = Number.NaN;
	let nProfitLossPct = Number.NaN;
	let sDevelopmentDisplayMode = "absolute";
	let mRangeDevelopmentBySymbol = new Map();

	const fnRenderPie = () => {
		const bShowPie = Boolean(elShowPie.checked);
		elPiePanel.style.display = bShowPie ? "" : "none";
		elChartLayout.classList.toggle("is-pie-hidden", !bShowPie);
		if (!bShowPie) return;
		fnDrawPieChart(oPieCtx, elPieCanvas, aPieItemsCurrent, {
			iSelectedIndex: iSelectedPieIndex,
			nSelectScale: nPieSelectScale,
		});
		fnRenderPieLegend(elPieLegend, aPieItemsCurrent, iSelectedPieIndex);
	};

	const fnRedrawDepotFromCache = () => {
		if (!aLastDepotChartPoints.length) return;
		fnDrawLineChart(oCtx, elCanvas, aLastDepotChartPoints, bLastDepotPnlOnly);
		fnRenderPie();
	};

	const fnScheduleResponsiveRedraw = () => {
		cancelAnimationFrame(iResizeAnimFrame);
		iResizeAnimFrame = requestAnimationFrame(() => {
			fnRedrawDepotFromCache();
		});
	};

	const fnAnimatePieSelection = () => {
		cancelAnimationFrame(iAnimFrame);
		const nStart = performance.now();
		const nDuration = 220;
		const fnStep = (nNow) => {
			const nProgress = Math.min(1, (nNow - nStart) / nDuration);
			nPieSelectScale = nProgress;
			fnRenderPie();
			if (nProgress < 1) iAnimFrame = requestAnimationFrame(fnStep);
		};
		iAnimFrame = requestAnimationFrame(fnStep);
	};

	elPieCanvas.addEventListener("click", (oEvent) => {
		if (!aPieItemsCurrent.length) return;
		const oRect = elPieCanvas.getBoundingClientRect();
		const nX = oEvent.clientX - oRect.left;
		const nY = oEvent.clientY - oRect.top;
		const iHitIndex = fnGetPieSliceIndexAtPoint(elPieCanvas, aPieItemsCurrent, nX, nY);
		if (iHitIndex < 0) return;
		if (iSelectedPieIndex === iHitIndex) {
			iSelectedPieIndex = -1;
			nPieSelectScale = 0;
			fnRenderPie();
			return;
		}
		iSelectedPieIndex = iHitIndex;
		nPieSelectScale = 0;
		fnAnimatePieSelection();
	});

	let aPositions = [];
	try {
		aPositions = await fnLoadPositions();
	} catch (oError) {
		fnShowError(String(oError?.message || oError));
		elDepotInfo.textContent = "Konnte Positionen nicht laden.";
		fnClearCanvas(oCtx, elCanvas);
		fnClearCanvas(oPieCtx, elPieCanvas);
		fnRenderPieLegend(elPieLegend, []);
		return;
	}

	const aDepotRows = fnAggregateOwnedSymbols(aPositions);
	const mCurrentPriceBySymbol = await fnLoadCurrentPricesBySymbol(aDepotRows);

	const fnRenderProfitLoss = () => {
		const bShowPercent = sProfitLossDisplayMode === "percent";
		const sValueText = bShowPercent ? fnFmtSignedPct(nProfitLossPct) : fnFmtSignedMoney(nProfitLossAbs);
		const sClassName = nProfitLossAbs > 0
			? "stock-performance--positive"
			: (nProfitLossAbs < 0 ? "stock-performance--negative" : "stock-performance--neutral");
		elKProfitLoss.classList.remove("stock-performance--positive", "stock-performance--negative", "stock-performance--neutral");
		elKProfitLoss.classList.add(sClassName);
		elKProfitLoss.textContent = sValueText;
	};

	const fnRenderDepotRows = () => {
		elHoldingsTbody.innerHTML = aDepotRows
			.map((oRow) => {
				const sSymbol = fnEscapeHtml(String(oRow?.sSymbol || ""));
				const sLogoUrl = fnEscapeHtml(fnBuildStockLogoUrl(oRow?.sSymbol, { size: 48 }));
				const sAmount = fnFmtNumber(Number(oRow?.nTotalAmount), 4);
				const sBuyDate = Number.isFinite(oRow?.iEarliestBuyMs) ? fnFmtDateFromTimestamp(oRow.iEarliestBuyMs) : "—";
				const sDevelopment = fnBuildDevelopmentCellHtml(
					oRow,
					mCurrentPriceBySymbol,
					sDevelopmentDisplayMode,
					mRangeDevelopmentBySymbol
				);

				return `
        <tr>
          <td>
            <span class="stock-cell-with-logo">
              <img class="stock-logo stock-logo--sm" data-symbol="${sSymbol}" data-logo-size="48" src="${sLogoUrl}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
              <b>${sSymbol}</b>
            </span>
          </td>
          <td>${sAmount}</td>
          <td>${sBuyDate}</td>
          <td class="stock-performance-cell">${sDevelopment}</td>
        </tr>
      `;
			})
			.join("");
		elHoldingsTbody.querySelectorAll('img.stock-logo').forEach((img) => {
			img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
		});
	};

	const fnSetRangeLabels = (sRange) => {
		const oLabels = {
			"1D": fnT("common.day", "Tag"),
			"1W": fnT("common.week", "Woche"),
			"1M": fnT("month", "Monat"),
			"1Y": fnT("common.year", "Jahr"),
			"SINCE_BUY": fnT("stocks.since_buy", "Ab Kauf"),
		};
		const sRangeLabel = oLabels[sRange] || sRange;
		if (elHoldingsDevelopmentHeader) {
			elHoldingsDevelopmentHeader.textContent = fnT("stocks.profit_loss", "Gewinn/Verlust");
		}
		if (elKProfitLossLabel) {
			elKProfitLossLabel.textContent = `${fnT("stocks.profit_loss", "Gewinn/Verlust")} (${sRangeLabel})`;
		}
	};

	elKProfitLossCard.addEventListener("click", () => {
		sProfitLossDisplayMode = sProfitLossDisplayMode === "absolute" ? "percent" : "absolute";
		fnRenderProfitLoss();
	});

	elHoldingsTbody.addEventListener("click", (oEvent) => {
		const elTarget = oEvent.target instanceof Element ? oEvent.target.closest("td.stock-performance-cell") : null;
		if (!elTarget) return;
		sDevelopmentDisplayMode = sDevelopmentDisplayMode === "absolute" ? "percent" : "absolute";
		fnRenderDepotRows();
	});

	fnRenderDepotRows();

	const aElRangeButtons = [...document.querySelectorAll(".range-btn")];
	let sActiveRange = "1D";
	fnSetRangeLabels(sActiveRange);

		let bDepotChartRefreshing = false;
		const fnRefreshDepotChart = async () => {
			if (bDepotChartRefreshing) return;
			bDepotChartRefreshing = true;
			try {
				await fnBuildDepotChart({
				aPositions,
				aDepotRows,
				sRange: sActiveRange,
				oCtx,
				elCanvas,
				elInfo: elDepotInfo,
				elKTotal,
				elKTotalLabel,
				elKProfitLoss,
				bPnlOnly: Boolean(elPnlOnly.checked),
				oPieCtx,
				elPieCanvas,
				elPieLegend,
					fnOnCompositionChange: (aComposition) => {
						aPieItemsCurrent = aComposition;
						if (iSelectedPieIndex >= aPieItemsCurrent.length) iSelectedPieIndex = -1;
						fnRenderPie();
					},
					fnOnPointsChange: (aPoints, bPnlOnlyCurrent) => {
						aLastDepotChartPoints = Array.isArray(aPoints) ? aPoints : [];
						bLastDepotPnlOnly = Boolean(bPnlOnlyCurrent);
					},
					fnOnProfitLossChange: (nAbs, nPct) => {
						nProfitLossAbs = Number(nAbs);
						nProfitLossPct = Number(nPct);
						fnRenderProfitLoss();
					},
					fnOnDevelopmentBySymbolChange: (mNextDevelopmentBySymbol) => {
						mRangeDevelopmentBySymbol = mNextDevelopmentBySymbol instanceof Map
							? mNextDevelopmentBySymbol
							: new Map();
						fnRenderDepotRows();
					},
				});
			} finally {
				bDepotChartRefreshing = false;
			}
		};

	aElRangeButtons.forEach((elButton) => {
		elButton.addEventListener("click", async () => {
			aElRangeButtons.forEach((elOtherButton) => elOtherButton.classList.remove("active"));
			elButton.classList.add("active");
			sActiveRange = elButton.dataset.range;
			fnSetRangeLabels(sActiveRange);
			await fnRefreshDepotChart();
		});
	});

	elPnlOnly.addEventListener("change", async () => {
		await fnRefreshDepotChart();
	});

	elShowPie.addEventListener("change", async () => {
		fnRenderPie();
		fnScheduleResponsiveRedraw();
		await fnRefreshDepotChart();
	});

	window.addEventListener("resize", fnScheduleResponsiveRedraw);
	_resizeCleanup = () => window.removeEventListener("resize", fnScheduleResponsiveRedraw);

	await fnRefreshDepotChart();
}

/**
 * Baut den Gesamtdepot-Chart und die zugehörigen KPIs.
 * Scope: [DEPOT]
 * Variablen:
 * - `aSymbols`: Alle im Depot enthaltenen Symbole.
 * - `oQuery`: API-Parameter für den gewählten Zeitraum.
 * - `mSeriesBySymbol`: Geladene Kursdaten je Symbol.
 * - `aPoints`: Normierte Chartpunkte.
 * @param {{
 *  aPositions: Array<object>,
 *  sRange: string,
 *  oCtx: CanvasRenderingContext2D,
 *  elCanvas: HTMLCanvasElement,
 *  elInfo: HTMLElement,
 *  elKTotal: HTMLElement,
 *  elKTotalLabel: HTMLElement,
 *  elKProfitLoss: HTMLElement,
 *  bPnlOnly: boolean
 * }} oArgs
 */
async function fnBuildDepotChart(oArgs) {
	const aPositions = oArgs.aPositions || [];
	const aDepotRows = Array.isArray(oArgs.aDepotRows) ? oArgs.aDepotRows : fnAggregateOwnedSymbols(aPositions);
	if (!aPositions.length) {
		oArgs.elInfo.textContent = fnT("stocks.no_positions", "Keine Positionen vorhanden.");
		fnClearCanvas(oArgs.oCtx, oArgs.elCanvas);
		oArgs.fnOnProfitLossChange?.(Number.NaN, Number.NaN);
		oArgs.fnOnCompositionChange?.([]);
		oArgs.fnOnDevelopmentBySymbolChange?.(new Map());
		return;
	}

	const oQuery = fnRangeToQuery(oArgs.sRange, aPositions);
	oArgs.elInfo.textContent = `${fnT("stocks.loading_quotes", "Lade Kursdaten")} (${oArgs.sRange}, interval=${oQuery.interval})...`;

	const aSymbols = [...new Set(aPositions.map((oPosition) => String(oPosition?.symbol || "").trim().toUpperCase()).filter(Boolean))];
	const mSeriesBySymbol = await fnLoadSeriesForSymbols(aSymbols, oQuery);

	if (mSeriesBySymbol.size === 0) {
		oArgs.elInfo.textContent = fnT("stocks.no_data_received", "Keine Kursdaten erhalten (API Limit? falsche Symbole?).");
		fnClearCanvas(oArgs.oCtx, oArgs.elCanvas);
		oArgs.fnOnProfitLossChange?.(Number.NaN, Number.NaN);
		oArgs.fnOnCompositionChange?.([]);
		oArgs.fnOnDevelopmentBySymbolChange?.(new Map());
		return;
	}
	const mDevelopmentBySymbol = fnBuildRangeDevelopmentBySymbol(aDepotRows, aPositions, mSeriesBySymbol, oQuery, oArgs.sRange);
	oArgs.fnOnDevelopmentBySymbolChange?.(mDevelopmentBySymbol);

	const aRawTotalPoints = fnBuildSeriesPointsForPositions(aPositions, mSeriesBySymbol, false);
	const aTotalPointsWithRange = fnWithFixedDateRange(aRawTotalPoints, oQuery, false, oArgs.sRange);
	let aTotalPoints = aTotalPointsWithRange;
	const aRawDisplayPoints = oArgs.bPnlOnly
		? fnBuildSeriesPointsForPositions(aPositions, mSeriesBySymbol, true)
		: aRawTotalPoints;
	const aDisplayPointsWithRange = fnWithFixedDateRange(aRawDisplayPoints, oQuery, oArgs.bPnlOnly, oArgs.sRange);
	let aDisplayPoints = aDisplayPointsWithRange;

	if (aTotalPoints.length === 0 || aDisplayPoints.length === 0) {
		const aCurrentComposition = fnBuildDepotComposition(aPositions, mSeriesBySymbol);
		const nCurrentTotal = aCurrentComposition.reduce((nSum, oRow) => nSum + Number(oRow?.nValue || 0), 0);
		const nInvestedTotalFallback = aPositions.reduce((nSum, oPosition) => {
			const nAmount = Number(oPosition?.amount);
			const nBuyPrice = Number(oPosition?.worthwhenbought);
			if (!Number.isFinite(nAmount) || nAmount <= 0) return nSum;
			if (!Number.isFinite(nBuyPrice) || nBuyPrice < 0) return nSum;
			return nSum + nAmount * nBuyPrice;
		}, 0);
		if (aTotalPoints.length === 0) {
			const sTotalReferenceTime = String(aTotalPoints[0]?.t || "");
			aTotalPoints = fnBuildZeroFallbackSeries(oQuery, nCurrentTotal, sTotalReferenceTime);
		}
		if (aDisplayPoints.length === 0) {
			const sDisplayReferenceTime = String(aDisplayPoints[0]?.t || "");
			const nLastDisplayValue = oArgs.bPnlOnly ? (nCurrentTotal - nInvestedTotalFallback) : nCurrentTotal;
			aDisplayPoints = fnBuildZeroFallbackSeries(oQuery, nLastDisplayValue, sDisplayReferenceTime);
		}
	}

	const oLastTotalPoint = aTotalPoints[aTotalPoints.length - 1];
	const nLastTotal = Number(oLastTotalPoint?.y);

	oArgs.elKTotalLabel.textContent = fnT("stocks.depot_value_last_point", "Depotwert (letzter Punkt)");
	oArgs.elKTotal.textContent = fnFmtMoney(nLastTotal, "USD");
	const oFirstDisplayPoint = aDisplayPoints[0];
	const oLastDisplayPoint = aDisplayPoints[aDisplayPoints.length - 1];
	const nFirstDisplay = Number(oFirstDisplayPoint?.y);
	const nLastDisplay = Number(oLastDisplayPoint?.y);
	const nProfitLossAbs = Number.isFinite(nFirstDisplay) && Number.isFinite(nLastDisplay)
		? (nLastDisplay - nFirstDisplay)
		: Number.NaN;
	const nProfitLossPct = Number.isFinite(nFirstDisplay) && nFirstDisplay > 0
		? (nProfitLossAbs / nFirstDisplay) * 100
		: Number.NaN;
	oArgs.fnOnProfitLossChange?.(nProfitLossAbs, nProfitLossPct);

	fnDrawLineChart(oArgs.oCtx, oArgs.elCanvas, aDisplayPoints, oArgs.bPnlOnly);
	oArgs.fnOnPointsChange?.(aDisplayPoints, oArgs.bPnlOnly);
	const aComposition = fnBuildDepotComposition(aPositions, mSeriesBySymbol);
	oArgs.fnOnCompositionChange?.(aComposition);

	const bSomeFromCache = [...mSeriesBySymbol.values()].some((oSeries) => oSeries.fromCache);
	oArgs.elInfo.textContent = `${fnT("stocks.chart_updated", "Chart aktualisiert")}: ${oArgs.sRange}${bSomeFromCache ? ` (${fnT("stocks.partly_from_cache", "teilweise aus Cache")})` : ""}`;
}

// =====================================================
// [ANALYSE] 10) Einzelanalyse-Funktionen
// Nur für data-view=\"analysis\".
// =====================================================

/**
 * Initialisiert die Einzelanalyse inkl. API-Suche, Depot-Auswahl, Kauf und Einzel-Chart.
 * Scope: [ANALYSE]
 * Variablen:
 * - `aPositions`: Vollständige Positionsliste.
 * - `aOwnedRows`: Aggregierte Symbol-Zeilen aus dem Depot.
 * - `sCatalogSearchTerm`: Aktueller Suchstring für die Suche.
 * - `sActiveRange`: Gewählter Zeitraum.
 * - `sSelectedSymbol`: Aktuell ausgewähltes Symbol.
 * - `nLastKnownClose`: Letzter bekannter Kurs für Kauf-Fallback.
 */
export async function fnInitAnalysisView() {
	const sNoExchangeValue = "__NONE__";
	const sNoAssetClassValue = "__NONE__";
	const elInfo = document.getElementById("analysisInfo");
	const elCatalogSearchInput = document.getElementById("analysisCatalogSearchInput");
	const elExchangeSelect = document.getElementById("analysisExchangeSelect");
	const elAssetClassSelect = document.getElementById("analysisAssetClassSelect");
	const elCatalogSelectFirstBtn = document.getElementById("analysisCatalogSelectFirstBtn");
	const elSearchResults = document.getElementById("analysisSearchResults");
	const elOwnedSymbolSelect = document.getElementById("analysisOwnedSymbolSelect");
	const elUseOwnedBtn = document.getElementById("analysisUseOwnedBtn");
	const elTradeAmountInput = document.getElementById("analysisTradeAmountInput");
	const elTradeShareAccountSelect = document.getElementById("analysisTradeShareAccountSelect");
	const elBuyBtn = document.getElementById("analysisBuyBtn");
	const elSellBtn = document.getElementById("analysisSellBtn");
	const elBuyFeedback = document.getElementById("analysisBuyFeedback");
	const elTableTbody = document.querySelector("#analysisHoldingsTable tbody");

	const elTotalLabel = document.getElementById("analysis_total_label");
	const elTotal = document.getElementById("analysis_total");
	const elChange = document.getElementById("analysis_change");

	const elCanvas = document.getElementById("analysisChart");
	const oCtx = elCanvas?.getContext("2d");

	if (!elInfo || !elCatalogSearchInput || !elExchangeSelect || !elAssetClassSelect || !elCatalogSelectFirstBtn || !elSearchResults || !elOwnedSymbolSelect || !elUseOwnedBtn || !elTradeAmountInput || !elTradeShareAccountSelect || !elBuyBtn || !elSellBtn || !elBuyFeedback || !elTableTbody || !elTotalLabel || !elTotal || !elChange || !elCanvas || !oCtx) {
		fnShowError(fnT("stocks.analysis_view_init_failed", "Einzelanalyse konnte nicht korrekt initialisiert werden (fehlende DOM-Elemente)."));
		return;
	}

	let aPositions = [];
	try {
		aPositions = await fnLoadPositions();
	} catch (oError) {
		fnShowError(String(oError?.message || oError));
		elInfo.textContent = fnT("stocks.load_positions_failed", "Konnte Positionen nicht laden.");
		fnClearCanvas(oCtx, elCanvas);
		return;
	}

	let aOwnedRows = fnAggregateOwnedSymbols(aPositions);
	let sActiveRange = "1D";
	let sCatalogSearchTerm = "";
	let sSelectedSymbol = aOwnedRows[0]?.sSymbol || "";
	let aCurrentSearchResults = [];
	let iSearchRequestSeq = 0;
	let nLastKnownClose = Number.NaN;
	let sSelectedTradeShareAccountId = fnNormalizeAccountId(sSelectedShareAccountId || aShareAccounts[0]?.id);
	let sSelectedExchange = typeof fnGetTradingExchange === "function" ? fnGetTradingExchange() : "NASDAQ";
	let sSelectedAssetClass = sNoAssetClassValue;

	const aElRangeButtons = [...document.querySelectorAll(".range-btn")];

	const fnRenderOwnedRows = async () => {
		const mCurrentPriceBySymbol = await fnLoadCurrentPricesBySymbol(aOwnedRows);
		elTableTbody.innerHTML = aOwnedRows
			.map((oRow) => {
				const sFirstBuyDate = Number.isFinite(oRow.iEarliestBuyMs)
					? fnFmtDateFromTimestamp(oRow.iEarliestBuyMs)
					: "—";

				return `
          <tr>
            <td><b>${fnEscapeHtml(oRow.sSymbol)}</b></td>
            <td>${fnFmtNumber(oRow.nTotalAmount, 4)}</td>
            <td>${sFirstBuyDate}</td>
            <td>${fnBuildDevelopmentCellHtml(oRow, mCurrentPriceBySymbol)}</td>
          </tr>
        `;
			})
			.join("");
	};

	const fnRenderOwnedSelectOptions = () => {
		if (!aOwnedRows.some((oRow) => oRow.sSymbol === sSelectedSymbol)) {
			sSelectedSymbol = aOwnedRows[0]?.sSymbol || sSelectedSymbol;
		}

		elOwnedSymbolSelect.innerHTML = aOwnedRows
			.map((oRow) => `<option value="${fnEscapeHtml(oRow.sSymbol)}">${fnEscapeHtml(oRow.sSymbol)}</option>`)
			.join("");

		if (sSelectedSymbol && aOwnedRows.some((oRow) => oRow.sSymbol === sSelectedSymbol)) {
			elOwnedSymbolSelect.value = sSelectedSymbol;
		}
	};

	const fnRenderTradeShareAccountOptions = () => {
		elTradeShareAccountSelect.innerHTML = aShareAccounts
			.map((oAccount) => `<option value="${fnEscapeHtml(oAccount.id)}">${fnEscapeHtml(oAccount.label)}</option>`)
			.join("");
		if (aShareAccounts.some((oAccount) => oAccount.id === sSelectedTradeShareAccountId)) {
			elTradeShareAccountSelect.value = sSelectedTradeShareAccountId;
		} else {
			sSelectedTradeShareAccountId = fnNormalizeAccountId(sSelectedShareAccountId || aShareAccounts[0]?.id);
			elTradeShareAccountSelect.value = sSelectedTradeShareAccountId;
		}
		elTradeShareAccountSelect.disabled = aShareAccounts.length === 0;
	};

	const fnRenderExchangeOptions = () => {
		const aExchanges = typeof fnGetCommonTradingExchanges === "function"
			? fnGetCommonTradingExchanges()
			: [
				"XSTU", "XDUS", "MUNICH", "MTA", "FSX", "OTC", "NASDAQ", "LSE", "VSE", "CBOE",
				"XETR", "XBER", "BSE", "NYSE", "JPX", "KRX", "NEO", "NSE", "SZSE", "HKEX",
				"SSE", "EURONEXT", "TWSE", "XHAM", "XHAN", "BMV", "SIX", "TSX", "ASX", "CXA",
				"TSXV", "BOVESPA", "OMX", "TASE", "BVS", "MYX", "IDX", "GPW", "SET", "OSE",
				"CSE", "SGX", "BIST", "JSE", "BCBA", "TADAWUL", "PSX", "BVCC", "NZX", "OMXC",
				"EGX", "BME", "PSE", "OMXH", "BVL", "MOEX", "ASE", "XKUW", "BVB", "ADX",
				"ISE", "QE", "BVC", "XSAP", "DFM", "OMXR", "ICEX", "OMXV", "OMXT",
			];
		const sNormalizedSelectedExchange = String(
			sSelectedExchange === sNoExchangeValue
				? sNoExchangeValue
				: (typeof fnSetTradingExchange === "function" ? fnSetTradingExchange(sSelectedExchange) : sSelectedExchange),
		).toUpperCase();

		elExchangeSelect.innerHTML = [
			`<option value="${fnEscapeHtml(sNoExchangeValue)}">${fnEscapeHtml(fnT("stocks.exchange_none", "No exchange"))}</option>`,
			...aExchanges
			.map((sExchange) => {
				const sNormalizedExchange = String(sExchange || "").trim().toUpperCase();
				const sLabel = sNormalizedExchange === "XETR" ? "XETRA (XETR)" : sNormalizedExchange;
				return `<option value="${fnEscapeHtml(sNormalizedExchange)}">${fnEscapeHtml(sLabel)}</option>`;
			}),
		].join("");
		elExchangeSelect.value = (sNormalizedSelectedExchange === sNoExchangeValue || aExchanges.includes(sNormalizedSelectedExchange))
			? sNormalizedSelectedExchange
			: aExchanges[0];
		sSelectedExchange = String(elExchangeSelect.value || "").trim().toUpperCase();
	};

	const fnRenderAssetClassOptions = () => {
		elAssetClassSelect.innerHTML = [
			`<option value="${fnEscapeHtml(sNoAssetClassValue)}">${fnEscapeHtml(fnT("stocks.asset_class_none", "No asset class"))}</option>`,
			`<option value="stock">${fnEscapeHtml(fnT("stocks.asset_class_stock", "Stock"))}</option>`,
			`<option value="etf">${fnEscapeHtml(fnT("stocks.asset_class_etf", "ETF"))}</option>`,
		].join("");

		elAssetClassSelect.value = ["stock", "etf", sNoAssetClassValue].includes(sSelectedAssetClass)
			? sSelectedAssetClass
			: sNoAssetClassValue;
		sSelectedAssetClass = String(elAssetClassSelect.value || sNoAssetClassValue).trim().toLowerCase();
	};

	const fnRenderSearchResults = async () => {
		const sNeedle = String(sCatalogSearchTerm || "").trim();
		const iRequestSeq = ++iSearchRequestSeq;

		if (!sNeedle) {
			aCurrentSearchResults = [];
			if (iRequestSeq === iSearchRequestSeq) {
				elSearchResults.innerHTML = `<div class="muted">${fnT("stocks.enter_search", "Bitte Suchbegriff eingeben.")}</div>`;
			}
			return;
		}

		aCurrentSearchResults = await fnSearchStocksViaBackend(sNeedle, { sExchange: sSelectedExchange, sAssetClass: sSelectedAssetClass, iLimit: 20 });

		if (iRequestSeq !== iSearchRequestSeq) return;

		if (!aCurrentSearchResults.length) {
			elSearchResults.innerHTML = `<div class="muted">${fnT("stocks.no_results", "Keine Treffer gefunden.")}</div>`;
			return;
		}

		elSearchResults.innerHTML = aCurrentSearchResults
			.map((oRow) => {
				const sLabel = `${fnEscapeHtml(oRow.sSymbol)} - ${fnEscapeHtml(oRow.sName || fnT("stocks.unknown_name", "Unbekannter Name"))}`;
				const sMeta = [oRow.sExchange, oRow.sCurrency || oRow.sCountry].filter(Boolean).join(" | ");
				return `
          <button type="button" class="analysis-search-item" data-symbol="${fnEscapeHtml(oRow.sSymbol)}">
            <span><b>${sLabel}</b></span>
            <small>${fnEscapeHtml(sMeta)}</small>
          </button>
        `;
			})
			.join("");
	};

	const fnGetLatestPriceBySymbol = async (sSymbol) => {
		try {
			const oQuoteResult = await fnGetLatestPriceBySymbolWithFallback(sSymbol);
			if (Number.isFinite(oQuoteResult?.nPrice) && oQuoteResult.nPrice > 0) return oQuoteResult.nPrice;
			return Number.NaN;
		} catch {
			return Number.NaN;
		}
	};

	let bAnalysisChartRefreshing = false;
	const fnRefreshAnalysisChart = async () => {
		if (bAnalysisChartRefreshing) return;
		bAnalysisChartRefreshing = true;
		try {
			const oChartResult = await fnBuildAnalysisChart({
				aPositions,
				sSelectedSymbol,
				sRange: sActiveRange,
				oCtx,
				elCanvas,
				elInfo,
				elTotal,
				elTotalLabel,
				elChange,
			});
			nLastKnownClose = Number.isFinite(oChartResult?.nLastClose) ? oChartResult.nLastClose : Number.NaN;
		} finally {
			bAnalysisChartRefreshing = false;
		}
	};

	let _searchDebounceTimer = null;
	elCatalogSearchInput.addEventListener("input", () => {
		sCatalogSearchTerm = String(elCatalogSearchInput.value || "").trim();
		clearTimeout(_searchDebounceTimer);
		_searchDebounceTimer = setTimeout(() => fnRenderSearchResults(), 250);
	});

	elExchangeSelect.addEventListener("change", async () => {
		sSelectedExchange = String(elExchangeSelect.value || "").trim().toUpperCase();
		if (sSelectedExchange !== sNoExchangeValue && typeof fnSetTradingExchange === "function") {
			sSelectedExchange = fnSetTradingExchange(sSelectedExchange);
		}
		await fnRenderSearchResults();
		fnRefreshStockLogoTheme?.(document);
	});

	elAssetClassSelect.addEventListener("change", async () => {
		sSelectedAssetClass = String(elAssetClassSelect.value || sNoAssetClassValue).trim().toLowerCase();
		await fnRenderSearchResults();
	});

	elCatalogSelectFirstBtn.addEventListener("click", async () => {
		const oFirstHit = aCurrentSearchResults[0];
		if (!oFirstHit?.sSymbol) {
			elInfo.textContent = fnT("stocks.no_selectable_hit", "Kein Treffer zur aktuellen Suche auswählbar.");
			return;
		}

		sSelectedSymbol = oFirstHit.sSymbol;
		elBuyFeedback.textContent = "";
		await fnRefreshAnalysisChart();
	});

	elSearchResults.addEventListener("click", async (oEvent) => {
		const elTarget = oEvent.target instanceof Element ? oEvent.target : null;
		const elTargetButton = elTarget?.closest("button[data-symbol]");
		if (!elTargetButton) return;
		sSelectedSymbol = String(elTargetButton.dataset.symbol || "").trim().toUpperCase();
		elBuyFeedback.textContent = "";
		await fnRefreshAnalysisChart();
	});

	elUseOwnedBtn.addEventListener("click", async () => {
		sSelectedSymbol = String(elOwnedSymbolSelect.value || "").trim().toUpperCase();
		elBuyFeedback.textContent = "";
		await fnRefreshAnalysisChart();
	});

	elOwnedSymbolSelect.addEventListener("change", async () => {
		sSelectedSymbol = String(elOwnedSymbolSelect.value || "").trim().toUpperCase();
		elBuyFeedback.textContent = "";
		await fnRefreshAnalysisChart();
	});

	elTradeShareAccountSelect.addEventListener("change", () => {
		sSelectedTradeShareAccountId = fnNormalizeAccountId(elTradeShareAccountSelect.value);
	});

	aElRangeButtons.forEach((elButton) => {
		elButton.addEventListener("click", async () => {
			aElRangeButtons.forEach((elOtherButton) => elOtherButton.classList.remove("active"));
			elButton.classList.add("active");
			sActiveRange = elButton.dataset.range;
			await fnRefreshAnalysisChart();
		});
	});

	elBuyBtn.addEventListener("click", async () => {
		if (elBuyBtn.disabled) return;
		elBuyBtn.disabled = true;
		elSellBtn.disabled = true;
		try {
			const sSymbol = String(sSelectedSymbol || "").trim().toUpperCase();
			const nAmount = Number(elTradeAmountInput.value);

			if (!sSymbol) {
				elBuyFeedback.textContent = fnT("stocks.select_stock_first", "Bitte zuerst eine Aktie auswählen.");
				return;
			}

			if (!Number.isFinite(nAmount) || nAmount <= 0) {
				elBuyFeedback.textContent = fnT("stocks.invalid_buy_amount", "Bitte eine gültige Kaufmenge größer als 0 eingeben.");
				return;
			}
			if (nAmount > 1_000_000) {
				elBuyFeedback.textContent = fnT("stocks.buy_amount_too_large", "Kaufmenge darf 1.000.000 nicht überschreiten.");
				return;
			}

			const sTargetShareAccountId = fnNormalizeAccountId(sSelectedTradeShareAccountId);
			if (!sTargetShareAccountId) {
				elBuyFeedback.textContent = fnT("stocks.buy_missing_share_account", "Kauf nicht möglich: Bitte ein Aktienkonto auswählen.");
				return;
			}

			let nBuyPrice = await fnGetLatestPriceBySymbol(sSymbol);
			if (!Number.isFinite(nBuyPrice) || nBuyPrice <= 0) {
				nBuyPrice = nLastKnownClose;
			}
			if (!Number.isFinite(nBuyPrice) || nBuyPrice <= 0) {
				elBuyFeedback.textContent = fnT("stocks.buy_price_unavailable", "Kauf nicht möglich: aktueller Kurs konnte nicht geladen werden.");
				return;
			}

			const nTradeTotalValue = nAmount * nBuyPrice;
			let oSelectedBankAccount;
			try {
				oSelectedBankAccount = await fnPromptBankAccountSelection({
					sActionLabel: "Kauf",
					sSymbol,
					nAmount,
					nTotalValue: nTradeTotalValue,
				});
			} catch (oError) {
				elBuyFeedback.textContent = `${fnT("stocks.buy_not_possible", "Kauf nicht möglich")}: ${String(oError?.message || oError)}`;
				return;
			}

			if (!oSelectedBankAccount?.id) {
				elBuyFeedback.textContent = fnT("stocks.buy_cancelled", "Kauf abgebrochen.");
				return;
			}

			try {
				await fnCreateDashboardTradeEntry({
					sType: "expense",
					sSymbol,
					nAmount,
					nTotalValue: nTradeTotalValue,
					sBankAccountId: oSelectedBankAccount.id,
				});
			} catch (oError) {
				elBuyFeedback.textContent = `${fnT("stocks.buy_not_saved", "Kauf nicht gespeichert")}: ${String(oError?.message || oError)}`;
				return;
			}

			const iNowUnixSeconds = Math.floor(Date.now() / 1000);
			const oNewPosition = {
				symbol: sSymbol,
				amount: nAmount,
				created_at: iNowUnixSeconds,
				worthwhenbought: nBuyPrice,
				share_account_id: sTargetShareAccountId,
			};

			fnPersistBoughtPosition(oNewPosition);
			if (fnIsAllAccountsSelected() || fnNormalizeAccountId(sSelectedShareAccountId) === sTargetShareAccountId) {
				aPositions.push(oNewPosition);
			}
			aOwnedRows = fnAggregateOwnedSymbols(aPositions);
			await fnRenderOwnedRows();
			fnRenderOwnedSelectOptions();
			const sTargetShareLabel = fnGetShareAccountLabel(sTargetShareAccountId);
			elBuyFeedback.textContent = fnT("stocks.buy_saved_detail", "Kauf gespeichert: {amount} x {symbol} zu {price} auf {shareAccount}, abgebucht von {bankAccount}.", {
				amount: fnFmtNumber(nAmount, 4),
				symbol: sSymbol,
				price: fnFmtMoney(nBuyPrice, "USD"),
				shareAccount: sTargetShareLabel,
				bankAccount: oSelectedBankAccount.label,
			});
			await fnRefreshAnalysisChart();
		} finally {
			elBuyBtn.disabled = false;
			elSellBtn.disabled = false;
		}
	});

	elSellBtn.addEventListener("click", async () => {
		if (elSellBtn.disabled) return;
		elBuyBtn.disabled = true;
		elSellBtn.disabled = true;
		try {
			const sSymbol = String(sSelectedSymbol || "").trim().toUpperCase();
			const nAmount = Number(elTradeAmountInput.value);

			if (!sSymbol) {
				elBuyFeedback.textContent = fnT("stocks.select_stock_first", "Bitte zuerst eine Aktie auswählen.");
				return;
			}

			if (!Number.isFinite(nAmount) || nAmount <= 0) {
				elBuyFeedback.textContent = fnT("stocks.invalid_sell_amount", "Bitte eine gültige Verkaufsmenge größer als 0 eingeben.");
				return;
			}
			if (nAmount > 1_000_000) {
				elBuyFeedback.textContent = fnT("stocks.sell_amount_too_large", "Verkaufsmenge darf 1.000.000 nicht überschreiten.");
				return;
			}

			const oOwnedRow = aOwnedRows.find((oRow) => oRow.sSymbol === sSymbol);
			const nOwnedAmount = Number(oOwnedRow?.nTotalAmount);
			if (!Number.isFinite(nOwnedAmount) || nOwnedAmount <= 0) {
				elBuyFeedback.textContent = fnT("stocks.sell_not_possible_not_owned", "Verkauf nicht möglich: {symbol} ist nicht im Bestand.", { symbol: sSymbol });
				return;
			}
			if (nAmount > nOwnedAmount) {
				elBuyFeedback.textContent = fnT("stocks.sell_not_possible_stock", "Verkauf nicht möglich: Bestand {amount} {symbol}.", {
					amount: fnFmtNumber(nOwnedAmount, 4),
					symbol: sSymbol,
				});
				return;
			}

			const sTargetShareAccountId = fnNormalizeAccountId(sSelectedTradeShareAccountId);
			if (!sTargetShareAccountId) {
				elBuyFeedback.textContent = fnT("stocks.sell_missing_share_account", "Verkauf nicht möglich: Bitte ein Aktienkonto auswählen.");
				return;
			}

			const nOwnedAmountOnTargetAccount = aPositions
				.filter((oPosition) => String(oPosition?.symbol || "").trim().toUpperCase() === sSymbol)
				.filter((oPosition) => fnGetPositionShareAccountId(oPosition) === sTargetShareAccountId)
				.reduce((nSum, oPosition) => nSum + Number(oPosition?.amount || 0), 0);
			if (nAmount > nOwnedAmountOnTargetAccount) {
				elBuyFeedback.textContent = fnT("stocks.sell_not_possible_account_stock", "Verkauf nicht möglich: Bestand auf {account} ist {amount} {symbol}.", {
					account: fnGetShareAccountLabel(sTargetShareAccountId),
					amount: fnFmtNumber(nOwnedAmountOnTargetAccount, 4),
					symbol: sSymbol,
				});
				return;
			}

			let nSellPrice = await fnGetLatestPriceBySymbol(sSymbol);
			if (!Number.isFinite(nSellPrice) || nSellPrice <= 0) {
				nSellPrice = nLastKnownClose;
			}
			if (!Number.isFinite(nSellPrice) || nSellPrice <= 0) {
				elBuyFeedback.textContent = fnT("stocks.sell_price_unavailable", "Verkauf nicht möglich: aktueller Kurs konnte nicht geladen werden.");
				return;
			}

			const nTradeTotalValue = nAmount * nSellPrice;
			let oSelectedBankAccount;
			try {
				oSelectedBankAccount = await fnPromptBankAccountSelection({
					sActionLabel: "Verkauf",
					sSymbol,
					nAmount,
					nTotalValue: nTradeTotalValue,
				});
			} catch (oError) {
				elBuyFeedback.textContent = `${fnT("stocks.sell_not_possible", "Verkauf nicht möglich")}: ${String(oError?.message || oError)}`;
				return;
			}

			if (!oSelectedBankAccount?.id) {
				elBuyFeedback.textContent = fnT("stocks.sell_cancelled", "Verkauf abgebrochen.");
				return;
			}

			try {
				await fnCreateDashboardTradeEntry({
					sType: "income",
					sSymbol,
					nAmount,
					nTotalValue: nTradeTotalValue,
					sBankAccountId: oSelectedBankAccount.id,
				});
			} catch (oError) {
				elBuyFeedback.textContent = `${fnT("stocks.sell_not_saved", "Verkauf nicht gespeichert")}: ${String(oError?.message || oError)}`;
				return;
			}

			const iNowUnixSeconds = Math.floor(Date.now() / 1000);
			const oSoldPosition = {
				symbol: sSymbol,
				amount: nAmount,
				created_at: iNowUnixSeconds,
				share_account_id: sTargetShareAccountId,
			};

			fnPersistSoldPosition(oSoldPosition);
			aPositions = fnApplySoldPositions(aPositions, [oSoldPosition]);
			aOwnedRows = fnAggregateOwnedSymbols(aPositions);
			await fnRenderOwnedRows();
			fnRenderOwnedSelectOptions();

			elBuyFeedback.textContent = fnT("stocks.sell_saved_detail", "Verkauf gespeichert: {amount} x {symbol} von {shareAccount}, gutgeschrieben auf {bankAccount}.", {
				amount: fnFmtNumber(nAmount, 4),
				symbol: sSymbol,
				shareAccount: fnGetShareAccountLabel(sTargetShareAccountId),
				bankAccount: oSelectedBankAccount.label,
			});
			await fnRefreshAnalysisChart();
		} finally {
			elBuyBtn.disabled = false;
			elSellBtn.disabled = false;
		}
	});

	await fnRenderOwnedRows();
	fnRenderOwnedSelectOptions();
	fnRenderTradeShareAccountOptions();
	fnRenderExchangeOptions();
	fnRenderAssetClassOptions();
	await fnRenderSearchResults();

	if (sSelectedSymbol) {
		await fnRefreshAnalysisChart();
	} else {
		elInfo.textContent = fnT("stocks.no_stock_available_use_search", "Keine Aktie verfügbar. Bitte Suche verwenden.");
		fnClearCanvas(oCtx, elCanvas);
	}

}

/**
 * Baut den Einzelchart für ein gewähltes Symbol inkl. KPI-Berechnung.
 * Scope: [ANALYSE]
 * @param {{
 *  aPositions: Array<object>,
 *  sSelectedSymbol: string,
 *  sRange: string,
 *  oCtx: CanvasRenderingContext2D,
 *  elCanvas: HTMLCanvasElement,
 *  elInfo: HTMLElement,
 *  elTotal: HTMLElement,
 *  elTotalLabel: HTMLElement,
 *  elChange: HTMLElement
 * }} oArgs
 */
async function fnBuildAnalysisChart(oArgs) {
	const sSymbol = String(oArgs.sSelectedSymbol || "").trim().toUpperCase();
	if (!sSymbol) {
		oArgs.elInfo.textContent = fnT("stocks.no_stock_selected", "Keine Aktie ausgewählt.");
		fnClearCanvas(oArgs.oCtx, oArgs.elCanvas);
		return;
	}

	const aSymbolPositions = (oArgs.aPositions || []).filter((oPosition) => {
		return String(oPosition?.symbol || "").trim().toUpperCase() === sSymbol;
	});

	const aPositionsForRange = aSymbolPositions.length
		? aSymbolPositions
		: [{ symbol: sSymbol, amount: 1, created_at: Date.now(), worthwhenbought: 0 }];

	const oQuery = fnRangeToQuery(oArgs.sRange, aPositionsForRange);
	oArgs.elInfo.textContent = `${fnT("stocks.loading_quotes_for", "Lade Kursdaten für {symbol}", { symbol: sSymbol })} (${oArgs.sRange}, interval=${oQuery.interval})...`;

	const mSeriesBySymbol = await fnLoadSeriesForSymbols([sSymbol], oQuery);
	if (!mSeriesBySymbol.size) {
		try {
			const oQuoteResult = await fnGetLatestPriceBySymbolWithFallback(sSymbol);
			const nLast = Number(oQuoteResult?.nPrice);
			if (!Number.isFinite(nLast) || nLast <= 0) throw new Error(fnT("stocks.invalid_quote_price", "Quote ohne gueltigen Kurs."));

			const aQuoteFallbackPoints = fnBuildZeroFallbackSeries(oQuery, nLast, "");
			const nFirst = Number(aQuoteFallbackPoints[0]?.y);
			const nChangeAbs = nLast - nFirst;
			const nChangePct = nFirst !== 0 ? (nChangeAbs / nFirst) * 100 : Number.NaN;

			oArgs.elTotalLabel.textContent = fnT("stocks.price_symbol_last_point", "Kurs {symbol} (letzter Punkt)", { symbol: sSymbol });
			oArgs.elTotal.textContent = fnFmtMoney(nLast, "USD");
			oArgs.elChange.textContent = `${fnFmtMoney(nChangeAbs, "USD")} (${Number.isFinite(nChangePct) ? nChangePct.toFixed(2) : "—"}%)`;
			fnDrawLineChart(oArgs.oCtx, oArgs.elCanvas, aQuoteFallbackPoints, false);
			oArgs.elInfo.textContent = fnT("stocks.no_history_live_quote_fallback", "Keine Historie fuer {symbol}; Fallback auf Live-Quote ({source}{cache}).", {
				symbol: sSymbol,
				source: oQuoteResult.sourceSymbol,
				cache: oQuoteResult.fromCache ? ", Cache" : "",
			});
			return { nLastClose: nLast };
		} catch (oQuoteError) {
			const sSeriesError = String(mSeriesBySymbol?.mErrorsBySymbol?.get?.(sSymbol) || "").trim();
			const sQuoteError = String(oQuoteError?.message || oQuoteError || "").trim();
			const sDetail = [sSeriesError, sQuoteError].filter(Boolean).join(" | ");
			oArgs.elInfo.textContent = sDetail
				? fnT("stocks.no_data_for_symbol_with_detail", "Keine Kursdaten fuer {symbol}. Detail: {detail}", { symbol: sSymbol, detail: sDetail })
				: fnT("stocks.no_data_for_symbol", "Keine Kursdaten fuer {symbol} erhalten.", { symbol: sSymbol });
			fnClearCanvas(oArgs.oCtx, oArgs.elCanvas);
			return;
		}
	}

	const aSeriesValues = mSeriesBySymbol.get(sSymbol)?.values || [];
	const aRawPoints = aSeriesValues
		.map((oValue) => {
			const sTime = String(oValue?.datetime || "");
			const nClose = Number(oValue?.close);
			if (!sTime || !Number.isFinite(nClose)) return null;
			return { t: sTime, total: nClose, invested: 0, pnl: 0, y: nClose };
		})
		.filter(Boolean);

	let aPoints = fnWithFixedDateRange(aRawPoints, oQuery, false, oArgs.sRange);

	if (aPoints.length === 0) {
		let nLastValue = Number(aPoints[aPoints.length - 1]?.y);
		if (!Number.isFinite(nLastValue) || nLastValue === 0) {
			const nLatestSeriesClose = Number(aSeriesValues[aSeriesValues.length - 1]?.close);
			if (Number.isFinite(nLatestSeriesClose)) {
				nLastValue = nLatestSeriesClose;
			}
		}
		const sReferenceTime = String(aPoints[0]?.t || "");
		aPoints = fnBuildZeroFallbackSeries(oQuery, Number.isFinite(nLastValue) ? nLastValue : 0, sReferenceTime);
	}

	const nFirst = aPoints[0].y;
	const nLast = aPoints[aPoints.length - 1].y;
	const nChangeAbs = nLast - nFirst;
	const nChangePct = nFirst !== 0 ? (nChangeAbs / nFirst) * 100 : Number.NaN;

	oArgs.elTotalLabel.textContent = fnT("stocks.price_symbol_last_point", "Kurs {symbol} (letzter Punkt)", { symbol: sSymbol });
	oArgs.elTotal.textContent = fnFmtMoney(nLast, "USD");
	oArgs.elChange.textContent = `${fnFmtMoney(nChangeAbs, "USD")} (${Number.isFinite(nChangePct) ? nChangePct.toFixed(2) : "—"}%)`;

	fnDrawLineChart(oArgs.oCtx, oArgs.elCanvas, aPoints, false);

	const bFromCache = [...mSeriesBySymbol.values()].some((oSeries) => oSeries.fromCache);
	const nOwnedAmount = aSymbolPositions.reduce((nSum, oPosition) => {
		const nAmount = Number(oPosition?.amount);
		return Number.isFinite(nAmount) ? nSum + nAmount : nSum;
	}, 0);
	const sOwnedHint = nOwnedAmount > 0
		? fnT("stocks.owned_hint", ", Bestand: {amount} Stk", { amount: fnFmtNumber(nOwnedAmount, 4) })
		: fnT("stocks.not_in_depot", ", nicht im Depot");
	oArgs.elInfo.textContent = fnT("stocks.chart_updated_detail", "Chart aktualisiert: {symbol}, {range}{cache}{owned}", {
		symbol: sSymbol,
		range: oArgs.sRange,
		cache: bFromCache ? fnT("stocks.from_cache_suffix", " (aus Cache)") : "",
		owned: sOwnedHint,
	});
	return { nLastClose: nLast };
}

// =====================================================
// [KATEGORIEN] 11) Kategorie-Funktionen
// Für Stammaktie, ETF und Real Estate.
// =====================================================

/**
 * Liefert Anzeige- und Filtermetadaten für eine Kategorie.
 * Scope: [KATEGORIEN]
 * @param {string} sCategoryView
 * @returns {{sTitle: string}}
 */
export function fnGetCategoryMeta(sCategoryView) {
	if (sCategoryView === "category_common_stock") return { sTitle: "Stammaktie" };
	if (sCategoryView === "category_preferred_stock") return { sTitle: "Vorzugsaktie" };
	if (sCategoryView === "category_etf") return { sTitle: "ETF" };
	if (sCategoryView === "category_real_estate") return { sTitle: "Immobilien" };
	if (sCategoryView === "category_depositary_receipts") return { sTitle: "Hinterlegungsscheine" };
	if (sCategoryView === "category_partnerships") return { sTitle: "Personengesellschaften" };
	if (sCategoryView === "category_closed_end_funds") return { sTitle: "Geschlossene Fonds" };
	if (sCategoryView === "category_etn") return { sTitle: "ETNs" };
	return { sTitle: "Kategorie" };
}

/**
 * Prüft, ob ein Katalogeintrag zur gewünschten Kategorie gehört.
 * Scope: [KATEGORIEN]
 * @param {{sName?: string, sType?: string} | null | undefined} oCatalogRow
 * @param {string} sCategoryView
 * @returns {boolean}
 */
function fnIsCatalogRowInCategory(oCatalogRow, sCategoryView) {
	if (!oCatalogRow) return false;
	const sType = String(oCatalogRow?.sType || "").trim().toLowerCase();
	const sName = String(oCatalogRow?.sName || "").trim().toLowerCase();

	if (sCategoryView === "category_common_stock") {
		return sType === "common stock";
	}
	if (sCategoryView === "category_preferred_stock") {
		return sType === "preferred stock";
	}
	if (sCategoryView === "category_etf") {
		return sType.includes("etf") || sType.includes("exchange-traded fund") || sName.includes(" etf");
	}
	if (sCategoryView === "category_real_estate") {
		return sType === "reit";
	}
	if (sCategoryView === "category_depositary_receipts") {
		return sType === "depositary receipt" || sType === "american depositary receipt" || sType === "global depositary receipt";
	}
	if (sCategoryView === "category_partnerships") {
		return sType === "limited partnership";
	}
	if (sCategoryView === "category_closed_end_funds") {
		return sType === "closed-end fund";
	}
	if (sCategoryView === "category_etn") {
		return sType === "exchange-traded note";
	}
	return false;
}

/**
 * Initialisiert die Kategorien-Ansicht und zeigt gehaltene Aktien je Bereich.
 * Scope: [KATEGORIEN]
 * @param {"category_common_stock"|"category_preferred_stock"|"category_etf"|"category_real_estate"|"category_depositary_receipts"|"category_partnerships"|"category_closed_end_funds"|"category_etn"} sCategoryView
 */
export async function fnInitCategoryView(sCategoryView) {
	const elInfo = document.getElementById("categoryInfo");
	const elTableTbody = document.querySelector("#categoryHoldingsTable tbody");
	if (!elInfo || !elTableTbody) {
		fnShowError(fnT("stocks.category_view_init_failed", "Kategorieansicht konnte nicht initialisiert werden (fehlende DOM-Elemente)."));
		return;
	}

	let aPositions;
	let aAllStocksCatalog;
	try {
		[aPositions, aAllStocksCatalog] = await Promise.all([fnLoadPositions(), fnLoadAllStocksCatalog()]);
	} catch (oError) {
		fnShowError(String(oError?.message || oError));
		elInfo.textContent = fnT("stocks.load_data_failed", "Konnte Daten nicht laden.");
		elTableTbody.innerHTML = "";
		return;
	}

	const mCatalogBySymbol = new Map(
		(aAllStocksCatalog || []).map((oRow) => [String(oRow?.sSymbol || "").trim().toUpperCase(), oRow])
	);

	const aOwnedRows = fnAggregateOwnedSymbols(aPositions);
	const aFilteredRows = aOwnedRows.filter((oRow) => {
		const oCatalogRow = mCatalogBySymbol.get(oRow.sSymbol);
		return fnIsCatalogRowInCategory(oCatalogRow, sCategoryView);
	});

	if (!aFilteredRows.length) {
		elInfo.textContent = fnT("stocks.no_owned_in_category", "Keine gehaltenen Aktien in dieser Kategorie gefunden.");
		elTableTbody.innerHTML = `
      <tr>
        <td colspan="6">${fnT("stocks.no_matching_positions", "Keine passenden Positionen vorhanden.")}</td>
      </tr>
    `;
		return;
	}

	const mCurrentPriceBySymbol = await fnLoadCurrentPricesBySymbol(aFilteredRows);
	elInfo.textContent = fnT("stocks.symbol_count_in_category", "{count} Symbol(e) in dieser Kategorie gefunden.", { count: aFilteredRows.length });
	elTableTbody.innerHTML = aFilteredRows
		.map((oRow) => {
			const oCatalogRow = mCatalogBySymbol.get(oRow.sSymbol) || {};
			const sName = String(oCatalogRow?.sName || fnT("unknown", "Unbekannt"));
			const sType = String(oCatalogRow?.sType || fnT("unknown", "Unbekannt"));
			const sLogoUrl = fnEscapeHtml(fnBuildStockLogoUrl(oRow?.sSymbol, { size: 48 }));
			const sFirstBuyDate = Number.isFinite(oRow.iEarliestBuyMs) ? fnFmtDateFromTimestamp(oRow.iEarliestBuyMs) : "—";
			return `
        <tr>
          <td><b>${fnEscapeHtml(oRow.sSymbol)}</b></td>
          <td>
            <span class="stock-cell-with-logo">
              <img class="stock-logo stock-logo--sm" data-symbol="${fnEscapeHtml(oRow.sSymbol)}" data-logo-size="48" src="${sLogoUrl}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
              <span>${fnEscapeHtml(sName)}</span>
            </span>
          </td>
          <td>${fnEscapeHtml(sType)}</td>
          <td>${fnFmtNumber(oRow.nTotalAmount, 4)}</td>
          <td>${sFirstBuyDate}</td>
          <td>${fnBuildDevelopmentCellHtml(oRow, mCurrentPriceBySymbol)}</td>
        </tr>
      `;
		})
		.join("");
	elTableTbody.querySelectorAll('img.stock-logo').forEach((img) => {
		img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
	});
}

export function fnAskTransferTargetPrompt(aOptions) {
	const aValidOptions = (Array.isArray(aOptions) ? aOptions : [])
		.map((oOption) => ({
			id: String(oOption?.id || "").trim(),
			label: String(oOption?.label || "").trim(),
		}))
		.filter((oOption) => Boolean(oOption.id));
	if (!aValidOptions.length) return "";
	const sList = aValidOptions.map((oOption, iIndex) => `${iIndex + 1}: ${oOption.label} (${oOption.id})`).join("\n");
	const sInput = window.prompt(
		`${fnT("accounts.share_transfer_required", "Dieses Aktienkonto enthält noch Shares. Bitte ein Zielkonto wählen.")}\n${sList}\n\nID eingeben:`,
		aValidOptions[0].id
	);
	const sChosen = String(sInput || "").trim();
	return aValidOptions.some((oOption) => oOption.id === sChosen) ? sChosen : "";
}

export async function fnInitAccountsView() {
	const elShareAccountNameInput = document.getElementById("shareAccountNameInput");
	const elCreateShareAccountBtn = document.getElementById("createShareAccountBtn");
	const elShareAccountsList = document.getElementById("shareAccountsList");
	const elBankAccountNameInput = document.getElementById("bankAccountNameInput");
	const elCreateBankAccountBtn = document.getElementById("createBankAccountBtn");
	const elBankAccountsList = document.getElementById("bankAccountsList");
	const elFeedback = document.getElementById("accountsFeedback");

	if (!elShareAccountNameInput || !elCreateShareAccountBtn || !elShareAccountsList || !elBankAccountNameInput || !elCreateBankAccountBtn || !elBankAccountsList || !elFeedback) {
		return;
	}

	const fnRenderAccountList = (elContainer, aAccounts, sKind) => {
		if (!aAccounts.length) {
			elContainer.innerHTML = `<p class="muted">${fnT("stocks.none_for_kind", "Keine {kind} vorhanden.", { kind: sKind })}</p>`;
			return;
		}

		elContainer.innerHTML = aAccounts
			.map((oAccount) => `
        <div class="account-row" data-kind="${fnEscapeHtml(sKind)}" data-account-id="${fnEscapeHtml(oAccount.id)}">
          <input class="account-name-input" type="text" value="${fnEscapeHtml(oAccount.label)}" aria-label="${fnT("stocks.account_name_aria", "{kind} Name", { kind: sKind })}">
          <button class="action" data-action="rename">${fnT("accounts.rename", "Umbenennen")}</button>
          <button class="action" data-action="delete">${fnT("accounts.delete", "Löschen")}</button>
        </div>
      `)
			.join("");
	};

	const fnRefresh = async () => {
		await Promise.all([fnLoadShareAccounts(), fnLoadBankAccounts()]);
		fnRenderAccountList(elShareAccountsList, aShareAccounts, fnT("accounts.share_account_fallback", "Aktienkonto"));
		fnRenderAccountList(elBankAccountsList, aBankAccounts, fnT("accounts.bank_account_fallback", "Bankkonto"));
	};

	elCreateShareAccountBtn.addEventListener("click", async () => {
		const sLabel = String(elShareAccountNameInput.value || "").trim();
		if (!sLabel) {
			elFeedback.textContent = fnT("accounts.enter_share_name", "Bitte einen Namen für das Aktienkonto eingeben.");
			return;
		}
		try {
			await fnApiRequestWithEndpoints(aShareAccountsCrudEndpoints, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ label: sLabel }),
			});
			elShareAccountNameInput.value = "";
			await fnRefresh();
			elFeedback.textContent = fnT("accounts.share_created", "Aktienkonto erstellt.");
		} catch (oError) {
			elFeedback.textContent = fnT("accounts.share_create_failed", "Aktienkonto konnte nicht erstellt werden: {error}", { error: String(oError?.message || oError) });
		}
	});

	elCreateBankAccountBtn.addEventListener("click", async () => {
		const sLabel = String(elBankAccountNameInput.value || "").trim();
		if (!sLabel) {
			elFeedback.textContent = fnT("accounts.enter_bank_name", "Bitte einen Namen für das Bankkonto eingeben.");
			return;
		}
		try {
			await fnApiRequestWithEndpoints(aBankAccountsEndpoints, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ label: sLabel }),
			});
			elBankAccountNameInput.value = "";
			await fnRefresh();
			elFeedback.textContent = fnT("accounts.bank_created", "Bankkonto erstellt.");
		} catch (oError) {
			elFeedback.textContent = fnT("accounts.bank_create_failed", "Bankkonto konnte nicht erstellt werden: {error}", { error: String(oError?.message || oError) });
		}
	});

	elShareAccountsList.addEventListener("click", async (oEvent) => {
		const elButton = oEvent.target instanceof Element ? oEvent.target.closest("button[data-action]") : null;
		if (!elButton) return;
		const elRow = elButton.closest(".account-row");
		if (!elRow) return;

		const sAccountId = String(elRow.dataset.accountId || "").trim();
		const sAction = String(elButton.dataset.action || "");
		const sLabel = String(elRow.querySelector(".account-name-input")?.value || "").trim();
		if (!sAccountId) return;

		try {
			if (sAction === "rename") {
				await fnApiUpdateAccount(aShareAccountsCrudEndpoints, sAccountId, { label: sLabel }, "PATCH");
				elFeedback.textContent = fnT("accounts.share_renamed", "Aktienkonto umbenannt.");
			} else if (sAction === "delete") {
				try {
					await fnApiDeleteAccount(aShareAccountsCrudEndpoints, sAccountId);
					elFeedback.textContent = fnT("accounts.share_deleted", "Aktienkonto gelöscht.");
				} catch (oError) {
					const oDetails = oError?.details || {};
					if (oDetails?.requires_transfer) {
						const sTransferTargetId = fnAskTransferTargetPrompt(oDetails.transfer_options);
						if (!sTransferTargetId) {
							elFeedback.textContent = fnT("accounts.transfer_cancelled", "Löschen abgebrochen.");
							return;
						}
						await fnApiDeleteAccount(aShareAccountsCrudEndpoints, sAccountId, {
							transfer_to_share_account_id: sTransferTargetId
						});
						elFeedback.textContent = fnT("accounts.share_deleted_with_transfer", "Aktienkonto gelöscht und Shares übertragen.");
					} else {
						throw oError;
					}
				}
			}
			await fnRefresh();
		} catch (oError) {
			elFeedback.textContent = fnT("accounts.action_failed", "Aktion fehlgeschlagen: {error}", { error: String(oError?.message || oError) });
		}
	});

	elBankAccountsList.addEventListener("click", async (oEvent) => {
		const elButton = oEvent.target instanceof Element ? oEvent.target.closest("button[data-action]") : null;
		if (!elButton) return;
		const elRow = elButton.closest(".account-row");
		if (!elRow) return;

		const sAccountId = String(elRow.dataset.accountId || "").trim();
		const sAction = String(elButton.dataset.action || "");
		const sLabel = String(elRow.querySelector(".account-name-input")?.value || "").trim();
		if (!sAccountId) return;

		try {
			if (sAction === "rename") {
				await fnApiUpdateAccount(aBankAccountsEndpoints, sAccountId, { label: sLabel }, "PATCH");
				elFeedback.textContent = fnT("accounts.bank_renamed", "Bankkonto umbenannt.");
			} else if (sAction === "delete") {
				await fnApiDeleteAccount(aBankAccountsEndpoints, sAccountId);
				elFeedback.textContent = fnT("accounts.bank_deleted", "Bankkonto gelöscht.");
			}
			await fnRefresh();
		} catch (oError) {
			elFeedback.textContent = fnT("accounts.action_failed", "Aktion fehlgeschlagen: {error}", { error: String(oError?.message || oError) });
		}
	});

	await fnRefresh();
}

// =====================================================
