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
          <h2 class="view-title">${fnT("stocks.depot_total", "Gesamtsdepot")}</h2>

          <div class="card">
            <div class="row">
              <label class="depot-account-picker">
                ${fnT("stocks.share_account", "Aktienkonto")}
                <select id="depotShareAccountSelect" aria-label="${fnT("stocks.share_account_select_aria", "Aktienkonto auswählen")}">
                  <option value="">${fnT("stocks.all_accounts", "Alle Konten")}</option>
                </select>
              </label>
            </div>
          </div>

          <div class="range-bar">
            <button class="range-btn active" data-range="1D">${fnT("common.day", "Tag")}</button>
            <button class="range-btn" data-range="1W">${fnT("common.week", "Woche")}</button>
            <button class="range-btn" data-range="1M">${fnT("month", "Monat")}</button>
            <button class="range-btn" data-range="1Y">${fnT("common.year", "Jahr")}</button>
            <button class="range-btn" data-range="SINCE_BUY">${fnT("stocks.since_buy", "Ab Kauf")}</button>
          </div>

          <div class="card">
            <div class="depot-top">
              <div class="kpis">
                <div class="kpi">
                  <b id="k_total_label">${fnT("stocks.depot_value_last_point", "Depotwert (letzter Punkt)")}</b>
                  <span id="k_total">—</span>
                </div>
                <div class="kpi">
                  <b>${fnT("stocks.change_period", "Veränderung im Zeitraum")}</b>
                  <span id="k_change">—</span>
                </div>
                <div class="kpi">
                  <b>${fnT("stocks.pnl_only", "Nur Gewinn/Verlust")}</b>
                  <label class="check-row">
                    <input type="checkbox" id="k_pnl_only" class="ui-check">
                    <span>${fnT("stocks.active", "Aktiv")}</span>
                  </label>
                </div>
                <div class="kpi">
                  <b>${fnT("stocks.show_pie", "Piechart anzeigen")}</b>
                  <label class="check-row">
                    <input type="checkbox" id="k_show_pie" class="ui-check">
                    <span>${fnT("stocks.active", "Aktiv")}</span>
                  </label>
                </div>
              </div>

              <div class="muted" id="depotInfo">${fnT("common.ready", "Bereit.")}</div>
            </div>

            <div class="depot-chart-layout is-pie-hidden">
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
            <h3>${fnT("stocks.positions", "Positionen")}</h3>
            <div class="table-wrap">
              <table class="table" id="holdingsTable">
                <thead>
                  <tr>
                    <th>${fnT("symbol", "Symbol")}</th>
                    <th>${fnT("amount", "Menge")}</th>
                    <th>${fnT("stocks.first_buy", "Erster Kauf")}</th>
                    <th>${fnT("stocks.avg_buy_price", "Ø Kaufpreis")}</th>
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
          <h2 class="view-title">${fnT("stocks.single_analysis", "Einzelanalyse")}</h2>

          <div class="card">
            <div class="row analysis-top-row">
              <label>
                ${fnT("stocks.search_all", "Alle Aktien durchsuchen")}
                <input id="analysisCatalogSearchInput" type="search" placeholder="${fnT("stocks.search_placeholder", "z. B. Apple oder AAPL")}" autocomplete="off">
              </label>

              <button class="action" id="analysisCatalogSelectFirstBtn" type="button">${fnT("stocks.select_first_hit", "Ersten Treffer laden")}</button>

              <div class="muted" id="analysisInfo">${fnT("common.ready", "Bereit.")}</div>
            </div>

            <div id="analysisSearchResults" class="analysis-search-results"></div>
          </div>

          <div class="card">
            <div class="row analysis-top-row">
              <label>
                ${fnT("stocks.my_holdings", "Meine gehaltenen Aktien")}
                <select id="analysisOwnedSymbolSelect"></select>
              </label>

              <button class="action" id="analysisUseOwnedBtn" type="button">${fnT("stocks.load_from_depot", "Aus Depot laden")}</button>

              <label>
                ${fnT("amount", "Menge")}
                <input id="analysisTradeAmountInput" type="number" min="0.0001" step="0.0001" value="1">
              </label>

              <label>
                ${fnT("stocks.share_account", "Aktienkonto")}
                <select id="analysisTradeShareAccountSelect"></select>
              </label>

              <button class="action primary" id="analysisBuyBtn" type="button">${fnT("stocks.buy", "Kaufen")}</button>
              <button class="action primary" id="analysisSellBtn" type="button">${fnT("stocks.sell", "Verkaufen")}</button>
            </div>
            <div class="muted" id="analysisBuyFeedback"></div>
          </div>

          <div class="range-bar">
            <button class="range-btn active" data-range="1D">${fnT("common.day", "Tag")}</button>
            <button class="range-btn" data-range="1W">${fnT("common.week", "Woche")}</button>
            <button class="range-btn" data-range="1M">${fnT("month", "Monat")}</button>
            <button class="range-btn" data-range="1Y">${fnT("common.year", "Jahr")}</button>
            <button class="range-btn" data-range="SINCE_BUY">${fnT("stocks.since_buy", "Ab Kauf")}</button>
          </div>

          <div class="card">
            <div class="depot-top">
              <div class="kpis">
                <div class="kpi">
                  <b id="analysis_total_label">${fnT("stocks.price_last_point", "Kurs (letzter Punkt)")}</b>
                  <span id="analysis_total">—</span>
                </div>
                <div class="kpi">
                  <b>${fnT("stocks.change_period", "Veränderung im Zeitraum")}</b>
                  <span id="analysis_change">—</span>
                </div>
              </div>
            </div>

            <canvas id="analysisChart" class="line-chart" width="1200" height="420"></canvas>
          </div>

          <div class="card">
            <h3>${fnT("stocks.all_owned", "Alle Aktien im Besitz")}</h3>
            <div class="table-wrap">
              <table class="table" id="analysisHoldingsTable">
                <thead>
                  <tr>
                    <th>${fnT("symbol", "Symbol")}</th>
                    <th>${fnT("stocks.total_quantity", "Gesamtmenge")}</th>
                    <th>${fnT("stocks.first_buy", "Erster Kauf")}</th>
                    <th>${fnT("stocks.avg_buy_price", "Ø Kaufpreis")}</th>
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
          <h2 class="view-title">${fnT("stocks.future_outlook", "Zukunftsaussicht")}</h2>

          <div class="card">
            <div class="row future-top-row">
              <label>
                ${fnT("stocks.forecast_period_years", "Prognosezeitraum (Jahre)")}
                <input id="futureYearsInput" type="number" min="1" max="50" step="1" value="5">
              </label>

              <button class="action" id="futureRecalcBtn" type="button">${fnT("stocks.future_recalc", "Neu berechnen")}</button>
              <button class="action" id="futureSelectAllBtn" type="button">${fnT("stocks.select_all", "Alle wählen")}</button>
              <button class="action" id="futureSelectNoneBtn" type="button">${fnT("stocks.select_none", "Keine wählen")}</button>
            </div>

            <div class="muted" id="futureInfo">${fnT("common.ready", "Bereit.")}</div>
          </div>

          <div class="card">
            <h3>${fnT("stocks.my_owned_multiple", "Meine gehaltenen Aktien (einzeln oder mehrfach auswählen)")}</h3>
            <div id="futureOwnedList" class="future-owned-list"></div>
          </div>

          <div class="card">
            <div class="kpis">
              <div class="kpi">
                <b>${fnT("stocks.selected_stocks", "Ausgewählte Aktien")}</b>
                <span id="futureSelectedSymbols">—</span>
              </div>
              <div class="kpi">
                <b>${fnT("stocks.current_value", "Aktueller Wert")}</b>
                <span id="futureCurrentValue">—</span>
              </div>
              <div class="kpi">
                <b>${fnT("stocks.avg_profit_year", "Ø Gewinn pro Jahr (seit Erstkauf)")}</b>
                <span id="futureAvgProfitYear">—</span>
              </div>
              <div class="kpi">
                <b>${fnT("stocks.avg_return_year", "Ø Rendite pro Jahr (seit Erstkauf)")}</b>
                <span id="futureAvgReturnYear">—</span>
              </div>
              <div class="kpi">
                <b>${fnT("stocks.forecast_value", "Prognosewert")}</b>
                <span id="futureProjectedValue">—</span>
              </div>
              <div class="kpi">
                <b>${fnT("stocks.forecast_pnl", "Prognose Gewinn/Verlust")}</b>
                <span id="futureProjectedPnl">—</span>
              </div>
            </div>
          </div>

          <div class="card">
            <h3>${fnT("stocks.history_since_first_buy", "Historische Entwicklung (ab erstem Kauf)")}</h3>
            <canvas id="futureHistoryChart" class="line-chart" width="1200" height="420"></canvas>
          </div>

          <div class="card">
            <h3>${fnT("stocks.forecast_constant_conditions", "Prognose bei gleichbleibenden Bedingungen")}</h3>
            <canvas id="futureProjectionChart" class="line-chart" width="1200" height="420"></canvas>
          </div>

          <div class="card">
            <h3>${fnT("stocks.holdings_aggregated", "Bestand (aggregiert)")}</h3>
            <div class="table-wrap">
              <table class="table" id="futureHoldingsTable">
                <thead>
                  <tr>
                    <th>${fnT("stocks.active", "Aktiv")}</th>
                    <th>${fnT("symbol", "Symbol")}</th>
                    <th>${fnT("stocks.total_quantity", "Gesamtmenge")}</th>
                    <th>${fnT("stocks.first_buy", "Erster Kauf")}</th>
                    <th>${fnT("stocks.avg_buy_price", "Ø Kaufpreis")}</th>
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
              <div class="muted" id="categoryInfo">${fnT("stocks.load_data", "Lade Daten...")}</div>
            </div>
          </div>

          <div class="card">
            <h3>${fnT("stocks.my_holdings_with_category", "Meine gehaltenen Aktien ({category})", { category: fnEscapeHtml(oCategoryMeta.sTitle) })}</h3>
            <div class="table-wrap">
              <table class="table" id="categoryHoldingsTable">
                <thead>
                  <tr>
                    <th>${fnT("symbol", "Symbol")}</th>
                    <th>${fnT("name", "Name")}</th>
                    <th>${fnT("type", "Typ")}</th>
                    <th>${fnT("stocks.total_quantity", "Gesamtmenge")}</th>
                    <th>${fnT("stocks.first_buy", "Erster Kauf")}</th>
                    <th>${fnT("stocks.avg_buy_price", "Ø Kaufpreis")}</th>
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
        <p class="muted">${fnT("stocks.not_implemented_yet", "Dieser Bereich ist noch nicht implementiert.")}</p>
      </div>
    `;
	}

	// =====================================================
