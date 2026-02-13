import "dotenv/config";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ObjectId } from "mongodb";
import { aFallbackPositions } from "./fallback-positions.mjs";

const sCurrentFilePath = fileURLToPath(import.meta.url);
const sCurrentDirPath = path.dirname(sCurrentFilePath);
const sProjectRootPath = path.resolve(sCurrentDirPath, "..", "..");
const iPort = Number(process.env.PORT || 5500);
const sTwelveDataBaseUrl = "https://api.twelvedata.com";
const sTwelveDataApiKey = String(process.env.TWELVE_DATA_API_KEY || process.env.TWELVE_API_KEY || "").trim();
let fnWithDbCached = null;

// DEV-Setup: später durch Login-/Session-Daten ersetzen.
const bUseFallbackPositions = true;  //Später ersetzen dass wenn man nicht angemeldet ist das kommt. Also eine Art Demo Account zum testen.
const aHardcodedBankAccounts = [
	{ sBankAccountId: "65f210000000000000000001", sLabel: "Hauptkonto" },
	{ sBankAccountId: "65f210000000000000000002", sLabel: "Trading Konto" },
	{ sBankAccountId: "65f210000000000000000003", sLabel: "Langfrist Depot" },
];

const oMimeByExt = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "application/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".mjs": "application/javascript; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
};

/**
 * Schreibt eine JSON-Response inklusive CORS-Headern.
 * @param {import("node:http").ServerResponse} oResponse
 * @param {number} iStatusCode
 * @param {any} oPayload
 */
function fnWriteJson(oResponse, iStatusCode, oPayload) {
	oResponse.writeHead(iStatusCode, {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
		"Content-Type": "application/json; charset=utf-8",
	});
	oResponse.end(JSON.stringify(oPayload));
}

/**
 * Konvertiert Mongo-Werte (inkl. Decimal128) robust in Number.
 * @param {any} xValue
 * @returns {number}
 */
function fnToNumber(xValue) {
	if (xValue == null) return Number.NaN;
	if (typeof xValue === "number") return xValue;
	if (typeof xValue === "object" && typeof xValue.toString === "function") {
		const nParsed = Number(xValue.toString());
		return Number.isFinite(nParsed) ? nParsed : Number.NaN;
	}
	return Number(xValue);
}

/**
 * Konvertiert String/ObjectId robust zu ObjectId oder null.
 * @param {string|ObjectId|any} xValue
 * @returns {ObjectId | null}
 */
function fnToObjectId(xValue) {
	if (xValue instanceof ObjectId) return xValue;
	const sValue = String(xValue || "").trim();
	if (!ObjectId.isValid(sValue)) return null;
	try {
		return new ObjectId(sValue);
	} catch {
		return null;
	}
}

/**
 * Liefert die harte Bankkonto-Konfiguration normalisiert.
 * @returns {Array<{sBankAccountId: string, sLabel: string}>}
 */
function fnGetHardcodedBankAccounts() {
	return (aHardcodedBankAccounts || [])
		.map((oAccount, iIndex) => {
			const sBankAccountId = String(oAccount?.sBankAccountId || "").trim();
			if (!ObjectId.isValid(sBankAccountId)) return null;
			const sLabelRaw = String(oAccount?.sLabel || "").trim();
			const sLabel = sLabelRaw || `Konto ${iIndex + 1}`;
			return { sBankAccountId, sLabel };
		})
		.filter(Boolean);
}

/**
 * Lädt Positionen aus MongoDB (`shares`) und mappt sie auf das Frontend-Format.
 * Filtert ausschließlich auf die hardcodierten Bankkonten
 * und optional auf ein ausgewähltes Konto.
 * @param {{sBankAccountId?: string}} [oOptions]
 * @returns {Promise<Array<{symbol: string, amount: number, created_at: number, worthwhenbought: number}>>}
 */
