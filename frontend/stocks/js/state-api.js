import { fnToMsFromTimestamp, fnEscapeHtml } from './domain.js';

// =====================================================
// [SHARED] 0) Konfiguration (für Depot + Einzelanalyse)
// =====================================================
const aPositionsEndpoints = [
	window.SHAREVIEW_POSITIONS_ENDPOINT,
	"/api/positions",
	"http://127.0.0.1:5588/api/positions",
	"http://localhost:5588/api/positions",
].filter(Boolean);
const aShareAccountsEndpoints = [
	window.SHAREVIEW_SHARE_ACCOUNTS_ENDPOINT,
	"/api/share-accounts",
	"/api/bank-accounts",
	"http://127.0.0.1:5588/api/share-accounts",
	"http://localhost:5588/api/share-accounts",
].filter(Boolean);
const aShareAccountsCrudEndpoints = aShareAccountsEndpoints.filter((sEndpoint) => !String(sEndpoint).includes("/api/bank-accounts"));
const aBankAccountsEndpoints = [
	window.SHAREVIEW_BANK_ACCOUNTS_ENDPOINT,
	"/api/bank-accounts",
	"http://127.0.0.1:5588/api/bank-accounts",
	"http://localhost:5588/api/bank-accounts",
].filter(Boolean);
const aIncomeEntriesEndpoints = [
	window.SHAREVIEW_INCOME_ENTRIES_ENDPOINT,
	"/api/income-entries",
	"http://127.0.0.1:3000/api/income-entries",
	"http://localhost:3000/api/income-entries",
	"http://127.0.0.1:5588/api/income-entries",
	"http://localhost:5588/api/income-entries",
].filter(Boolean);
const aExpenseEntriesEndpoints = [
	window.SHAREVIEW_EXPENSE_ENTRIES_ENDPOINT,
	"/api/expense-entries",
	"http://127.0.0.1:3000/api/expense-entries",
	"http://localhost:3000/api/expense-entries",
	"http://127.0.0.1:5588/api/expense-entries",
	"http://localhost:5588/api/expense-entries",
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
const sAllStocksDataPath = "/global-information/Allstocks.json";
export const aCommonTradingExchanges = [
	"XSTU", "XDUS", "MUNICH", "MTA", "FSX", "OTC", "NASDAQ", "LSE", "VSE", "CBOE",
	"XETR", "XBER", "BSE", "NYSE", "JPX", "KRX", "NEO", "NSE", "SZSE", "HKEX",
	"SSE", "EURONEXT", "TWSE", "XHAM", "XHAN", "BMV", "SIX", "TSX", "ASX", "CXA",
	"TSXV", "BOVESPA", "OMX", "TASE", "BVS", "MYX", "IDX", "GPW", "SET", "OSE",
	"CSE", "SGX", "BIST", "JSE", "BCBA", "TADAWUL", "PSX", "BVCC", "NZX", "OMXC",
	"EGX", "BME", "PSE", "OMXH", "BVL", "MOEX", "ASE", "XKUW", "BVB", "ADX",
	"ISE", "QE", "BVC", "XSAP", "DFM", "OMXR", "ICEX", "OMXV", "OMXT",
];
export let sTradingExchange = fnNormalizeTradingExchange(window.SHAREVIEW_DEFAULT_STOCK_EXCHANGE || "NASDAQ");
const sLocalBuyStorageBaseKey = "shareview_positions_buys_v2";
const sLocalSellStorageBaseKey = "shareview_positions_sells_v2";
export const iCacheTtlMs = 5 * 60 * 1000;
export let sLocale = window.FinanzAppLanguage?.getLocale?.(window.FinanzAppSession?.getCurrentUserFromStorage?.()?.id) || "de-DE";
const oShareViewCacheUtils = window.FinanzAppShareViewCacheUtils || {};
const oShareViewAccountUtils = window.FinanzAppShareViewAccountUtils || {};
export const oShareViewChartUtils = window.FinanzAppShareViewChartUtils || {};

// =====================================================
// [SHARED] 1) DOM-Referenzen + globaler Zustand
// =====================================================
export const elViewHost = document.getElementById("viewHost");

export let sActiveView = "depot";
export let aShareAccounts = [];
export let aBankAccounts = [];
export let sSelectedShareAccountId = "";

const sInitialRequestedView = String(new URLSearchParams(window.location.search).get("view") || "").trim().toLowerCase();
if (sInitialRequestedView === "accounts") {
	window.location.replace("/accounts/");
}

/**
 * Normalisiert eine Konto-ID als String.
 * Scope: [SHARED]
 * @param {any} xValue
 * @returns {string}
 */
export function fnNormalizeAccountId(xValue) {
	return String(xValue || "").trim();
}

export function fnGetCurrentSessionUserId() {
	const oUser = window.FinanzAppSession?.getCurrentUserFromStorage?.();
	return String(oUser?.id || "anonymous").trim();
}

export function fnGetScopedStorageKey(sBaseKey) {
	return `${sBaseKey}:${fnGetCurrentSessionUserId()}`;
}

/**
 * Prüft, ob die Gesamtansicht ("Alle Konten") aktiv ist.
 * Scope: [SHARED]
 * @returns {boolean}
 */
export function fnIsAllAccountsSelected() {
	return !fnNormalizeAccountId(sSelectedShareAccountId);
}

/**
 * Liefert den Anzeigenamen eines Kontos.
 * Scope: [SHARED]
 * @param {string} sBankAccountId
 * @returns {string}
 */
export function fnGetShareAccountLabel(sShareAccountId) {
	const sId = fnNormalizeAccountId(sShareAccountId);
	const oMatch = aShareAccounts.find((oAccount) => fnNormalizeAccountId(oAccount?.id) === sId);
	return String(oMatch?.label || sId || fnT("stocks.unknown_account", "Unbekanntes Konto"));
}

export function fnGetBankAccountLabel(sBankAccountId) {
	const sId = fnNormalizeAccountId(sBankAccountId);
	const oMatch = aBankAccounts.find((oAccount) => fnNormalizeAccountId(oAccount?.id) === sId);
	return String(oMatch?.label || sId || fnT("stocks.unknown_account", "Unbekanntes Konto"));
}

export function fnFmtTradeAmountRaw(nAmount) {
	if (!Number.isFinite(nAmount)) return "0";
	return String(Number(nAmount.toFixed(4)));
}

export function fnBuildTradeSource(sSymbol, nAmount, sDirection) {
	const sCleanSymbol = String(sSymbol || "").trim().toUpperCase();
	const sSign = sDirection === "in" ? "+" : "-";
	return `${sCleanSymbol} ${sSign} ${fnFmtTradeAmountRaw(nAmount)}`;
}

export function fnBuildEndpointsWithUserId(aEndpoints, sUserId) {
	const aUnique = [];
	for (const sEndpoint of aEndpoints || []) {
		const oUrl = new URL(String(sEndpoint || ""), window.location.origin);
		oUrl.searchParams.set("user_id", sUserId);
		const sUrl = oUrl.toString();
		if (!aUnique.includes(sUrl)) aUnique.push(sUrl);
	}
	return aUnique;
}

export async function fnCreateDashboardTradeEntry({
	sType,
	sSymbol,
	nAmount,
	nTotalValue,
	sBankAccountId,
}) {
	const sUserId = fnGetCurrentSessionUserId();
	if (!/^[a-fA-F0-9]{24}$/.test(sUserId)) {
		throw new Error(fnT("stocks.invalid_user_relogin", "Kein gueltiger Nutzer gefunden. Bitte neu einloggen."));
	}

	const nRoundedAmount = Number(Number(nTotalValue).toFixed(2));
	if (!Number.isFinite(nRoundedAmount) || nRoundedAmount <= 0) {
		throw new Error(fnT("stocks.invalid_trade_amount", "Betrag fuer Einnahme/Ausgabe ist ungueltig."));
	}

	const sSource = fnBuildTradeSource(sSymbol, nAmount, sType === "income" ? "in" : "out");
	const sBankLabel = fnGetBankAccountLabel(sBankAccountId);
	const sNowIso = new Date().toISOString();

	const oBasePayload = {
		user_id: sUserId,
		source: sSource,
		amount: nRoundedAmount,
		category: sType === "income" ? "investment" : "other",
		note: fnT("stocks.trade_note_bank_account", "Aktientrade ueber Bankkonto: {account}", { account: sBankLabel }),
		recurrence: "once",
		is_active: true,
		bank_account_id: fnNormalizeAccountId(sBankAccountId),
	};

	const bIsIncome = sType === "income";
	const aTargetEndpoints = fnBuildEndpointsWithUserId(
		bIsIncome ? aIncomeEntriesEndpoints : aExpenseEntriesEndpoints,
		sUserId,
	);

	await fnApiRequestWithEndpoints(aTargetEndpoints, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			...oBasePayload,
			...(bIsIncome ? { received_at: sNowIso } : { spent_at: sNowIso }),
		}),
	});
}

