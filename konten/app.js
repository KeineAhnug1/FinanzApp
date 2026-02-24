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

  function fnMapAccounts(aRaw, sFallbackPrefix) {
    return (Array.isArray(aRaw) ? aRaw : [])
      .map((oAccount, iIndex) => {
        const sId = String(oAccount?.id || "").trim();
        if (!sId) return null;
        const sLabel = String(oAccount?.label || oAccount?.name || "").trim() || `${sFallbackPrefix} ${iIndex + 1}`;
        return { id: sId, label: sLabel };
      })
      .filter(Boolean);
  }

  async function fnApiRequest(aEndpoints, oInit = {}) {
    let sLastError = t("accounts.endpoint_unreachable", "Kein Endpoint erreichbar");
    for (const sEndpoint of aEndpoints) {
      try {
        const oResponse = await fetch(sEndpoint, oInit);
        if (!oResponse.ok) {
          let sMessage = `HTTP ${oResponse.status}`;
          try {
            const oData = await oResponse.json();
            sMessage = String(oData?.message || sMessage);
          } catch {
            // noop
          }
          sLastError = sMessage;
          continue;
        }
        return await oResponse.json();
      } catch (oError) {
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
        <button class="action" data-action="rename">${t("accounts.rename", "Umbenennen")}</button>
        <button class="action" data-action="delete">${t("accounts.delete", "Löschen")}</button>
      </div>
    `).join("");
  }

  async function fnLoadShareAccounts() {
    const oData = await fnApiRequest(aShareAccountsEndpoints);
    aShareAccounts = fnMapAccounts(oData?.accounts, t("accounts.share_account_fallback", "Aktienkonto"));
  }

  async function fnLoadBankAccounts() {
    const oData = await fnApiRequest(aBankAccountsEndpoints);
    aBankAccounts = fnMapAccounts(oData?.accounts, t("accounts.bank_account_fallback", "Bankkonto"));
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

  async function fnDeleteAccount(aEndpoints, sAccountId) {
    const aUrl = aEndpoints.map((sEndpoint) => `${sEndpoint}/${encodeURIComponent(sAccountId)}`);
    await fnApiRequest(aUrl, { method: "DELETE" });
  }

  async function fnInit() {
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
          await fnDeleteAccount(aBankAccountsEndpoints, sId);
          elFeedback.textContent = t("accounts.bank_deleted", "Bankkonto gelöscht.");
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
