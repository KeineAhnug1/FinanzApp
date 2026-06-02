import '@shared/unified-ui.css';
import './style.css';
import '@shared/js/topbar.js';
import { t as _t, getLocale } from '@shared/js/language-utils.js';
import { getCurrentUserFromStorage } from '@shared/js/session-utils.js';
import { formatFromEur, getPreferredCurrency } from '@shared/js/currency-utils.js';
import { escapeHtml } from '@shared/js/html-utils.js';

const aShareAccountsEndpoints = [
  "/api/share-accounts"
];
const aBankAccountsEndpoints = [
  "/api/bank-accounts"
];

  let aShareAccounts = [];
  let aBankAccounts = [];

  function t(key, fallback, params = {}) {
    const translated = _t(key, params);
    if (translated && translated !== key) return translated;
    if (!params || !Object.keys(params).length) return fallback;
    return String(fallback || "").replaceAll(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
  }

  function fnEscapeHtml(sValue) {
    return escapeHtml(sValue);
  }

  function fnMapAccounts(aRaw, sFallbackPrefix, oOptions = {}) {
    const bWithBalance = oOptions.withBalance !== false;
    return (Array.isArray(aRaw) ? aRaw : [])
      .map((oAccount, iIndex) => {
        const sId = String(oAccount?.id || "").trim();
        if (!sId) return null;
        const sLabel = String(oAccount?.label || oAccount?.name || "").trim() || `${sFallbackPrefix} ${iIndex + 1}`;
        if (!bWithBalance) return { id: sId, label: sLabel, balance: null };
        const nBalance = Number(oAccount?.balance || 0);
        return { id: sId, label: sLabel, balance: Number.isFinite(nBalance) ? nBalance : 0 };
      })
      .filter(Boolean);
  }

  function fnFormatMoney(nAmount) {
    const amount = Number(nAmount) || 0;
    const userId = getCurrentUserFromStorage()?.id;
    const locale = getLocale(userId) || "de-DE";
    const currency = getPreferredCurrency(userId) || "EUR";
    try {
      return formatFromEur(amount, { locale, currency });
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  }

  async function fnApiRequest(aEndpoints, oInit = {}) {
    let sLastError = t("accounts.endpoint_unreachable", "Kein Endpoint erreichbar");
    for (const sEndpoint of aEndpoints) {
      try {
        const oResponse = await fetch(sEndpoint, oInit);
        if (!oResponse.ok) {
          let sMessage = `HTTP ${oResponse.status}`;
          let oDetails = null;
          try {
            const oData = await oResponse.json();
            oDetails = oData;
            sMessage = String(oData?.message || sMessage);
          } catch {
            // noop
          }
          const oError = new Error(sMessage);
          oError.details = oDetails;
          throw oError;
        }
        return await oResponse.json();
      } catch (oError) {
        if (oError?.details) throw oError;
        sLastError = String(oError?.message || oError);
      }
    }
    throw new Error(sLastError);
  }

  function fnById(id) {
    return document.getElementById(id);
  }

  function fnRenderList(elContainer, aAccounts, sType) {
    if (!elContainer) return;
    if (!aAccounts.length) {
      elContainer.innerHTML = `<p class="muted">${t("accounts.none_for_type", "Keine {type} vorhanden.", { type: fnEscapeHtml(sType) })}</p>`;
      return;
    }
    elContainer.innerHTML = aAccounts.map((oAccount) => `
      <div class="account-row" data-account-id="${fnEscapeHtml(oAccount.id)}" data-type="${fnEscapeHtml(sType)}">
        <button class="account-name-link" type="button" data-view-account="${fnEscapeHtml(oAccount.id)}" data-view-type="${fnEscapeHtml(sType)}">${fnEscapeHtml(oAccount.label)}</button>
        <input class="account-name-input" type="text" value="${fnEscapeHtml(oAccount.label)}" />
        <span class="account-balance">${oAccount.balance == null ? "-" : fnEscapeHtml(fnFormatMoney(oAccount.balance))}</span>
        <button class="action" data-action="rename">${t("accounts.rename", "Umbenennen")}</button>
        <button class="action" data-action="delete">${t("accounts.delete", "Löschen")}</button>
      </div>
    `).join("");
  }

  async function fnLoadShareAccounts() {
    const oData = await fnApiRequest(aShareAccountsEndpoints);
    aShareAccounts = fnMapAccounts(oData?.accounts, t("accounts.share_account_fallback", "Aktienkonto"), { withBalance: false });
  }

  async function fnLoadBankAccounts() {
    const oData = await fnApiRequest(aBankAccountsEndpoints);
    aBankAccounts = fnMapAccounts(oData?.accounts, t("accounts.bank_account_fallback", "Bankkonto"), { withBalance: true });
  }

  async function fnCreateAccount(aEndpoints, sLabel) {
    await fnApiRequest(aEndpoints, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: sLabel })
    });
  }

  async function fnRenameAccount(aEndpoints, sAccountId, sLabel) {
    const aUrl = aEndpoints.map((sEndpoint) => `${sEndpoint}/${encodeURIComponent(sAccountId)}`);
    await fnApiRequest(aUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: sLabel })
    });
  }

  async function fnDeleteAccount(aEndpoints, sAccountId, oOptions = {}) {
    const aUrl = aEndpoints.map((sEndpoint) => `${sEndpoint}/${encodeURIComponent(sAccountId)}`);
    const oInit = { method: "DELETE" };
    const sTransferTargetId = String(oOptions?.transferTargetId || "").trim();
    const sTransferField = String(oOptions?.transferField || "").trim();
    if (sTransferTargetId && sTransferField) {
      oInit.headers = { "Content-Type": "application/json" };
      oInit.body = JSON.stringify({ [sTransferField]: sTransferTargetId });
    }
    await fnApiRequest(aUrl, oInit);
  }

  function fnAskTransferTargetModal(aOptions, sMessage = "") {
    const aValidOptions = (Array.isArray(aOptions) ? aOptions : [])
      .map((oOption) => ({
        id: String(oOption?.id || "").trim(),
        label: String(oOption?.label || "").trim(),
        balance: Number(oOption?.balance || 0)
      }))
      .filter((oOption) => Boolean(oOption.id));
    if (!aValidOptions.length) return Promise.resolve("");

    const elBackdrop = fnById("transferModalBackdrop");
    const elMessage = fnById("transferModalMessage");
    const elSelect = fnById("transferTargetSelect");
    const elCancel = fnById("transferModalCancelBtn");
    const elConfirm = fnById("transferModalConfirmBtn");
    if (!elBackdrop || !elMessage || !elSelect || !elCancel || !elConfirm) {
      return Promise.resolve("");
    }

    elMessage.textContent = sMessage || t(
      "accounts.transfer_target_required",
      "Dieses Konto enthält noch Guthaben oder verknüpfte Buchungen. Bitte ein Zielkonto wählen."
    );
    elSelect.innerHTML = aValidOptions
      .map((oOption) => `<option value="${fnEscapeHtml(oOption.id)}">${fnEscapeHtml(oOption.label)} (${fnEscapeHtml(fnFormatMoney(oOption.balance))})</option>`)
      .join("");
    elBackdrop.hidden = false;

    return new Promise((resolve) => {
      let settled = false;

      const cleanup = (sValue) => {
        if (settled) return;
        settled = true;
        elBackdrop.hidden = true;
        elCancel.removeEventListener("click", onCancel);
        elConfirm.removeEventListener("click", onConfirm);
        elBackdrop.removeEventListener("click", onBackdropClick);
        document.removeEventListener("keydown", onKeyDown);
        resolve(sValue);
      };

      const onCancel = () => cleanup("");
      const onConfirm = () => cleanup(String(elSelect.value || "").trim());
      const onBackdropClick = (oEvent) => {
        if (oEvent.target === elBackdrop) cleanup("");
      };
      const onKeyDown = (oEvent) => {
        if (oEvent.key === "Escape") cleanup("");
      };

      elCancel.addEventListener("click", onCancel);
      elConfirm.addEventListener("click", onConfirm);
      elBackdrop.addEventListener("click", onBackdropClick);
      document.addEventListener("keydown", onKeyDown);
      elSelect.focus();
    });
  }

  function fnFormatDate(sValue) {
    const oDate = new Date(typeof sValue === "number" ? sValue * 1000 : sValue);
    if (Number.isNaN(oDate.getTime())) return "-";
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(oDate);
  }

  async function fnOpenAccountDetail(sAccountId, sType) {
    const elBackdrop = fnById("accountDetailBackdrop");
    const elContent = fnById("accountDetailContent");
    const elTitle = fnById("accountDetailTitle");
    const elClose = fnById("accountDetailCloseBtn");
    if (!elBackdrop || !elContent) return;

    const isShare = sType === t("accounts.share_accounts", "Aktienkonten");
    const accountList = isShare ? aShareAccounts : aBankAccounts;
    const oAccount = accountList.find((a) => a.id === sAccountId);
    const sLabel = oAccount ? oAccount.label : sAccountId;

    if (elTitle) elTitle.textContent = sLabel;
    elContent.innerHTML = `<p class="muted">Wird geladen...</p>`;
    elBackdrop.hidden = false;

    const onClose = () => { elBackdrop.hidden = true; };
    elClose.addEventListener("click", onClose, { once: true });
    elBackdrop.addEventListener("click", (e) => { if (e.target === elBackdrop) onClose(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") onClose(); }, { once: true });

    try {
      if (isShare) {
        const aData = await fnApiRequest([`/api/positions?share_account_id=${encodeURIComponent(sAccountId)}`]);
        const aPositions = Array.isArray(aData) ? aData : [];
        if (!aPositions.length) {
          elContent.innerHTML = `<p class="muted">Keine Positionen in diesem Aktienkonto.</p>`;
          return;
        }
        elContent.innerHTML = `
          <table class="detail-table">
            <thead><tr><th>Symbol</th><th>Anzahl</th><th>Kaufpreis/Stück</th><th>Gekauft am</th></tr></thead>
            <tbody>
              ${aPositions.map((pos) => `
                <tr>
                  <td><strong>${fnEscapeHtml(pos.symbol)}</strong></td>
                  <td>${fnEscapeHtml(String(pos.amount))}</td>
                  <td>${fnEscapeHtml(fnFormatMoney(pos.worthwhenbought))}</td>
                  <td>${fnEscapeHtml(fnFormatDate(pos.created_at))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        `;
      } else {
        const [oIncome, oExpense] = await Promise.all([
          fnApiRequest([`/api/income-entries?bank_account_id=${encodeURIComponent(sAccountId)}`]),
          fnApiRequest([`/api/expense-entries?bank_account_id=${encodeURIComponent(sAccountId)}`])
        ]);
        const aIncome = Array.isArray(oIncome?.entries) ? oIncome.entries : [];
        const aExpense = Array.isArray(oExpense?.entries) ? oExpense.entries : [];
        const aAll = [
          ...aIncome.map((e) => ({ ...e, _kind: "income", _date: e.received_at })),
          ...aExpense.map((e) => ({ ...e, _kind: "expense", _date: e.spent_at }))
        ].sort((a, b) => new Date(b._date) - new Date(a._date));

        if (!aAll.length) {
          elContent.innerHTML = `<p class="muted">Keine Transaktionen für dieses Konto.</p>`;
          return;
        }
        elContent.innerHTML = `
          <table class="detail-table">
            <thead><tr><th>Datum</th><th>Typ</th><th>Quelle / Kategorie</th><th>Betrag</th></tr></thead>
            <tbody>
              ${aAll.map((e) => `
                <tr>
                  <td>${fnEscapeHtml(fnFormatDate(e._date))}</td>
                  <td class="${e._kind === "income" ? "tx-income" : "tx-expense"}">${e._kind === "income" ? "Einnahme" : "Ausgabe"}</td>
                  <td>${fnEscapeHtml(e.source || e.category || "-")}${e.note ? `<br><small class="muted">${fnEscapeHtml(e.note)}</small>` : ""}</td>
                  <td class="${e._kind === "income" ? "tx-income" : "tx-expense"}">${e._kind === "income" ? "+" : "−"}${fnEscapeHtml(fnFormatMoney(e.amount))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        `;
      }
    } catch (oError) {
      elContent.innerHTML = `<p class="muted">Fehler: ${fnEscapeHtml(String(oError?.message || oError))}</p>`;
    }
  }

  async function fnInit() {
    const elTransferBackdrop = fnById("transferModalBackdrop");
    if (elTransferBackdrop) {
      elTransferBackdrop.hidden = true;
    }

    const elShareNameInput = fnById("shareAccountNameInput");
    const elCreateShareBtn = fnById("createShareAccountBtn");
    const elShareList = fnById("shareAccountsList");

    const elBankNameInput = fnById("bankAccountNameInput");
    const elCreateBankBtn = fnById("createBankAccountBtn");
    const elBankList = fnById("bankAccountsList");

    const elFeedback = fnById("accountsFeedback");
    if (!elShareNameInput || !elCreateShareBtn || !elShareList || !elBankNameInput || !elCreateBankBtn || !elBankList || !elFeedback) {
      return;
    }

    const fnRefresh = async () => {
      await Promise.all([fnLoadShareAccounts(), fnLoadBankAccounts()]);
      fnRenderList(elShareList, aShareAccounts, t("accounts.share_accounts", "Aktienkonten"));
      fnRenderList(elBankList, aBankAccounts, t("accounts.bank_accounts", "Bankkonten"));
    };

    window.addEventListener("finanzapp:locale-changed", () => {
      fnRenderList(elShareList, aShareAccounts, t("accounts.share_accounts", "Aktienkonten"));
      fnRenderList(elBankList, aBankAccounts, t("accounts.bank_accounts", "Bankkonten"));
    });

    elCreateShareBtn.addEventListener("click", async () => {
      const sLabel = String(elShareNameInput.value || "").trim();
      if (!sLabel) {
        elFeedback.textContent = t("accounts.enter_share_name", "Bitte einen Namen für das Aktienkonto eingeben.");
        return;
      }
      try {
        await fnCreateAccount(aShareAccountsEndpoints, sLabel);
        elShareNameInput.value = "";
        await fnRefresh();
        elFeedback.textContent = t("accounts.share_created", "Aktienkonto erstellt.");
      } catch (oError) {
        elFeedback.textContent = t("accounts.share_create_failed", "Aktienkonto konnte nicht erstellt werden: {error}", { error: String(oError?.message || oError) });
      }
    });

    elCreateBankBtn.addEventListener("click", async () => {
      const sLabel = String(elBankNameInput.value || "").trim();
      if (!sLabel) {
        elFeedback.textContent = t("accounts.enter_bank_name", "Bitte einen Namen für das Bankkonto eingeben.");
        return;
      }
      try {
        await fnCreateAccount(aBankAccountsEndpoints, sLabel);
        elBankNameInput.value = "";
        await fnRefresh();
        elFeedback.textContent = t("accounts.bank_created", "Bankkonto erstellt.");
      } catch (oError) {
        elFeedback.textContent = t("accounts.bank_create_failed", "Bankkonto konnte nicht erstellt werden: {error}", { error: String(oError?.message || oError) });
      }
    });

    elShareList.addEventListener("keydown", async (oEvent) => {
      if (oEvent.key !== "Enter" && oEvent.key !== "Escape") return;
      const elInput = oEvent.target instanceof Element ? oEvent.target.closest(".account-name-input") : null;
      if (!elInput) return;
      const elRow = elInput.closest(".account-row");
      if (!elRow) return;

      if (oEvent.key === "Escape") {
        const elNameLink = elRow.querySelector(".account-name-link");
        elInput.value = elNameLink ? elNameLink.textContent : "";
        elRow.classList.remove("is-renaming");
        const elSaveBtn = elRow.querySelector("button[data-action='save']");
        if (elSaveBtn) { elSaveBtn.textContent = t("accounts.rename", "Umbenennen"); elSaveBtn.dataset.action = "rename"; }
        return;
      }

      oEvent.preventDefault();
      const sId = String(elRow.dataset.accountId || "");
      const sLabel = String(elInput.value || "").trim();
      if (!sId) return;
      if (!sLabel) { elFeedback.textContent = t("accounts.enter_valid_name", "Bitte einen gültigen Kontonamen eingeben."); return; }
      try {
        await fnRenameAccount(aShareAccountsEndpoints, sId, sLabel);
        elFeedback.textContent = t("accounts.share_renamed", "Aktienkonto umbenannt.");
        await fnRefresh();
      } catch (oError) {
        elFeedback.textContent = t("accounts.action_failed", "Aktion fehlgeschlagen: {error}", { error: String(oError?.message || oError) });
      }
    });

    elShareList.addEventListener("click", async (oEvent) => {
      const elButton = oEvent.target instanceof Element ? oEvent.target.closest("button[data-action]") : null;
      if (!elButton) return;
      const elRow = elButton.closest(".account-row");
      if (!elRow) return;

      const sId = String(elRow.dataset.accountId || "");
      const sAction = String(elButton.dataset.action || "");
      if (!sId) return;

      if (sAction === "rename") {
        elRow.classList.add("is-renaming");
        const elInput = elRow.querySelector(".account-name-input");
        if (elInput) { elInput.focus(); elInput.select(); }
        elButton.textContent = t("accounts.save", "Speichern");
        elButton.dataset.action = "save";
        return;
      }

      const sLabel = String(elRow.querySelector(".account-name-input")?.value || "").trim();

      try {
        if (sAction === "save") {
          if (!sLabel) {
            elFeedback.textContent = t("accounts.enter_valid_name", "Bitte einen gültigen Kontonamen eingeben.");
            return;
          }
          await fnRenameAccount(aShareAccountsEndpoints, sId, sLabel);
          elFeedback.textContent = t("accounts.share_renamed", "Aktienkonto umbenannt.");
        } else if (sAction === "delete") {
          try {
            await fnDeleteAccount(aShareAccountsEndpoints, sId);
            elFeedback.textContent = t("accounts.share_deleted", "Aktienkonto gelöscht.");
          } catch (oError) {
            const oDetails = oError?.details || {};
            if (oDetails?.requires_transfer) {
              const sTransferTargetId = await fnAskTransferTargetModal(
                oDetails.transfer_options,
                t("accounts.share_transfer_required", "Dieses Aktienkonto enthält noch Shares. Bitte ein Zielkonto wählen.")
              );
              if (!sTransferTargetId) {
                elFeedback.textContent = t("accounts.transfer_cancelled", "Löschen abgebrochen.");
                return;
              }
              await fnDeleteAccount(aShareAccountsEndpoints, sId, {
                transferTargetId: sTransferTargetId,
                transferField: "transfer_to_share_account_id"
              });
              elFeedback.textContent = t("accounts.share_deleted_with_transfer", "Aktienkonto gelöscht und Shares übertragen.");
            } else {
              throw oError;
            }
          }
        }
        await fnRefresh();
      } catch (oError) {
        elFeedback.textContent = t("accounts.action_failed", "Aktion fehlgeschlagen: {error}", { error: String(oError?.message || oError) });
      }
    });

    elBankList.addEventListener("keydown", async (oEvent) => {
      if (oEvent.key !== "Enter" && oEvent.key !== "Escape") return;
      const elInput = oEvent.target instanceof Element ? oEvent.target.closest(".account-name-input") : null;
      if (!elInput) return;
      const elRow = elInput.closest(".account-row");
      if (!elRow) return;

      if (oEvent.key === "Escape") {
        const elNameLink = elRow.querySelector(".account-name-link");
        elInput.value = elNameLink ? elNameLink.textContent : "";
        elRow.classList.remove("is-renaming");
        const elSaveBtn = elRow.querySelector("button[data-action='save']");
        if (elSaveBtn) { elSaveBtn.textContent = t("accounts.rename", "Umbenennen"); elSaveBtn.dataset.action = "rename"; }
        return;
      }

      oEvent.preventDefault();
      const sId = String(elRow.dataset.accountId || "");
      const sLabel = String(elInput.value || "").trim();
      if (!sId) return;
      if (!sLabel) { elFeedback.textContent = t("accounts.enter_valid_name", "Bitte einen gültigen Kontonamen eingeben."); return; }
      try {
        await fnRenameAccount(aBankAccountsEndpoints, sId, sLabel);
        elFeedback.textContent = t("accounts.bank_renamed", "Bankkonto umbenannt.");
        await fnRefresh();
      } catch (oError) {
        elFeedback.textContent = t("accounts.action_failed", "Aktion fehlgeschlagen: {error}", { error: String(oError?.message || oError) });
      }
    });

    elBankList.addEventListener("click", async (oEvent) => {
      const elButton = oEvent.target instanceof Element ? oEvent.target.closest("button[data-action]") : null;
      if (!elButton) return;
      const elRow = elButton.closest(".account-row");
      if (!elRow) return;

      const sId = String(elRow.dataset.accountId || "");
      const sAction = String(elButton.dataset.action || "");
      if (!sId) return;

      if (sAction === "rename") {
        elRow.classList.add("is-renaming");
        const elInput = elRow.querySelector(".account-name-input");
        if (elInput) { elInput.focus(); elInput.select(); }
        elButton.textContent = t("accounts.save", "Speichern");
        elButton.dataset.action = "save";
        return;
      }

      const sLabel = String(elRow.querySelector(".account-name-input")?.value || "").trim();

      try {
        if (sAction === "save") {
          if (!sLabel) {
            elFeedback.textContent = t("accounts.enter_valid_name", "Bitte einen gültigen Kontonamen eingeben.");
            return;
          }
          await fnRenameAccount(aBankAccountsEndpoints, sId, sLabel);
          elFeedback.textContent = t("accounts.bank_renamed", "Bankkonto umbenannt.");
        } else if (sAction === "delete") {
          try {
            await fnDeleteAccount(aBankAccountsEndpoints, sId);
            elFeedback.textContent = t("accounts.bank_deleted", "Bankkonto gelöscht.");
          } catch (oError) {
            const oDetails = oError?.details || {};
            if (oDetails?.requires_transfer) {
              const sTransferTargetId = await fnAskTransferTargetModal(
                oDetails.transfer_options,
                t("accounts.transfer_target_required", "Dieses Konto enthält noch Guthaben oder verknüpfte Buchungen. Bitte ein Zielkonto wählen.")
              );
              if (!sTransferTargetId) {
                elFeedback.textContent = t("accounts.transfer_cancelled", "Löschen abgebrochen.");
                return;
              }
              await fnDeleteAccount(aBankAccountsEndpoints, sId, {
                transferTargetId: sTransferTargetId,
                transferField: "transfer_to_bank_account_id"
              });
              elFeedback.textContent = t("accounts.bank_deleted_with_transfer", "Bankkonto gelöscht und Guthaben übertragen.");
            } else {
              throw oError;
            }
          }
        }
        await fnRefresh();
      } catch (oError) {
        elFeedback.textContent = t("accounts.action_failed", "Aktion fehlgeschlagen: {error}", { error: String(oError?.message || oError) });
      }
    });

    try {
      await fnRefresh();
    } catch (oError) {
      elFeedback.textContent = t("accounts.load_failed", "Konten konnten nicht geladen werden: {error}", { error: String(oError?.message || oError) });
    }

    // Open account detail on name click
    document.addEventListener("click", async (oEvent) => {
      const elBtn = oEvent.target instanceof Element ? oEvent.target.closest("[data-view-account]") : null;
      if (!elBtn) return;
      const sAccountId = String(elBtn.dataset.viewAccount || "");
      const sViewType = String(elBtn.dataset.viewType || "");
      if (!sAccountId) return;
      await fnOpenAccountDetail(sAccountId, sViewType);
    });
  }

  fnInit();