async function fnLoadPositionsFromMongo(oOptions = {}) {
	try {
		if (!fnWithDbCached) {
			const oDbClientModule = await import("../../database/db-client.mjs");
			fnWithDbCached = oDbClientModule?.withDb;
		}

		if (typeof fnWithDbCached !== "function") return [];

		return await fnWithDbCached(async (oDb) => {
			const aHardcodedAccounts = fnGetHardcodedBankAccounts();
			const aHardcodedObjectIds = aHardcodedAccounts
				.map((oAccount) => fnToObjectId(oAccount.sBankAccountId))
				.filter(Boolean);
			if (!aHardcodedObjectIds.length) return [];

			const aAllowedAccounts = await oDb
				.collection("bank_accounts")
				.find({ _id: { $in: aHardcodedObjectIds } })
				.project({ _id: 1 })
				.toArray();
			const aAllowedAccountIds = aAllowedAccounts.map((oAccount) => oAccount?._id).filter(Boolean);
			if (!aAllowedAccountIds.length) return [];

			const sSelectedAccountIdRaw = String(oOptions?.sBankAccountId || "").trim();
			let aFilterAccountIds = aAllowedAccountIds;
			if (sSelectedAccountIdRaw) {
				const oSelectedAccountId = fnToObjectId(sSelectedAccountIdRaw);
				if (!oSelectedAccountId) return [];

				const bSelectedAllowed = aAllowedAccountIds.some((oId) => oId.equals(oSelectedAccountId));
				if (!bSelectedAllowed) return [];

				aFilterAccountIds = [oSelectedAccountId];
			}

			const aShares = await oDb
				.collection("shares")
				.find({ bank_account_id: { $in: aFilterAccountIds } })
				.sort({ bought_at: 1 })
				.limit(300)
				.toArray();

			return (aShares || [])
				.map((oShare) => {
					const sSymbol = String(oShare?.symbol || "").trim().toUpperCase();
					const nAmount = fnToNumber(oShare?.units);
					const nBoughtFor = fnToNumber(oShare?.bought_for);
					const iBoughtAtMs = oShare?.bought_at instanceof Date ? oShare.bought_at.getTime() : Date.parse(String(oShare?.bought_at || ""));
					const iCreatedAt = Number.isFinite(iBoughtAtMs) ? Math.floor(iBoughtAtMs / 1000) : Number.NaN;
					const nWorthWhenBought = Number.isFinite(nAmount) && nAmount > 0 && Number.isFinite(nBoughtFor)
						? nBoughtFor / nAmount
						: Number.NaN;

					if (!sSymbol) return null;
					if (!Number.isFinite(nAmount) || nAmount <= 0) return null;
					if (!Number.isFinite(iCreatedAt) || iCreatedAt <= 0) return null;
					if (!Number.isFinite(nWorthWhenBought) || nWorthWhenBought <= 0) return null;

					return {
						symbol: sSymbol,
						amount: Number(nAmount.toFixed(4)),
						created_at: iCreatedAt,
						worthwhenbought: Number(nWorthWhenBought.toFixed(4)),
					};
				})
				.filter(Boolean);
		});
	} catch (oError) {
		console.warn("Mongo-Positionsabfrage fehlgeschlagen.", oError?.message || oError);
		throw oError;
	}
}

/**
 * Liefert Debug-Informationen zur Positionsfilterung.
 * @param {{sBankAccountId?: string}} [oOptions]
 * @returns {Promise<object>}
 */