export async function fnPromptBankAccountSelection({
	sActionLabel,
	sSymbol,
	nAmount,
	nTotalValue,
}) {
	await fnLoadBankAccounts();
	if (!aBankAccounts.length) {
		throw new Error(fnT("stocks.no_bank_account_available", "Kein Bankkonto vorhanden. Bitte zuerst in der Kontenverwaltung ein Bankkonto anlegen."));
	}

	return await new Promise((fnResolve) => {
		const elBackdrop = document.createElement("div");
		elBackdrop.className = "trade-account-modal";
		const sDefaultId = fnNormalizeAccountId(aBankAccounts[0]?.id);
		elBackdrop.innerHTML = `
      <div class="trade-account-modal-card" role="dialog" aria-modal="true" aria-label="${fnT("stocks.select_bank_account_aria", "Bankkonto auswaehlen")}">
        <h3>${fnT("stocks.action_bank_account", "{action}: Bankkonto auswaehlen", { action: fnEscapeHtml(sActionLabel) })}</h3>
        <p class="muted">${fnEscapeHtml(fnBuildTradeSource(sSymbol, nAmount, sActionLabel === "Verkauf" ? "in" : "out"))}</p>
        <p class="muted">${fnT("amount", "Betrag")}: ${fnEscapeHtml(fnFmtMoney(nTotalValue, "USD"))}</p>
        <label>
          ${fnT("bank_account", "Bankkonto")}
          <select id="tradeBankAccountSelect">
            ${aBankAccounts.map((oAccount) => `<option value="${fnEscapeHtml(oAccount.id)}">${fnEscapeHtml(oAccount.label)}</option>`).join("")}
          </select>
        </label>
        <div class="trade-account-modal-actions">
          <button type="button" class="action" data-action="cancel">${fnT("cancel", "Abbrechen")}</button>
          <button type="button" class="action primary" data-action="confirm">${fnT("confirm", "Bestaetigen")}</button>
        </div>
      </div>
    `;

		document.body.appendChild(elBackdrop);
		const elSelect = elBackdrop.querySelector("#tradeBankAccountSelect");
		if (elSelect) elSelect.value = sDefaultId;

		const fnCleanup = () => {
			elBackdrop.remove();
		};

		elBackdrop.addEventListener("click", (oEvent) => {
			if (oEvent.target === elBackdrop) {
				fnCleanup();
				fnResolve(null);
			}
		});

		elBackdrop.querySelector('[data-action="cancel"]')?.addEventListener("click", () => {
			fnCleanup();
			fnResolve(null);
		});

		elBackdrop.querySelector('[data-action="confirm"]')?.addEventListener("click", () => {
			const sSelectedId = fnNormalizeAccountId(elSelect?.value || "");
			if (!sSelectedId) return;
			fnCleanup();
			fnResolve({
				id: sSelectedId,
				label: fnGetBankAccountLabel(sSelectedId),
			});
		});
	});
}

