	// [SHARED] 7) Domain- und Berechnungs-Helper
	// Wird von Depot und Einzelanalyse genutzt.
	// =====================================================

	/**
	 * Wandelt ein Datums-Objekt in `YYYY-MM-DD` um.
	 * Scope: [SHARED]
	 * Variablen:
	 * - `dDate`: Eingabedatum.
	 * - `iYear`: Jahr.
	 * - `sMonth`: Monat als 2-stellige Zahl.
	 * - `sDay`: Tag als 2-stellige Zahl.
	 * @param {Date} dDate
	 * @returns {string}
	 */
	function fnFmtYmd(dDate) {
		const iYear = dDate.getFullYear();
		const sMonth = String(dDate.getMonth() + 1).padStart(2, "0"); //Welcher kek sagt Januar = 0
		const sDay = String(dDate.getDate()).padStart(2, "0");
		return `${iYear}-${sMonth}-${sDay}`;
	}

	/**
	 * Wandelt einen Unix-Zeitstempel in Millisekunden um.
	 * Scope: [SHARED]
	 * @param {number|string} nTimestampRaw
	 * @returns {number}
	 */
	function fnToMsFromTimestamp(nTimestampRaw) {
		const nTimestamp = Number(nTimestampRaw);
		if (!Number.isFinite(nTimestamp)) return Number.NaN;
		return nTimestamp < 10000000000 ? nTimestamp * 1000 : nTimestamp;
	}

	/**
	 * Wandelt Twelve-Data-Datetime (`YYYY-MM-DD` oder `YYYY-MM-DD HH:MM:SS`) in Millisekunden.
	 * Scope: [SHARED]
	 * @param {string} sValueRaw
	 * @returns {number}
	 */
	function fnToMsFromTdDatetime(sValueRaw) {
		const sValue = String(sValueRaw || "");
		if (!sValue) return Number.NaN;

		const sIso = sValue.includes(" ") ? sValue.replace(" ", "T") : `${sValue}T00:00:00`;
		const iMs = Date.parse(sIso);
		return Number.isFinite(iMs) ? iMs : Number.NaN;
	}

	function fnTdSortKey(sValueRaw) {
		const sValue = String(sValueRaw || "").trim();
		if (!sValue) return Number.NaN;
		const sCompact = sValue.replace(/[^\d]/g, "");
		if (!sCompact) return Number.NaN;
		const sPadded = sValue.includes(" ") ? sCompact.padEnd(14, "0") : `${sCompact}000000`;
		const nKey = Number(sPadded);
		return Number.isFinite(nKey) ? nKey : Number.NaN;
	}

	function fnFmtYmdInTimeZone(iMs, sTimeZone = "America/New_York") {
		if (!Number.isFinite(iMs)) return "";
		const dDate = new Date(iMs);
		try {
			const oFormatter = new Intl.DateTimeFormat("en-US", {
				timeZone: sTimeZone,
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
			});
			if (typeof oFormatter.formatToParts === "function") {
				const aParts = oFormatter.formatToParts(dDate);
				const sYear = aParts.find((oPart) => oPart.type === "year")?.value || "";
				const sMonth = aParts.find((oPart) => oPart.type === "month")?.value || "";
				const sDay = aParts.find((oPart) => oPart.type === "day")?.value || "";
				if (sYear && sMonth && sDay) return `${sYear}-${sMonth}-${sDay}`;
			}
		} catch {
			// Fallback unten.
		}

		try {
			const sFormatted = new Intl.DateTimeFormat("sv-SE", {
				timeZone: sTimeZone,
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
			}).format(dDate);
			if (/^\d{4}-\d{2}-\d{2}$/.test(sFormatted)) return sFormatted;
		} catch {
			// Letzter Fallback unten.
		}

		return fnFmtYmd(dDate);
	}

	function fnFmtTdDateTimeInTimeZone(iMs, sTimeZone = "America/New_York") {
		if (!Number.isFinite(iMs)) return "";
		const oFormatter = new Intl.DateTimeFormat("sv-SE", {
			timeZone: sTimeZone,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false,
		});
		return oFormatter.format(new Date(iMs)).replace("T", " ");
	}

	function fnFmtMarketYmd(dDate) {
		if (!(dDate instanceof Date) || !Number.isFinite(dDate.getTime())) return "";
		return fnFmtYmdInTimeZone(dDate.getTime(), "America/New_York");
	}

	function fnBuildRangeQuery(interval, outputsize, dStartDate, dEndDate) {
		const oQuery = { interval, outputsize };
		const sStart = fnFmtMarketYmd(dStartDate);
		const sEnd = fnFmtMarketYmd(dEndDate);
		if (sStart && sEnd) {
			oQuery.start_date = sStart;
			oQuery.end_date = sEnd;
		}
		return oQuery;
	}

	function fnIsTdPointOnOrAfterPurchase(sTdDatetime, iPurchaseMs) {
		if (!Number.isFinite(iPurchaseMs)) return true;
		const sPoint = String(sTdDatetime || "").trim();
		if (!sPoint) return false;
		if (sPoint.includes(" ")) {
			const sPurchaseDateTime = fnFmtTdDateTimeInTimeZone(iPurchaseMs, "America/New_York");
			return sPoint >= sPurchaseDateTime;
		}
		const sPurchaseDay = fnFmtYmdInTimeZone(iPurchaseMs, "America/New_York");
		return sPoint.slice(0, 10) >= sPurchaseDay;
	}

	/**
	 * Liefert das früheste Kaufdatum aller Positionen als Date.
	 * Scope: [SHARED]
	 * @param {Array<object>} aPositions
	 * @returns {Date | null}
	 */
	function fnGetFirstBuyDate(aPositions) {
		let iMinMs = Number.POSITIVE_INFINITY;

		for (const oPosition of aPositions || []) {
			const iCurrentMs = fnToMsFromTimestamp(oPosition?.created_at);
			if (Number.isFinite(iCurrentMs) && iCurrentMs < iMinMs) iMinMs = iCurrentMs;
		}

		if (!Number.isFinite(iMinMs)) return null;
		return new Date(iMinMs);
	}

	/**
	 * Übersetzt den gewählten Zeitraum in Twelve-Data-Parameter.
	 * Scope: [SHARED]
	 * @param {string} sRange
	 * @param {Array<object>} aPositions
	 * @returns {{interval: string, outputsize?: number, start_date?: string, end_date?: string}}
	 */
	function fnRangeToQuery(sRange, aPositions) {
		if (sRange === "1D") {
			return {
				interval: "5min",
				outputsize: 576,
			};
		}

		if (sRange === "1W") {
			return {
				interval: "15min",
				outputsize: 960,
			};
		}

		if (sRange === "1M") {
			return {
				interval: "1h",
				outputsize: 1200,
			};
		}

		if (sRange === "1Y") {
			return {
				interval: "1day",
				outputsize: 420,
			};
		}

		if (sRange === "SINCE_BUY") {
			const dEndDate = new Date();
			const dFirstBuyDate = fnGetFirstBuyDate(aPositions);
			const dStartDate = dFirstBuyDate || new Date(dEndDate.getTime() - 365 * 24 * 60 * 60 * 1000);

			return fnBuildRangeQuery("1day", 5000, dStartDate, dEndDate);
		}

		return { interval: "1day", outputsize: 30 };
	}

	/**
	 * Erzeugt moegliche Twelve-Data-Symbolvarianten fuer ein lokales Symbol.
	 * Scope: [SHARED]
	 * @param {string} sSymbolRaw
	 * @returns {string[]}
	 */
	function fnBuildTdSymbolCandidates(sSymbolRaw) {
		const sSymbol = String(sSymbolRaw || "").trim().toUpperCase();
		if (!sSymbol) return [];

		const aCandidates = [];
		const fnPushUnique = (sCandidateRaw) => {
			const sCandidate = String(sCandidateRaw || "").trim().toUpperCase();
			if (!sCandidate) return;
			if (!aCandidates.includes(sCandidate)) aCandidates.push(sCandidate);
		};

		fnPushUnique(sSymbol);
		fnPushUnique(sSymbol.replace("/", "."));
		fnPushUnique(sSymbol.replace("/", "-"));

		if (sSymbol.includes(":")) {
			const sWithoutPrefix = sSymbol.split(":").pop();
			fnPushUnique(sWithoutPrefix);
		}

		if (sSymbol.includes(".")) {
			const [sBaseRaw, sSuffixRaw] = sSymbol.split(".");
			const sBase = String(sBaseRaw || "").trim();
			const sSuffix = String(sSuffixRaw || "").trim();
			fnPushUnique(sBase);

			const oSuffixToExchangePrefix = {
				DE: ["XETR", "FWB"],
				L: ["LSE"],
				TO: ["TSX"],
				AX: ["ASX"],
				SW: ["SIX"],
				PA: ["EPA"],
				MI: ["MIL"],
				MC: ["BME"],
			};
			for (const sExchangePrefix of oSuffixToExchangePrefix[sSuffix] || []) {
				fnPushUnique(`${sExchangePrefix}:${sBase}`);
			}
		}

		return aCandidates;
	}

	/**
	 * Baut ein Fallback-Query fuer Tagesdaten, falls Intraday fehlt.
	 * Scope: [SHARED]
	 * @param {object} oQuery
	 * @returns {object}
	 */
	function fnBuildDailyFallbackQuery(oQuery) {
		const oBase = { ...(oQuery || {}) };
		return {
			...oBase,
			interval: "1day",
			outputsize: Math.max(Number(oBase.outputsize) || 0, 60),
		};
	}

	/**
	 * Extrahiert einen gueltigen Kurs aus einem Twelve-Data-Quote-Objekt.
	 * Scope: [SHARED]
	 * @param {any} oData
	 * @returns {number}
	 */
	function fnExtractPositiveQuotePrice(oData) {
		const nClose = Number(oData?.close);
		if (Number.isFinite(nClose) && nClose > 0) return nClose;

		const nPrice = Number(oData?.price);
		if (Number.isFinite(nPrice) && nPrice > 0) return nPrice;

		const nPreviousClose = Number(oData?.previous_close);
		if (Number.isFinite(nPreviousClose) && nPreviousClose > 0) return nPreviousClose;

		return Number.NaN;
	}

	/**
	 * Laedt den letzten verfuegbaren Kurs inkl. Symbol-Fallback.
	 * Scope: [SHARED]
	 * @param {string} sSymbol
	 * @returns {Promise<{nPrice: number, sourceSymbol: string, fromCache: boolean}>}
	 */
	async function fnGetLatestPriceBySymbolWithFallback(sSymbol) {
		const aSymbolCandidates = fnBuildTdSymbolCandidates(sSymbol);
		let sLastError = "Kein Quote verfuegbar.";

		for (const sCandidate of aSymbolCandidates) {
			try {
				const oFetchResult = await fnTdFetch("/quote", { symbol: sCandidate });
				const nPrice = fnExtractPositiveQuotePrice(oFetchResult?.data);
				if (Number.isFinite(nPrice) && nPrice > 0) {
					return {
						nPrice,
						sourceSymbol: sCandidate,
						fromCache: Boolean(oFetchResult?.fromCache),
					};
				}
				sLastError = `Quote ohne Kurs fuer ${sCandidate}.`;
			} catch (oError) {
				sLastError = String(oError?.message || oError);
			}
		}

		throw new Error(sLastError);
	}

	/**
	 * Laedt Time-Series fuer ein Symbol inkl. Symbol- und Intervall-Fallback.
	 * Scope: [SHARED]
	 * @param {string} sSymbol
	 * @param {object} oQuery
	 * @returns {Promise<{values: Array<object>, fromCache: boolean, sourceSymbol: string, interval: string}>}
	 */
	async function fnLoadSeriesForSymbolWithFallback(sSymbol, oQuery) {
		const aSymbolCandidates = fnBuildTdSymbolCandidates(sSymbol);
		const aQueries = [oQuery];
		const sInterval = String(oQuery?.interval || "").toLowerCase();
		if (sInterval && sInterval !== "1day") {
			aQueries.push(fnBuildDailyFallbackQuery(oQuery));
		}

		let sLastError = fnT("stocks.no_timeseries_available", "Keine Zeitreihe verfuegbar.");

		for (const oCandidateQuery of aQueries) {
			for (const sCandidate of aSymbolCandidates) {
				try {
					const oFetchResult = await fnTdFetch("/time_series", {
						symbol: sCandidate,
						...oCandidateQuery,
					});

					const aValues = Array.isArray(oFetchResult.data?.values)
						? [...oFetchResult.data.values].reverse()
						: [];

					if (aValues.length) {
						return {
							values: aValues,
							fromCache: oFetchResult.fromCache,
							sourceSymbol: sCandidate,
							interval: String(oCandidateQuery?.interval || ""),
						};
					}

					sLastError = fnT("stocks.empty_timeseries_for", "Leere Zeitreihe fuer {symbol}.", { symbol: sCandidate });
				} catch (oError) {
					sLastError = String(oError?.message || oError);
				}
			}
		}

		throw new Error(sLastError);
	}

	/**
	 * Lädt Time-Series Daten für die übergebenen Symbole sequenziell.
	 * Scope: [SHARED]
	 * @param {string[]} aSymbols
	 * @param {object} oQuery
	 * @returns {Promise<Map<string, {values: Array<object>, fromCache: boolean}>>}
	 */
	async function fnLoadSeriesForSymbols(aSymbols, oQuery) {
		const mSeriesBySymbol = new Map();
		const mErrorsBySymbol = new Map();

		for (const sSymbolRaw of aSymbols) {
			const sSymbol = String(sSymbolRaw || "").trim().toUpperCase();
			if (!sSymbol) continue;

			try {
				const oSeriesResult = await fnLoadSeriesForSymbolWithFallback(sSymbol, oQuery);
				mSeriesBySymbol.set(sSymbol, {
					values: oSeriesResult.values,
					fromCache: oSeriesResult.fromCache,
					sourceSymbol: oSeriesResult.sourceSymbol,
					interval: oSeriesResult.interval,
				});
			} catch (oError) {
				mErrorsBySymbol.set(sSymbol, String(oError?.message || oError));
				console.warn("Time series failed for", sSymbol, oError);
			}
		}

		mSeriesBySymbol.mErrorsBySymbol = mErrorsBySymbol;
		return mSeriesBySymbol;
	}

	/**
	 * Aggregiert Positionen je Symbol für Tabellen-/Auswahlzwecke.
	 * Scope: [SHARED]
	 * Variablen:
	 * - `aPositions`: Ungefilterte Positionsliste.
	 * - `mBySymbol`: Zwischenstruktur je Symbol.
	 * - `oAgg`: Aggregiertes Objekt pro Symbol.
	 * - `nAmount`: Stückzahl der Einzelposition.
	 * - `nBuyPrice`: Kaufpreis der Einzelposition.
	 * - `iBuyMs`: Kaufzeitpunkt in Millisekunden.
	 * - `aRows`: Finale Zeilen für Tabelle/Select.
	 * @param {Array<{symbol: string, amount: number, created_at: number, worthwhenbought: number}>} aPositions
	 * @returns {Array<{sSymbol: string, nTotalAmount: number, nAvgBuyPrice: number, iEarliestBuyMs: number}>}
	 */
	function fnAggregateOwnedSymbols(aPositions) {
		const mBySymbol = new Map();

		for (const oPosition of aPositions || []) {
			const sSymbol = String(oPosition?.symbol || "").trim().toUpperCase();
			if (!sSymbol) continue;

			const nAmount = Number(oPosition?.amount);
			const nBuyPrice = Number(oPosition?.worthwhenbought);
			const iBuyMs = fnToMsFromTimestamp(oPosition?.created_at);

			if (!mBySymbol.has(sSymbol)) {
				mBySymbol.set(sSymbol, {
					sSymbol,
					nTotalAmount: 0,
					nWeightedBuySum: 0,
					iEarliestBuyMs: Number.POSITIVE_INFINITY,
				});
			}

			const oAgg = mBySymbol.get(sSymbol);
			if (Number.isFinite(nAmount) && nAmount > 0) {
				oAgg.nTotalAmount += nAmount;
				if (Number.isFinite(nBuyPrice)) {
					oAgg.nWeightedBuySum += nBuyPrice * nAmount;
				}
			}

			if (Number.isFinite(iBuyMs) && iBuyMs < oAgg.iEarliestBuyMs) {
				oAgg.iEarliestBuyMs = iBuyMs;
			}
		}

		const aRows = [...mBySymbol.values()].map((oAgg) => {
			const nAvgBuyPrice = oAgg.nTotalAmount > 0 ? oAgg.nWeightedBuySum / oAgg.nTotalAmount : Number.NaN;
			return {
				sSymbol: oAgg.sSymbol,
				nTotalAmount: oAgg.nTotalAmount,
				nAvgBuyPrice,
				iEarliestBuyMs: Number.isFinite(oAgg.iEarliestBuyMs) ? oAgg.iEarliestBuyMs : Number.NaN,
			};
		});

		aRows.sort((oA, oB) => (oA.sSymbol < oB.sSymbol ? -1 : 1));
		return aRows;
	}

	/**
	 * Baut aus Positions- und Kursdaten die Chartpunkte auf.
	 * Scope: [SHARED]
	 * @param {Array<object>} aPositions
	 * @param {Map<string, {values: Array<object>}>} mSeriesBySymbol
	 * @param {boolean} bPnlOnly
	 * @returns {Array<{t: string, total: number, invested: number, pnl: number, y: number}>}
	 */
	function fnBuildSeriesPointsForPositions(aPositions, mSeriesBySymbol, bPnlOnly) {
		const mTimeLabelByKey = new Map();
		const aPreparedPositions = [];

		for (const oPosition of aPositions || []) {
			const sSymbol = String(oPosition?.symbol || "").trim().toUpperCase();
			const nAmount = Number(oPosition?.amount);
			if (!sSymbol || !Number.isFinite(nAmount) || nAmount <= 0) continue;

			const iPurchaseMs = fnToMsFromTimestamp(oPosition?.created_at);
			const nBuyPrice = Number(oPosition?.worthwhenbought);
			const aSeriesValues = mSeriesBySymbol.get(sSymbol)?.values || [];
			const aSeriesPoints = [];

			for (const oValue of aSeriesValues) {
				const sDatetime = String(oValue?.datetime || "").trim();
				const nClose = Number(oValue?.close);
				const nTimeKey = fnTdSortKey(sDatetime);
				if (!sDatetime || !Number.isFinite(nTimeKey) || !Number.isFinite(nClose)) continue;

				if (!mTimeLabelByKey.has(nTimeKey)) mTimeLabelByKey.set(nTimeKey, sDatetime);
				aSeriesPoints.push({ nTimeKey, nClose, sDatetime });
			}

			if (!aSeriesPoints.length) continue;
			aSeriesPoints.sort((oLeft, oRight) => oLeft.nTimeKey - oRight.nTimeKey);

			aPreparedPositions.push({
				nAmount,
				nBuyPrice,
				iPurchaseMs,
				aSeriesPoints,
				iCursor: 0,
				nLastClose: Number.NaN,
			});
		}

		const aSortedTimeKeys = [...mTimeLabelByKey.keys()].sort((nLeft, nRight) => nLeft - nRight);
		if (!aSortedTimeKeys.length) return [];

		const aPoints = [];
		for (const nTimeKey of aSortedTimeKeys) {
			let nTotal = 0;
			let nInvested = 0;
			const sPointLabel = mTimeLabelByKey.get(nTimeKey) || "";

			for (const oPrepared of aPreparedPositions) {
				while (
					oPrepared.iCursor < oPrepared.aSeriesPoints.length &&
					oPrepared.aSeriesPoints[oPrepared.iCursor].nTimeKey <= nTimeKey
				) {
					oPrepared.nLastClose = oPrepared.aSeriesPoints[oPrepared.iCursor].nClose;
					oPrepared.iCursor += 1;
				}

				if (!Number.isFinite(oPrepared.nLastClose)) continue;
				if (!fnIsTdPointOnOrAfterPurchase(sPointLabel, oPrepared.iPurchaseMs)) continue;

				nTotal += oPrepared.nLastClose * oPrepared.nAmount;
				if (Number.isFinite(oPrepared.nBuyPrice)) {
					nInvested += oPrepared.nBuyPrice * oPrepared.nAmount;
				}
			}

			const sTimeLabel = sPointLabel;
			const nPnl = nTotal - nInvested;
			aPoints.push({ t: sTimeLabel, total: nTotal, invested: nInvested, pnl: nPnl, y: bPnlOnly ? nPnl : nTotal });
		}

		return aPoints;
	}

	/**
	 * Berechnet die wertgewichtete Rendite über alle Positionen im Zeitraum.
	 * Scope: [SHARED]
	 * @param {Array<object>} aPositions
	 * @param {Map<string, {values: Array<object>}>} mSeriesBySymbol
	 * @returns {number}
	 */
	function fnComputeWeightedReturnPct(aPositions, mSeriesBySymbol) {
		let nWeightedReturnSum = 0;
		let nWeightSum = 0;

		for (const oPosition of aPositions || []) {
			const sSymbol = String(oPosition?.symbol || "").trim().toUpperCase();
			const nAmount = Number(oPosition?.amount);
			const iPurchaseMs = fnToMsFromTimestamp(oPosition?.created_at);
			const aSeriesValues = mSeriesBySymbol.get(sSymbol)?.values || [];

			if (!Number.isFinite(nAmount) || nAmount <= 0) continue;
			if (!aSeriesValues.length) continue;

			const aFilteredValues = aSeriesValues.filter((oValue) => {
				const iPointMs = fnToMsFromTdDatetime(oValue?.datetime);
				const sDatetime = String(oValue?.datetime || "");
				const bIsDailyPoint = sDatetime.includes(" ") === false;
				const sPurchaseDay = Number.isFinite(iPurchaseMs) ? fnFmtYmdInTimeZone(iPurchaseMs, "America/New_York") : "";
				const sPointDay = sDatetime.slice(0, 10);
				if (!Number.isFinite(iPointMs)) return false;
				if (Number.isFinite(iPurchaseMs)) {
					if (bIsDailyPoint) {
						if (sPointDay && sPurchaseDay && sPointDay < sPurchaseDay) return false;
					} else if (iPointMs < iPurchaseMs) {
						return false;
					}
				}
				return Number.isFinite(Number(oValue?.close));
			});

			if (!aFilteredValues.length) continue;

			const nStartClose = Number(aFilteredValues[0]?.close);
			const nEndClose = Number(aFilteredValues[aFilteredValues.length - 1]?.close);
			if (!Number.isFinite(nStartClose) || !Number.isFinite(nEndClose) || nStartClose <= 0) continue;

			const nStartValue = nStartClose * nAmount;
			if (!Number.isFinite(nStartValue) || nStartValue <= 0) continue;

			const nReturnPct = ((nEndClose - nStartClose) / nStartClose) * 100;
			nWeightedReturnSum += nReturnPct * nStartValue;
			nWeightSum += nStartValue;
		}

		if (!Number.isFinite(nWeightSum) || nWeightSum <= 0) return Number.NaN;
		return nWeightedReturnSum / nWeightSum;
	}

	/**
	 * Beschraenkt Daten auf den angefragten Datumsbereich ohne Forward-Fill.
	 * Damit werden Nicht-Handelstage nicht kuenstlich angezeigt.
	 * Scope: [SHARED]
	 * @param {Array<object>} aPoints
	 * @param {object} oQuery
	 * @param {boolean} bPnlOnly
	 * @returns {Array<object>}
	 */
	function fnWithFixedDateRange(aPoints, oQuery, bPnlOnly, sRange = "") {
		if (!Array.isArray(aPoints)) return aPoints;
		const fnPointDayKey = (oPoint) => {
			const sRaw = String(oPoint?.t || "").trim();
			if (/^\d{4}-\d{2}-\d{2}/.test(sRaw)) return sRaw.slice(0, 10);
			const iMs = fnToMsFromTdDatetime(sRaw);
			if (!Number.isFinite(iMs)) return "";
			return fnFmtYmdInTimeZone(iMs, "America/New_York");
		};

		const fnPointMs = (oPoint) => fnToMsFromTdDatetime(String(oPoint?.t || ""));
		const aValidPoints = aPoints.filter((oPoint) => Number.isFinite(fnPointMs(oPoint)));
		if (!aValidPoints.length) return aPoints;

		const iLatestMs = Math.max(...aValidPoints.map((oPoint) => fnPointMs(oPoint)));
		if (!Number.isFinite(iLatestMs)) return aPoints;

		if (sRange === "1D") {
			const sLatestDay = fnFmtYmdInTimeZone(iLatestMs, "America/New_York");
			if (!sLatestDay) return aPoints;
			const aOneDayPoints = aPoints.filter((oPoint) => fnPointDayKey(oPoint) === sLatestDay);
			return aOneDayPoints.length ? aOneDayPoints : aPoints;
		}

		const oWindowByRange = {
			"1W": 7 * 24 * 60 * 60 * 1000,
			"1M": 31 * 24 * 60 * 60 * 1000,
			"1Y": 366 * 24 * 60 * 60 * 1000,
		};
		const iWindowMs = oWindowByRange[sRange];
		if (Number.isFinite(iWindowMs) && iWindowMs > 0) {
			const iCutoffMs = iLatestMs - iWindowMs + 1;
			const aWindowed = aPoints.filter((oPoint) => {
				const iMs = fnPointMs(oPoint);
				return Number.isFinite(iMs) && iMs >= iCutoffMs;
			});
			return aWindowed.length ? aWindowed : aPoints;
		}

		const sStartDay = String(oQuery?.start_date || "").slice(0, 10);
		const sEndDay = String(oQuery?.end_date || "").slice(0, 10);
		if (!sStartDay || !sEndDay || sStartDay > sEndDay) return aPoints;
		const aDayBounded = aPoints.filter((oPoint) => {
			const sPointDay = fnPointDayKey(oPoint);
			if (!/^\d{4}-\d{2}-\d{2}$/.test(sPointDay)) return false;
			return sPointDay >= sStartDay && sPointDay <= sEndDay;
		});
		return aDayBounded.length ? aDayBounded : aPoints;
	}

	/**
	 * Formatiert ein Datum passend zum Twelve-Data-Zeitformat des Referenzwerts.
	 * Scope: [SHARED]
	 * @param {Date} dDate
	 * @param {string} sReferenceTime
	 * @returns {string}
	 */
	function fnFormatTimeLikeReference(dDate, sReferenceTime) {
		if (!(dDate instanceof Date) || !Number.isFinite(dDate.getTime())) return String(sReferenceTime || "");
		const sRef = String(sReferenceTime || "");
		if (sRef.includes(" ")) {
			const sHours = String(dDate.getHours()).padStart(2, "0");
			const sMinutes = String(dDate.getMinutes()).padStart(2, "0");
			const sSeconds = String(dDate.getSeconds()).padStart(2, "0");
			return `${fnFmtYmd(dDate)} ${sHours}:${sMinutes}:${sSeconds}`;
		}
		return fnFmtYmd(dDate);
	}

	/**
	 * Erzeugt bei frischem Kauf einen Startpunkt mit 0-Wert, damit ein sichtbarer Sprung entsteht.
	 * Scope: [SHARED]
	 * @param {Array<{t: string, total: number, invested: number, pnl: number, y: number}>} aPoints
	 * @returns {Array<{t: string, total: number, invested: number, pnl: number, y: number}>}
	 */
	function fnEnsureInitialPortfolioJump(aPoints) {
		if (!Array.isArray(aPoints) || !aPoints.length) return aPoints;
		const oFirstPoint = aPoints[0];
		const nFirstValue = Number(oFirstPoint?.y);
		if (!Number.isFinite(nFirstValue) || nFirstValue <= 0) return aPoints;
		if (!String(oFirstPoint?.t || "").includes(" ")) return aPoints;

		const iFirstMs = fnToMsFromTdDatetime(oFirstPoint?.t);
		let dBefore = null;
		if (Number.isFinite(iFirstMs)) {
			const iOffsetMs = String(oFirstPoint?.t || "").includes(" ") ? 60 * 1000 : 24 * 60 * 60 * 1000;
			dBefore = new Date(iFirstMs - iOffsetMs);
		}

		const oSyntheticPoint = {
			t: dBefore ? fnFormatTimeLikeReference(dBefore, oFirstPoint?.t) : `vor_${String(oFirstPoint?.t || "").trim()}`,
			total: 0,
			invested: 0,
			pnl: 0,
			y: 0,
		};

		return [oSyntheticPoint, ...aPoints];
	}

	/**
	 * Ergänzt einen Ankerpunkt zum frühesten Kaufzeitpunkt.
	 * Dadurch wirkt der Verlauf nicht so, als wäre erst beim ersten Kursdatenpunkt gekauft worden.
	 * Scope: [SHARED]
	 * @param {Array<{t: string, total: number, invested: number, pnl: number, y: number}>} aPoints
	 * @param {Array<object>} aPositions
	 * @param {boolean} bPnlOnly
	 * @returns {Array<{t: string, total: number, invested: number, pnl: number, y: number}>}
	 */
	function fnInjectPurchaseAnchorPoint(aPoints, aPositions, bPnlOnly) {
		return Array.isArray(aPoints) ? aPoints : [];
	}

	/**
	 * Leitet aus einem Interval-String die Schrittweite in Millisekunden ab.
	 * Scope: [SHARED]
	 * @param {string} sInterval
	 * @returns {number}
	 */
	function fnIntervalToStepMs(sInterval) {
		if (typeof oShareViewChartUtils.intervalToStepMs === "function") {
			return oShareViewChartUtils.intervalToStepMs(sInterval);
		}
		const sValue = String(sInterval || "").trim().toLowerCase();
		const oMatch = sValue.match(/^(\d+)\s*(min|day|week|month)$/);
		if (!oMatch) return 24 * 60 * 60 * 1000;
		const nValue = Number(oMatch[1]);
		if (!Number.isFinite(nValue) || nValue <= 0) return 24 * 60 * 60 * 1000;
		if (oMatch[2] === "min") return nValue * 60 * 1000;
		if (oMatch[2] === "day") return nValue * 24 * 60 * 60 * 1000;
		if (oMatch[2] === "week") return nValue * 7 * 24 * 60 * 60 * 1000;
		if (oMatch[2] === "month") return nValue * 30 * 24 * 60 * 60 * 1000;
		return 24 * 60 * 60 * 1000;
	}

	/**
	 * Erzeugt eine Fallback-Serie: alle Punkte 0, letzter Punkt = aktueller Wert.
	 * Scope: [SHARED]
	 * @param {object} oQuery
	 * @param {number} nLastValue
	 * @param {string} sReferenceTime
	 * @returns {Array<{t: string, total: number, invested: number, pnl: number, y: number}>}
	 */
	function fnBuildZeroFallbackSeries(oQuery, nLastValue, sReferenceTime) {
		const nSafeLastValue = Number.isFinite(Number(nLastValue)) ? Number(nLastValue) : 0;
		const nStepMs = fnIntervalToStepMs(oQuery?.interval);
		const nNowMs = Date.now();
		const iDefaultPointCount = nStepMs < 24 * 60 * 60 * 1000
			? Math.max(2, Math.floor((24 * 60 * 60 * 1000) / Math.max(1, nStepMs)) + 1)
			: 30;
		const bIntradayFallback = nStepMs < 24 * 60 * 60 * 1000;

		let iPointCount = iDefaultPointCount;
		const dStart = oQuery?.start_date ? new Date(`${oQuery.start_date}T00:00:00`) : null;
		const dEnd = oQuery?.end_date ? new Date(`${oQuery.end_date}T00:00:00`) : null;
		const bSameDayRange = Boolean(
			String(oQuery?.start_date || "")
			&& String(oQuery?.start_date || "") === String(oQuery?.end_date || "")
		);
		if (dStart instanceof Date && dEnd instanceof Date && Number.isFinite(dStart.getTime()) && Number.isFinite(dEnd.getTime()) && dEnd >= dStart) {
			const nRangeDays = Math.floor((dEnd.getTime() - dStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
			if (Number.isFinite(nRangeDays) && nRangeDays > 1) {
				iPointCount = Math.min(180, Math.max(2, nRangeDays));
			}
		}

		let iEndMs = Number.isFinite(dEnd?.getTime()) ? dEnd.getTime() : nNowMs;
		let iStartMs = iEndMs - (iPointCount - 1) * nStepMs;
		if (bIntradayFallback && bSameDayRange) {
			const iDayStartMs = dStart.getTime();
			const iDayEndMs = iDayStartMs + (24 * 60 * 60 * 1000) - nStepMs;
			iEndMs = Math.min(nNowMs, iDayEndMs);
			iStartMs = iDayStartMs;
			iPointCount = Math.max(2, Math.floor((iEndMs - iStartMs) / Math.max(1, nStepMs)) + 1);
		}

		const aSeries = [];
		for (let iIndex = 0; iIndex < iPointCount; iIndex += 1) {
			const iCurrentMs = iStartMs + iIndex * nStepMs;
			const dCurrent = new Date(iCurrentMs);
			const sTimeValue = (() => {
				if (!bIntradayFallback) return fnFormatTimeLikeReference(dCurrent, sReferenceTime);
				if (String(sReferenceTime || "").includes(" ")) return fnFormatTimeLikeReference(dCurrent, sReferenceTime);
				const sHours = String(dCurrent.getHours()).padStart(2, "0");
				const sMinutes = String(dCurrent.getMinutes()).padStart(2, "0");
				const sSeconds = String(dCurrent.getSeconds()).padStart(2, "0");
				return `${fnFmtYmd(dCurrent)} ${sHours}:${sMinutes}:${sSeconds}`;
			})();
			aSeries.push({
				t: sTimeValue,
				total: 0,
				invested: 0,
				pnl: 0,
				y: 0,
			});
		}
		aSeries[aSeries.length - 1] = {
			...aSeries[aSeries.length - 1],
			total: nSafeLastValue,
			y: nSafeLastValue,
		};
		return aSeries;
	}

	/**
	 * Erzeugt Kurzlabel für die X-Achse.
	 * Scope: [SHARED]
	 * @param {string} sValue
	 * @returns {string}
	 */
	function fnShortLabel(sValue, bIncludeDate = false) {
		const sText = String(sValue || "");
		if (!sText) return "";

		if (sText.includes(" ")) {
			const [sDate, sTime] = sText.split(" ");
			const sClock = String(sTime || "").slice(0, 5);
			if (!bIncludeDate) return sClock;
			const [, sMonth, sDay] = String(sDate || "").split("-");
			if (sDay && sMonth) return `${sDay}.${sMonth} ${sClock}`.trim();
			return sClock;
		}
		const [sYear, sMonth, sDay] = sText.split("-");
		if (sYear && sMonth && sDay) return `${sDay}.${sMonth}.`;
		return sText;
	}

	/**
	 * Formatiert Y-Achsenwerte kompakt für den Chart.
	 * Scope: [SHARED]
	 * @param {number} nValue
	 * @param {boolean} bPnlOnly
	 * @returns {string}
	 */
	function fnFmtAxisMoneyCompact(nValue, bPnlOnly) {
		if (!Number.isFinite(nValue)) return "—";

		const nAbs = Math.abs(nValue);
		const sPrefix = bPnlOnly && nValue > 0 ? "+" : "";

		if (nAbs >= 1000000) {
			return `${sPrefix}${(nValue / 1000000).toFixed(2)}M`;
		}
		if (nAbs >= 1000) {
			return `${sPrefix}${(nValue / 1000).toFixed(1)}k`;
		}
		return `${sPrefix}${fnFmtMoney(nValue, "USD")}`;
	}

	/**
	 * Escaped HTML für sichere Ausgabe im Template.
	 * Scope: [SHARED]
	 * @param {string} sInput
	 * @returns {string}
	 */
	function fnEscapeHtml(sInput) {
		return String(sInput)
			.replaceAll("&", "&amp;")
			.replaceAll("<", "&lt;")
			.replaceAll(">", "&gt;")
			.replaceAll('"', "&quot;")
			.replaceAll("'", "&#039;");
	}

	// =====================================================
