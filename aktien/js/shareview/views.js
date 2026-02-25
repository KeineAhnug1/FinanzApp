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

          <div class="card">
            <div class="row">
              <label class="depot-account-picker">
                Aktienkonto
                <select id="depotShareAccountSelect" aria-label="Aktienkonto auswählen">
                  <option value="">Alle Konten</option>
                </select>
              </label>
            </div>
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

              <label>
                Aktienkonto
                <select id="analysisTradeShareAccountSelect"></select>
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

		if (sViewName === "accounts") {
			window.location.assign("/konten/");
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