// =====================================================
// [SHARED] 2) UI-Helfer - Lokalisierung
// =====================================================

/**
 * Loggt einen Fehlertext in die Konsole.
 * Scope: [SHARED]
 * @param {string} sMessage
 */
export function fnShowError(sMessage) {
	console.error(sMessage);
}

export function fnT(sKey, sFallback, oParams = {}) {
	const sTranslated = window.FinanzAppLanguage?.t?.(sKey, oParams);
	if (sTranslated && sTranslated !== sKey) return sTranslated;
	if (!oParams || !Object.keys(oParams).length) return sFallback;
	return String(sFallback || "").replaceAll(/\{(\w+)\}/g, (_, sName) => String(oParams[sName] ?? ""));
}

/**
 * Liefert die aktuell ausgewaehlte Laufzeit-Locale.
 * Scope: [SHARED]
 * @returns {string}
 */
export function fnGetLocale() {
	return window.FinanzAppLanguage?.getLocale?.(fnGetCurrentSessionUserId()) || sLocale || "de-DE";
}

export function fnNormalizeTradingExchange(sExchangeRaw) {
	const sExchange = fnNormalizeExchangeCode(sExchangeRaw);
	if (!sExchange) return aCommonTradingExchanges[0];
	return /^[A-Z0-9._-]{2,15}$/.test(sExchange) ? sExchange : aCommonTradingExchanges[0];
}

export function fnNormalizeExchangeCode(sExchangeRaw) {
	return String(sExchangeRaw || "")
		.trim()
		.toUpperCase();
}

export function fnIsNoExchangeSelection(sExchangeRaw) {
	const sExchange = fnNormalizeExchangeCode(sExchangeRaw);
	return sExchange === "__NONE__" || sExchange === "NONE";
}