async function fnDebugPositionsFromMongo(oOptions = {}) {
	const oDebug = {
		selected_bank_account_id: String(oOptions?.sBankAccountId || "").trim(),
		fallback_enabled: bUseFallbackPositions,
		configured_bank_account_ids: [],
		valid_configured_object_ids: [],
		allowed_bank_account_ids_in_db: [],
		selected_id_is_valid_object_id: false,
		selected_id_is_allowed: false,
		used_filter_account_ids: [],
		shares_found_raw: 0,
		positions_mapped: 0,
		error: null,
	};

	try {
		if (!fnWithDbCached) {
			const oDbClientModule = await import("../../database/db-client.mjs");
			fnWithDbCached = oDbClientModule?.withDb;
		}

		if (typeof fnWithDbCached !== "function") {
			oDebug.error = "withDb ist nicht verfügbar.";
			return oDebug;
		}

		return await fnWithDbCached(async (oDb) => {
			const aHardcodedAccounts = fnGetHardcodedBankAccounts();
			const aHardcodedObjectIds = aHardcodedAccounts
				.map((oAccount) => fnToObjectId(oAccount.sBankAccountId))
				.filter(Boolean);

			oDebug.configured_bank_account_ids = aHardcodedAccounts.map((oAccount) => oAccount.sBankAccountId);
			oDebug.valid_configured_object_ids = aHardcodedObjectIds.map((oId) => oId.toHexString());

			if (!aHardcodedObjectIds.length) {
				oDebug.error = "Keine gueltigen hardcodierten Konto-IDs konfiguriert.";
				return oDebug;
			}

			const aAllowedAccounts = await oDb
				.collection("bank_accounts")
				.find({ _id: { $in: aHardcodedObjectIds } })
				.project({ _id: 1 })
				.toArray();
			const aAllowedAccountIds = aAllowedAccounts.map((oAccount) => oAccount?._id).filter(Boolean);
			oDebug.allowed_bank_account_ids_in_db = aAllowedAccountIds.map((oId) => oId.toHexString());

			if (!aAllowedAccountIds.length) {
				oDebug.error = "Keine der konfigurierten Konto-IDs existiert in bank_accounts.";
				return oDebug;
			}

			const sSelectedAccountIdRaw = String(oOptions?.sBankAccountId || "").trim();
			let aFilterAccountIds = aAllowedAccountIds;
			if (sSelectedAccountIdRaw) {
				const oSelectedAccountId = fnToObjectId(sSelectedAccountIdRaw);
				oDebug.selected_id_is_valid_object_id = Boolean(oSelectedAccountId);
				if (!oSelectedAccountId) {
					oDebug.error = "Ausgewaehlte bank_account_id ist kein gueltiges ObjectId-Format.";
					return oDebug;
				}

				const bSelectedAllowed = aAllowedAccountIds.some((oId) => oId.equals(oSelectedAccountId));
				oDebug.selected_id_is_allowed = bSelectedAllowed;
				if (!bSelectedAllowed) {
					oDebug.error = "Ausgewaehlte bank_account_id ist nicht in der erlaubten Kontoliste.";
					return oDebug;
				}

				aFilterAccountIds = [oSelectedAccountId];
			}

			oDebug.used_filter_account_ids = aFilterAccountIds.map((oId) => oId.toHexString());

			const aShares = await oDb
				.collection("shares")
				.find({ bank_account_id: { $in: aFilterAccountIds } })
				.sort({ bought_at: 1 })
				.limit(300)
				.toArray();

			oDebug.shares_found_raw = aShares.length;
			oDebug.positions_mapped = (aShares || [])
				.map((oShare) => {
					const sSymbol = String(oShare?.symbol || "").trim().toUpperCase();
					const nAmount = fnToNumber(oShare?.units);
					const nBoughtFor = fnToNumber(oShare?.bought_for);
					const iBoughtAtMs = oShare?.bought_at instanceof Date ? oShare.bought_at.getTime() : Date.parse(String(oShare?.bought_at || ""));
					const iCreatedAt = Number.isFinite(iBoughtAtMs) ? Math.floor(iBoughtAtMs / 1000) : Number.NaN;
					const nWorthWhenBought = Number.isFinite(nAmount) && nAmount > 0 && Number.isFinite(nBoughtFor)
						? nBoughtFor / nAmount
						: Number.NaN;
					if (!sSymbol) return null;
					if (!Number.isFinite(nAmount) || nAmount <= 0) return null;
					if (!Number.isFinite(iCreatedAt) || iCreatedAt <= 0) return null;
					if (!Number.isFinite(nWorthWhenBought) || nWorthWhenBought <= 0) return null;
					return 1;
				})
				.filter(Boolean).length;

			return oDebug;
		});
	} catch (oError) {
		oDebug.error = String(oError?.message || oError);
		return oDebug;
	}
}

