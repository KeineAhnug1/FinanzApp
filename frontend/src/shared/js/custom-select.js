/**
 * Ersetzt ein <select>-Element durch ein custom dropdown.
 * Das Popup wird ans <body> gehängt und per getBoundingClientRect positioniert,
 * sodass kein overflow:hidden / transform / stacking-context-Problem auftreten kann.
 *
 * Gibt ein Objekt zurück mit:
 *   .value   — aktuell gewählter Wert
 *   .setOptions([ {value, label} ]) — Optionen neu setzen
 *   .setValue(v) — Wert programmatisch setzen
 *   .onChange(fn) — Callback wenn Nutzer Wert wählt
 */
export function initCustomSelect(selectEl) {
  if (!selectEl) return null;

  // Verstecke das Original
  selectEl.style.display = "none";

  // State
  let options = Array.from(selectEl.options).map((o) => ({ value: o.value, label: o.text }));
  let currentValue = selectEl.value || (options[0]?.value ?? "");
  let changeHandlers = [];
  let isOpen = false;
  let popupEl = null;

  // Wrapper + Button bauen
  const wrapper = document.createElement("div");
  wrapper.className = "csel-wrap";
  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.appendChild(selectEl);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "csel-btn";
  wrapper.appendChild(btn);

  function labelFor(v) {
    return options.find((o) => o.value === v)?.label ?? v;
  }

  function updateBtn() {
    btn.textContent = labelFor(currentValue);
  }
  updateBtn();

  function closePopup() {
    if (!popupEl) return;
    popupEl.remove();
    popupEl = null;
    isOpen = false;
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
  }

  function openPopup() {
    if (isOpen) { closePopup(); return; }
    isOpen = true;

    popupEl = document.createElement("div");
    popupEl.className = "csel-popup";

    options.forEach((opt) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "csel-item" + (opt.value === currentValue ? " is-active" : "");
      item.textContent = opt.label;
      item.dataset.value = opt.value;
      item.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        currentValue = opt.value;
        selectEl.value = currentValue;
        updateBtn();
        closePopup();
        changeHandlers.forEach((fn) => fn(currentValue));
      });
      popupEl.appendChild(item);
    });

    document.body.appendChild(popupEl);
    positionPopup();

    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
  }

  function positionPopup() {
    const rect = btn.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const scrollX = window.scrollX || document.documentElement.scrollLeft;
    const popupH = popupEl.offsetHeight || 200;
    const spaceBelow = window.innerHeight - rect.bottom;

    popupEl.style.position = "absolute";
    popupEl.style.minWidth = rect.width + "px";
    popupEl.style.left = (rect.left + scrollX) + "px";

    if (spaceBelow < popupH && rect.top > popupH) {
      popupEl.style.top = (rect.top + scrollY - popupH) + "px";
    } else {
      popupEl.style.top = (rect.bottom + scrollY + 2) + "px";
    }
  }

  function onOutside(e) {
    if (!popupEl) return;
    if (!popupEl.contains(e.target) && e.target !== btn) {
      closePopup();
    }
  }

  function onKey(e) {
    if (e.key === "Escape") closePopup();
  }

  btn.addEventListener("click", openPopup);

  // API
  return {
    get value() { return currentValue; },
    setOptions(newOptions) {
      options = newOptions;
      if (!options.find((o) => o.value === currentValue)) {
        currentValue = options[0]?.value ?? "";
      }
      updateBtn();
    },
    setValue(v) {
      currentValue = v;
      selectEl.value = v;
      updateBtn();
    },
    onChange(fn) {
      changeHandlers.push(fn);
    },
  };
}
