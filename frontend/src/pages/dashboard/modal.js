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
  let triggerElement = null;

  const handleKeydown = (event) => {
    if (event.key === "Escape") {
      close(false);
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [...backdrop.querySelectorAll("button:not([disabled])")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey) {
      if (document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const close = (value) => {
    backdrop.hidden = true;
    document.removeEventListener("keydown", handleKeydown);
    if (resolver) {
      const fn = resolver;
      resolver = null;
      fn(value);
    }
    if (triggerElement) {
      triggerElement.focus();
      triggerElement = null;
    }
  };

  cancelBtn.addEventListener("click", () => close(false));
  okBtn.addEventListener("click", () => close(true));
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      close(false);
    }
  });

  return ({ title, message, confirmText, trigger } = {}) =>
    new Promise((resolve) => {
      triggerElement = trigger ?? document.activeElement;
      resolver = resolve;
      titleNode.textContent = title;
      messageNode.textContent = message;
      okBtn.textContent = confirmText || "Loeschen";
      backdrop.hidden = false;
      document.addEventListener("keydown", handleKeydown);
      okBtn.focus();
    });
}