/**
 * Lädt verfügbare Konten anhand der hardcodierten Konto-IDs.
 * Rückgabe priorisiert die dort definierten Labels.
 * @returns {Promise<Array<{id: string, label: string}>>}
 */
async function fnLoadBankAccountsFromMongo() {
	try {
		if (!fnWithDbCached) {
			const oDbClientModule = await import("../../database/db-client.mjs");
			fnWithDbCached = oDbClientModule?.withDb;
		}

		if (typeof fnWithDbCached !== "function") return [];

		return await fnWithDbCached(async (oDb) => {
			const aHardcodedAccounts = fnGetHardcodedBankAccounts();
			const aHardcodedObjectIds = aHardcodedAccounts
				.map((oAccount) => fnToObjectId(oAccount.sBankAccountId))
				.filter(Boolean);
			if (!aHardcodedObjectIds.length) return [];

			const aBankAccounts = await oDb
				.collection("bank_accounts")
				.find({ _id: { $in: aHardcodedObjectIds } })
				.project({ _id: 1, created_at: 1 })
				.sort({ created_at: 1 })
				.toArray();

			const mHardcodedLabelById = new Map(aHardcodedAccounts.map((oAccount) => [oAccount.sBankAccountId, oAccount.sLabel]));
			const aAllowedByHardcoded = aBankAccounts.filter((oAccount) => aHardcodedObjectIds.some((oId) => oId.equals(oAccount?._id)));

			return aAllowedByHardcoded.map((oAccount, iIndex) => {
				const sId = String(oAccount?._id || "");
				const sHardcodedLabel = mHardcodedLabelById.get(sId);
				return {
					id: sId,
					label: sHardcodedLabel || `Konto ${iIndex + 1}`,
				};
			});
		});
	} catch (oError) {
		console.warn("Mongo-Bankkontenabfrage fehlgeschlagen.", oError?.message || oError);
		throw oError;
	}
}

/**
 * Proxyt eine Anfrage an Twelve Data und injiziert den API-Key serverseitig.
 * @param {string} sPathname
 * @param {URL} oRequestUrl
 * @param {import("node:http").ServerResponse} oResponse
 * @returns {Promise<void>}
 */
async function fnProxyTwelveData(sPathname, oRequestUrl, oResponse) {
	if (!sTwelveDataApiKey) {
		fnWriteJson(oResponse, 500, { status: "error", message: "TWELVE_DATA_API_KEY fehlt im Backend." });
		return;
	}

	const sProxyPrefix = "/api/twelvedata";
	const sTdPathRaw = sPathname.slice(sProxyPrefix.length) || "/";
	const sTdPath = sTdPathRaw.startsWith("/") ? sTdPathRaw : `/${sTdPathRaw}`;
	const oTdUrl = new URL(sTdPath, sTwelveDataBaseUrl);

	oRequestUrl.searchParams.forEach((sValue, sKey) => {
		if (sKey.toLowerCase() === "apikey" || sKey.toLowerCase() === "api_key") return;
		oTdUrl.searchParams.set(sKey, sValue);
	});
	oTdUrl.searchParams.set("apikey", sTwelveDataApiKey);

	try {
		const oUpstreamResponse = await fetch(oTdUrl.toString(), {
			headers: { Accept: "application/json" },
		});
		const sBody = await oUpstreamResponse.text();

		oResponse.writeHead(oUpstreamResponse.status, {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
			"Content-Type": "application/json; charset=utf-8",
		});
		oResponse.end(sBody);
	} catch (oError) {
		fnWriteJson(oResponse, 502, {
			status: "error",
			message: "Twelve Data Proxy Anfrage fehlgeschlagen.",
			detail: String(oError?.message || oError),
		});
	}
}

/**
 * Liefert statische Dateien aus dem Projektverzeichnis aus.
 * @param {string} sRequestPath
 * @param {import("node:http").ServerResponse} oResponse
 * @returns {Promise<void>}
 */
