(() => {
  const aShareAccountsEndpoints = [
    "/api/share-accounts"
  ];
  const aBankAccountsEndpoints = [
    "/api/bank-accounts"
  ];

  let aShareAccounts = [];
  let aBankAccounts = [];

  function t(key, fallback, params = {}) {
    const translated = window.FinanzAppLanguage?.t?.(key, params);
    if (translated && translated !== key) return translated;
    if (!params || !Object.keys(params).length) return fallback;
    return String(fallback || "").replaceAll(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
  }

  function fnEscapeHtml(sValue) {
    return String(sValue || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
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
    try {
      if (window.FinanzAppCurrency?.formatFromEur) {
        return window.FinanzAppCurrency.formatFromEur(amount, { locale: "de-DE", currency: "EUR" });
      }
      return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(amount);
    } catch {
      return `${amount.toFixed(2)} EUR`;
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

  async function fnDeleteAccount(aEndpoints, sAccountId, sTransferTargetId = "") {
    const aUrl = aEndpoints.map((sEndpoint) => `${sEndpoint}/${encodeURIComponent(sAccountId)}`);
    const oInit = { method: "DELETE" };
    if (sTransferTargetId) {
      oInit.headers = { "Content-Type": "application/json" };
      oInit.body = JSON.stringify({ transfer_to_bank_account_id: sTransferTargetId });
    }
    await fnApiRequest(aUrl, oInit);
  }

  function fnAskTransferTargetModal(aOptions) {
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

    elMessage.textContent = t(
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

    elShareList.addEventListener("click", async (oEvent) => {
      const elButton = oEvent.target instanceof Element ? oEvent.target.closest("button[data-action]") : null;
      if (!elButton) return;
      const elRow = elButton.closest(".account-row");
      if (!elRow) return;

      const sId = String(elRow.dataset.accountId || "");
      const sAction = String(elButton.dataset.action || "");
      const sLabel = String(elRow.querySelector(".account-name-input")?.value || "").trim();
      if (!sId) return;

      try {
        if (sAction === "rename") {
          if (!sLabel) {
            elFeedback.textContent = t("accounts.enter_valid_name", "Bitte einen gültigen Kontonamen eingeben.");
            return;
          }
          await fnRenameAccount(aShareAccountsEndpoints, sId, sLabel);
          elFeedback.textContent = t("accounts.share_renamed", "Aktienkonto umbenannt.");
        } else if (sAction === "delete") {
          await fnDeleteAccount(aShareAccountsEndpoints, sId);
          elFeedback.textContent = t("accounts.share_deleted", "Aktienkonto gelöscht.");
        }
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
      const sLabel = String(elRow.querySelector(".account-name-input")?.value || "").trim();
      if (!sId) return;

      try {
        if (sAction === "rename") {
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
              const sTransferTargetId = await fnAskTransferTargetModal(oDetails.transfer_options);
              if (!sTransferTargetId) {
                elFeedback.textContent = t("accounts.transfer_cancelled", "Löschen abgebrochen.");
                return;
              }
              await fnDeleteAccount(aBankAccountsEndpoints, sId, sTransferTargetId);
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
  }

  fnInit();
})();
