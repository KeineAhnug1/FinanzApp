import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sCurrentFilePath = fileURLToPath(import.meta.url);
const sCurrentDirPath = path.dirname(sCurrentFilePath);
const sProjectRootPath = path.resolve(sCurrentDirPath, "..", "..");

/**
 * Startet einen Kindprozess für API oder statischen Webserver.
 * @param {string} sCommand
 * @param {string[]} aArgs
 * @param {string} sLabel
 * @param {Record<string, string>} [oExtraEnv={}]
 * @returns {import("node:child_process").ChildProcess}
 */
function fnStartProcess(sCommand, aArgs, sLabel, oExtraEnv = {}) {
	const oChild = spawn(sCommand, aArgs, {
		cwd: sProjectRootPath,
		stdio: "inherit",
		env: { ...process.env, ...oExtraEnv },
	});

	oChild.on("error", (oError) => {
		console.error(`[${sLabel}] Konnte Prozess nicht starten:`, oError.message);
	});

	oChild.on("exit", (iExitCode, sSignal) => {
		const sReason = sSignal ? `Signal ${sSignal}` : `Code ${iExitCode}`;
		console.log(`[${sLabel}] beendet (${sReason}).`);
	});

	return oChild;
}

const oApiWithPortProcess = fnStartProcess("node", ["aktien/backend/server.mjs"], "api", { PORT: "5588" });

let oWebProcess = fnStartProcess("python3", ["-m", "http.server", "5500"], "web");

oWebProcess.on("error", () => {
	oWebProcess = fnStartProcess("python", ["-m", "http.server", "5500"], "web");
});

/**
 * Beendet beide gestarteten Prozesse kontrolliert.
 */
function fnShutdown() {
	if (oApiWithPortProcess && !oApiWithPortProcess.killed) oApiWithPortProcess.kill("SIGINT");
	if (oWebProcess && !oWebProcess.killed) oWebProcess.kill("SIGINT");
}

process.on("SIGINT", fnShutdown);
process.on("SIGTERM", fnShutdown);

console.log("Gestartet:");
console.log("- Frontend: http://localhost:5500/aktien/ShareView.html");
console.log("- API: http://localhost:5588/api/positions");