export function fnGetCommonTradingExchanges() {
	return [...aCommonTradingExchanges];
}

export function fnGetTradingExchange() {
	return sTradingExchange;
}

export function fnSetTradingExchange(sExchangeRaw) {
	sTradingExchange = fnNormalizeTradingExchange(sExchangeRaw);
	return sTradingExchange;
}

export function fnGetLogoTheme() {
	return document.documentElement?.dataset?.theme === "dark" ? "dark" : "light";
}

export function fnBuildStockLogoUrl(sSymbol, oOptions = {}) {
	const sCleanSymbol = String(sSymbol || "").trim().toUpperCase();
	if (!sCleanSymbol) return "";
	const iSizeRaw = Number(oOptions?.size);
	const iSize = Number.isFinite(iSizeRaw) ? Math.max(16, Math.min(256, Math.round(iSizeRaw))) : 48;
	const sExchange = fnNormalizeTradingExchange(oOptions?.exchange || sTradingExchange);
	const oUrl = new URL("/api/stocks/logo", window.location.origin);
	oUrl.searchParams.set("symbol", sCleanSymbol);
	oUrl.searchParams.set("exchange", sExchange);
	oUrl.searchParams.set("theme", fnGetLogoTheme());
	oUrl.searchParams.set("size", String(iSize));
	return oUrl.toString();
}

export function fnRefreshStockLogoTheme(oRoot = document) {
	const elRoot = oRoot && typeof oRoot.querySelectorAll === "function" ? oRoot : document;
	const aLogoNodes = elRoot.querySelectorAll(".stock-logo[data-symbol]");
	for (const elLogo of aLogoNodes) {
		const sSymbol = String(elLogo.dataset.symbol || "").trim().toUpperCase();
		if (!sSymbol) continue;
		const iSizeRaw = Number(elLogo.dataset.logoSize || 48);
		elLogo.src = fnBuildStockLogoUrl(sSymbol, { size: iSizeRaw });
	}
}

window.addEventListener("finanzapp:theme-changed", () => {
	fnRefreshStockLogoTheme(document);
});

/**
 * Formatiert einen numerischen Wert als Währung.
 * Scope: [SHARED]
 * @param {number} nValue
 * @param {string} [sCurrency="EUR"]
 * @returns {string}
 */
