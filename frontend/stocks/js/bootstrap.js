	// [SHARED] 13) Navigation + App-Start
	// =====================================================
	const aStocksViews = new Set(["depot", "analysis"]);

	function fnGetViewFromHash() {
		const sHash = String(window.location.hash || "").trim().replace(/^#/, "").toLowerCase();
		return aStocksViews.has(sHash) ? sHash : null;
	}

	function fnSetViewFromHashOrFallback() {
		const sViewFromHash = fnGetViewFromHash();
		if (sViewFromHash) {
			sActiveView = sViewFromHash;
			return;
		}
		if (aStocksViews.has(sActiveView)) return;
		sActiveView = "depot";
	}

	function fnSetActiveTopNavLink() {
		const aTopLinks = [...document.querySelectorAll(".app-nav-links .app-nav-link")];
		aTopLinks.forEach((elLink) => {
			const sHref = String(elLink.getAttribute("href") || "");
			const bIsAccountsLink = sHref.startsWith("/accounts/");
			const bIsStocksLink = sHref.startsWith("/stocks/");
			const bShouldBeActive = sActiveView === "accounts" ? bIsAccountsLink : bIsStocksLink;
			if (bIsAccountsLink || bIsStocksLink) {
				elLink.classList.toggle("is-active", bShouldBeActive);
			}
		});
	}

	async function fnInitApp() {
		if (window.FinanzAppCurrency?.preloadRates) {
			await window.FinanzAppCurrency.preloadRates({ base: "EUR" });
		}
		await Promise.all([fnLoadShareAccounts(), fnLoadBankAccounts()]);
		fnSetViewFromHashOrFallback();
		fnSetActiveTopNavLink();
		fnRenderView(sActiveView);
	}

	window.addEventListener("hashchange", () => {
		const sViewFromHash = fnGetViewFromHash();
		if (!sViewFromHash) return;
		sActiveView = sViewFromHash;
		fnSetActiveTopNavLink();
		fnRenderView(sActiveView);
	});

	window.addEventListener("finanzapp:locale-changed", () => {
		sLocale = fnGetLocale();
		fnSetActiveTopNavLink();
		fnRenderView(sActiveView);
	});

	fnInitApp();
