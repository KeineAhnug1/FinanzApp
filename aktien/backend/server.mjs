import "dotenv/config";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aFallbackPositions } from "./fallback-positions.mjs";

const sCurrentFilePath = fileURLToPath(import.meta.url);
const sCurrentDirPath = path.dirname(sCurrentFilePath);
const sProjectRootPath = path.resolve(sCurrentDirPath, "..", "..");
const iPort = Number(process.env.PORT || 5500);
const sTwelveDataBaseUrl = "https://api.twelvedata.com";
const sTwelveDataApiKey = String(process.env.TWELVE_DATA_API_KEY || process.env.TWELVE_API_KEY || "").trim();
let fnWithDbCached = null;

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
 * Lädt Positionen aus MongoDB (`shares`) und mappt sie auf das Frontend-Format.
 * Hinweis: Nutzerfilter folgt später; aktuell werden alle Shares geladen.
 * @returns {Promise<Array<{symbol: string, amount: number, created_at: number, worthwhenbought: number}>>}
 */
async function fnLoadPositionsFromMongo() {
	try {
		if (!fnWithDbCached) {
			const oDbClientModule = await import("../../database/db-client.mjs");
			fnWithDbCached = oDbClientModule?.withDb;
		}

		if (typeof fnWithDbCached !== "function") return [];

		return await fnWithDbCached(async (oDb) => {
			const aShares = await oDb
				.collection("shares")
				.find({})
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
		console.warn("Mongo-Positionsabfrage fehlgeschlagen. Nutze Fallback-Daten.", oError?.message || oError);
		return [];
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
		const aMongoPositions = await fnLoadPositionsFromMongo();
		const aPositions = aMongoPositions.length ? aMongoPositions : aFallbackPositions;
		fnWriteJson(oResponse, 200, aPositions);
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