export function fnFmtMoney(nValue, sCurrency = "EUR") {
	if (!Number.isFinite(nValue)) return "—";
	const sSourceCurrency = String(sCurrency || "EUR").trim().toUpperCase();
	const sTargetCurrency = window.FinanzAppCurrency?.getPreferredCurrency?.(fnGetCurrentSessionUserId?.()) || "EUR";
	if (window.FinanzAppCurrency?.formatAmount) {
		return window.FinanzAppCurrency.formatAmount(nValue, {
			locale: fnGetLocale(),
			sourceCurrency: sSourceCurrency,
			currency: sTargetCurrency,
			maximumFractionDigits: 2,
		});
	}
	return new Intl.NumberFormat(fnGetLocale(), {
		style: "currency",
		currency: sSourceCurrency,
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
export function fnFmtNumber(nValue, iDigits = 4) {
	if (!Number.isFinite(nValue)) return "—";
	return new Intl.NumberFormat(fnGetLocale(), { maximumFractionDigits: iDigits }).format(nValue);
}

/**
 * Wandelt einen Unix-Zeitstempel in ein deutsches Datumsformat.
 * Scope: [SHARED]
 * @param {number|string} nTimestampRaw
 * @returns {string}
 */
export function fnFmtDateFromTimestamp(nTimestampRaw) {
	const iTimestampMs = fnToMsFromTimestamp(nTimestampRaw);
	if (!Number.isFinite(iTimestampMs)) return "—";
	const dDate = new Date(iTimestampMs);
	return new Intl.DateTimeFormat(fnGetLocale(), {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(dDate);
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
export function fnCacheKey(oPayload) {
	if (typeof oShareViewCacheUtils.cacheKey === "function") {
		return oShareViewCacheUtils.cacheKey(oPayload);
	}
	return "td_cache_" + fnToBase64Utf8(JSON.stringify(oPayload));
}

/**
 * Kodiert einen UTF-8-String als Base64.
 * Scope: [SHARED]
 * @param {string} sValue
 * @returns {string}
 */
export function fnToBase64Utf8(sValue) {
	if (typeof oShareViewCacheUtils.toBase64Utf8 === "function") {
		return oShareViewCacheUtils.toBase64Utf8(sValue);
	}

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
export function fnCacheRead(sKey) {
	if (typeof oShareViewCacheUtils.cacheRead === "function") {
		return oShareViewCacheUtils.cacheRead(sKey, iCacheTtlMs);
	}

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
export function fnCacheWrite(sKey, oData) {
	if (typeof oShareViewCacheUtils.cacheWrite === "function") {
		oShareViewCacheUtils.cacheWrite(sKey, oData);
		return;
	}
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
export async function fnTdFetch(sPath, oParams) {
	const sKey = fnCacheKey({ path: sPath, params: oParams });
	const oCachedData = fnCacheRead(sKey);
	if (oCachedData) return { data: oCachedData, fromCache: true };

	let sLastError = fnT("stocks.no_backend_endpoint", "Kein Backend-Endpoint verfügbar.");
	for (const sBaseUrl of aBackendBaseUrls) {
		const sEndpointPath = `/api/twelvedata${sPath}`;
		const oUrl = sBaseUrl
			? new URL(sEndpointPath, sBaseUrl)
			: new URL(sEndpointPath, window.location.origin);

		Object.entries(oParams || {}).forEach(([sKeyParam, xValue]) => {
			if (xValue == null) return;
			const sValue = String(xValue).trim();
			if (!sValue || sValue === "undefined" || sValue === "null") return;
			oUrl.searchParams.set(sKeyParam, sValue);
		});

		try {
			const oResponse = await fetch(oUrl.toString());
			if (!oResponse.ok) {
				sLastError = `HTTP ${oResponse.status} - ${oResponse.statusText} (${oUrl.toString()})`;
				continue;
			}

			const oData = await oResponse.json();
			if (oData?.status === "error") {
				sLastError = oData?.message || fnT("stocks.twelve_data_error", "Twelve Data Fehler");
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
export function fnBuildUrlWithQuery(sEndpoint, oParams = {}) {
	if (typeof oShareViewAccountUtils.buildUrlWithQuery === "function") {
		return oShareViewAccountUtils.buildUrlWithQuery(sEndpoint, oParams);
	}
	const oUrl = new URL(sEndpoint, window.location.origin);
	Object.entries(oParams).forEach(([sKey, sValue]) => {
		const sValueTrimmed = String(sValue || "").trim();
		if (!sValueTrimmed) return;
		oUrl.searchParams.set(sKey, sValueTrimmed);
	});
	return oUrl;
}

export function fnMapApiAccounts(aRawAccounts, sFallbackPrefix) {
	if (typeof oShareViewAccountUtils.mapApiAccounts === "function") {
		return oShareViewAccountUtils.mapApiAccounts(aRawAccounts, sFallbackPrefix);
	}
	return (Array.isArray(aRawAccounts) ? aRawAccounts : [])
		.map((oAccount, iIndex) => {
			const sId = String(oAccount?.id || "").trim();
			if (!sId) return null;
			const sLabelRaw = String(oAccount?.label || oAccount?.name || "").trim();
			return {
				id: sId,
				label: sLabelRaw || `${sFallbackPrefix} ${iIndex + 1}`,
			};
		})
		.filter(Boolean);
}

export async function fnLoadAccountsByEndpoints(aEndpoints, sFallbackPrefix, oOptions = {}) {
	if (typeof oShareViewAccountUtils.loadAccountsByEndpoints === "function") {
		return await oShareViewAccountUtils.loadAccountsByEndpoints(aEndpoints, sFallbackPrefix, oOptions);
	}

	const bWarnHttp = Boolean(oOptions.warnHttp);
	const sWarnPrefix = String(oOptions.warnPrefix || "").trim();
	for (const sEndpoint of aEndpoints) {
		try {
			const oUrl = fnBuildUrlWithQuery(sEndpoint);
			const oResponse = await fetch(oUrl.toString());
			if (!oResponse.ok) {
				if (bWarnHttp) {
					console.warn(`${sWarnPrefix} Backend Fehler (${sEndpoint}): HTTP ${oResponse.status}.`);
				}
				continue;
			}
			const oData = await oResponse.json();
			return fnMapApiAccounts(oData?.accounts, sFallbackPrefix);
		} catch (oError) {
			if (sWarnPrefix) {
				console.warn(`${sWarnPrefix} Backend nicht erreichbar (${sEndpoint}).`, oError);
			}
		}
	}
	return [];
}

export function fnRenderShareAccountOptions(elSelect, bIncludeAllOption = false) {
	if (!elSelect) return;
	const sCurrent = String(sSelectedShareAccountId || "").trim();
	const sOptions = [
		...(bIncludeAllOption ? [`<option value="">${fnT("stocks.all_accounts", "Alle Konten")}</option>`] : []),
		...aShareAccounts.map((oAccount) => {
			const sId = fnEscapeHtml(String(oAccount?.id || ""));
			const sLabel = fnEscapeHtml(String(oAccount?.label || sId || fnT("stocks.share_account", "Aktienkonto")));
			return `<option value="${sId}">${sLabel}</option>`;
		}),
	].join("");

	elSelect.innerHTML = sOptions;
	const bSelectionExists = aShareAccounts.some((oAccount) => String(oAccount?.id || "") === sCurrent);
	elSelect.value = bSelectionExists ? sCurrent : (bIncludeAllOption ? "" : String(aShareAccounts[0]?.id || ""));
	sSelectedShareAccountId = String(elSelect.value || "").trim();
}

export async function fnLoadShareAccounts() {
	aShareAccounts = await fnLoadAccountsByEndpoints(aShareAccountsEndpoints, fnT("stocks.share_account", "Aktienkonto"), {
		warnPrefix: fnT("stocks.share_account", "Aktienkonto"),
		warnHttp: true,
	});
}

export async function fnLoadBankAccounts() {
	aBankAccounts = await fnLoadAccountsByEndpoints(aBankAccountsEndpoints, fnT("bank_account", "Bankkonto"));
}

/**
 * Lädt Positionen aus dem Backend und ergänzt lokale Trades des aktuellen Users.
 * Scope: [SHARED]
 * @returns {Promise<Array<{symbol: string, amount: number, created_at: number, worthwhenbought: number}>>}
 */
export async function fnLoadPositions() {
	const sActiveAccountId = fnNormalizeAccountId(sSelectedShareAccountId);
	const aLocalBoughtPositionsAll = fnReadLocalBoughtPositions();
	const aLocalSoldPositionsAll = fnReadLocalSoldPositions();
	const aLocalBoughtPositions = sActiveAccountId
		? aLocalBoughtPositionsAll.filter((oPosition) => fnGetPositionShareAccountId(oPosition) === sActiveAccountId)
		: aLocalBoughtPositionsAll;
	const aLocalSoldPositions = sActiveAccountId
		? aLocalSoldPositionsAll.filter((oPosition) => fnGetPositionShareAccountId(oPosition) === sActiveAccountId)
		: aLocalSoldPositionsAll;

	for (const sPositionsEndpoint of aPositionsEndpoints) {
		try {
			const oUrl = fnBuildUrlWithQuery(sPositionsEndpoint, {
				share_account_id: sSelectedShareAccountId,
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

	console.warn(fnT("stocks.no_positions_endpoint_local_fallback", "Kein Positions-Endpoint erreichbar. Nutze nur lokale Käufe."));
	return fnApplySoldPositions(aLocalBoughtPositions, aLocalSoldPositions);
}

/**
 * Liest lokal gespeicherte Käufe aus dem Browser-Storage.
 * Scope: [SHARED]
 * @returns {Array<{symbol: string, amount: number, created_at: number, worthwhenbought: number}>}
 */
export function fnReadLocalBoughtPositions() {
	const sRaw = localStorage.getItem(fnGetScopedStorageKey(sLocalBuyStorageBaseKey));
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
export function fnWriteLocalBoughtPositions(aPositions) {
	localStorage.setItem(fnGetScopedStorageKey(sLocalBuyStorageBaseKey), JSON.stringify(aPositions));
}

/**
 * Liest lokal gespeicherte Verkäufe aus dem Browser-Storage.
 * Scope: [SHARED]
 * @returns {Array<{symbol: string, amount: number, created_at: number}>}
 */
export function fnReadLocalSoldPositions() {
	const sRaw = localStorage.getItem(fnGetScopedStorageKey(sLocalSellStorageBaseKey));
	if (!sRaw) return [];

	try {
		const aParsed = JSON.parse(sRaw);
		if (!Array.isArray(aParsed)) return [];
		return fnNormalizePositions(aParsed)
			.map((oPosition) => ({
				symbol: oPosition.symbol,
				amount: Number(oPosition.amount),
				created_at: Number(oPosition.created_at),
				share_account_id: fnNormalizeAccountId(oPosition?.share_account_id || oPosition?.bank_account_id),
				bank_account_id: fnNormalizeAccountId(oPosition?.bank_account_id),
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
export function fnWriteLocalSoldPositions(aPositions) {
	localStorage.setItem(fnGetScopedStorageKey(sLocalSellStorageBaseKey), JSON.stringify(aPositions));
}

/**
 * Speichert einen Kauf lokal.
 * Scope: [SHARED]
 * @param {{symbol: string, amount: number, created_at: number, worthwhenbought: number}} oPosition
 */
export function fnPersistBoughtPosition(oPosition) {
	const aLocalPositions = fnReadLocalBoughtPositions();
	aLocalPositions.push(oPosition);
	fnWriteLocalBoughtPositions(aLocalPositions);
}

/**
 * Speichert einen Verkauf lokal.
 * Scope: [SHARED]
 * @param {{symbol: string, amount: number, created_at: number}} oPosition
 */
export function fnPersistSoldPosition(oPosition) {
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
export function fnApplySoldPositions(aPositions, aSoldPositions) {
	const aBasePositions = fnNormalizePositions(aPositions)
		.map((oPosition) => ({
			...oPosition,
			amount: Number(oPosition.amount),
			created_at: Number(oPosition.created_at),
			worthwhenbought: Number(oPosition.worthwhenbought),
			share_account_id: fnGetPositionShareAccountId(oPosition),
			bank_account_id: fnNormalizeAccountId(oPosition?.bank_account_id),
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
			share_account_id: fnGetPositionShareAccountId(oSell),
		}))
		.filter((oSell) => Number.isFinite(oSell.amount) && oSell.amount > 0)
		.sort((oA, oB) => Number(oA.created_at) - Number(oB.created_at));

	for (const oSell of aSells) {
		let nAmountLeft = oSell.amount;
		const aSymbolPositions = (mPositionsBySymbol.get(oSell.symbol) || []).filter((oPosition) => {
			if (!oSell.share_account_id) return true;
			return fnNormalizeAccountId(oPosition?.share_account_id) === oSell.share_account_id;
		});
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
export function fnNormalizePositions(aPositions) {
	return (aPositions || [])
		.map((oPosition) => {
			const sSymbol = String(oPosition?.symbol ?? oPosition?.shares ?? "").trim().toUpperCase();
			if (!sSymbol) return null;
			return { ...oPosition, symbol: sSymbol };
		})
		.filter(Boolean);
}

export function fnGetPositionShareAccountId(oPosition) {
	return fnNormalizeAccountId(oPosition?.share_account_id || oPosition?.bank_account_id);
}

/**
 * Lädt den lokalen Aktienkatalog aus `/global-information/Allstocks.json`.
 * Scope: [SHARED]
 * @returns {Promise<Array<{sSymbol: string, sName: string, sExchange: string, sCurrency: string, sType: string}>>}
 */
export async function fnLoadAllStocksCatalog(oOptions = {}) {
	try {
		const bExchangeProvided = oOptions && Object.prototype.hasOwnProperty.call(oOptions, "sExchange");
		const bNoExchangeSelection = fnIsNoExchangeSelection(oOptions?.sExchange);
		const sExchange = bExchangeProvided && !bNoExchangeSelection
			? fnNormalizeTradingExchange(oOptions?.sExchange)
			: fnNormalizeTradingExchange(fnGetTradingExchange());
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
				.filter((oRow) => {
					if (bExchangeProvided && bNoExchangeSelection) return true;
					return fnNormalizeExchangeCode(oRow.sExchange) === sExchange;
				})
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
export function fnSearchStocksCatalog(aCatalog, sNeedle, iLimit = 20) {
	const sQuery = String(sNeedle || "").trim().toLowerCase();
	if (!sQuery) return aCatalog.slice(0, iLimit);

	return aCatalog
		.filter((oRow) => oRow.sSymbol.toLowerCase().includes(sQuery) || oRow.sName.toLowerCase().includes(sQuery))
		.slice(0, iLimit);
}

/**
 * Sucht Aktien über den zentralen Backend-Proxy (`/api/stocks/search`).
 * Scope: [SHARED]
 * @param {string} sQuery
 * @param {{sExchange?: string, sAssetClass?: string, iLimit?: number}} [oOptions]
 * @returns {Promise<Array<{sSymbol: string, sName: string, sExchange: string, sCountry: string, sCurrency: string}>>}
 */
export async function fnSearchStocksViaBackend(sQuery, oOptions = {}) {
	const sNeedle = String(sQuery || "").trim();
	if (!sNeedle) return [];

	const bExchangeProvided = oOptions && Object.prototype.hasOwnProperty.call(oOptions, "sExchange");
	const bNoExchangeSelection = fnIsNoExchangeSelection(oOptions?.sExchange);
	const sExchange = bExchangeProvided && !bNoExchangeSelection
		? fnNormalizeTradingExchange(oOptions?.sExchange)
		: fnNormalizeTradingExchange(sTradingExchange);
	const sRequestedAssetClass = String(oOptions?.sAssetClass || "").trim().toLowerCase();
	const sAssetClass = sRequestedAssetClass === "stock" || sRequestedAssetClass === "etf"
		? sRequestedAssetClass
		: "";
	const iLimitRaw = Number(oOptions?.iLimit);
	const iLimit = Number.isFinite(iLimitRaw) ? Math.max(1, Math.min(50, Math.floor(iLimitRaw))) : 20;

	const oUrl = new URL("/api/stocks/search", window.location.origin);
	oUrl.searchParams.set("q", sNeedle);
	if (!(bExchangeProvided && bNoExchangeSelection)) {
		oUrl.searchParams.set("exchange", sExchange);
	}
	if (sAssetClass) {
		oUrl.searchParams.set("asset_class", sAssetClass);
	}
	oUrl.searchParams.set("limit", String(iLimit));

	const oResponse = await fetch(oUrl.toString());
	if (!oResponse.ok) {
		const oError = await oResponse.json().catch(() => null);
		throw new Error(String(oError?.detail || oError?.message || `HTTP ${oResponse.status}`));
	}

	const oPayload = await oResponse.json();
	const aResults = Array.isArray(oPayload?.results) ? oPayload.results : [];
	const aNormalizedResults = aResults
		.map((oRow) => ({
			sSymbol: String(oRow?.sSymbol || oRow?.symbol || "").trim().toUpperCase(),
			sName: String(oRow?.sName || oRow?.name || "").trim(),
			sExchange: String(oRow?.sExchange || oRow?.exchange || "").trim(),
			sCountry: String(oRow?.sCountry || oRow?.country || "").trim(),
			sCurrency: String(oRow?.sCurrency || oRow?.currency || "").trim(),
		}))
		.filter((oRow) => Boolean(oRow.sSymbol));

	if (!(bExchangeProvided && bNoExchangeSelection)) {
		const aExchangeFilteredResults = aNormalizedResults
			.filter((oRow) => fnNormalizeExchangeCode(oRow.sExchange) === sExchange)
			.slice(0, iLimit);
		if (aExchangeFilteredResults.length) {
			return aExchangeFilteredResults;
		}
	}
	if (aNormalizedResults.length) {
		return aNormalizedResults.slice(0, iLimit);
	}

	const aCatalogFallback = await fnLoadAllStocksCatalog(
		bExchangeProvided && bNoExchangeSelection ? { sExchange: "__NONE__" } : { sExchange },
	);
	return fnSearchStocksCatalog(aCatalogFallback, sNeedle, iLimit);
}

export function fnApiRequestWithEndpoints(aEndpoints, oRequestInit = {}) {
	let sLastError = "Kein Endpoint erreichbar";
	const fnRequest = window.FinanzAppApi?.requestJsonMerged;

	const fnTryEndpoints = async () => {
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
	};

	return fnTryEndpoints();
}

export async function fnApiUpdateAccount(aBaseEndpoints, sAccountId, oPayload, sMethod) {
	const aEndpoints = (aBaseEndpoints || []).map((sEndpoint) => `${String(sEndpoint).replace(/\/$/, "")}/${encodeURIComponent(sAccountId)}`);
	return await fnApiRequestWithEndpoints(aEndpoints, {
		method: sMethod,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(oPayload),
	});
}

export async function fnApiDeleteAccount(aBaseEndpoints, sAccountId, oPayload = null) {
	const aEndpoints = (aBaseEndpoints || []).map((sEndpoint) => `${String(sEndpoint).replace(/\/$/, "")}/${encodeURIComponent(sAccountId)}`);
	const oInit = { method: "DELETE" };
	if (oPayload && typeof oPayload === "object") {
		oInit.headers = { "Content-Type": "application/json" };
		oInit.body = JSON.stringify(oPayload);
	}
	return await fnApiRequestWithEndpoints(aEndpoints, oInit);
}

// Mutable state setters (used by other modules)
export function setActiveView(sView) {
	sActiveView = sView;
}

export function setSelectedShareAccountId(sId) {
	sSelectedShareAccountId = sId;
}

export function setLocale(sNewLocale) {
	sLocale = sNewLocale;
}

// Keep window.* bridges for backward compatibility
window.fnGetCommonTradingExchanges = fnGetCommonTradingExchanges;
window.fnGetTradingExchange = fnGetTradingExchange;
window.fnSetTradingExchange = fnSetTradingExchange;

// Re-export endpoints for features.js account management
export { aShareAccountsEndpoints, aShareAccountsCrudEndpoints, aBankAccountsEndpoints };

// =====================================================
