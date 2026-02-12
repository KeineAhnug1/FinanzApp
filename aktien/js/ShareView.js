(() => {
	// =====================================================
	// [SHARED] 0) Konfiguration (für Depot + Einzelanalyse)
	// =====================================================
	const sTwelveApiKey = "551db088d29044888daee527fe5da4b1";
	const sTdBaseUrl = "https://api.twelvedata.com";
	const sPositionsEndpoint = "/api/positions";
	const sAllStocksDataPath = "testdata/Allstocks.json";
	const sLocalBuyStorageKey = "shareview_positions_buys_v1";
	const iCacheTtlMs = 5 * 60 * 1000;
	const sLocale = "de-DE";

	// =====================================================
	// [SHARED] 1) DOM-Referenzen + globaler Zustand
	// =====================================================
	const aElNavButtons = [...document.querySelectorAll(".navbtn")];
	const elViewHost = document.getElementById("viewHost");

	let sActiveView = "depot";

	// =====================================================
	// [SHARED] 2) UI-Helfer - Lokalisierung
	// =====================================================

	/**
	 * Loggt einen Fehlertext in die Konsole.
	 * Scope: [SHARED]
	 * @param {string} sMessage
	 */
	function fnShowError(sMessage) {
		console.error(sMessage);
	}

	/**
	 * Formatiert einen numerischen Wert als Währung.
	 * Scope: [SHARED]
	 * @param {number} nValue
	 * @param {string} [sCurrency="EUR"]
	 * @returns {string}
	 */
	function fnFmtMoney(nValue, sCurrency = "EUR") {
		if (!Number.isFinite(nValue)) return "—";
		return new Intl.NumberFormat(sLocale, {
			style: "currency",
			currency: sCurrency,
			maximumFractionDigits: 2,
		}).format(nValue);
	}

	/**
	 * Formatiert eine Zahl mit begrenzter Nachkommastellenzahl.
	 * Scope: [SHARED]
	 * Variablen:
	 * @param {number} nValue
	 * @param {number} [iDigits=4]
	 * @returns {string}
	 */
	function fnFmtNumber(nValue, iDigits = 4) {
		if (!Number.isFinite(nValue)) return "—";
		return new Intl.NumberFormat(sLocale, { maximumFractionDigits: iDigits }).format(nValue);
	}

	/**
	 * Wandelt einen Unix-Zeitstempel in ein deutsches Datumsformat.
	 * Scope: [SHARED]
	 * @param {number|string} nTimestampRaw
	 * @returns {string}
	 */
	function fnFmtDateFromTimestamp(nTimestampRaw) {
		const iTimestampMs = fnToMsFromTimestamp(nTimestampRaw);
		if (!Number.isFinite(iTimestampMs)) return "—";
		const dDate = new Date(iTimestampMs);
		return new Intl.DateTimeFormat(sLocale, { dateStyle: "medium" }).format(dDate);
	}

	// =====================================================
	// [SHARED] 3) Cache-Helfer
	// =====================================================

	/**
	 * Erzeugt aus einem Objekt einen stabilen localStorage-Key.
	 * Scope: [SHARED]
	 * @param {object} oPayload
	 * @returns {string}
	 */
	function fnCacheKey(oPayload) {
		return "td_cache_" + fnToBase64Utf8(JSON.stringify(oPayload));
	}

	/**
	 * Kodiert einen UTF-8-String als Base64.
	 * Scope: [SHARED]
	 * @param {string} sValue
	 * @returns {string}
	 */
	function fnToBase64Utf8(sValue) {
		const aBytes = new TextEncoder().encode(sValue);
		let sBinary = "";
		const iChunkSize = 32768;

		for (let iIndex = 0; iIndex < aBytes.length; iIndex += iChunkSize) {
			const aChunk = aBytes.subarray(iIndex, iIndex + iChunkSize);
			sBinary += String.fromCharCode(...aChunk);
		}

		return btoa(sBinary);
	}

	/**
	 * Liest einen Cache-Eintrag und prüft die TTL.
	 * Scope: [SHARED]
	 * @param {string} sKey
	 * @returns {any | null}
	 */
	function fnCacheRead(sKey) {
		const sRaw = localStorage.getItem(sKey);
		if (!sRaw) return null;

		try {
			const oParsed = JSON.parse(sRaw);
			if (!oParsed?.ts || !oParsed?.data) return null;
			if (Date.now() - oParsed.ts > iCacheTtlMs) return null;
			return oParsed.data;
		} catch {
			return null;
		}
	}

	/**
	 * Schreibt Daten inkl. Timestamp in den Cache.
	 * Scope: [SHARED]
	 * @param {string} sKey
	 * @param {any} oData
	 */
	function fnCacheWrite(sKey, oData) {
		localStorage.setItem(sKey, JSON.stringify({ ts: Date.now(), data: oData }));
	}

	// =====================================================
	// [SHARED] 4) API-Zugriff
	// =====================================================

	/**
	 * Führt einen Twelve-Data-Request aus (inkl. Cache).
	 * Scope: [SHARED]
	 * Variablen:
	 * - `sPath`: Endpoint-Pfad.
	 * - `oParams`: Query-Parameter.
	 * - `oUrl`: Zusammengesetzte Request-URL.
	 * - `sKey`: Cache-Schlüssel.
	 * - `oCachedData`: Ergebnis aus Cache (falls vorhanden).
	 * - `oResponse`: fetch-Response.
	 * - `oData`: Geparstes API-JSON.
	 * @param {string} sPath
	 * @param {Record<string, string | number>} oParams
	 * @returns {Promise<{data: any, fromCache: boolean}>}
	 */
	async function fnTdFetch(sPath, oParams) {
		const oUrl = new URL(sTdBaseUrl + sPath);
		Object.entries(oParams).forEach(([sKeyParam, xValue]) => {
			oUrl.searchParams.set(sKeyParam, String(xValue));
		});

		const sKey = fnCacheKey({ path: sPath, params: oParams });
		const oCachedData = fnCacheRead(sKey);
		if (oCachedData) return { data: oCachedData, fromCache: true };

		const oResponse = await fetch(oUrl.toString());
		if (!oResponse.ok) throw new Error(`HTTP ${oResponse.status} - ${oResponse.statusText}`);

		const oData = await oResponse.json();
		if (oData?.status === "error") {
			throw new Error(oData?.message || "Twelve Data Fehler");
		}

		fnCacheWrite(sKey, oData);
		return { data: oData, fromCache: false };
	}

	// =====================================================
	// [SHARED] 5) Positions- und Katalogdaten
	// Wird in Depot und Einzelanalyse verwendet.
	// =====================================================
	const aFallbackPositions = [
		{
			symbol: "AAPL",
			amount: 3.1,
			created_at: 1749549600,
			worthwhenbought: 202.69,
		},
		{
			symbol: "MSFT",
			amount: 1.75,
			created_at: 1749636000,
			worthwhenbought: 472.62,
		},
		{
			symbol: "TSLA",
			amount: 0.85,
			created_at: 1749722400,
			worthwhenbought: 319.11,
		},
	];

	/**
	 * Lädt Positionen aus `window.POSITIONS`, Backend-Endpoint oder Fallback.
	 * Scope: [SHARED]
	 * @returns {Promise<Array<{symbol: string, amount: number, created_at: number, worthwhenbought: number}>>}
	 */
	async function fnLoadPositions() {
		const aLocalBoughtPositions = fnReadLocalBoughtPositions();
		if (Array.isArray(window.POSITIONS)) {
			return fnNormalizePositions([...window.POSITIONS, ...aLocalBoughtPositions]);
		}

		try {
			const oResponse = await fetch(sPositionsEndpoint);
			if (oResponse.ok) {
				const oData = await oResponse.json();
				if (Array.isArray(oData)) {
					return fnNormalizePositions([...oData, ...aLocalBoughtPositions]);
				}
			}
			console.warn(`Positions Backend Fehler: HTTP ${oResponse.status}. Nutze Fallback-Daten.`);
		} catch (oError) {
			console.warn("Positions Backend nicht erreichbar. Nutze Fallback-Daten.", oError);
		}

		if (!Array.isArray(aFallbackPositions)) {
			throw new Error("Ungueltige Fallback-Daten. Erwartet Array aus Positionen.");
		}

		return fnNormalizePositions([...aFallbackPositions, ...aLocalBoughtPositions]);
	}

	/**
	 * Liest lokal gespeicherte Käufe aus dem Browser-Storage.
	 * Scope: [SHARED]
	 * @returns {Array<{symbol: string, amount: number, created_at: number, worthwhenbought: number}>}
	 */
	function fnReadLocalBoughtPositions() {
		const sRaw = localStorage.getItem(sLocalBuyStorageKey);
		if (!sRaw) return [];

		try {
			const aParsed = JSON.parse(sRaw);
			if (!Array.isArray(aParsed)) return [];
			return fnNormalizePositions(aParsed);
		} catch {
			return [];
		}
	}

	/**
	 * Schreibt lokal gespeicherte Käufe in den Browser-Storage.
	 * Scope: [SHARED]
	 * @param {Array<{symbol: string, amount: number, created_at: number, worthwhenbought: number}>} aPositions
	 */
	function fnWriteLocalBoughtPositions(aPositions) {
		localStorage.setItem(sLocalBuyStorageKey, JSON.stringify(aPositions));
	}

	/**
	 * Speichert einen Kauf lokal und ergänzt optional `window.POSITIONS`.
	 * Scope: [SHARED]
	 * @param {{symbol: string, amount: number, created_at: number, worthwhenbought: number}} oPosition
	 */
	function fnPersistBoughtPosition(oPosition) {
		const aLocalPositions = fnReadLocalBoughtPositions();
		aLocalPositions.push(oPosition);
		fnWriteLocalBoughtPositions(aLocalPositions);

		if (Array.isArray(window.POSITIONS)) {
			window.POSITIONS.push(oPosition);
		}
	}

	/**
	 * Normalisiert Positionsobjekte auf das Feld `symbol`.
	 * Scope: [SHARED]
	 * Hinweis:
	 * - Unterstützt Legacy-Daten mit `shares`.
	 * @param {Array<any>} aPositions
	 * @returns {Array<{symbol: string, amount: number, created_at: number, worthwhenbought: number}>}
	 */
	function fnNormalizePositions(aPositions) {
		return (aPositions || [])
			.map((oPosition) => {
				const sSymbol = String(oPosition?.symbol ?? oPosition?.shares ?? "").trim().toUpperCase();
				if (!sSymbol) return null;
				return { ...oPosition, symbol: sSymbol };
			})
			.filter(Boolean);
	}

	/**
	 * Lädt den lokalen Aktienkatalog aus `testdata/Allstocks.json`.
	 * Scope: [SHARED]
	 * @returns {Promise<Array<{sSymbol: string, sName: string, sExchange: string, sCurrency: string}>>}
	 */
	async function fnLoadAllStocksCatalog() {
		try {
			const oResponse = await fetch(sAllStocksDataPath);
			if (!oResponse.ok) return [];

			const oData = await oResponse.json();
			const aRows = Array.isArray(oData?.data)
				? oData.data
					.map((oRow) => ({
						sSymbol: String(oRow?.symbol || "").trim().toUpperCase(),
						sName: String(oRow?.name || "").trim(),
						sExchange: String(oRow?.exchange || "").trim(),
						sCurrency: String(oRow?.currency || "").trim(),
					}))
					.filter((oRow) => Boolean(oRow.sSymbol))
				: [];

			return aRows;
		} catch {
			return [];
		}
	}

	/**
	 * Filtert den Aktienkatalog über Symbol/Name.
	 * Scope: [SHARED]
	 * @param {Array<{sSymbol: string, sName: string, sExchange: string, sCurrency: string}>} aCatalog
	 * @param {string} sNeedle
	 * @param {number} [iLimit=20]
	 * @returns {Array<{sSymbol: string, sName: string, sExchange: string, sCurrency: string}>}
	 */
	function fnSearchStocksCatalog(aCatalog, sNeedle, iLimit = 20) {
		const sQuery = String(sNeedle || "").trim().toLowerCase();
		if (!sQuery) return aCatalog.slice(0, iLimit);

		return aCatalog
			.filter((oRow) => oRow.sSymbol.toLowerCase().includes(sQuery) || oRow.sName.toLowerCase().includes(sQuery))
			.slice(0, iLimit);
	}

	// =====================================================
	// [SHARED] 6) View-Rendering (enthält [DEPOT]- und [ANALYSE]-Template)
	// =====================================================

	/**
	 * Rendert den gewählten Hauptbereich und startet dessen Initialisierung.
	 * Scope: [SHARED]
	 * @param {string} sViewName
	 */
	function fnRenderView(sViewName) {
		elViewHost.innerHTML = "";

		// [DEPOT] Template + Startlogik
		if (sViewName === "depot") {
			elViewHost.innerHTML = `
        <section class="depot-page">
          <h2 class="view-title">Gesamtsdepot</h2>

          <div class="range-bar">
            <button class="range-btn active" data-range="1D">Tag</button>
            <button class="range-btn" data-range="1W">Woche</button>
            <button class="range-btn" data-range="1M">Monat</button>
            <button class="range-btn" data-range="1Y">Jahr</button>
            <button class="range-btn" data-range="SINCE_BUY">Ab Kauf</button>
          </div>

          <div class="card">
            <div class="depot-top">
              <div class="kpis">
                <div class="kpi">
                  <b id="k_total_label">Depotwert (letzter Punkt)</b>
                  <span id="k_total">—</span>
                </div>
                <div class="kpi">
                  <b>Veränderung im Zeitraum</b>
                  <span id="k_change">—</span>
                </div>
                <div class="kpi">
                  <b>Nur Gewinn/Verlust</b>
                  <label class="check-row">
                    <input type="checkbox" id="k_pnl_only" class="ui-check">
                    <span>Aktiv</span>
                  </label>
                </div>
                <div class="kpi">
                  <b>Piechart anzeigen</b>
                  <label class="check-row">
                    <input type="checkbox" id="k_show_pie" class="ui-check" checked>
                    <span>Aktiv</span>
                  </label>
                </div>
              </div>

              <div class="muted" id="depotInfo">Bereit.</div>
            </div>

            <div class="depot-chart-layout">
              <div class="depot-line-wrap">
                <canvas id="depotChart" class="line-chart" width="1200" height="420"></canvas>
              </div>
              <div class="depot-pie-wrap" id="depotPiePanel">
                <div class="depot-pie-content">
                  <canvas id="depotPieChart" class="pie-chart" width="420" height="420"></canvas>
                  <div id="depotPieLegend" class="pie-legend"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <h3>Positionen</h3>
            <div class="table-wrap">
              <table class="table" id="holdingsTable">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Menge</th>
                    <th>Kaufdatum</th>
                    <th>Preis bei Kauf</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>

        </section>
      `;

			fnInitDepotView();
			return;
		}

		// [ANALYSE] Template + Startlogik
		if (sViewName === "analysis") {
			elViewHost.innerHTML = `
        <section class="analysis-page">
          <h2 class="view-title">Einzelanalyse</h2>

          <div class="card">
            <div class="row analysis-top-row">
              <label>
                Alle Aktien durchsuchen
                <input id="analysisCatalogSearchInput" type="search" placeholder="z. B. Apple oder AAPL" autocomplete="off">
              </label>

              <button class="action" id="analysisCatalogSelectFirstBtn" type="button">Ersten Treffer laden</button>

              <div class="muted" id="analysisInfo">Bereit.</div>
            </div>

            <div id="analysisSearchResults" class="analysis-search-results"></div>
          </div>

          <div class="card">
            <div class="row analysis-top-row">
              <label>
                Meine gehaltenen Aktien
                <select id="analysisOwnedSymbolSelect"></select>
              </label>

              <button class="action" id="analysisUseOwnedBtn" type="button">Aus Depot laden</button>

              <label>
                Menge kaufen
                <input id="analysisBuyAmountInput" type="number" min="0.0001" step="0.0001" value="1">
              </label>

              <button class="action primary" id="analysisBuyBtn" type="button">Kaufen</button>
            </div>
            <div class="muted" id="analysisBuyFeedback"></div>
          </div>

          <div class="range-bar">
            <button class="range-btn active" data-range="1D">Tag</button>
            <button class="range-btn" data-range="1W">Woche</button>
            <button class="range-btn" data-range="1M">Monat</button>
            <button class="range-btn" data-range="1Y">Jahr</button>
            <button class="range-btn" data-range="SINCE_BUY">Ab Kauf</button>
          </div>

          <div class="card">
            <div class="depot-top">
              <div class="kpis">
                <div class="kpi">
                  <b id="analysis_total_label">Kurs (letzter Punkt)</b>
                  <span id="analysis_total">—</span>
                </div>
                <div class="kpi">
                  <b>Veränderung im Zeitraum</b>
                  <span id="analysis_change">—</span>
                </div>
              </div>
            </div>

            <canvas id="analysisChart" class="line-chart" width="1200" height="420"></canvas>
          </div>

          <div class="card">
            <h3>Alle Aktien im Besitz</h3>
            <div class="table-wrap">
              <table class="table" id="analysisHoldingsTable">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Gesamtmenge</th>
                    <th>Erster Kauf</th>
                    <th>Ø Kaufpreis</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </section>
      `;

			fnInitAnalysisView();
			return;
		}

		elViewHost.innerHTML = `
      <div class="card">
        <h2 class="view-title">${fnEscapeHtml(sViewName)}</h2>
        <p class="muted">Dieser Bereich ist noch nicht implementiert.</p>
      </div>
    `;
	}

	// =====================================================
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
	 * Lädt Time-Series Daten für die übergebenen Symbole sequenziell.
	 * Scope: [SHARED]
	 * @param {string[]} aSymbols
	 * @param {object} oQuery
	 * @returns {Promise<Map<string, {values: Array<object>, fromCache: boolean}>>}
	 */
	async function fnLoadSeriesForSymbols(aSymbols, oQuery) {
		const mSeriesBySymbol = new Map();

		for (const sSymbolRaw of aSymbols) {
			const sSymbol = String(sSymbolRaw || "").trim().toUpperCase();
			if (!sSymbol) continue;

			try {
				const oFetchResult = await fnTdFetch("/time_series", {
					symbol: sSymbol,
					...oQuery,
					apikey: sTwelveApiKey,
				});

				const aValues = Array.isArray(oFetchResult.data?.values)
					? [...oFetchResult.data.values].reverse()
					: [];

				mSeriesBySymbol.set(sSymbol, { values: aValues, fromCache: oFetchResult.fromCache });
			} catch (oError) {
				console.warn("Time series failed for", sSymbol, oError);
			}
		}

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
	// [SHARED] 8) Chart Rendering (Depot + Einzelanalyse)
	// =====================================================

	/**
	 * Löscht den kompletten Canvas-Bereich.
	 * Scope: [SHARED]
	 * @param {CanvasRenderingContext2D} oCtx
	 * @param {HTMLCanvasElement} elCanvas
	 */
	function fnClearCanvas(oCtx, elCanvas) {
		oCtx.clearRect(0, 0, elCanvas.width, elCanvas.height);
	}

	/**
	 * Zeichnet einen einheitlichen Linienchart für Gesamt- und Einzelansicht.
	 * Scope: [SHARED]
	 * Variablen:
	 * - `oCtx`: 2D-Kontext.
	 * - `elCanvas`: Ziel-Canvas.
	 * - `aPoints`: Datenpunkte mit `y`-Wert.
	 * - `bPnlOnly`: Schaltet Y-Label-Formatierung für PnL um.
	 * - `iWidth` / `iHeight`: Canvas-Dimensionen.
	 * - `nMin` / `nMax`: Wertebereich auf Y.
	 * @param {CanvasRenderingContext2D} oCtx
	 * @param {HTMLCanvasElement} elCanvas
	 * @param {Array<{t: string, y: number}>} aPoints
	 * @param {boolean} bPnlOnly
	 */
	function fnDrawLineChart(oCtx, elCanvas, aPoints, bPnlOnly) {
		fnClearCanvas(oCtx, elCanvas);

		const iWidth = elCanvas.width;
		const iHeight = elCanvas.height;

		const iPadL = 78;
		const iPadR = 26;
		const iPadT = 20;
		const iPadB = 44;

		const iInnerWidth = iWidth - iPadL - iPadR;
		const iInnerHeight = iHeight - iPadT - iPadB;

		const aValues = aPoints.map((oPoint) => oPoint.y);
		let nMin = Math.min(...aValues);
		let nMax = Math.max(...aValues);

		if (nMax - nMin < 1e-9) nMax = nMin + 1;

		const fnXAt = (iIndex) => {
			if (aPoints.length <= 1) return iPadL;
			return iPadL + (iIndex / (aPoints.length - 1)) * iInnerWidth;
		};
		const fnYAt = (nValue) => iPadT + (1 - (nValue - nMin) / (nMax - nMin)) * iInnerHeight;

		oCtx.strokeStyle = "#2c3445";
		oCtx.lineWidth = 1;
		oCtx.strokeRect(iPadL, iPadT, iInnerWidth, iInnerHeight);

		oCtx.font = "12px 'Avenir Next', 'Nunito Sans', sans-serif";
		oCtx.fillStyle = "#aeb8cc";

		for (let iTickIndex = 0; iTickIndex <= 5; iTickIndex += 1) {
			const nTickValue = nMax - (iTickIndex / 5) * (nMax - nMin);
			const nY = fnYAt(nTickValue);

			oCtx.strokeStyle = iTickIndex === 5 ? "#3a4458" : "#262f40";
			oCtx.setLineDash(iTickIndex === 5 ? [] : [3, 5]);
			oCtx.beginPath();
			oCtx.moveTo(iPadL, nY);
			oCtx.lineTo(iPadL + iInnerWidth, nY);
			oCtx.stroke();
			oCtx.setLineDash([]);

			const sLabel = fnFmtAxisMoneyCompact(nTickValue, bPnlOnly);
			oCtx.textAlign = "right";
			oCtx.textBaseline = "middle";
			oCtx.fillText(sLabel, iPadL - 10, nY);
		}

		const aCanvasPoints = aPoints.map((oPoint, iPointIndex) => ({
			nX: fnXAt(iPointIndex),
			nY: fnYAt(oPoint.y),
		}));

		const oGradient = oCtx.createLinearGradient(0, iPadT, 0, iPadT + iInnerHeight);
		oGradient.addColorStop(0, "rgba(95, 165, 255, 0.32)");
		oGradient.addColorStop(1, "rgba(95, 165, 255, 0.04)");

		oCtx.beginPath();
		oCtx.moveTo(aCanvasPoints[0].nX, iPadT + iInnerHeight);
		oCtx.lineTo(aCanvasPoints[0].nX, aCanvasPoints[0].nY);
		for (let iPointIndex = 1; iPointIndex < aCanvasPoints.length - 1; iPointIndex += 1) {
			const nCurrentX = aCanvasPoints[iPointIndex].nX;
			const nCurrentY = aCanvasPoints[iPointIndex].nY;
			const nNextX = aCanvasPoints[iPointIndex + 1].nX;
			const nNextY = aCanvasPoints[iPointIndex + 1].nY;
			const nControlX = (nCurrentX + nNextX) / 2;
			oCtx.quadraticCurveTo(nCurrentX, nCurrentY, nControlX, (nCurrentY + nNextY) / 2);
		}
		const oLastPoint = aCanvasPoints[aCanvasPoints.length - 1];
		oCtx.lineTo(oLastPoint.nX, oLastPoint.nY);
		oCtx.lineTo(oLastPoint.nX, iPadT + iInnerHeight);
		oCtx.closePath();
		oCtx.fillStyle = oGradient;
		oCtx.fill();

		oCtx.beginPath();
		oCtx.moveTo(aCanvasPoints[0].nX, aCanvasPoints[0].nY);
		for (let iPointIndex = 1; iPointIndex < aCanvasPoints.length - 1; iPointIndex += 1) {
			const nCurrentX = aCanvasPoints[iPointIndex].nX;
			const nCurrentY = aCanvasPoints[iPointIndex].nY;
			const nNextX = aCanvasPoints[iPointIndex + 1].nX;
			const nNextY = aCanvasPoints[iPointIndex + 1].nY;
			const nControlX = (nCurrentX + nNextX) / 2;
			oCtx.quadraticCurveTo(nCurrentX, nCurrentY, nControlX, (nCurrentY + nNextY) / 2);
		}
		oCtx.lineTo(oLastPoint.nX, oLastPoint.nY);
		oCtx.strokeStyle = "#66aeff";
		oCtx.lineWidth = 2.6;
		oCtx.stroke();

		oCtx.beginPath();
		oCtx.arc(oLastPoint.nX, oLastPoint.nY, 3.5, 0, Math.PI * 2);
		oCtx.fillStyle = "#66aeff";
		oCtx.fill();

		oCtx.beginPath();
		oCtx.arc(oLastPoint.nX, oLastPoint.nY, 8, 0, Math.PI * 2);
		oCtx.fillStyle = "rgba(102, 174, 255, 0.25)";
		oCtx.fill();

		const iLabelCount = Math.min(6, aPoints.length);
		oCtx.font = "11px 'Avenir Next', 'Nunito Sans', sans-serif";
		oCtx.fillStyle = "#98a3ba";
		oCtx.textAlign = "center";
		oCtx.textBaseline = "top";
		for (let iLabelIndex = 0; iLabelIndex < iLabelCount; iLabelIndex += 1) {
			const nRatio = iLabelCount <= 1 ? 0 : iLabelIndex / (iLabelCount - 1);
			const iPointIndex = Math.round(nRatio * (aPoints.length - 1));
			const nX = fnXAt(iPointIndex);
			const sTime = aPoints[iPointIndex].t;
			oCtx.fillText(fnShortLabel(sTime), nX, iPadT + iInnerHeight + 10);
		}
	}

	/**
	 * Berechnet die aktuelle Depot-Zusammensetzung nach Symbol (Wertanteile).
	 * Scope: [DEPOT]
	 * @param {Array<object>} aPositions
	 * @param {Map<string, {values: Array<object>}>} mSeriesBySymbol
	 * @returns {Array<{sSymbol: string, nValue: number, nPct: number}>}
	 */
	function fnBuildDepotComposition(aPositions, mSeriesBySymbol) {
		const mAmountBySymbol = new Map();

		for (const oPosition of aPositions || []) {
			const sSymbol = String(oPosition?.symbol || "").trim().toUpperCase();
			const nAmount = Number(oPosition?.amount);
			if (!sSymbol || !Number.isFinite(nAmount) || nAmount <= 0) continue;
			mAmountBySymbol.set(sSymbol, (mAmountBySymbol.get(sSymbol) || 0) + nAmount);
		}

		const aRows = [];
		for (const [sSymbol, nAmount] of mAmountBySymbol.entries()) {
			const aSeriesValues = mSeriesBySymbol.get(sSymbol)?.values || [];
			const nLastClose = Number(aSeriesValues[aSeriesValues.length - 1]?.close);
			if (!Number.isFinite(nLastClose) || nLastClose <= 0) continue;
			const nValue = nLastClose * nAmount;
			if (!Number.isFinite(nValue) || nValue <= 0) continue;
			aRows.push({ sSymbol, nValue, nPct: 0 });
		}

		const nTotal = aRows.reduce((nSum, oRow) => nSum + oRow.nValue, 0);
		if (!Number.isFinite(nTotal) || nTotal <= 0) return [];

		for (const oRow of aRows) {
			oRow.nPct = (oRow.nValue / nTotal) * 100;
		}

		aRows.sort((oA, oB) => oB.nValue - oA.nValue);
		return aRows;
	}

	/**
	 * Liefert eine visuell unterscheidbare Farbe für ein Pie-Segment.
	 * Scope: [DEPOT]
	 * @param {number} iIndex
	 * @returns {string}
	 */
	function fnPieColorAt(iIndex) {
		const aPalette = [
			"#66aeff",
			"#6ee7c8",
			"#f7b267",
			"#c89bff",
			"#ff8f8f",
			"#9cd05d",
			"#7fd8ff",
			"#ffd166",
			"#9fb3ff",
			"#f78fb3",
		];
		return aPalette[iIndex % aPalette.length];
	}

	/**
	 * Ermittelt per Klickkoordinate, welches Pie-Segment getroffen wurde.
	 * Scope: [DEPOT]
	 * @param {HTMLCanvasElement} elCanvas
	 * @param {Array<{sSymbol: string, nValue: number, nPct: number}>} aItems
	 * @param {number} nX
	 * @param {number} nY
	 * @returns {number}
	 */
	function fnGetPieSliceIndexAtPoint(elCanvas, aItems, nX, nY) {
		if (!aItems.length) return -1;
		const iWidth = elCanvas.width;
		const iHeight = elCanvas.height;
		const nCx = iWidth / 2;
		const nCy = iHeight / 2;
		const nRadius = Math.min(iWidth, iHeight) * 0.34;
		const nInnerRadius = nRadius * 0.48;
		const nDx = nX - nCx;
		const nDy = nY - nCy;
		const nDistance = Math.sqrt(nDx * nDx + nDy * nDy);

		if (nDistance < nInnerRadius || nDistance > nRadius + 12) return -1;

		let nAngle = Math.atan2(nDy, nDx);
		nAngle -= -Math.PI / 2;
		if (nAngle < 0) nAngle += Math.PI * 2;

		let nAcc = 0;
		for (let iIndex = 0; iIndex < aItems.length; iIndex += 1) {
			const nSlice = (aItems[iIndex].nPct / 100) * Math.PI * 2;
			if (nAngle >= nAcc && nAngle <= nAcc + nSlice) return iIndex;
			nAcc += nSlice;
		}

		return -1;
	}

	/**
	 * Zeichnet den Depot-Piechart mit den Wertanteilen.
	 * Scope: [DEPOT]
	 * @param {CanvasRenderingContext2D} oCtx
	 * @param {HTMLCanvasElement} elCanvas
	 * @param {Array<{sSymbol: string, nValue: number, nPct: number}>} aItems
	 */
	function fnDrawPieChart(oCtx, elCanvas, aItems, oOptions = {}) {
		fnClearCanvas(oCtx, elCanvas);
		const iWidth = elCanvas.width;
		const iHeight = elCanvas.height;
		const nCx = iWidth / 2;
		const nCy = iHeight / 2;
		const nRadius = Math.min(iWidth, iHeight) * 0.34;
		const nInnerRadius = nRadius * 0.48;
		const iSelectedIndex = Number.isInteger(oOptions.iSelectedIndex) ? oOptions.iSelectedIndex : -1;
		const nSelectScale = Number.isFinite(oOptions.nSelectScale) ? Math.max(0, Math.min(1, oOptions.nSelectScale)) : 0;

		if (!aItems.length) {
			oCtx.fillStyle = "#98a3ba";
			oCtx.font = "13px 'Avenir Next', 'Nunito Sans', sans-serif";
			oCtx.textAlign = "center";
			oCtx.textBaseline = "middle";
			oCtx.fillText("Keine Verteilung verfügbar", nCx, nCy);
			return;
		}

		let nStartAngle = -Math.PI / 2;
		aItems.forEach((oItem, iIndex) => {
			const nSlice = (oItem.nPct / 100) * Math.PI * 2;
			const nEndAngle = nStartAngle + nSlice;
			const nMid = nStartAngle + nSlice / 2;
			const nPush = iIndex === iSelectedIndex ? 10 * nSelectScale : 0;
			const nSliceRadius = nRadius + (iIndex === iSelectedIndex ? 7 * nSelectScale : 0);
			const nSliceCx = nCx + Math.cos(nMid) * nPush;
			const nSliceCy = nCy + Math.sin(nMid) * nPush;

			oCtx.beginPath();
			oCtx.moveTo(nSliceCx, nSliceCy);
			oCtx.arc(nSliceCx, nSliceCy, nSliceRadius, nStartAngle, nEndAngle);
			oCtx.closePath();
			oCtx.fillStyle = fnPieColorAt(iIndex);
			oCtx.fill();
			oCtx.strokeStyle = "#1f2735";
			oCtx.lineWidth = 2;
			oCtx.stroke();

			nStartAngle = nEndAngle;
		});

		// Donut-Mitte freilegen für moderneren Look
		oCtx.beginPath();
		oCtx.arc(nCx, nCy, nInnerRadius, 0, Math.PI * 2);
		oCtx.fillStyle = "#1b222e";
		oCtx.fill();

		oCtx.fillStyle = "#aeb8cc";
		oCtx.font = "11px 'Avenir Next', 'Nunito Sans', sans-serif";
		oCtx.textAlign = "center";
		oCtx.textBaseline = "middle";
		oCtx.fillText(iSelectedIndex >= 0 ? "Auswahl" : "Depot", nCx, nCy - 8);
		oCtx.fillStyle = "#e9eef8";
		oCtx.font = "700 15px 'Avenir Next', 'Nunito Sans', sans-serif";
		if (iSelectedIndex >= 0 && aItems[iSelectedIndex]) {
			oCtx.fillText(aItems[iSelectedIndex].sSymbol, nCx, nCy + 2);
			oCtx.fillStyle = "#aeb8cc";
			oCtx.font = "12px 'Avenir Next', 'Nunito Sans', sans-serif";
			oCtx.fillText(`${aItems[iSelectedIndex].nPct.toFixed(2)}%`, nCx, nCy + 20);
		} else {
			oCtx.fillText("Allokation", nCx, nCy + 11);
		}
	}

	/**
	 * Rendert die Legende unter dem Piechart.
	 * Scope: [DEPOT]
	 * @param {HTMLElement} elLegend
	 * @param {Array<{sSymbol: string, nValue: number, nPct: number}>} aItems
	 */
	function fnRenderPieLegend(elLegend, aItems, iSelectedIndex = -1) {
		if (!elLegend) return;
		if (!aItems.length) {
			elLegend.innerHTML = `<p class="muted">Keine Verteilung verfügbar.</p>`;
			return;
		}

		elLegend.innerHTML = aItems
			.map((oItem, iIndex) => {
				const sActiveClass = iIndex === iSelectedIndex ? " is-active" : "";
				return `
          <div class="pie-legend-item${sActiveClass}">
            <span class="pie-legend-dot" style="background:${fnPieColorAt(iIndex)}"></span>
            <b>${fnEscapeHtml(oItem.sSymbol)}</b>
            <span>${oItem.nPct.toFixed(2)}%</span>
          </div>
        `;
			})
			.join("");
	}

	// =====================================================
	// [DEPOT] 9) Gesamtsdepot-Funktionen
	// Nur für data-view=\"depot\".
	// =====================================================

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

		const elKTotal = document.getElementById("k_total");
		const elKTotalLabel = document.getElementById("k_total_label");
		const elKChange = document.getElementById("k_change");
		const elPnlOnly = document.getElementById("k_pnl_only");
		const elShowPie = document.getElementById("k_show_pie");

		const elCanvas = document.getElementById("depotChart");
		const oCtx = elCanvas?.getContext("2d");
		const elPieCanvas = document.getElementById("depotPieChart");
		const oPieCtx = elPieCanvas?.getContext("2d");
		const elPieLegend = document.getElementById("depotPieLegend");
		const elPiePanel = document.getElementById("depotPiePanel");
		const elChartLayout = document.querySelector(".depot-chart-layout");

		if (!elDepotInfo || !elHoldingsTbody || !elKTotal || !elKTotalLabel || !elKChange || !elPnlOnly || !elShowPie || !elCanvas || !oCtx || !elPieCanvas || !oPieCtx || !elPieLegend || !elPiePanel || !elChartLayout) {
			fnShowError("Depot-Ansicht konnte nicht korrekt initialisiert werden (fehlende DOM-Elemente).");
			return;
		}

		let aPieItemsCurrent = [];
		let iSelectedPieIndex = -1;
		let nPieSelectScale = 0;
		let iAnimFrame = 0;

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
			if (!elShowPie.checked || !aPieItemsCurrent.length) return;
			const oRect = elPieCanvas.getBoundingClientRect();
			const nX = (oEvent.clientX - oRect.left) * (elPieCanvas.width / oRect.width);
			const nY = (oEvent.clientY - oRect.top) * (elPieCanvas.height / oRect.height);
			const iHitIndex = fnGetPieSliceIndexAtPoint(elPieCanvas, aPieItemsCurrent, nX, nY);
			if (iHitIndex < 0) return;
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

		elHoldingsTbody.innerHTML = aPositions
			.map((oPosition) => {
				const sSymbol = fnEscapeHtml(String(oPosition?.symbol || ""));
				const sAmount = fnFmtNumber(Number(oPosition?.amount), 4);
				const sBuyDate = fnFmtDateFromTimestamp(oPosition?.created_at);
				const sBuyPrice = fnFmtNumber(Number(oPosition?.worthwhenbought), 4);

				return `
          <tr>
            <td><b>${sSymbol}</b></td>
            <td>${sAmount}</td>
            <td>${sBuyDate}</td>
            <td>${sBuyPrice}</td>
          </tr>
        `;
			})
			.join("");

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
				elKChange,
				bPnlOnly: Boolean(elPnlOnly?.checked),
				oPieCtx,
				elPieCanvas,
				elPieLegend,
				bShowPie: Boolean(elShowPie?.checked),
				fnOnCompositionChange: (aComposition) => {
					aPieItemsCurrent = aComposition;
					if (iSelectedPieIndex >= aPieItemsCurrent.length) iSelectedPieIndex = -1;
					fnRenderPie();
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

		elPnlOnly?.addEventListener("change", async () => {
			await fnRefreshDepotChart();
		});

		elShowPie?.addEventListener("change", () => {
			fnRenderPie();
		});

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
	 *  elKChange: HTMLElement,
	 *  bPnlOnly: boolean
	 * }} oArgs
	 */
	async function fnBuildDepotChart(oArgs) {
		const aPositions = oArgs.aPositions || [];
		if (!sTwelveApiKey) {
			fnShowError("Bitte trage deinen Twelve Data API Key in ShareView.js ein.");
			oArgs.elInfo.textContent = "Kein API-Key gesetzt.";
			fnClearCanvas(oArgs.oCtx, oArgs.elCanvas);
			oArgs.fnOnCompositionChange?.([]);
			return;
		}

		if (!aPositions.length) {
			oArgs.elInfo.textContent = "Keine Positionen vorhanden.";
			fnClearCanvas(oArgs.oCtx, oArgs.elCanvas);
			oArgs.fnOnCompositionChange?.([]);
			return;
		}

		const oQuery = fnRangeToQuery(oArgs.sRange, aPositions);
		oArgs.elInfo.textContent = `Lade Kursdaten (${oArgs.sRange}, interval=${oQuery.interval})...`;

		const aSymbols = [...new Set(aPositions.map((oPosition) => String(oPosition?.symbol || "").trim().toUpperCase()).filter(Boolean))];
		const mSeriesBySymbol = await fnLoadSeriesForSymbols(aSymbols, oQuery);

		if (mSeriesBySymbol.size === 0) {
			oArgs.elInfo.textContent = "Keine Kursdaten erhalten (API Limit? falsche Symbole?).";
			fnClearCanvas(oArgs.oCtx, oArgs.elCanvas);
			oArgs.fnOnCompositionChange?.([]);
			return;
		}

		const aRawPoints = fnBuildSeriesPointsForPositions(aPositions, mSeriesBySymbol, oArgs.bPnlOnly);
		const aPoints = fnWithFixedDateRange(aRawPoints, oQuery, oArgs.bPnlOnly);

		if (aPoints.length < 2) {
			oArgs.elInfo.textContent = "Zu wenige Datenpunkte für Chart.";
			fnClearCanvas(oArgs.oCtx, oArgs.elCanvas);
			oArgs.fnOnCompositionChange?.([]);
			return;
		}

		const oFirstPoint = aPoints[0];
		const oLastPoint = aPoints[aPoints.length - 1];
		const nFirst = oFirstPoint.y;
		const nLast = oLastPoint.y;
		const nChangeAbs = nLast - nFirst;

		const nChangePct = oArgs.bPnlOnly
			? fnComputeWeightedReturnPct(aPositions, mSeriesBySymbol)
			: (nFirst !== 0 ? (nChangeAbs / nFirst) * 100 : Number.NaN);

		oArgs.elKTotalLabel.textContent = oArgs.bPnlOnly ? "Gewinn/Verlust (letzter Punkt)" : "Depotwert (letzter Punkt)";
		oArgs.elKTotal.textContent = fnFmtMoney(nLast, "USD");
		oArgs.elKChange.textContent = `${fnFmtMoney(nChangeAbs, "USD")} (${Number.isFinite(nChangePct) ? nChangePct.toFixed(2) : "—"}%)`;

		fnDrawLineChart(oArgs.oCtx, oArgs.elCanvas, aPoints, oArgs.bPnlOnly);
		const aComposition = fnBuildDepotComposition(aPositions, mSeriesBySymbol);
		oArgs.fnOnCompositionChange?.(aComposition);

		const bSomeFromCache = [...mSeriesBySymbol.values()].some((oSeries) => oSeries.fromCache);
		oArgs.elInfo.textContent = `Chart aktualisiert: ${oArgs.sRange}${bSomeFromCache ? " (teilweise aus Cache)" : ""}`;
	}

	// =====================================================
	// [ANALYSE] 10) Einzelanalyse-Funktionen
	// Nur für data-view=\"analysis\".
	// =====================================================

	/**
	 * Initialisiert die Einzelanalyse inkl. Katalogsuche, Depot-Auswahl, Kauf und Einzel-Chart.
	 * Scope: [ANALYSE]
	 * Variablen:
	 * - `aPositions`: Vollständige Positionsliste.
	 * - `aOwnedRows`: Aggregierte Symbol-Zeilen aus dem Depot.
	 * - `aAllStocksCatalog`: Gesamter lokaler Katalog aus `Allstocks.json`.
	 * - `sCatalogSearchTerm`: Aktueller Suchstring für den Katalog.
	 * - `sActiveRange`: Gewählter Zeitraum.
	 * - `sSelectedSymbol`: Aktuell ausgewähltes Symbol.
	 * - `nLastKnownClose`: Letzter bekannter Kurs für Kauf-Fallback.
	 */
	async function fnInitAnalysisView() {
		const elInfo = document.getElementById("analysisInfo");
		const elCatalogSearchInput = document.getElementById("analysisCatalogSearchInput");
		const elCatalogSelectFirstBtn = document.getElementById("analysisCatalogSelectFirstBtn");
		const elSearchResults = document.getElementById("analysisSearchResults");
		const elOwnedSymbolSelect = document.getElementById("analysisOwnedSymbolSelect");
		const elUseOwnedBtn = document.getElementById("analysisUseOwnedBtn");
		const elBuyAmountInput = document.getElementById("analysisBuyAmountInput");
		const elBuyBtn = document.getElementById("analysisBuyBtn");
		const elBuyFeedback = document.getElementById("analysisBuyFeedback");
		const elTableTbody = document.querySelector("#analysisHoldingsTable tbody");

		const elTotalLabel = document.getElementById("analysis_total_label");
		const elTotal = document.getElementById("analysis_total");
		const elChange = document.getElementById("analysis_change");

		const elCanvas = document.getElementById("analysisChart");
		const oCtx = elCanvas?.getContext("2d");

		if (!elInfo || !elCatalogSearchInput || !elCatalogSelectFirstBtn || !elSearchResults || !elOwnedSymbolSelect || !elUseOwnedBtn || !elBuyAmountInput || !elBuyBtn || !elBuyFeedback || !elTableTbody || !elTotalLabel || !elTotal || !elChange || !elCanvas || !oCtx) {
			fnShowError("Einzelanalyse konnte nicht korrekt initialisiert werden (fehlende DOM-Elemente).");
			return;
		}

		let aPositions = [];
		try {
			aPositions = await fnLoadPositions();
		} catch (oError) {
			fnShowError(String(oError?.message || oError));
			elInfo.textContent = "Konnte Positionen nicht laden.";
			fnClearCanvas(oCtx, elCanvas);
			return;
		}

		let aOwnedRows = fnAggregateOwnedSymbols(aPositions);
		const aAllStocksCatalog = await fnLoadAllStocksCatalog();
		let sActiveRange = "1D";
		let sCatalogSearchTerm = "";
		let sSelectedSymbol = aOwnedRows[0]?.sSymbol || "";
		let aCurrentSearchResults = [];
		let nLastKnownClose = Number.NaN;

		const aElRangeButtons = [...document.querySelectorAll(".range-btn")];

		const fnRenderOwnedRows = () => {
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
              <td>${fnFmtMoney(oRow.nAvgBuyPrice, "USD")}</td>
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

		const fnRenderSearchResults = () => {
			aCurrentSearchResults = fnSearchStocksCatalog(aAllStocksCatalog, sCatalogSearchTerm, 20);
			if (!aCurrentSearchResults.length) {
				elSearchResults.innerHTML = `<div class="muted">Keine Treffer gefunden.</div>`;
				return;
			}

			elSearchResults.innerHTML = aCurrentSearchResults
				.map((oRow) => {
					const sLabel = `${fnEscapeHtml(oRow.sSymbol)} - ${fnEscapeHtml(oRow.sName || "Unbekannter Name")}`;
					const sMeta = [oRow.sExchange, oRow.sCurrency].filter(Boolean).join(" | ");
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
				const oFetchResult = await fnTdFetch("/quote", {
					symbol: sSymbol,
					apikey: sTwelveApiKey,
				});

				const nClose = Number(oFetchResult?.data?.close);
				if (Number.isFinite(nClose) && nClose > 0) return nClose;

				const nPrice = Number(oFetchResult?.data?.price);
				if (Number.isFinite(nPrice) && nPrice > 0) return nPrice;

				const nPreviousClose = Number(oFetchResult?.data?.previous_close);
				if (Number.isFinite(nPreviousClose) && nPreviousClose > 0) return nPreviousClose;

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

		elCatalogSearchInput.addEventListener("input", () => {
			sCatalogSearchTerm = String(elCatalogSearchInput.value || "").trim();
			fnRenderSearchResults();
		});

		elCatalogSelectFirstBtn.addEventListener("click", async () => {
			const oFirstHit = aCurrentSearchResults[0];
			if (!oFirstHit?.sSymbol) {
				elInfo.textContent = "Kein Treffer zur aktuellen Suche auswählbar.";
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
			const nAmount = Number(elBuyAmountInput.value);

			if (!sSymbol) {
				elBuyFeedback.textContent = "Bitte zuerst eine Aktie auswählen.";
				return;
			}

			if (!Number.isFinite(nAmount) || nAmount <= 0) {
				elBuyFeedback.textContent = "Bitte eine gültige Kaufmenge größer als 0 eingeben.";
				return;
			}

			let nBuyPrice = await fnGetLatestPriceBySymbol(sSymbol);
			if (!Number.isFinite(nBuyPrice) || nBuyPrice <= 0) {
				nBuyPrice = nLastKnownClose;
			}
			if (!Number.isFinite(nBuyPrice) || nBuyPrice <= 0) {
				elBuyFeedback.textContent = "Kauf nicht möglich: aktueller Kurs konnte nicht geladen werden.";
				return;
			}

			const iNowUnixSeconds = Math.floor(Date.now() / 1000);
			const oNewPosition = {
				symbol: sSymbol,
				amount: nAmount,
				created_at: iNowUnixSeconds,
				worthwhenbought: nBuyPrice,
			};

			fnPersistBoughtPosition(oNewPosition);
			aPositions.push(oNewPosition);
			aOwnedRows = fnAggregateOwnedSymbols(aPositions);
			fnRenderOwnedRows();
			fnRenderOwnedSelectOptions();

			elBuyFeedback.textContent = `Kauf gespeichert: ${fnFmtNumber(nAmount, 4)} x ${sSymbol} zu ${fnFmtMoney(nBuyPrice, "USD")}.`;
			await fnRefreshAnalysisChart();
		});

		fnRenderOwnedRows();
		fnRenderOwnedSelectOptions();
		fnRenderSearchResults();

		if (!sSelectedSymbol) {
			const oFirstHit = fnSearchStocksCatalog(aAllStocksCatalog, "", 1)[0];
			sSelectedSymbol = oFirstHit?.sSymbol || "";
		}

		if (sSelectedSymbol) {
			await fnRefreshAnalysisChart();
		} else {
			elInfo.textContent = "Keine Aktie verfügbar. Bitte Suchdatei prüfen.";
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
		if (!sTwelveApiKey) {
			fnShowError("Bitte trage deinen Twelve Data API Key in ShareView.js ein.");
			oArgs.elInfo.textContent = "Kein API-Key gesetzt.";
			fnClearCanvas(oArgs.oCtx, oArgs.elCanvas);
			return;
		}

		const sSymbol = String(oArgs.sSelectedSymbol || "").trim().toUpperCase();
		if (!sSymbol) {
			oArgs.elInfo.textContent = "Keine Aktie ausgewählt.";
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
		oArgs.elInfo.textContent = `Lade Kursdaten für ${sSymbol} (${oArgs.sRange}, interval=${oQuery.interval})...`;

		const mSeriesBySymbol = await fnLoadSeriesForSymbols([sSymbol], oQuery);
		if (!mSeriesBySymbol.size) {
			oArgs.elInfo.textContent = `Keine Kursdaten für ${sSymbol} erhalten.`;
			fnClearCanvas(oArgs.oCtx, oArgs.elCanvas);
			return;
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

		const aPoints = fnWithFixedDateRange(aRawPoints, oQuery, false);

		if (aPoints.length < 2) {
			oArgs.elInfo.textContent = `Zu wenige Datenpunkte für ${sSymbol}.`;
			fnClearCanvas(oArgs.oCtx, oArgs.elCanvas);
			return { nLastClose: Number.NaN };
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
	// [SHARED] 11) Navigation + App-Start
	// =====================================================

	/**
	 * Setzt den aktiven Zustand in der Seiten-Navigation.
	 * Scope: [SHARED]
	 * Variablen:
	 * - `sView`: Aktiver View-Key.
	 * @param {string} sView
	 */
	function fnSetActiveNav(sView) {
		aElNavButtons.forEach((elButton) => {
			elButton.classList.toggle("active", elButton.dataset.view === sView);
		});
	}

	aElNavButtons.forEach((elButton) => {
		elButton.addEventListener("click", () => {
			sActiveView = elButton.dataset.view;
			fnSetActiveNav(sActiveView);
			fnRenderView(sActiveView);
		});
	});

	fnSetActiveNav(sActiveView);
	fnRenderView(sActiveView);
})();
