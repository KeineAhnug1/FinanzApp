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
		if (sRange === "1D") return { interval: "5min", outputsize: 120 };
		if (sRange === "1W") return { interval: "1day", outputsize: 35 };
		if (sRange === "1M") return { interval: "1day", outputsize: 60 };

		if (sRange === "1Y") {
			const dEndDate = new Date();
			const dStartDate = new Date(dEndDate);
			dStartDate.setFullYear(dStartDate.getFullYear() - 1);

			return {
				interval: "1day",
				start_date: fnFmtYmd(dStartDate),
				end_date: fnFmtYmd(dEndDate),
				outputsize: 400,
			};
		}

		if (sRange === "SINCE_BUY") {
			const dEndDate = new Date();
			const dFirstBuyDate = fnGetFirstBuyDate(aPositions);
			const dStartDate = dFirstBuyDate || new Date(dEndDate.getTime() - 365 * 24 * 60 * 60 * 1000);

			return {
				interval: "1day",
				start_date: fnFmtYmd(dStartDate),
				end_date: fnFmtYmd(dEndDate),
				outputsize: 5000,
			};
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
		if (String(oQuery?.interval || "").toLowerCase() === "5min") {
			aQueries.push(fnBuildDailyFallbackQuery(oQuery));
		}

		let sLastError = "Keine Zeitreihe verfuegbar.";

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

					sLastError = `Leere Zeitreihe fuer ${sCandidate}.`;
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
		const setAllTimes = new Set();
		const mCloseByPosition = new Map();

		aPositions.forEach((oPosition, iPositionIndex) => {
			const sSymbol = String(oPosition?.symbol || "").trim().toUpperCase();
			const iPurchaseMs = fnToMsFromTimestamp(oPosition?.created_at);
			const aSeriesValues = mSeriesBySymbol.get(sSymbol)?.values || [];
			const mCloseByTime = new Map();

			for (const oValue of aSeriesValues) {
				const sDatetime = oValue?.datetime;
				const nClose = Number(oValue?.close);
				const iPointMs = fnToMsFromTdDatetime(sDatetime);

				if (!sDatetime || !Number.isFinite(nClose)) continue;
				if (Number.isFinite(iPurchaseMs) && Number.isFinite(iPointMs) && iPointMs < iPurchaseMs) continue;

				mCloseByTime.set(sDatetime, nClose);
				setAllTimes.add(sDatetime);
			}

			mCloseByPosition.set(iPositionIndex, mCloseByTime);
		});

		const aSortedTimes = [...setAllTimes].sort((sA, sB) => (sA < sB ? -1 : 1));

		const aPoints = aSortedTimes.map((sTime) => {
			let nTotal = 0;
			let nInvested = 0;

			aPositions.forEach((oPosition, iPositionIndex) => {
				const nAmount = Number(oPosition?.amount);
				const nBuyPrice = Number(oPosition?.worthwhenbought);
				const nClose = mCloseByPosition.get(iPositionIndex)?.get(sTime);

				if (!Number.isFinite(nAmount) || nAmount <= 0) return;
				if (!Number.isFinite(nClose)) return;

				nTotal += nClose * nAmount;
				if (Number.isFinite(nBuyPrice)) nInvested += nBuyPrice * nAmount;
			});

			const nPnl = nTotal - nInvested;
			return { t: sTime, total: nTotal, invested: nInvested, pnl: nPnl, y: bPnlOnly ? nPnl : nTotal };
		});

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
				if (!Number.isFinite(iPointMs)) return false;
				if (Number.isFinite(iPurchaseMs) && iPointMs < iPurchaseMs) return false;
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
	 * Erweitert Tagesdaten auf einen fixen Bereich (`start_date` bis `end_date`) mit Forward-Fill.
	 * Scope: [SHARED]
	 * @param {Array<object>} aPoints
	 * @param {object} oQuery
	 * @param {boolean} bPnlOnly
	 * @returns {Array<object>}
	 */
	function fnWithFixedDateRange(aPoints, oQuery, bPnlOnly) {
		if (!oQuery?.start_date || !oQuery?.end_date) return aPoints;
		if (!Array.isArray(aPoints)) return aPoints;

		const mByDate = new Map();
		for (const oPoint of aPoints) {
			mByDate.set(String(oPoint.t).slice(0, 10), oPoint);
		}

		const dStart = new Date(`${oQuery.start_date}T00:00:00`);
		const dEnd = new Date(`${oQuery.end_date}T00:00:00`);
		if (!Number.isFinite(dStart.getTime()) || !Number.isFinite(dEnd.getTime()) || dStart > dEnd) return aPoints;

		const aOutput = [];
		let oLastKnown = null;

		for (let dCursor = new Date(dStart); dCursor <= dEnd; dCursor.setDate(dCursor.getDate() + 1)) {
			const sDay = fnFmtYmd(dCursor);
			const oRealPoint = mByDate.get(sDay);

			if (oRealPoint) {
				oLastKnown = oRealPoint;
				aOutput.push(oRealPoint);
				continue;
			}

			if (oLastKnown) {
				aOutput.push({ ...oLastKnown, t: sDay, y: bPnlOnly ? oLastKnown.pnl : oLastKnown.total });
				continue;
			}

			aOutput.push({ t: sDay, total: 0, invested: 0, pnl: 0, y: 0 });
		}

		return aOutput;
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
		const iDefaultPointCount = nStepMs < 24 * 60 * 60 * 1000 ? 24 : 30;

		let iPointCount = iDefaultPointCount;
		const dStart = oQuery?.start_date ? new Date(`${oQuery.start_date}T00:00:00`) : null;
		const dEnd = oQuery?.end_date ? new Date(`${oQuery.end_date}T00:00:00`) : null;
		if (dStart instanceof Date && dEnd instanceof Date && Number.isFinite(dStart.getTime()) && Number.isFinite(dEnd.getTime()) && dEnd >= dStart) {
			const nRangeDays = Math.floor((dEnd.getTime() - dStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
			if (Number.isFinite(nRangeDays) && nRangeDays > 1) {
				iPointCount = Math.min(180, Math.max(2, nRangeDays));
			}
		}

		const iEndMs = Number.isFinite(dEnd?.getTime()) ? dEnd.getTime() : nNowMs;
		const iStartMs = iEndMs - (iPointCount - 1) * nStepMs;
		const aSeries = [];
		for (let iIndex = 0; iIndex < iPointCount; iIndex += 1) {
			const iCurrentMs = iStartMs + iIndex * nStepMs;
			const dCurrent = new Date(iCurrentMs);
			aSeries.push({
				t: fnFormatTimeLikeReference(dCurrent, sReferenceTime),
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
	function fnShortLabel(sValue) {
		const sText = String(sValue || "");
		if (!sText) return "";

		if (sText.includes(" ")) {
			const [sDate, sTime] = sText.split(" ");
			const [sYear, sMonth, sDay] = sDate.split("-");
			return `${sDay}.${sMonth}. ${sTime.slice(0, 5)}`;
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