async function fnServeStatic(sRequestPath, oResponse) {
	const sDecodedPath = decodeURIComponent(sRequestPath);
	const sSafeRelativePath = path
		.normalize(sDecodedPath)
		.replace(/^([/\\])+/, "")
		.replace(/^(\.\.(\/|\\|$))+/, "");

	let sFilePath = path.join(sProjectRootPath, sSafeRelativePath);
	if (sDecodedPath === "/") {
		sFilePath = path.join(sProjectRootPath, "aktien", "ShareView.html");
	}

	try {
		const oFileStats = await stat(sFilePath);
		if (oFileStats.isDirectory()) {
			fnWriteJson(oResponse, 403, { error: "Directory listing is not allowed." });
			return;
		}

		const sFileExtension = path.extname(sFilePath).toLowerCase();
		oResponse.writeHead(200, {
			"Access-Control-Allow-Origin": "*",
			"Content-Type": oMimeByExt[sFileExtension] || "application/octet-stream",
		});
		createReadStream(sFilePath).pipe(oResponse);
	} catch {
		fnWriteJson(oResponse, 404, { error: "Not found." });
	}
}

/**
 * Zentrale Request-Routing-Funktion für API und statische Dateien.
 * @param {import("node:http").IncomingMessage} oRequest
 * @param {import("node:http").ServerResponse} oResponse
 * @returns {Promise<void>}
 */
async function fnHandleRequest(oRequest, oResponse) {
	const sMethod = (oRequest.method || "GET").toUpperCase();
	const oRequestUrl = new URL(oRequest.url || "/", `http://${oRequest.headers.host || "localhost"}`);
	const { pathname: sPathname } = oRequestUrl;

	if (sMethod === "OPTIONS") {
		oResponse.writeHead(204, {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		});
		oResponse.end();
		return;
	}

	if (sMethod === "GET" && sPathname === "/api/positions") {
		try {
			const sBankAccountId = String(oRequestUrl.searchParams.get("bank_account_id") || "").trim();
			const aMongoPositions = await fnLoadPositionsFromMongo({ sBankAccountId });
			const aPositions = aMongoPositions.length
				? aMongoPositions
				: (bUseFallbackPositions ? aFallbackPositions : []);
			fnWriteJson(oResponse, 200, aPositions);
		} catch (oError) {
			fnWriteJson(oResponse, 503, {
				error: "Database unavailable.",
				detail: String(oError?.message || oError),
			});
		}
		return;
	}

	if (sMethod === "GET" && sPathname === "/api/bank-accounts") {
		try {
			const aAccounts = await fnLoadBankAccountsFromMongo();
			fnWriteJson(oResponse, 200, {
				accounts: aAccounts,
			});
		} catch (oError) {
			fnWriteJson(oResponse, 503, {
				error: "Database unavailable.",
				detail: String(oError?.message || oError),
			});
		}
		return;
	}

	if (sMethod === "GET" && sPathname === "/api/debug/positions") {
		const sBankAccountId = String(oRequestUrl.searchParams.get("bank_account_id") || "").trim();
		const oDebug = await fnDebugPositionsFromMongo({ sBankAccountId });
		fnWriteJson(oResponse, 200, oDebug);
		return;
	}

	if (sMethod === "GET" && sPathname.startsWith("/api/twelvedata")) {
		await fnProxyTwelveData(sPathname, oRequestUrl, oResponse);
		return;
	}

	if (sMethod !== "GET" && sMethod !== "HEAD") {
		fnWriteJson(oResponse, 405, { error: "Method not allowed." });
		return;
	}

	await fnServeStatic(sPathname, oResponse);
}

const oServer = createServer(fnHandleRequest);
oServer.listen(iPort, "127.0.0.1", () => {
	console.log(`Aktien backend läuft auf http://localhost:${iPort}`);
	console.log(`Frontend: http://localhost:${iPort}/aktien/ShareView.html`);
});
