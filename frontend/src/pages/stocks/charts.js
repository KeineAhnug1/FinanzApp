import { fnT, fnFmtMoney, oShareViewChartUtils } from './state-api.js';
import { fnFmtAxisMoneyCompact, fnShortLabel, fnEscapeHtml } from './domain.js';

// [SHARED] 8) Chart Rendering (Depot + Einzelanalyse)
// =====================================================

/**
 * Löscht den kompletten Canvas-Bereich.
 * Scope: [SHARED]
 * @param {CanvasRenderingContext2D} oCtx
 * @param {HTMLCanvasElement} elCanvas
 */
export function fnClearCanvas(oCtx, elCanvas) {
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
export function fnPrepareCanvas(oCtx, elCanvas, oOptions = {}) {
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
export function fnCanvasRoundRect(oCtx, nX, nY, nWidth, nHeight, nRadius) {
	if (typeof oShareViewChartUtils.canvasRoundRect === "function") {
		return oShareViewChartUtils.canvasRoundRect(oCtx, nX, nY, nWidth, nHeight, nRadius);
	}
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
export function fnGetLineChartGeometry(iWidth, iHeight) {
	if (typeof oShareViewChartUtils.getLineChartGeometry === "function") {
		return oShareViewChartUtils.getLineChartGeometry(iWidth, iHeight);
	}
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
 * Zeichnet einen geglaetteten Linienpfad, damit starke Zacken ruhiger wirken.
 * Scope: [SHARED]
 * @param {CanvasRenderingContext2D} oCtx
 * @param {Array<{nX: number, nY: number}>} aCanvasPoints
 */
export function fnStrokeSmoothPath(oCtx, aCanvasPoints) {
	if (!Array.isArray(aCanvasPoints) || aCanvasPoints.length <= 1) return;
	oCtx.beginPath();
	oCtx.moveTo(aCanvasPoints[0].nX, aCanvasPoints[0].nY);
	for (let iPointIndex = 1; iPointIndex < aCanvasPoints.length - 1; iPointIndex += 1) {
		const oCurrent = aCanvasPoints[iPointIndex];
		const oNext = aCanvasPoints[iPointIndex + 1];
		const nMidX = (oCurrent.nX + oNext.nX) / 2;
		const nMidY = (oCurrent.nY + oNext.nY) / 2;
		oCtx.quadraticCurveTo(oCurrent.nX, oCurrent.nY, nMidX, nMidY);
	}
	const oLastMinusOne = aCanvasPoints[aCanvasPoints.length - 2];
	const oLast = aCanvasPoints[aCanvasPoints.length - 1];
	oCtx.quadraticCurveTo(oLastMinusOne.nX, oLastMinusOne.nY, oLast.nX, oLast.nY);
}

/**
 * Initialisiert Pointer-Events für Hover-Markierung im Linienchart.
 * Scope: [SHARED]
 * @param {HTMLCanvasElement} elCanvas
 */
export function fnEnsureLineChartHoverHandlers(elCanvas) {
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
export function fnDrawLineChart(oCtx, elCanvas, aPoints, bPnlOnly) {
	if (!Array.isArray(aPoints) || aPoints.length === 0) {
		const { iWidth, iHeight } = fnPrepareCanvas(oCtx, elCanvas);
		oCtx.clearRect(0, 0, iWidth, iHeight);
		return;
	}

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
	const sPrimary = oStyles.getPropertyValue("--clr-chart-line").trim() || oStyles.getPropertyValue("--accent-blue").trim() || oStyles.getPropertyValue("--clr-primary").trim() || "#f39a67";
	const sTextMuted = oStyles.getPropertyValue("--clr-text-muted").trim() || "#5d6763";
	const sBorder = oStyles.getPropertyValue("--clr-border").trim() || "#d2d8d4";
	const sBorderStrong = oStyles.getPropertyValue("--clr-border-strong").trim() || "#b5c0ba";
	const sSurface = oStyles.getPropertyValue("--clr-surface").trim() || "#ffffff";
	const sText = oStyles.getPropertyValue("--clr-text").trim() || "#1d2522";

	const { bCompact, iPadL, iPadT, iInnerWidth, iInnerHeight } = fnGetLineChartGeometry(iWidth, iHeight);

	const aValues = aPoints.map((oPoint) => oPoint.y);
	let nMin = Math.min(...aValues);
	let nMax = Math.max(...aValues);

	const nDataRange = nMax - nMin;
	if (nDataRange < 1e-9) {
		const nBase = Math.abs(nMin) > 1 ? Math.abs(nMin) : 1;
		nMin -= nBase * 0.05;
		nMax += nBase * 0.05;
	} else {
		const nPadding = nDataRange * 0.12;
		nMin -= nPadding;
		nMax += nPadding;
	}

	const fnXAt = (iIndex) => {
		if (aPoints.length <= 1) return iPadL;
		return iPadL + (iIndex / (aPoints.length - 1)) * iInnerWidth;
	};
	const fnYAt = (nValue) => iPadT + (1 - (nValue - nMin) / (nMax - nMin)) * iInnerHeight;

	oCtx.font = `${bCompact ? 10 : 12}px 'Sora', 'Avenir Next', sans-serif`;
	oCtx.fillStyle = sTextMuted;

	for (let iTickIndex = 0; iTickIndex <= 5; iTickIndex += 1) {
		const nTickValue = nMax - (iTickIndex / 5) * (nMax - nMin);
		const nY = fnYAt(nTickValue);

		oCtx.strokeStyle = iTickIndex === 5 ? sBorderStrong : sBorder;
		oCtx.setLineDash([]);
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

	const nZeroY = fnYAt(0);
	if (nZeroY >= iPadT && nZeroY <= iPadT + iInnerHeight) {
		oCtx.beginPath();
		oCtx.moveTo(iPadL, nZeroY);
		oCtx.lineTo(iPadL + iInnerWidth, nZeroY);
		oCtx.strokeStyle = sTextMuted;
		oCtx.lineWidth = 1.1;
		oCtx.stroke();
	}

	const aCanvasPoints = aPoints.map((oPoint, iPointIndex) => ({
		nX: fnXAt(iPointIndex),
		nY: fnYAt(oPoint.y),
	}));

	fnStrokeSmoothPath(oCtx, aCanvasPoints);
	oCtx.strokeStyle = sPrimary;
	oCtx.lineWidth = 2.6;
	oCtx.stroke();

	const iHoverIndex = Number.isInteger(oHoverState.iHoverIndex) ? oHoverState.iHoverIndex : -1;
	if (iHoverIndex >= 0 && iHoverIndex < aCanvasPoints.length) {
		const oHoverPoint = aCanvasPoints[iHoverIndex];
		const nHoverValue = Number(aPoints[iHoverIndex]?.y);
		const sHoverPrefix = bPnlOnly && nHoverValue > 0 ? "+" : "";
		const sHoverValue = Number.isFinite(nHoverValue) ? `${sHoverPrefix}${fnFmtMoney(nHoverValue, "USD")}` : "—";

		oCtx.beginPath();
		oCtx.setLineDash([4, 4]);
		oCtx.moveTo(oHoverPoint.nX, iPadT);
		oCtx.lineTo(oHoverPoint.nX, iPadT + iInnerHeight);
		oCtx.strokeStyle = sTextMuted;
		oCtx.lineWidth = 1.2;
		oCtx.stroke();
		oCtx.setLineDash([]);

		oCtx.font = `${bCompact ? 11 : 12}px 'Sora', 'Avenir Next', sans-serif`;
		const iPadX = bCompact ? 8 : 10;
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
	const setIntradayDays = new Set(
		aPoints
			.map((oPoint) => String(oPoint?.t || ""))
			.filter((sTime) => sTime.includes(" "))
			.map((sTime) => sTime.slice(0, 10))
	);
	const bIntradayCrossesDays = setIntradayDays.size > 1;
	oCtx.font = `${bCompact ? 10 : 11}px 'Sora', 'Avenir Next', sans-serif`;
	oCtx.fillStyle = sTextMuted;
	oCtx.textAlign = "center";
	oCtx.textBaseline = "top";
	for (let iLabelIndex = 0; iLabelIndex < iLabelCount; iLabelIndex += 1) {
		const nRatio = iLabelCount <= 1 ? 0 : iLabelIndex / (iLabelCount - 1);
		const iPointIndex = Math.round(nRatio * (aPoints.length - 1));
		const nX = fnXAt(iPointIndex);
		const sTime = aPoints[iPointIndex].t;
		const sLabel = fnShortLabel(sTime, bIntradayCrossesDays);
		oCtx.fillText(sLabel, nX, iPadT + iInnerHeight + 10);
	}
}

/**
 * Berechnet die aktuelle Depot-Zusammensetzung nach Symbol (Wertanteile).
 * Scope: [DEPOT]
 * @param {Array<object>} aPositions
 * @param {Map<string, {values: Array<object>}>} mSeriesBySymbol
 * @returns {Array<{sSymbol: string, nValue: number, nPct: number}>}
 */
export function fnBuildDepotComposition(aPositions, mSeriesBySymbol) {
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
export function fnPieColorAt(iIndex) {
	const oStyles = getComputedStyle(document.documentElement);
	const aPalette = [
		oStyles.getPropertyValue("--clr-pie-1").trim() || "#ef5b2a",
		oStyles.getPropertyValue("--clr-pie-2").trim() || "#f57c00",
		oStyles.getPropertyValue("--clr-pie-3").trim() || "#f9a825",
		oStyles.getPropertyValue("--clr-pie-4").trim() || "#f4a261",
		oStyles.getPropertyValue("--clr-pie-5").trim() || "#e76f51",
		oStyles.getPropertyValue("--clr-pie-6").trim() || "#f7b267",
		oStyles.getPropertyValue("--clr-pie-7").trim() || "#ff7043",
		oStyles.getPropertyValue("--clr-pie-8").trim() || "#d97706",
		oStyles.getPropertyValue("--clr-pie-9").trim() || "#fb8c00",
		oStyles.getPropertyValue("--clr-pie-10").trim() || "#ffb74d",
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
export function fnGetPieSliceIndexAtPoint(elCanvas, aItems, nX, nY) {
	if (!aItems.length) return -1;
	const oRect = elCanvas.getBoundingClientRect();
	const iWidth = Math.max(1, Math.round(oRect.width || elCanvas.clientWidth || elCanvas.width));
	const iHeight = Math.max(1, Math.round(oRect.height || elCanvas.clientHeight || elCanvas.height));
	const nCx = iWidth / 2;
	const nCy = iHeight / 2;
	const nRadius = Math.min(iWidth, iHeight) * 0.39;
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
export function fnDrawPieChart(oCtx, elCanvas, aItems, oOptions = {}) {
	const { iWidth, iHeight } = fnPrepareCanvas(oCtx, elCanvas, { bForceSquare: true });
	oCtx.clearRect(0, 0, iWidth, iHeight);
	const oStyles = getComputedStyle(document.documentElement);
	const sSurface = oStyles.getPropertyValue("--clr-surface").trim() || "#ffffff";
	const sTextMuted = oStyles.getPropertyValue("--clr-text-muted").trim() || "#5d6763";
	const nCx = iWidth / 2;
	const nCy = iHeight / 2;
	const nRadius = Math.min(iWidth, iHeight) * 0.39;
	const nInnerRadius = nRadius * 0.52;
	const iSelectedIndex = Number.isInteger(oOptions.iSelectedIndex) ? oOptions.iSelectedIndex : -1;
	const nSelectScale = Number.isFinite(oOptions.nSelectScale) ? Math.max(0, Math.min(1, oOptions.nSelectScale)) : 0;

	if (!aItems.length) {
		oCtx.fillStyle = sTextMuted;
		oCtx.font = "13px 'Sora', 'Avenir Next', sans-serif";
		oCtx.textAlign = "center";
		oCtx.textBaseline = "middle";
		oCtx.fillText(fnT("stocks.no_distribution", "Keine Verteilung verfügbar"), nCx, nCy);
		return;
	}

	let nStartAngle = -Math.PI / 2;
	aItems.forEach((oItem, iIndex) => {
		const nSlice = (oItem.nPct / 100) * Math.PI * 2;
		const nEndAngle = nStartAngle + nSlice;
		const bItemSelected = iSelectedIndex >= 0 && iIndex === iSelectedIndex;

		oCtx.beginPath();
		oCtx.moveTo(nCx, nCy);
		oCtx.arc(nCx, nCy, nRadius, nStartAngle, nEndAngle);
		oCtx.closePath();
		oCtx.globalAlpha = iSelectedIndex >= 0 && !bItemSelected ? 0.45 + 0.2 * (1 - nSelectScale) : 1;
		oCtx.fillStyle = fnPieColorAt(iIndex);
		oCtx.fill();
		oCtx.strokeStyle = sSurface;
		oCtx.lineWidth = 2.4;
		oCtx.stroke();
		oCtx.globalAlpha = 1;

		nStartAngle = nEndAngle;
	});

	// Dashboard-Style: klare Donut-Mitte ohne Zusatztext.
	oCtx.beginPath();
	oCtx.arc(nCx, nCy, nInnerRadius, 0, Math.PI * 2);
	oCtx.fillStyle = sSurface;
	oCtx.fill();
}

/**
 * Rendert die Legende unter dem Piechart.
 * Scope: [DEPOT]
 * @param {HTMLElement} elLegend
 * @param {Array<{sSymbol: string, nValue: number, nPct: number}>} aItems
 */
export function fnRenderPieLegend(elLegend, aItems, iSelectedIndex = -1) {
	if (!elLegend) return;
	if (!aItems.length) {
		elLegend.innerHTML = `<p class="muted">${fnT("stocks.no_distribution", "Keine Verteilung verfügbar.")}</p>`;
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
