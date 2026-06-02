import { preloadRates } from '@shared/js/currency-utils.js';
import {
	sActiveView,
	setActiveView,
	setLocale,
	fnGetLocale,
	fnLoadShareAccounts,
	fnLoadBankAccounts,
} from './state-api.js';

import { fnRenderView } from './views.js';

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
		setActiveView(sViewFromHash);
		return;
	}
	if (aStocksViews.has(sActiveView)) return;
	setActiveView("depot");
}

function fnSetActiveStocksTab(sView) {
	const aTabs = document.querySelectorAll("[data-stocks-tab]");
	for (const elTab of aTabs) {
		const bActive = elTab.dataset.stocksTab === sView;
		elTab.classList.toggle("is-active", bActive);
		elTab.setAttribute("aria-selected", String(bActive));
	}
}

function fnInitStocksTabs() {
	const aTabs = document.querySelectorAll("[data-stocks-tab]");
	for (const elTab of aTabs) {
		elTab.addEventListener("click", () => {
			const sView = elTab.dataset.stocksTab;
			if (!sView || !aStocksViews.has(sView)) return;
			setActiveView(sView);
			fnSetActiveStocksTab(sView);
			window.location.hash = sView;
			fnRenderView(sView);
		});
	}
}

function fnSetActiveTopNavLink() {
	const aTopLinks = [...document.querySelectorAll(".app-nav-links .app-nav-link")];
	aTopLinks.forEach((elLink) => {
		const sHref = String(elLink.getAttribute("href") || "");
		const bIsAccountsLink = sHref.startsWith("/pages/accounts/");
		const bIsStocksLink = sHref.startsWith("/pages/stocks/");
		const bShouldBeActive = sActiveView === "accounts" ? bIsAccountsLink : bIsStocksLink;
		if (bIsAccountsLink || bIsStocksLink) {
			elLink.classList.toggle("is-active", bShouldBeActive);
		}
	});
}

export async function fnInitApp() {
	await preloadRates({ base: "EUR" });
	await Promise.all([fnLoadShareAccounts(), fnLoadBankAccounts()]);
	fnSetViewFromHashOrFallback();
	fnSetActiveTopNavLink();
	fnSetActiveStocksTab(sActiveView);
	fnInitStocksTabs();
	fnRenderView(sActiveView);
}

window.addEventListener("hashchange", () => {
	const sViewFromHash = fnGetViewFromHash();
	if (!sViewFromHash) return;
	setActiveView(sViewFromHash);
	fnSetActiveTopNavLink();
	fnSetActiveStocksTab(sViewFromHash);
	fnRenderView(sActiveView);
});

window.addEventListener("finanzapp:locale-changed", () => {
	setLocale(fnGetLocale());
	fnSetActiveTopNavLink();
	fnRenderView(sActiveView);
});
