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
	function fnGetLineChartGeometry(iWidth, iHeight) {
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
		const sPrimary = oStyles.getPropertyValue("--clr-chart-line").trim() || oStyles.getPropertyValue("--clr-primary").trim() || "#0a6ed1";
		const sPrimarySoft = oStyles.getPropertyValue("--clr-primary-soft").trim() || "rgba(10, 110, 209, 0.12)";
		const sChartFillTop = oStyles.getPropertyValue("--clr-chart-fill-top").trim() || "rgba(10, 110, 209, 0.30)";
		const sChartFillBottom = oStyles.getPropertyValue("--clr-chart-fill-bottom").trim() || sPrimarySoft || "rgba(10, 110, 209, 0.08)";
		const sChartPointGlow = oStyles.getPropertyValue("--clr-chart-point-glow").trim() || "rgba(10, 110, 209, 0.23)";
		const sChartHoverGlow = oStyles.getPropertyValue("--clr-chart-hover-glow").trim() || "rgba(10, 110, 209, 0.18)";
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

		oCtx.strokeStyle = sBorder;
		oCtx.lineWidth = 1.1;
		oCtx.strokeRect(iPadL, iPadT, iInnerWidth, iInnerHeight);

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

		const aCanvasPoints = aPoints.map((oPoint, iPointIndex) => ({
			nX: fnXAt(iPointIndex),
			nY: fnYAt(oPoint.y),
		}));

		const oGradient = oCtx.createLinearGradient(0, iPadT, 0, iPadT + iInnerHeight);
		oGradient.addColorStop(0, sChartFillTop);
		oGradient.addColorStop(1, sChartFillBottom);

		oCtx.beginPath();
		oCtx.moveTo(aCanvasPoints[0].nX, iPadT + iInnerHeight);
		oCtx.lineTo(aCanvasPoints[0].nX, aCanvasPoints[0].nY);
		for (let iPointIndex = 1; iPointIndex < aCanvasPoints.length; iPointIndex += 1) {
			oCtx.lineTo(aCanvasPoints[iPointIndex].nX, aCanvasPoints[iPointIndex].nY);
		}
		const oLastPoint = aCanvasPoints[aCanvasPoints.length - 1];
		oCtx.lineTo(oLastPoint.nX, oLastPoint.nY);
		oCtx.lineTo(oLastPoint.nX, iPadT + iInnerHeight);
		oCtx.closePath();
		oCtx.fillStyle = oGradient;
		oCtx.fill();

		oCtx.beginPath();
		oCtx.moveTo(aCanvasPoints[0].nX, aCanvasPoints[0].nY);
		for (let iPointIndex = 1; iPointIndex < aCanvasPoints.length; iPointIndex += 1) {
			oCtx.lineTo(aCanvasPoints[iPointIndex].nX, aCanvasPoints[iPointIndex].nY);
		}
		oCtx.lineTo(oLastPoint.nX, oLastPoint.nY);
		oCtx.strokeStyle = sPrimary;
		oCtx.lineWidth = 2.6;
		oCtx.stroke();

		oCtx.beginPath();
		oCtx.arc(oLastPoint.nX, oLastPoint.nY, 2.8, 0, Math.PI * 2);
		oCtx.fillStyle = sPrimary;
		oCtx.fill();

		if (sChartPointGlow) {
			oCtx.beginPath();
			oCtx.arc(oLastPoint.nX, oLastPoint.nY, 6.5, 0, Math.PI * 2);
			oCtx.fillStyle = sChartPointGlow;
			oCtx.fill();
		}

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

			oCtx.beginPath();
			oCtx.arc(oHoverPoint.nX, oHoverPoint.nY, 6.5, 0, Math.PI * 2);
			oCtx.fillStyle = sChartHoverGlow;
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
		const oStyles = getComputedStyle(document.documentElement);
		const aPalette = [
			oStyles.getPropertyValue("--clr-pie-1").trim() || "#0a6ed1",
			oStyles.getPropertyValue("--clr-pie-2").trim() || "#2c7ddd",
			oStyles.getPropertyValue("--clr-pie-3").trim() || "#3b8eea",
			oStyles.getPropertyValue("--clr-pie-4").trim() || "#539df2",
			oStyles.getPropertyValue("--clr-pie-5").trim() || "#69abff",
			oStyles.getPropertyValue("--clr-pie-6").trim() || "#2a62a7",
			oStyles.getPropertyValue("--clr-pie-7").trim() || "#356fba",
			oStyles.getPropertyValue("--clr-pie-8").trim() || "#447fcb",
			oStyles.getPropertyValue("--clr-pie-9").trim() || "#6b95d6",
			oStyles.getPropertyValue("--clr-pie-10").trim() || "#8aaee0",
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
			oCtx.fillText(fnT("stocks.no_distribution", "Keine Verteilung verfügbar"), nCx, nCy);
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

		const sInfoTitle = iSelectedIndex >= 0 ? fnT("selection", "Auswahl") : fnT("depot", "Depot");
		const sInfoNameRaw = iSelectedIndex >= 0 && aItems[iSelectedIndex] ? aItems[iSelectedIndex].sSymbol : fnT("allocation", "Allokation");
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
