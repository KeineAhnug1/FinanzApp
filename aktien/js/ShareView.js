(() => {
	// =====================================================
	// [SHARED] 0) Konfiguration (für Depot + Einzelanalyse)
	// =====================================================
	const aPositionsEndpoints = [
		window.SHAREVIEW_POSITIONS_ENDPOINT,
		"/api/positions",
		"http://127.0.0.1:5588/api/positions",
		"http://localhost:5588/api/positions",
	].filter(Boolean);
	const aBankAccountsEndpoints = [
		window.SHAREVIEW_BANK_ACCOUNTS_ENDPOINT,
		"/api/bank-accounts",
		"http://127.0.0.1:5588/api/bank-accounts",
		"http://localhost:5588/api/bank-accounts",
	].filter(Boolean);
	const aBackendBaseUrls = [
		window.SHAREVIEW_BACKEND_BASE_URL,
		window.location.origin,
		"http://127.0.0.1:5588",
		"http://localhost:5588",
	].filter((sValue, iIndex, aValues) => {
		const sNormalized = String(sValue ?? "").trim();
		return sNormalized && aValues.findIndex((sItem) => String(sItem ?? "").trim() === sNormalized) === iIndex;
	});
	const sAllStocksDataPath = "testdata/Allstocks.json";
	const sLocalBuyStorageKey = "shareview_positions_buys_v1";
	const sLocalSellStorageKey = "shareview_positions_sells_v1";
	const iCacheTtlMs = 5 * 60 * 1000;
	const sLocale = "de-DE";

	// =====================================================
	// [SHARED] 1) DOM-Referenzen + globaler Zustand
	// =====================================================
	const aElNavButtons = [...document.querySelectorAll(".navbtn")];
	const elViewHost = document.getElementById("viewHost");
	const elGlobalBankAccountSelect = document.getElementById("globalBankAccountSelect");

	let sActiveView = "depot";
	let aBankAccounts = [];
	let sSelectedBankAccountId = "";

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
		const sKey = fnCacheKey({ path: sPath, params: oParams });
		const oCachedData = fnCacheRead(sKey);
		if (oCachedData) return { data: oCachedData, fromCache: true };

		let sLastError = "Kein Backend-Endpoint verfügbar.";
		for (const sBaseUrl of aBackendBaseUrls) {
			const sEndpointPath = `/api/twelvedata${sPath}`;
			const oUrl = sBaseUrl
				? new URL(sEndpointPath, sBaseUrl)
				: new URL(sEndpointPath, window.location.origin);

			Object.entries(oParams).forEach(([sKeyParam, xValue]) => {
				oUrl.searchParams.set(sKeyParam, String(xValue));
			});

			try {
				const oResponse = await fetch(oUrl.toString());
				if (!oResponse.ok) {
					sLastError = `HTTP ${oResponse.status} - ${oResponse.statusText} (${oUrl.toString()})`;
					continue;
				}

				const oData = await oResponse.json();
				if (oData?.status === "error") {
					sLastError = oData?.message || "Twelve Data Fehler";
					continue;
				}

				fnCacheWrite(sKey, oData);
				return { data: oData, fromCache: false };
			} catch (oError) {
				sLastError = String(oError?.message || oError);
			}
		}

		throw new Error(`Twelve-Data-Backend Fehler: ${sLastError}`);
	}

	// =====================================================
	// [SHARED] 5) Positions- und Katalogdaten
	// Wird in Depot und Einzelanalyse verwendet.
	// =====================================================
	/**
	 * Baut eine Endpoint-URL inkl. Query-Parametern.
	 * Scope: [SHARED]
	 * @param {string} sEndpoint
	 * @param {Record<string, string>} oParams
	 * @returns {URL}
	 */
	function fnBuildUrlWithQuery(sEndpoint, oParams = {}) {
		const oUrl = new URL(sEndpoint, window.location.origin);
		Object.entries(oParams).forEach(([sKey, sValue]) => {
			const sValueTrimmed = String(sValue || "").trim();
			if (!sValueTrimmed) return;
			oUrl.searchParams.set(sKey, sValueTrimmed);
		});
		return oUrl;
	}

	/**
	 * Rendert Optionen im globalen Bankkonto-Dropdown.
	 * Scope: [SHARED]
	 */
	function fnRenderBankAccountOptions() {
		if (!elGlobalBankAccountSelect) return;

		const sCurrent = String(sSelectedBankAccountId || "").trim();
		const sOptions = [
			`<option value="">Alle Konten</option>`,
			...aBankAccounts.map((oAccount) => {
				const sId = fnEscapeHtml(String(oAccount?.id || ""));
				const sLabel = fnEscapeHtml(String(oAccount?.label || sId || "Konto"));
				return `<option value="${sId}">${sLabel}</option>`;
			}),
		].join("");

		elGlobalBankAccountSelect.innerHTML = sOptions;
		const bSelectionExists = aBankAccounts.some((oAccount) => String(oAccount?.id || "") === sCurrent);
		elGlobalBankAccountSelect.value = bSelectionExists ? sCurrent : "";
		sSelectedBankAccountId = elGlobalBankAccountSelect.value;
	}

	/**
	 * Lädt die verfügbaren Bankkonten aus dem Backend.
	 * Scope: [SHARED]
	 * @returns {Promise<void>}
	 */
	async function fnLoadBankAccounts() {
		if (!elGlobalBankAccountSelect) return;

		for (const sEndpoint of aBankAccountsEndpoints) {
			try {
				const oUrl = fnBuildUrlWithQuery(sEndpoint);
				const oResponse = await fetch(oUrl.toString());
				if (!oResponse.ok) {
					console.warn(`Bankkonto-Backend Fehler (${sEndpoint}): HTTP ${oResponse.status}.`);
					continue;
				}

				const oData = await oResponse.json();
				const aAccounts = Array.isArray(oData?.accounts) ? oData.accounts : [];
				aBankAccounts = aAccounts
					.map((oAccount, iIndex) => {
						const sId = String(oAccount?.id || "").trim();
						if (!sId) return null;
						const sLabelRaw = String(oAccount?.label || "").trim();
						return {
							id: sId,
							label: sLabelRaw || `Konto ${iIndex + 1}`,
						};
					})
					.filter(Boolean);
				fnRenderBankAccountOptions();
				return;
			} catch (oError) {
				console.warn(`Bankkonto-Backend nicht erreichbar (${sEndpoint}).`, oError);
			}
		}

		aBankAccounts = [];
		fnRenderBankAccountOptions();
	}

	/**
	 * Lädt Positionen aus `window.POSITIONS` oder Backend-Endpoint.
	 * Scope: [SHARED]
	 * @returns {Promise<Array<{symbol: string, amount: number, created_at: number, worthwhenbought: number}>>}
	 */
	async function fnLoadPositions() {
		const aLocalBoughtPositions = fnReadLocalBoughtPositions();
		const aLocalSoldPositions = fnReadLocalSoldPositions();
		if (Array.isArray(window.POSITIONS)) {
			return fnApplySoldPositions([...window.POSITIONS, ...aLocalBoughtPositions], aLocalSoldPositions);
		}

		for (const sPositionsEndpoint of aPositionsEndpoints) {
			try {
				const oUrl = fnBuildUrlWithQuery(sPositionsEndpoint, {
					bank_account_id: sSelectedBankAccountId,
				});
				const oResponse = await fetch(oUrl.toString());
				if (oResponse.ok) {
					const oData = await oResponse.json();
					if (Array.isArray(oData)) {
						return fnApplySoldPositions([...oData, ...aLocalBoughtPositions], aLocalSoldPositions);
					}
				}
				console.warn(`Positions Backend Fehler (${oUrl.toString()}): HTTP ${oResponse.status}.`);
			} catch (oError) {
				console.warn(`Positions Backend nicht erreichbar (${sPositionsEndpoint}).`, oError);
			}
		}

		console.warn("Kein Positions-Endpoint erreichbar. Nutze nur lokale Käufe.");
		return fnApplySoldPositions(aLocalBoughtPositions, aLocalSoldPositions);
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
	 * Liest lokal gespeicherte Verkäufe aus dem Browser-Storage.
	 * Scope: [SHARED]
	 * @returns {Array<{symbol: string, amount: number, created_at: number}>}
	 */
	function fnReadLocalSoldPositions() {
		const sRaw = localStorage.getItem(sLocalSellStorageKey);
		if (!sRaw) return [];

		try {
			const aParsed = JSON.parse(sRaw);
			if (!Array.isArray(aParsed)) return [];
			return fnNormalizePositions(aParsed)
				.map((oPosition) => ({
					symbol: oPosition.symbol,
					amount: Number(oPosition.amount),
					created_at: Number(oPosition.created_at),
				}))
				.filter((oPosition) => Number.isFinite(oPosition.amount) && oPosition.amount > 0);
		} catch {
			return [];
		}
	}

	/**
	 * Schreibt lokal gespeicherte Verkäufe in den Browser-Storage.
	 * Scope: [SHARED]
	 * @param {Array<{symbol: string, amount: number, created_at: number}>} aPositions
	 */
	function fnWriteLocalSoldPositions(aPositions) {
		localStorage.setItem(sLocalSellStorageKey, JSON.stringify(aPositions));
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
	 * Speichert einen Verkauf lokal.
	 * Scope: [SHARED]
	 * @param {{symbol: string, amount: number, created_at: number}} oPosition
	 */
	function fnPersistSoldPosition(oPosition) {
		const aLocalSellPositions = fnReadLocalSoldPositions();
		aLocalSellPositions.push(oPosition);
		fnWriteLocalSoldPositions(aLocalSellPositions);
	}

	/**
	 * Wendet Verkäufe auf Positionsdaten an (FIFO: neueste Käufe zuerst reduziert).
	 * Scope: [SHARED]
	 * @param {Array<{symbol: string, amount: number, created_at: number, worthwhenbought: number}>} aPositions
	 * @param {Array<{symbol: string, amount: number, created_at: number}>} aSoldPositions
	 * @returns {Array<{symbol: string, amount: number, created_at: number, worthwhenbought: number}>}
	 */
	function fnApplySoldPositions(aPositions, aSoldPositions) {
		const aBasePositions = fnNormalizePositions(aPositions)
			.map((oPosition) => ({
				...oPosition,
				amount: Number(oPosition.amount),
				created_at: Number(oPosition.created_at),
				worthwhenbought: Number(oPosition.worthwhenbought),
			}))
			.filter((oPosition) => Number.isFinite(oPosition.amount) && oPosition.amount > 0);

		const mPositionsBySymbol = new Map();
		for (const oPosition of aBasePositions) {
			if (!mPositionsBySymbol.has(oPosition.symbol)) mPositionsBySymbol.set(oPosition.symbol, []);
			mPositionsBySymbol.get(oPosition.symbol).push(oPosition);
		}

		for (const aSymbolPositions of mPositionsBySymbol.values()) {
			aSymbolPositions.sort((oA, oB) => Number(oB.created_at) - Number(oA.created_at));
		}

		const aSells = fnNormalizePositions(aSoldPositions)
			.map((oSell) => ({
				symbol: oSell.symbol,
				amount: Number(oSell.amount),
				created_at: Number(oSell.created_at),
			}))
			.filter((oSell) => Number.isFinite(oSell.amount) && oSell.amount > 0)
			.sort((oA, oB) => Number(oA.created_at) - Number(oB.created_at));

		for (const oSell of aSells) {
			let nAmountLeft = oSell.amount;
			const aSymbolPositions = mPositionsBySymbol.get(oSell.symbol) || [];
			for (const oPosition of aSymbolPositions) {
				if (nAmountLeft <= 0) break;
				if (!Number.isFinite(oPosition.amount) || oPosition.amount <= 0) continue;
				const nReduce = Math.min(oPosition.amount, nAmountLeft);
				oPosition.amount -= nReduce;
				nAmountLeft -= nReduce;
			}
		}

		return aBasePositions.filter((oPosition) => Number.isFinite(oPosition.amount) && oPosition.amount > 0.0000001);
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
	 * @returns {Promise<Array<{sSymbol: string, sName: string, sExchange: string, sCurrency: string, sType: string}>>}
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
						sType: String(oRow?.type || "").trim(),
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
                Menge
                <input id="analysisTradeAmountInput" type="number" min="0.0001" step="0.0001" value="1">
              </label>

              <button class="action primary" id="analysisBuyBtn" type="button">Kaufen</button>
              <button class="action primary" id="analysisSellBtn" type="button">Verkaufen</button>
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

		// [ZUKUNFT] Template + Startlogik
		if (sViewName === "futureanalysis") {
			elViewHost.innerHTML = `
        <section class="future-page">
          <h2 class="view-title">Zukunftsaussicht</h2>

          <div class="card">
            <div class="row future-top-row">
              <label>
                Prognosezeitraum (Jahre)
                <input id="futureYearsInput" type="number" min="1" max="50" step="1" value="5">
              </label>

              <button class="action" id="futureRecalcBtn" type="button">Neu berechnen</button>
              <button class="action" id="futureSelectAllBtn" type="button">Alle wählen</button>
              <button class="action" id="futureSelectNoneBtn" type="button">Keine wählen</button>
            </div>

            <div class="muted" id="futureInfo">Bereit.</div>
          </div>

          <div class="card">
            <h3>Meine gehaltenen Aktien (einzeln oder mehrfach auswählen)</h3>
            <div id="futureOwnedList" class="future-owned-list"></div>
          </div>

          <div class="card">
            <div class="kpis">
              <div class="kpi">
                <b>Ausgewählte Aktien</b>
                <span id="futureSelectedSymbols">—</span>
              </div>
              <div class="kpi">
                <b>Aktueller Wert</b>
                <span id="futureCurrentValue">—</span>
              </div>
              <div class="kpi">
                <b>Ø Gewinn pro Jahr (seit Erstkauf)</b>
                <span id="futureAvgProfitYear">—</span>
              </div>
              <div class="kpi">
                <b>Ø Rendite pro Jahr (seit Erstkauf)</b>
                <span id="futureAvgReturnYear">—</span>
              </div>
              <div class="kpi">
                <b>Prognosewert</b>
                <span id="futureProjectedValue">—</span>
              </div>
              <div class="kpi">
                <b>Prognose Gewinn/Verlust</b>
                <span id="futureProjectedPnl">—</span>
              </div>
            </div>
          </div>

          <div class="card">
            <h3>Historische Entwicklung (ab erstem Kauf)</h3>
            <canvas id="futureHistoryChart" class="line-chart" width="1200" height="420"></canvas>
          </div>

          <div class="card">
            <h3>Prognose bei gleichbleibenden Bedingungen</h3>
            <canvas id="futureProjectionChart" class="line-chart" width="1200" height="420"></canvas>
          </div>

          <div class="card">
            <h3>Bestand (aggregiert)</h3>
            <div class="table-wrap">
              <table class="table" id="futureHoldingsTable">
                <thead>
                  <tr>
                    <th>Aktiv</th>
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

			fnInitFutureAnalysisView();
			return;
		}

		// [KATEGORIEN] Template + Startlogik
		if (
			sViewName === "category_common_stock" ||
			sViewName === "category_preferred_stock" ||
			sViewName === "category_etf" ||
			sViewName === "category_real_estate" ||
			sViewName === "category_depositary_receipts" ||
			sViewName === "category_partnerships" ||
			sViewName === "category_closed_end_funds" ||
			sViewName === "category_etn"
		) {
			const oCategoryMeta = fnGetCategoryMeta(sViewName);
			elViewHost.innerHTML = `
        <section class="category-page">
          <h2 class="view-title">${fnEscapeHtml(oCategoryMeta.sTitle)}</h2>

          <div class="card">
            <div class="row analysis-top-row">
              <div class="muted" id="categoryInfo">Lade Daten...</div>
            </div>
          </div>

          <div class="card">
            <h3>Meine gehaltenen Aktien (${fnEscapeHtml(oCategoryMeta.sTitle)})</h3>
            <div class="table-wrap">
              <table class="table" id="categoryHoldingsTable">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>Typ</th>
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

			fnInitCategoryView(sViewName);
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
		oCtx.save();
		oCtx.setTransform(1, 0, 0, 1, 0, 0);
		oCtx.clearRect(0, 0, elCanvas.width, elCanvas.height);
		oCtx.restore();
	}

	/**
	 * Synchronisiert die interne Canvas-Auflösung mit der sichtbaren Größe.
	 * Scope: [SHARED]
	 * @param {CanvasRenderingContext2D} oCtx
	 * @param {HTMLCanvasElement} elCanvas
	 * @param {{bForceSquare?: boolean}} [oOptions]
	 * @returns {{iWidth: number, iHeight: number}}
	 */
	function fnPrepareCanvas(oCtx, elCanvas, oOptions = {}) {
		const nDpr = Math.max(1, window.devicePixelRatio || 1);
		const oRect = elCanvas.getBoundingClientRect();
		let iWidth = Math.max(1, Math.round(oRect.width || elCanvas.clientWidth || elCanvas.width));
		let iHeight = Math.max(1, Math.round(oRect.height || elCanvas.clientHeight || elCanvas.height));

		if (oOptions.bForceSquare) {
			const iSide = Math.max(1, Math.min(iWidth, iHeight));
			iWidth = iSide;
			iHeight = iSide;
		}

		const iPixelWidth = Math.max(1, Math.round(iWidth * nDpr));
		const iPixelHeight = Math.max(1, Math.round(iHeight * nDpr));
		if (elCanvas.width !== iPixelWidth || elCanvas.height !== iPixelHeight) {
			elCanvas.width = iPixelWidth;
			elCanvas.height = iPixelHeight;
		}

		oCtx.setTransform(1, 0, 0, 1, 0, 0);
		oCtx.scale(nDpr, nDpr);
		return { iWidth, iHeight };
	}

	/**
	 * Zeichnet ein Rechteck mit gerundeten Ecken als Canvas-Pfad.
	 * Scope: [SHARED]
	 * @param {CanvasRenderingContext2D} oCtx
	 * @param {number} nX
	 * @param {number} nY
	 * @param {number} nWidth
	 * @param {number} nHeight
	 * @param {number} nRadius
	 */
	function fnCanvasRoundRect(oCtx, nX, nY, nWidth, nHeight, nRadius) {
		const nR = Math.max(0, Math.min(nRadius, nWidth / 2, nHeight / 2));
		oCtx.beginPath();
		if (typeof oCtx.roundRect === "function") {
			oCtx.roundRect(nX, nY, nWidth, nHeight, nR);
			return;
		}
		oCtx.moveTo(nX + nR, nY);
		oCtx.lineTo(nX + nWidth - nR, nY);
		oCtx.quadraticCurveTo(nX + nWidth, nY, nX + nWidth, nY + nR);
		oCtx.lineTo(nX + nWidth, nY + nHeight - nR);
		oCtx.quadraticCurveTo(nX + nWidth, nY + nHeight, nX + nWidth - nR, nY + nHeight);
		oCtx.lineTo(nX + nR, nY + nHeight);
		oCtx.quadraticCurveTo(nX, nY + nHeight, nX, nY + nHeight - nR);
		oCtx.lineTo(nX, nY + nR);
		oCtx.quadraticCurveTo(nX, nY, nX + nR, nY);
		oCtx.closePath();
	}

	/**
	 * Merkt sich Hover-Status je Linienchart-Canvas.
	 * Scope: [SHARED]
	 * @type {WeakMap<HTMLCanvasElement, {iHoverIndex: number, oCtx?: CanvasRenderingContext2D, aPoints?: Array<{t: string, y: number}>, bPnlOnly?: boolean}>}
	 */
	const mLineChartHover = new WeakMap();

	/**
	 * Liefert die Chart-Geometrie passend zur aktuellen Canvas-Breite.
	 * Scope: [SHARED]
	 * @param {number} iWidth
	 * @param {number} iHeight
	 * @returns {{bCompact: boolean, iPadL: number, iPadR: number, iPadT: number, iPadB: number, iInnerWidth: number, iInnerHeight: number}}
	 */
	function fnGetLineChartGeometry(iWidth, iHeight) {
		const bCompact = iWidth < 520;
		const iPadL = bCompact ? 56 : 78;
		const iPadR = bCompact ? 16 : 26;
		const iPadT = bCompact ? 16 : 20;
		const iPadB = bCompact ? 36 : 44;
		const iInnerWidth = iWidth - iPadL - iPadR;
		const iInnerHeight = iHeight - iPadT - iPadB;
		return { bCompact, iPadL, iPadR, iPadT, iPadB, iInnerWidth, iInnerHeight };
	}

	/**
	 * Initialisiert Pointer-Events für Hover-Markierung im Linienchart.
	 * Scope: [SHARED]
	 * @param {HTMLCanvasElement} elCanvas
	 */
	function fnEnsureLineChartHoverHandlers(elCanvas) {
		if (elCanvas.dataset.hoverInit === "1") return;
		elCanvas.dataset.hoverInit = "1";

		const fnResolveHoverIndex = (oEvent) => {
			const oState = mLineChartHover.get(elCanvas) || { iHoverIndex: -1 };
			const aPoints = Array.isArray(oState.aPoints) ? oState.aPoints : [];
			const oRect = elCanvas.getBoundingClientRect();
			const iWidth = Math.max(1, Math.round(oRect.width || elCanvas.clientWidth || elCanvas.width));
			const iHeight = Math.max(1, Math.round(oRect.height || elCanvas.clientHeight || elCanvas.height));
			const { iPadL, iPadT, iInnerWidth, iInnerHeight } = fnGetLineChartGeometry(iWidth, iHeight);
			const nX = oEvent.clientX - oRect.left;
			const nY = oEvent.clientY - oRect.top;

			if (
				nX < iPadL ||
				nX > iPadL + iInnerWidth ||
				nY < iPadT ||
				nY > iPadT + iInnerHeight ||
				aPoints.length <= 0
			) {
				return -1;
			}

			if (aPoints.length === 1) return 0;
			const nRatio = (nX - iPadL) / iInnerWidth;
			const iIndex = Math.round(nRatio * (aPoints.length - 1));
			return Math.max(0, Math.min(aPoints.length - 1, iIndex));
		};

		const fnHandleMove = (oEvent) => {
			const oState = mLineChartHover.get(elCanvas) || { iHoverIndex: -1 };
			const iNextHoverIndex = fnResolveHoverIndex(oEvent);
			if (oState.iHoverIndex === iNextHoverIndex) return;
			oState.iHoverIndex = iNextHoverIndex;
			mLineChartHover.set(elCanvas, oState);
			if (oState.oCtx && Array.isArray(oState.aPoints)) {
				fnDrawLineChart(oState.oCtx, elCanvas, oState.aPoints, Boolean(oState.bPnlOnly));
			}
		};

		const fnHandleLeave = () => {
			const oState = mLineChartHover.get(elCanvas) || { iHoverIndex: -1 };
			if (oState.iHoverIndex < 0) return;
			oState.iHoverIndex = -1;
			mLineChartHover.set(elCanvas, oState);
			if (oState.oCtx && Array.isArray(oState.aPoints)) {
				fnDrawLineChart(oState.oCtx, elCanvas, oState.aPoints, Boolean(oState.bPnlOnly));
			}
		};

		elCanvas.addEventListener("pointermove", fnHandleMove);
		elCanvas.addEventListener("pointerleave", fnHandleLeave);
	}

	/**
	 * Zeichnet einen einheitlichen Linienchart für Gesamt- und Einzelansicht.
	 * Scope: [SHARED]
	 * @param {CanvasRenderingContext2D} oCtx
	 * @param {HTMLCanvasElement} elCanvas
	 * @param {Array<{t: string, y: number}>} aPoints
	 * @param {boolean} bPnlOnly
	 */
	function fnDrawLineChart(oCtx, elCanvas, aPoints, bPnlOnly) {
		const oHoverState = mLineChartHover.get(elCanvas) || { iHoverIndex: -1 };
		oHoverState.oCtx = oCtx;
		oHoverState.aPoints = aPoints;
		oHoverState.bPnlOnly = bPnlOnly;
		if (!Number.isInteger(oHoverState.iHoverIndex)) oHoverState.iHoverIndex = -1;
		if (oHoverState.iHoverIndex >= aPoints.length) oHoverState.iHoverIndex = -1;
		mLineChartHover.set(elCanvas, oHoverState);
		fnEnsureLineChartHoverHandlers(elCanvas);
		const { iWidth, iHeight } = fnPrepareCanvas(oCtx, elCanvas);
		oCtx.clearRect(0, 0, iWidth, iHeight);
		const oStyles = getComputedStyle(document.documentElement);
		const sPrimary = oStyles.getPropertyValue("--clr-primary").trim() || "#1d7a5b";
		const sPrimarySoft = oStyles.getPropertyValue("--clr-primary-soft").trim() || "rgba(29, 122, 91, 0.12)";
		const sTextMuted = oStyles.getPropertyValue("--clr-text-muted").trim() || "#5d6763";
		const sBorder = oStyles.getPropertyValue("--clr-border").trim() || "#d2d8d4";
		const sBorderStrong = oStyles.getPropertyValue("--clr-border-strong").trim() || "#b5c0ba";
		const sSurface = oStyles.getPropertyValue("--clr-surface").trim() || "#ffffff";
		const sText = oStyles.getPropertyValue("--clr-text").trim() || "#1d2522";

		const { bCompact, iPadL, iPadT, iInnerWidth, iInnerHeight } = fnGetLineChartGeometry(iWidth, iHeight);

		const aValues = aPoints.map((oPoint) => oPoint.y);
		let nMin = Math.min(...aValues);
		let nMax = Math.max(...aValues);

		if (nMax - nMin < 1e-9) nMax = nMin + 1;

		const fnXAt = (iIndex) => {
			if (aPoints.length <= 1) return iPadL;
			return iPadL + (iIndex / (aPoints.length - 1)) * iInnerWidth;
		};
		const fnYAt = (nValue) => iPadT + (1 - (nValue - nMin) / (nMax - nMin)) * iInnerHeight;

		oCtx.strokeStyle = sBorderStrong;
		oCtx.lineWidth = 1;
		oCtx.strokeRect(iPadL, iPadT, iInnerWidth, iInnerHeight);

		oCtx.font = `${bCompact ? 10 : 12}px 'Sora', 'Avenir Next', sans-serif`;
		oCtx.fillStyle = sTextMuted;

		for (let iTickIndex = 0; iTickIndex <= 5; iTickIndex += 1) {
			const nTickValue = nMax - (iTickIndex / 5) * (nMax - nMin);
			const nY = fnYAt(nTickValue);

			oCtx.strokeStyle = iTickIndex === 5 ? sBorderStrong : sBorder;
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
		oGradient.addColorStop(0, "rgba(29, 122, 91, 0.30)");
		oGradient.addColorStop(1, sPrimarySoft || "rgba(29, 122, 91, 0.08)");

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
		oCtx.strokeStyle = sPrimary;
		oCtx.lineWidth = 2.6;
		oCtx.stroke();

		oCtx.beginPath();
		oCtx.arc(oLastPoint.nX, oLastPoint.nY, 3.5, 0, Math.PI * 2);
		oCtx.fillStyle = sPrimary;
		oCtx.fill();

		oCtx.beginPath();
		oCtx.arc(oLastPoint.nX, oLastPoint.nY, 8, 0, Math.PI * 2);
		oCtx.fillStyle = "rgba(29, 122, 91, 0.23)";
		oCtx.fill();

		const iHoverIndex = Number.isInteger(oHoverState.iHoverIndex) ? oHoverState.iHoverIndex : -1;
		if (iHoverIndex >= 0 && iHoverIndex < aCanvasPoints.length) {
			const oHoverPoint = aCanvasPoints[iHoverIndex];
			const nHoverValue = Number(aPoints[iHoverIndex]?.y);
			const sHoverValue = Number.isFinite(nHoverValue) ? fnFmtMoney(nHoverValue, "USD") : "—";

			oCtx.beginPath();
			oCtx.setLineDash([4, 4]);
			oCtx.moveTo(oHoverPoint.nX, iPadT);
			oCtx.lineTo(oHoverPoint.nX, iPadT + iInnerHeight);
			oCtx.strokeStyle = sBorderStrong;
			oCtx.lineWidth = 1;
			oCtx.stroke();
			oCtx.setLineDash([]);

			oCtx.beginPath();
			oCtx.arc(oHoverPoint.nX, oHoverPoint.nY, 6.5, 0, Math.PI * 2);
			oCtx.fillStyle = "rgba(29, 122, 91, 0.18)";
			oCtx.fill();

			oCtx.beginPath();
			oCtx.arc(oHoverPoint.nX, oHoverPoint.nY, 4, 0, Math.PI * 2);
			oCtx.fillStyle = sPrimary;
			oCtx.fill();

			oCtx.font = `${bCompact ? 11 : 12}px 'Sora', 'Avenir Next', sans-serif`;
			const iPadX = bCompact ? 8 : 10;
			const iPadY = bCompact ? 5 : 6;
			const iBoxH = bCompact ? 24 : 26;
			const iTextW = Math.ceil(oCtx.measureText(sHoverValue).width);
			const iBoxW = iTextW + iPadX * 2;
			let nBoxX = oHoverPoint.nX + 10;
			if (nBoxX + iBoxW > iPadL + iInnerWidth) {
				nBoxX = oHoverPoint.nX - iBoxW - 10;
			}
			nBoxX = Math.max(iPadL + 2, nBoxX);
			let nBoxY = oHoverPoint.nY - iBoxH - 10;
			if (nBoxY < iPadT + 2) nBoxY = oHoverPoint.nY + 10;
			if (nBoxY + iBoxH > iPadT + iInnerHeight - 2) nBoxY = iPadT + iInnerHeight - iBoxH - 2;

			fnCanvasRoundRect(oCtx, nBoxX, nBoxY, iBoxW, iBoxH, 7);
			oCtx.fillStyle = sSurface;
			oCtx.fill();
			oCtx.lineWidth = 1;
			oCtx.strokeStyle = sBorderStrong;
			oCtx.stroke();

			oCtx.fillStyle = sText;
			oCtx.textAlign = "left";
			oCtx.textBaseline = "middle";
			oCtx.fillText(sHoverValue, nBoxX + iPadX, nBoxY + iBoxH / 2);
		}

		const iLabelCount = Math.min(bCompact ? 4 : 6, aPoints.length);
		oCtx.font = `${bCompact ? 10 : 11}px 'Sora', 'Avenir Next', sans-serif`;
		oCtx.fillStyle = sTextMuted;
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
			"#1d7a5b",
			"#2f8d6b",
			"#58be97",
			"#4ea57e",
			"#7bc9ab",
			"#3f7f68",
			"#76b495",
			"#2d6c57",
			"#6fae90",
			"#245846",
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
		const oRect = elCanvas.getBoundingClientRect();
		const iWidth = Math.max(1, Math.round(oRect.width || elCanvas.clientWidth || elCanvas.width));
		const iHeight = Math.max(1, Math.round(oRect.height || elCanvas.clientHeight || elCanvas.height));
		const nCx = iWidth / 2;
		const nCy = iHeight / 2;
		const nRadius = Math.min(iWidth, iHeight) * 0.37;
		const nInnerRadius = nRadius * 0.52;
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
		const { iWidth, iHeight } = fnPrepareCanvas(oCtx, elCanvas, { bForceSquare: true });
		oCtx.clearRect(0, 0, iWidth, iHeight);
		const oStyles = getComputedStyle(document.documentElement);
		const sSurfaceSoft = oStyles.getPropertyValue("--clr-surface-soft").trim() || "#f3f4f1";
		const sSurface = oStyles.getPropertyValue("--clr-surface").trim() || "#ffffff";
		const sBorder = oStyles.getPropertyValue("--clr-border").trim() || "#d2d8d4";
		const sText = oStyles.getPropertyValue("--clr-text").trim() || "#1d2522";
		const sTextMuted = oStyles.getPropertyValue("--clr-text-muted").trim() || "#5d6763";
		const sPrimary = oStyles.getPropertyValue("--clr-primary").trim() || "#1d7a5b";
		const nCx = iWidth / 2;
		const nCy = iHeight / 2;
		const nRadius = Math.min(iWidth, iHeight) * 0.37;
		const nInnerRadius = nRadius * 0.52;
		const iSelectedIndex = Number.isInteger(oOptions.iSelectedIndex) ? oOptions.iSelectedIndex : -1;
		const nSelectScale = Number.isFinite(oOptions.nSelectScale) ? Math.max(0, Math.min(1, oOptions.nSelectScale)) : 0;

		if (!aItems.length) {
			oCtx.fillStyle = sTextMuted;
			oCtx.font = "13px 'Sora', 'Avenir Next', sans-serif";
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
			oCtx.strokeStyle = sSurface;
			oCtx.lineWidth = 3;
			oCtx.stroke();

			nStartAngle = nEndAngle;
		});

		// Donut-Mitte freilegen für moderneren Look
		oCtx.beginPath();
		oCtx.arc(nCx, nCy, nInnerRadius, 0, Math.PI * 2);
		oCtx.fillStyle = sSurfaceSoft;
		oCtx.fill();

		const iInfoWidth = Math.min(iWidth * 0.56, nInnerRadius * 2.1);
		const iInfoHeight = Math.min(iHeight * 0.26, nInnerRadius * 1.7);
		fnCanvasRoundRect(oCtx, nCx - iInfoWidth / 2, nCy - iInfoHeight / 2, iInfoWidth, iInfoHeight, 14);
		oCtx.fillStyle = sSurface;
		oCtx.fill();
		oCtx.strokeStyle = sBorder;
		oCtx.lineWidth = 1;
		oCtx.stroke();

		const sInfoTitle = iSelectedIndex >= 0 ? "Auswahl" : "Depot";
		const sInfoNameRaw = iSelectedIndex >= 0 && aItems[iSelectedIndex] ? aItems[iSelectedIndex].sSymbol : "Allokation";
		const sInfoName = String(sInfoNameRaw || "");
		const sInfoNameShort = sInfoName.length > 14 ? `${sInfoName.slice(0, 13)}…` : sInfoName;
		const sInfoPct = iSelectedIndex >= 0 && aItems[iSelectedIndex] ? `${aItems[iSelectedIndex].nPct.toFixed(2)}%` : "";

		oCtx.fillStyle = sTextMuted;
		oCtx.font = "600 11px 'Sora', 'Avenir Next', sans-serif";
		oCtx.textAlign = "center";
		oCtx.textBaseline = "middle";
		oCtx.fillText(sInfoTitle, nCx, nCy - 16);
		oCtx.fillStyle = sText;
		oCtx.font = "700 15px 'Sora', 'Avenir Next', sans-serif";
		oCtx.fillText(sInfoNameShort, nCx, nCy + 2);
		if (sInfoPct) {
			oCtx.fillStyle = sPrimary;
			oCtx.font = "700 12px 'Sora', 'Avenir Next', sans-serif";
			oCtx.fillText(sInfoPct, nCx, nCy + 21);
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
		let aLastDepotChartPoints = [];
		let bLastDepotPnlOnly = false;
		let iResizeAnimFrame = 0;

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
			if (!elShowPie.checked || !aPieItemsCurrent.length) return;
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
					fnOnPointsChange: (aPoints, bPnlOnlyCurrent) => {
						aLastDepotChartPoints = Array.isArray(aPoints) ? aPoints : [];
						bLastDepotPnlOnly = Boolean(bPnlOnlyCurrent);
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

		elShowPie?.addEventListener("change", async () => {
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
	 *  elKChange: HTMLElement,
	 *  bPnlOnly: boolean
	 * }} oArgs
	 */
	async function fnBuildDepotChart(oArgs) {
		const aPositions = oArgs.aPositions || [];
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
		oArgs.fnOnPointsChange?.(aPoints, oArgs.bPnlOnly);
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
		const elTradeAmountInput = document.getElementById("analysisTradeAmountInput");
		const elBuyBtn = document.getElementById("analysisBuyBtn");
		const elSellBtn = document.getElementById("analysisSellBtn");
		const elBuyFeedback = document.getElementById("analysisBuyFeedback");
		const elTableTbody = document.querySelector("#analysisHoldingsTable tbody");

		const elTotalLabel = document.getElementById("analysis_total_label");
		const elTotal = document.getElementById("analysis_total");
		const elChange = document.getElementById("analysis_change");

		const elCanvas = document.getElementById("analysisChart");
		const oCtx = elCanvas?.getContext("2d");

		if (!elInfo || !elCatalogSearchInput || !elCatalogSelectFirstBtn || !elSearchResults || !elOwnedSymbolSelect || !elUseOwnedBtn || !elTradeAmountInput || !elBuyBtn || !elSellBtn || !elBuyFeedback || !elTableTbody || !elTotalLabel || !elTotal || !elChange || !elCanvas || !oCtx) {
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
			const nAmount = Number(elTradeAmountInput.value);

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

		elSellBtn.addEventListener("click", async () => {
			const sSymbol = String(sSelectedSymbol || "").trim().toUpperCase();
			const nAmount = Number(elTradeAmountInput.value);

			if (!sSymbol) {
				elBuyFeedback.textContent = "Bitte zuerst eine Aktie auswählen.";
				return;
			}

			if (!Number.isFinite(nAmount) || nAmount <= 0) {
				elBuyFeedback.textContent = "Bitte eine gültige Verkaufsmenge größer als 0 eingeben.";
				return;
			}

			const oOwnedRow = aOwnedRows.find((oRow) => oRow.sSymbol === sSymbol);
			const nOwnedAmount = Number(oOwnedRow?.nTotalAmount);
			if (!Number.isFinite(nOwnedAmount) || nOwnedAmount <= 0) {
				elBuyFeedback.textContent = `Verkauf nicht möglich: ${sSymbol} ist nicht im Bestand.`;
				return;
			}
			if (nAmount > nOwnedAmount) {
				elBuyFeedback.textContent = `Verkauf nicht möglich: Bestand ${fnFmtNumber(nOwnedAmount, 4)} ${sSymbol}.`;
				return;
			}

			const iNowUnixSeconds = Math.floor(Date.now() / 1000);
			const oSoldPosition = {
				symbol: sSymbol,
				amount: nAmount,
				created_at: iNowUnixSeconds,
			};

			fnPersistSoldPosition(oSoldPosition);
			aPositions = fnApplySoldPositions(aPositions, [oSoldPosition]);
			aOwnedRows = fnAggregateOwnedSymbols(aPositions);
			fnRenderOwnedRows();
			fnRenderOwnedSelectOptions();

			elBuyFeedback.textContent = `Verkauf gespeichert: ${fnFmtNumber(nAmount, 4)} x ${sSymbol}.`;
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
		if (sCategoryView === "category_real_estate") return { sTitle: "Real Estate" };
		if (sCategoryView === "category_depositary_receipts") return { sTitle: "Depositary Receipts" };
		if (sCategoryView === "category_partnerships") return { sTitle: "Partnerships" };
		if (sCategoryView === "category_closed_end_funds") return { sTitle: "Closed-end Funds" };
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
			fnShowError("Kategorieansicht konnte nicht initialisiert werden (fehlende DOM-Elemente).");
			return;
		}

		let aPositions = [];
		let aAllStocksCatalog = [];
		try {
			[aPositions, aAllStocksCatalog] = await Promise.all([fnLoadPositions(), fnLoadAllStocksCatalog()]);
		} catch (oError) {
			fnShowError(String(oError?.message || oError));
			elInfo.textContent = "Konnte Daten nicht laden.";
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
			elInfo.textContent = "Keine gehaltenen Aktien in dieser Kategorie gefunden.";
			elTableTbody.innerHTML = `
        <tr>
          <td colspan="6">Keine passenden Positionen vorhanden.</td>
        </tr>
      `;
			return;
		}

		elInfo.textContent = `${aFilteredRows.length} Symbol(e) in dieser Kategorie gefunden.`;
		elTableTbody.innerHTML = aFilteredRows
			.map((oRow) => {
				const oCatalogRow = mCatalogBySymbol.get(oRow.sSymbol) || {};
				const sName = String(oCatalogRow?.sName || "Unbekannt");
				const sType = String(oCatalogRow?.sType || "Unbekannt");
				const sFirstBuyDate = Number.isFinite(oRow.iEarliestBuyMs) ? fnFmtDateFromTimestamp(oRow.iEarliestBuyMs) : "—";
				return `
          <tr>
            <td><b>${fnEscapeHtml(oRow.sSymbol)}</b></td>
            <td>${fnEscapeHtml(sName)}</td>
            <td>${fnEscapeHtml(sType)}</td>
            <td>${fnFmtNumber(oRow.nTotalAmount, 4)}</td>
            <td>${sFirstBuyDate}</td>
            <td>${fnFmtMoney(oRow.nAvgBuyPrice, "USD")}</td>
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
			fnShowError("Zukunftsaussicht konnte nicht korrekt initialisiert werden (fehlende DOM-Elemente).");
			return;
		}

		let aPositions = [];
		try {
			aPositions = await fnLoadPositions();
		} catch (oError) {
			fnShowError(String(oError?.message || oError));
			elInfo.textContent = "Konnte Positionen nicht laden.";
			fnClearCanvas(oHistoryCtx, elHistoryCanvas);
			fnClearCanvas(oProjectionCtx, elProjectionCanvas);
			return;
		}

		const aOwnedRows = fnAggregateOwnedSymbols(aPositions);
		const setSelectedSymbols = new Set(aOwnedRows.map((oRow) => oRow.sSymbol));

		const fnRenderOwnedSelectors = () => {
			if (!aOwnedRows.length) {
				elOwnedList.innerHTML = `<div class="muted">Keine gehaltenen Aktien vorhanden.</div>`;
				elTableTbody.innerHTML = "";
				return;
			}

			elOwnedList.innerHTML = aOwnedRows
				.map((oRow) => {
					const sChecked = setSelectedSymbols.has(oRow.sSymbol) ? "checked" : "";
					return `
            <label class="future-owned-item">
              <input type="checkbox" data-symbol="${fnEscapeHtml(oRow.sSymbol)}" ${sChecked}>
              <span><b>${fnEscapeHtml(oRow.sSymbol)}</b> (${fnFmtNumber(oRow.nTotalAmount, 4)} Stk)</span>
            </label>
          `;
				})
				.join("");

			elTableTbody.innerHTML = aOwnedRows
				.map((oRow) => {
					const sIsActive = setSelectedSymbols.has(oRow.sSymbol) ? "Ja" : "Nein";
					const sFirstBuyDate = Number.isFinite(oRow.iEarliestBuyMs)
						? fnFmtDateFromTimestamp(oRow.iEarliestBuyMs)
						: "—";
					return `
            <tr>
              <td>${sIsActive}</td>
              <td><b>${fnEscapeHtml(oRow.sSymbol)}</b></td>
              <td>${fnFmtNumber(oRow.nTotalAmount, 4)}</td>
              <td>${sFirstBuyDate}</td>
              <td>${fnFmtMoney(oRow.nAvgBuyPrice, "USD")}</td>
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
				elInfo.textContent = "Bitte mindestens eine gehaltene Aktie auswählen.";
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
				elInfo.textContent = "Für die Auswahl gibt es keine Positionen.";
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

			elInfo.textContent = `Lade Kursdaten für ${aSelectedSymbols.join(", ")}...`;
			const mSeriesBySymbol = await fnLoadSeriesForSymbols(aSelectedSymbols, oQuery);
			if (!mSeriesBySymbol.size) {
				elInfo.textContent = "Keine Kursdaten für die Auswahl erhalten.";
				fnClearCanvas(oHistoryCtx, elHistoryCanvas);
				fnClearCanvas(oProjectionCtx, elProjectionCanvas);
				return;
			}

			const aRawHistoryPoints = fnBuildSeriesPointsForPositions(aSelectedPositions, mSeriesBySymbol, false);
			const aHistoryPoints = fnWithFixedDateRange(aRawHistoryPoints, oQuery, false);
			if (aHistoryPoints.length < 2) {
				elInfo.textContent = "Zu wenige historische Datenpunkte für die Auswahl.";
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
					elInfo.textContent = "Zu wenige Prognosedaten für die Auswahl.";
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

	// =====================================================
	// [SHARED] 13) Navigation + App-Start
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

	if (elGlobalBankAccountSelect) {
		elGlobalBankAccountSelect.addEventListener("change", () => {
			sSelectedBankAccountId = String(elGlobalBankAccountSelect.value || "").trim();
			fnRenderView(sActiveView);
		});
	}

	async function fnInitApp() {
		await fnLoadBankAccounts();
		fnSetActiveNav(sActiveView);
		fnRenderView(sActiveView);
	}

	fnInitApp();
})();
