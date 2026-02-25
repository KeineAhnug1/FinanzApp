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

	function fnSetActiveTopNavLink() {
		const aTopLinks = [...document.querySelectorAll(".app-nav-links .app-nav-link")];
		aTopLinks.forEach((elLink) => {
			const sHref = String(elLink.getAttribute("href") || "");
			const bIsAccountsLink = sHref.startsWith("/konten/");
			const bIsStocksLink = sHref.startsWith("/aktien/");
			const bShouldBeActive = sActiveView === "accounts" ? bIsAccountsLink : bIsStocksLink;
			if (bIsAccountsLink || bIsStocksLink) {
				elLink.classList.toggle("is-active", bShouldBeActive);
			}
		});
	}

	aElNavButtons.forEach((elButton) => {
		elButton.addEventListener("click", () => {
			sActiveView = elButton.dataset.view;
			fnSetActiveNav(sActiveView);
			fnSetActiveTopNavLink();
			fnRenderView(sActiveView);
		});
	});

	async function fnInitApp() {
		if (window.FinanzAppCurrency?.preloadRates) {
			await window.FinanzAppCurrency.preloadRates({ base: "EUR" });
		}
		await Promise.all([fnLoadShareAccounts(), fnLoadBankAccounts()]);
		fnSetActiveNav(sActiveView);
		fnSetActiveTopNavLink();
		fnRenderView(sActiveView);
	}

	window.addEventListener("finanzapp:locale-changed", () => {
		sLocale = fnGetLocale();
		fnSetActiveTopNavLink();
		fnRenderView(sActiveView);
	});

	fnInitApp();
