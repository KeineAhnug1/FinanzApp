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
	function fnBuildDevelopmentCellHtml(oRow, mCurrentPriceBySymbol, sDisplayMode = "absolute") {
		const sSymbol = String(oRow?.sSymbol || "").trim().toUpperCase();
		const nAvgBuyPrice = Number(oRow?.nAvgBuyPrice);
		const nCurrentPrice = Number(mCurrentPriceBySymbol?.get(sSymbol));
		const nDevelopmentAbs = Number.isFinite(nCurrentPrice) && Number.isFinite(nAvgBuyPrice)
			? (nCurrentPrice - nAvgBuyPrice)
			: Number.NaN;
		const nDevelopmentPct = fnComputeDevelopmentPctSinceBuy(nAvgBuyPrice, nCurrentPrice);
		if (!Number.isFinite(nDevelopmentPct)) {
			return `<span class="stock-performance stock-performance--neutral is-clickable" data-display-mode="absolute">—</span>`;
		}
		const sClassName = nDevelopmentAbs > 0
			? "stock-performance--positive"
			: (nDevelopmentAbs < 0 ? "stock-performance--negative" : "stock-performance--neutral");
		const sText = sDisplayMode === "percent" ? fnFmtSignedPct(nDevelopmentPct) : fnFmtSignedMoney(nDevelopmentAbs);
		return `<span class="stock-performance ${sClassName} is-clickable" data-display-mode="${fnEscapeHtml(sDisplayMode)}">${fnEscapeHtml(sText)}</span>`;
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
	async function fnInitDepotView() {
		const elDepotInfo = document.getElementById("depotInfo");
		const elHoldingsTbody = document.querySelector("#holdingsTable tbody");
		const elDepotShareAccountSelect = document.getElementById("depotShareAccountSelect");

		const elKTotal = document.getElementById("k_total");
		const elKTotalLabel = document.getElementById("k_total_label");
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
			sSelectedShareAccountId = String(elDepotShareAccountSelect.value || "").trim();
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
					const sDevelopment = fnBuildDevelopmentCellHtml(oRow, mCurrentPriceBySymbol, sDevelopmentDisplayMode);

					return `
          <tr>
            <td>
              <span class="stock-cell-with-logo">
                <img class="stock-logo stock-logo--sm" data-symbol="${sSymbol}" data-logo-size="48" src="${sLogoUrl}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';">
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

			const fnRefreshDepotChart = async () => {
				await fnBuildDepotChart({
				aPositions,
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
				});
			};

		aElRangeButtons.forEach((elButton) => {
			elButton.addEventListener("click", async () => {
				aElRangeButtons.forEach((elOtherButton) => elOtherButton.classList.remove("active"));
				elButton.classList.add("active");
				sActiveRange = elButton.dataset.range;
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
		if (!aPositions.length) {
			oArgs.elInfo.textContent = fnT("stocks.no_positions", "Keine Positionen vorhanden.");
			fnClearCanvas(oArgs.oCtx, oArgs.elCanvas);
			oArgs.fnOnProfitLossChange?.(Number.NaN, Number.NaN);
			oArgs.fnOnCompositionChange?.([]);
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
			return;
		}

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
		const nInvestedTotal = aPositions.reduce((nSum, oPosition) => {
			const nAmount = Number(oPosition?.amount);
			const nBuyPrice = Number(oPosition?.worthwhenbought);
			if (!Number.isFinite(nAmount) || nAmount <= 0) return nSum;
			if (!Number.isFinite(nBuyPrice) || nBuyPrice < 0) return nSum;
			return nSum + nAmount * nBuyPrice;
		}, 0);
		const nProfitLossAbs = nLastTotal - nInvestedTotal;
		const nProfitLossPct = nInvestedTotal > 0 ? (nProfitLossAbs / nInvestedTotal) * 100 : Number.NaN;
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
	async function fnInitAnalysisView() {
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
				: ["NASDAQ", "NYSE", "AMEX", "LSE", "XETR", "TSX", "SIX", "EURONEXT"];
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

		const fnRefreshAnalysisChart = async () => {
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
		};

		elCatalogSearchInput.addEventListener("input", async () => {
			sCatalogSearchTerm = String(elCatalogSearchInput.value || "").trim();
			await fnRenderSearchResults();
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
			let oSelectedBankAccount = null;
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
		});

		elSellBtn.addEventListener("click", async () => {
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
			let oSelectedBankAccount = null;
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
	 * Variablen:
	 * - `aSymbolPositions`: Positionen nur für das gewählte Symbol.
	 * - `aSeriesValues`: Geladene Kursreihe aus der API.
	 * - `oQuery`: Query-Parameter je Zeitraum.
	 * - `mSeriesBySymbol`: Kursdaten für das gewählte Symbol.
	 * - `aPoints`: Normierte Chartpunkte (hier direkt auf Kursbasis).
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

		oArgs.elTotalLabel.textContent = `Kurs ${sSymbol} (letzter Punkt)`;
		oArgs.elTotal.textContent = fnFmtMoney(nLast, "USD");
		oArgs.elChange.textContent = `${fnFmtMoney(nChangeAbs, "USD")} (${Number.isFinite(nChangePct) ? nChangePct.toFixed(2) : "—"}%)`;

		fnDrawLineChart(oArgs.oCtx, oArgs.elCanvas, aPoints, false);

		const bFromCache = [...mSeriesBySymbol.values()].some((oSeries) => oSeries.fromCache);
		const nOwnedAmount = aSymbolPositions.reduce((nSum, oPosition) => {
			const nAmount = Number(oPosition?.amount);
			return Number.isFinite(nAmount) ? nSum + nAmount : nSum;
		}, 0);
		const sOwnedHint = nOwnedAmount > 0 ? `, Bestand: ${fnFmtNumber(nOwnedAmount, 4)} Stk` : ", nicht im Depot";
		oArgs.elInfo.textContent = `Chart aktualisiert: ${sSymbol}, ${oArgs.sRange}${bFromCache ? " (aus Cache)" : ""}${sOwnedHint}`;
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
	function fnGetCategoryMeta(sCategoryView) {
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
	async function fnInitCategoryView(sCategoryView) {
		const elInfo = document.getElementById("categoryInfo");
		const elTableTbody = document.querySelector("#categoryHoldingsTable tbody");
		if (!elInfo || !elTableTbody) {
			fnShowError(fnT("stocks.category_view_init_failed", "Kategorieansicht konnte nicht initialisiert werden (fehlende DOM-Elemente)."));
			return;
		}

		let aPositions = [];
		let aAllStocksCatalog = [];
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
                <img class="stock-logo stock-logo--sm" data-symbol="${fnEscapeHtml(oRow.sSymbol)}" data-logo-size="48" src="${sLogoUrl}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.style.display='none';">
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
	}

	// =====================================================
	// [ZUKUNFT] 12) Zukunftsaussicht-Funktionen
	// Nur für data-view="futureanalysis".
	// =====================================================

	/**
	 * Rendert die Zukunftsaussicht mit Mehrfachauswahl, Kennzahlen und Prognosechart.
	 * Scope: [ZUKUNFT]
	 */
	async function fnInitFutureAnalysisView() {
		const elInfo = document.getElementById("futureInfo");
		const elYearsInput = document.getElementById("futureYearsInput");
		const elRecalcBtn = document.getElementById("futureRecalcBtn");
		const elSelectAllBtn = document.getElementById("futureSelectAllBtn");
		const elSelectNoneBtn = document.getElementById("futureSelectNoneBtn");
		const elOwnedList = document.getElementById("futureOwnedList");
		const elTableTbody = document.querySelector("#futureHoldingsTable tbody");

		const elSelectedSymbols = document.getElementById("futureSelectedSymbols");
		const elCurrentValue = document.getElementById("futureCurrentValue");
		const elAvgProfitYear = document.getElementById("futureAvgProfitYear");
		const elAvgReturnYear = document.getElementById("futureAvgReturnYear");
		const elProjectedValue = document.getElementById("futureProjectedValue");
		const elProjectedPnl = document.getElementById("futureProjectedPnl");

		const elHistoryCanvas = document.getElementById("futureHistoryChart");
		const oHistoryCtx = elHistoryCanvas?.getContext("2d");
		const elProjectionCanvas = document.getElementById("futureProjectionChart");
		const oProjectionCtx = elProjectionCanvas?.getContext("2d");

		if (
			!elInfo ||
			!elYearsInput ||
			!elRecalcBtn ||
			!elSelectAllBtn ||
			!elSelectNoneBtn ||
			!elOwnedList ||
			!elTableTbody ||
			!elSelectedSymbols ||
			!elCurrentValue ||
			!elAvgProfitYear ||
			!elAvgReturnYear ||
			!elProjectedValue ||
			!elProjectedPnl ||
			!elHistoryCanvas ||
			!oHistoryCtx ||
			!elProjectionCanvas ||
			!oProjectionCtx
		) {
			fnShowError(fnT("stocks.future_view_init_failed", "Zukunftsaussicht konnte nicht korrekt initialisiert werden (fehlende DOM-Elemente)."));
			return;
		}

		let aPositions = [];
		try {
			aPositions = await fnLoadPositions();
		} catch (oError) {
			fnShowError(String(oError?.message || oError));
			elInfo.textContent = fnT("stocks.load_positions_failed", "Konnte Positionen nicht laden.");
			fnClearCanvas(oHistoryCtx, elHistoryCanvas);
			fnClearCanvas(oProjectionCtx, elProjectionCanvas);
			return;
		}

		const aOwnedRows = fnAggregateOwnedSymbols(aPositions);
		const mCurrentPriceBySymbol = await fnLoadCurrentPricesBySymbol(aOwnedRows);
		const setSelectedSymbols = new Set(aOwnedRows.map((oRow) => oRow.sSymbol));

		const fnRenderOwnedSelectors = () => {
			if (!aOwnedRows.length) {
				elOwnedList.innerHTML = `<div class="muted">${fnT("stocks.no_owned_stocks", "Keine gehaltenen Aktien vorhanden.")}</div>`;
				elTableTbody.innerHTML = "";
				return;
			}

			elOwnedList.innerHTML = aOwnedRows
				.map((oRow) => {
					const sChecked = setSelectedSymbols.has(oRow.sSymbol) ? "checked" : "";
					return `
            <label class="future-owned-item">
              <input type="checkbox" data-symbol="${fnEscapeHtml(oRow.sSymbol)}" ${sChecked}>
              <span><b>${fnEscapeHtml(oRow.sSymbol)}</b> (${fnFmtNumber(oRow.nTotalAmount, 4)} ${fnT("piece_short", "Stk")})</span>
            </label>
          `;
				})
				.join("");

			elTableTbody.innerHTML = aOwnedRows
				.map((oRow) => {
					const sIsActive = setSelectedSymbols.has(oRow.sSymbol) ? fnT("yes", "Ja") : fnT("no", "Nein");
					const sFirstBuyDate = Number.isFinite(oRow.iEarliestBuyMs)
						? fnFmtDateFromTimestamp(oRow.iEarliestBuyMs)
						: "—";
					return `
            <tr>
              <td>${sIsActive}</td>
              <td><b>${fnEscapeHtml(oRow.sSymbol)}</b></td>
              <td>${fnFmtNumber(oRow.nTotalAmount, 4)}</td>
              <td>${sFirstBuyDate}</td>
              <td>${fnBuildDevelopmentCellHtml(oRow, mCurrentPriceBySymbol)}</td>
            </tr>
          `;
				})
				.join("");
		};

		const fnBuildProjectionPoints = (nCurrentValue, nAnnualRate, nYears) => {
			const iMonths = Math.max(1, Math.round(nYears * 12));
			const dNow = new Date();
			const aPoints = [];

			for (let iMonthIndex = 0; iMonthIndex <= iMonths; iMonthIndex += 1) {
				const dPointDate = new Date(dNow);
				dPointDate.setMonth(dPointDate.getMonth() + iMonthIndex);
				const nYearsFromNow = iMonthIndex / 12;
				const nProjectedValue = nCurrentValue * Math.pow(1 + nAnnualRate, nYearsFromNow);
				aPoints.push({
					t: fnFmtYmd(dPointDate),
					total: nProjectedValue,
					invested: 0,
					pnl: nProjectedValue - nCurrentValue,
					y: nProjectedValue,
				});
			}

			return aPoints;
		};

		const fnRefreshFuture = async () => {
			const nYearsRaw = Number(elYearsInput.value);
			const nYears = Number.isFinite(nYearsRaw) ? Math.max(1, Math.min(50, Math.round(nYearsRaw))) : 5;
			elYearsInput.value = String(nYears);

			const aSelectedSymbols = aOwnedRows
				.map((oRow) => oRow.sSymbol)
				.filter((sSymbol) => setSelectedSymbols.has(sSymbol));

			if (!aSelectedSymbols.length) {
				elInfo.textContent = fnT("stocks.select_at_least_one", "Bitte mindestens eine gehaltene Aktie auswählen.");
				elSelectedSymbols.textContent = "—";
				elCurrentValue.textContent = "—";
				elAvgProfitYear.textContent = "—";
				elAvgReturnYear.textContent = "—";
				elProjectedValue.textContent = "—";
				elProjectedPnl.textContent = "—";
				fnClearCanvas(oHistoryCtx, elHistoryCanvas);
				fnClearCanvas(oProjectionCtx, elProjectionCanvas);
				return;
			}

			const aSelectedPositions = aPositions.filter((oPosition) =>
				setSelectedSymbols.has(String(oPosition?.symbol || "").trim().toUpperCase())
			);
			if (!aSelectedPositions.length) {
				elInfo.textContent = fnT("stocks.no_positions_for_selection", "Für die Auswahl gibt es keine Positionen.");
				fnClearCanvas(oHistoryCtx, elHistoryCanvas);
				fnClearCanvas(oProjectionCtx, elProjectionCanvas);
				return;
			}

			const dFirstBuy = fnGetFirstBuyDate(aSelectedPositions);
			const dEnd = new Date();
			const oQuery = {
				interval: "1day",
				start_date: fnFmtYmd(dFirstBuy || new Date(dEnd.getTime() - 365 * 24 * 60 * 60 * 1000)),
				end_date: fnFmtYmd(dEnd),
				outputsize: 5000,
			};

			elInfo.textContent = fnT("stocks.loading_quotes_for_symbols", "Lade Kursdaten für {symbols}...", { symbols: aSelectedSymbols.join(", ") });
			const mSeriesBySymbol = await fnLoadSeriesForSymbols(aSelectedSymbols, oQuery);
			if (!mSeriesBySymbol.size) {
				elInfo.textContent = fnT("stocks.no_chart_data_selected", "Keine Kursdaten für die Auswahl erhalten.");
				fnClearCanvas(oHistoryCtx, elHistoryCanvas);
				fnClearCanvas(oProjectionCtx, elProjectionCanvas);
				return;
			}

			const aRawHistoryPoints = fnBuildSeriesPointsForPositions(aSelectedPositions, mSeriesBySymbol, false);
			const aHistoryPoints = fnWithFixedDateRange(aRawHistoryPoints, oQuery, false, "SINCE_BUY");
			if (aHistoryPoints.length < 2) {
				elInfo.textContent = fnT("stocks.too_few_historical_points", "Zu wenige historische Datenpunkte für die Auswahl.");
				fnClearCanvas(oHistoryCtx, elHistoryCanvas);
				fnClearCanvas(oProjectionCtx, elProjectionCanvas);
				return;
			}

			fnDrawLineChart(oHistoryCtx, elHistoryCanvas, aHistoryPoints, false);

				const nInvested = aSelectedPositions.reduce((nSum, oPosition) => {
					const nAmount = Number(oPosition?.amount);
					const nBuyPrice = Number(oPosition?.worthwhenbought);
					if (!Number.isFinite(nAmount) || nAmount <= 0 || !Number.isFinite(nBuyPrice) || nBuyPrice <= 0) return nSum;
					return nSum + nAmount * nBuyPrice;
				}, 0);

				const nYearsSinceFirst = Number.isFinite(dFirstBuy?.getTime())
					? Math.max((Date.now() - dFirstBuy.getTime()) / (365.25 * 24 * 60 * 60 * 1000), 1 / 365.25)
					: 1;
				const mPositionsBySymbol = new Map();
				for (const oPosition of aSelectedPositions) {
					const sSymbol = String(oPosition?.symbol || "").trim().toUpperCase();
					if (!sSymbol) continue;
					if (!mPositionsBySymbol.has(sSymbol)) mPositionsBySymbol.set(sSymbol, []);
					mPositionsBySymbol.get(sSymbol).push(oPosition);
				}

				let nCurrentValue = 0;
				let nRateWeightedSum = 0;
				let nRateWeight = 0;
				const aProjectionSeries = [];

				for (const [sSymbol, aSymbolPositions] of mPositionsBySymbol.entries()) {
					const nTotalAmount = aSymbolPositions.reduce((nSum, oPosition) => {
						const nAmount = Number(oPosition?.amount);
						return Number.isFinite(nAmount) && nAmount > 0 ? nSum + nAmount : nSum;
					}, 0);
					if (!Number.isFinite(nTotalAmount) || nTotalAmount <= 0) continue;

					const nSymbolInvested = aSymbolPositions.reduce((nSum, oPosition) => {
						const nAmount = Number(oPosition?.amount);
						const nBuyPrice = Number(oPosition?.worthwhenbought);
						if (!Number.isFinite(nAmount) || nAmount <= 0 || !Number.isFinite(nBuyPrice) || nBuyPrice <= 0) return nSum;
						return nSum + nAmount * nBuyPrice;
					}, 0);

					const aSeriesValues = mSeriesBySymbol.get(sSymbol)?.values || [];
					const nLastClose = Number(aSeriesValues[aSeriesValues.length - 1]?.close);
					const nSymbolCurrentValue = Number.isFinite(nLastClose) && nLastClose > 0 ? nLastClose * nTotalAmount : 0;
					nCurrentValue += nSymbolCurrentValue;

					const dSymbolFirstBuy = fnGetFirstBuyDate(aSymbolPositions);
					const nSymbolYearsSinceFirst = Number.isFinite(dSymbolFirstBuy?.getTime())
						? Math.max((Date.now() - dSymbolFirstBuy.getTime()) / (365.25 * 24 * 60 * 60 * 1000), 1 / 365.25)
						: nYearsSinceFirst;

					let nSymbolAnnualRate = 0;
					if (nSymbolInvested > 0) {
						if (nSymbolCurrentValue <= 0) {
							nSymbolAnnualRate = -1;
						} else {
							nSymbolAnnualRate = Math.pow(nSymbolCurrentValue / nSymbolInvested, 1 / nSymbolYearsSinceFirst) - 1;
						}
					}
					nSymbolAnnualRate = Math.max(-1, nSymbolAnnualRate);

					if (nSymbolCurrentValue > 0) {
						nRateWeightedSum += nSymbolAnnualRate * nSymbolCurrentValue;
						nRateWeight += nSymbolCurrentValue;
					}

					aProjectionSeries.push(fnBuildProjectionPoints(nSymbolCurrentValue, nSymbolAnnualRate, nYears));
				}

				const mProjectionSumByDate = new Map();
				for (const aSeries of aProjectionSeries) {
					for (const oPoint of aSeries) {
						const sDay = String(oPoint?.t || "");
						if (!sDay) continue;
						const nPrev = Number(mProjectionSumByDate.get(sDay) || 0);
						const nY = Number(oPoint?.y);
						mProjectionSumByDate.set(sDay, nPrev + (Number.isFinite(nY) ? nY : 0));
					}
				}

				const aProjectionPoints = [...mProjectionSumByDate.entries()]
					.sort(([sA], [sB]) => (sA < sB ? -1 : 1))
					.map(([sDay, nTotal]) => ({
						t: sDay,
						total: nTotal,
						invested: 0,
						pnl: nTotal - nCurrentValue,
						y: nTotal,
					}));

				if (aProjectionPoints.length < 2) {
					elInfo.textContent = fnT("stocks.too_few_projection_points", "Zu wenige Prognosedaten für die Auswahl.");
					fnClearCanvas(oProjectionCtx, elProjectionCanvas);
					return;
				}

				const nTotalProfit = nCurrentValue - nInvested;
				const nAvgProfitPerYear = nTotalProfit / nYearsSinceFirst;
				const nAnnualRate = nRateWeight > 0 ? nRateWeightedSum / nRateWeight : 0;
				fnDrawLineChart(oProjectionCtx, elProjectionCanvas, aProjectionPoints, false);

				const nProjectedValue = Number(aProjectionPoints[aProjectionPoints.length - 1]?.y);
				const nProjectedPnl = nProjectedValue - nCurrentValue;

				elSelectedSymbols.textContent = aSelectedSymbols.join(", ");
				elCurrentValue.textContent = fnFmtMoney(nCurrentValue, "USD");
				elAvgProfitYear.textContent = fnFmtMoney(nAvgProfitPerYear, "USD");
				elAvgReturnYear.textContent = `${(nAnnualRate * 100).toFixed(2)}%`;
				elProjectedValue.textContent = fnFmtMoney(nProjectedValue, "USD");
				elProjectedPnl.textContent = `${fnFmtMoney(nProjectedPnl, "USD")} (${(nAnnualRate * 100).toFixed(2)}% p.a.)`;

				const bSomeFromCache = [...mSeriesBySymbol.values()].some((oSeries) => oSeries.fromCache);
				elInfo.textContent = `Zukunftsaussicht aktualisiert: ${nYears} Jahr(e), Basis seit ${fnFmtDateFromTimestamp(dFirstBuy?.getTime() || Date.now())}${bSomeFromCache ? " (teilweise aus Cache)" : ""}`;
		};

		elOwnedList.addEventListener("change", async (oEvent) => {
			const elTarget = oEvent.target instanceof HTMLInputElement ? oEvent.target : null;
			if (!elTarget || elTarget.type !== "checkbox") return;
			const sSymbol = String(elTarget.dataset.symbol || "").trim().toUpperCase();
			if (!sSymbol) return;
			if (elTarget.checked) {
				setSelectedSymbols.add(sSymbol);
			} else {
				setSelectedSymbols.delete(sSymbol);
			}
			fnRenderOwnedSelectors();
			await fnRefreshFuture();
		});

		elSelectAllBtn.addEventListener("click", async () => {
			aOwnedRows.forEach((oRow) => setSelectedSymbols.add(oRow.sSymbol));
			fnRenderOwnedSelectors();
			await fnRefreshFuture();
		});

		elSelectNoneBtn.addEventListener("click", async () => {
			setSelectedSymbols.clear();
			fnRenderOwnedSelectors();
			await fnRefreshFuture();
		});

		elRecalcBtn.addEventListener("click", async () => {
			await fnRefreshFuture();
		});

		elYearsInput.addEventListener("change", async () => {
			await fnRefreshFuture();
		});

		fnRenderOwnedSelectors();
		await fnRefreshFuture();
	}

	async function fnApiRequestWithEndpoints(aEndpoints, oRequestInit = {}) {
		let sLastError = "Kein Endpoint erreichbar";
		const fnRequest = window.FinanzAppApi?.requestJsonMerged;
		for (const sEndpoint of aEndpoints || []) {
			try {
				if (typeof fnRequest === "function") {
					const oResult = await fnRequest(sEndpoint, oRequestInit);
					if (oResult?.ok) return oResult;
					const oError = new Error(String(oResult?.message || `HTTP ${oResult?.status || 0}`));
					oError.details = oResult || null;
					throw oError;
				}

				const oResponse = await fetch(sEndpoint, oRequestInit);
				if (oResponse.ok) return await oResponse.json();
				let sMessage = `HTTP ${oResponse.status}`;
				let oDetails = null;
				try {
					const oErrorData = await oResponse.json();
					oDetails = oErrorData;
					sMessage = String(oErrorData?.message || sMessage);
				} catch {
					// noop
				}
				const oError = new Error(sMessage);
				oError.details = oDetails;
				throw oError;
			} catch (oError) {
				if (oError?.details) throw oError;
				sLastError = String(oError?.message || oError);
			}
		}

		throw new Error(sLastError);
	}

	async function fnApiUpdateAccount(aBaseEndpoints, sAccountId, oPayload, sMethod) {
		const aEndpoints = (aBaseEndpoints || []).map((sEndpoint) => `${String(sEndpoint).replace(/\/$/, "")}/${encodeURIComponent(sAccountId)}`);
		return await fnApiRequestWithEndpoints(aEndpoints, {
			method: sMethod,
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(oPayload),
		});
	}

	async function fnApiDeleteAccount(aBaseEndpoints, sAccountId, oPayload = null) {
		const aEndpoints = (aBaseEndpoints || []).map((sEndpoint) => `${String(sEndpoint).replace(/\/$/, "")}/${encodeURIComponent(sAccountId)}`);
		const oInit = { method: "DELETE" };
		if (oPayload && typeof oPayload === "object") {
			oInit.headers = { "Content-Type": "application/json" };
			oInit.body = JSON.stringify(oPayload);
		}
		return await fnApiRequestWithEndpoints(aEndpoints, oInit);
	}

	function fnAskTransferTargetPrompt(aOptions) {
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

	async function fnInitAccountsView() {
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
