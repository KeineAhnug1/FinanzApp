// Gemeinsamer Bestaetigungsdialog fuer kritische Aktionen (z. B. Loeschen).
export function initConfirmModal() {
  const backdrop = document.getElementById("confirm-modal");
  const titleNode = document.getElementById("confirm-title");
  const messageNode = document.getElementById("confirm-message");
  const cancelBtn = document.getElementById("confirm-cancel-btn");
  const okBtn = document.getElementById("confirm-ok-btn");
  if (!backdrop || !titleNode || !messageNode || !cancelBtn || !okBtn) {
    return async () => false;
  }

  let resolver = null;

  const close = (value) => {
    backdrop.hidden = true;
    if (resolver) {
      const fn = resolver;
      resolver = null;
      fn(value);
    }
  };

  cancelBtn.addEventListener("click", () => close(false));
  okBtn.addEventListener("click", () => close(true));
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      close(false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (!backdrop.hidden && event.key === "Escape") {
      close(false);
    }
  });

  return ({ title, message, confirmText }) =>
    new Promise((resolve) => {
      resolver = resolve;
      titleNode.textContent = title;
      messageNode.textContent = message;
      okBtn.textContent = confirmText || "Loeschen";
      backdrop.hidden = false;
      okBtn.focus();
    });
}
