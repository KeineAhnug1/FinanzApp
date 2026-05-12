function normalizeHeaders(rawHeaders = {}) {
  const headers = {};
  for (const [key, value] of Object.entries(rawHeaders || {})) {
    headers[key] = value;
  }
  return headers;
}

export async function requestJson(url, options = {}) {
  const method = options.method || "GET";
  const headers = normalizeHeaders(options.headers);
  const requestInit = {
    credentials: options.credentials || "same-origin",
    ...options,
    method,
    headers
  };

  if (options.body !== undefined && options.body !== null && typeof options.body !== "string") {
    if (!requestInit.headers["Content-Type"]) {
      requestInit.headers["Content-Type"] = "application/json";
    }
    requestInit.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, requestInit);
    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {};
    }

    return {
      ok: response.ok && Boolean(data?.ok),
      status: response.status,
      responseOk: response.ok,
      retryAfter: response.headers.has("Retry-After") ? Number(response.headers.get("Retry-After")) : null,
      data
    };
  } catch {
    return {
      ok: false,
      status: 0,
      responseOk: false,
      data: {},
      message: "Server nicht erreichbar."
    };
  }
}

export async function requestJsonMerged(url, options = {}) {
  const result = await requestJson(url, options);
  return { ...result.data, ok: result.ok, status: result.status, responseOk: result.responseOk };
}

const DURATION = { success: 3200, error: 5000, warning: 4000, info: 3200 };
const ICONS    = { success: "✓",  error: "✕",  warning: "!",  info: "i"  };
let region = null;

function getRegion() {
  if (region?.isConnected) return region;
  region = document.createElement("div");
  region.className = "toast-region";
  region.setAttribute("aria-live", "polite");
  region.setAttribute("aria-atomic", "false");
  document.body.appendChild(region);
  return region;
}

function dismiss(toast) {
  if (!toast.isConnected) return;
  toast.classList.add("is-exiting");
  toast.addEventListener("animationend", () => toast.remove(), { once: true });
  setTimeout(() => toast.remove(), 250);
}

export function showToast(message, type = "info", opts = {}) {
  const r = getRegion();
  const toast = document.createElement("div");
  toast.className = `toast is-${type}`;
  toast.setAttribute("role", "status");

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = ICONS[type] || "i";

  const text = document.createElement("span");
  text.textContent = message;

  toast.append(icon, text);
  r.appendChild(toast);

  const timer = setTimeout(() => dismiss(toast), opts.duration ?? DURATION[type] ?? 3200);
  toast.addEventListener("click", () => { clearTimeout(timer); dismiss(toast); });
  return toast;
}

export const toastSuccess = (m, o) => showToast(m, "success", o);
export const toastError = (m, o) => showToast(m, "error", o);
export const toastWarning = (m, o) => showToast(m, "warning", o);
export const toastInfo = (m, o) => showToast(m, "info", o);

window.FinanzAppApi = {
  requestJson,
  requestJsonMerged
};

window.FinanzAppToast = {
  show: showToast,
  success: toastSuccess,
  error: toastError,
  warning: toastWarning,
  info: toastInfo
};

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  if (reason && reason.name === "AbortError") return;
  const msg = (reason && (reason.message || String(reason))) || "Ein unerwarteter Fehler ist aufgetreten.";
  window.FinanzAppToast?.error(msg);
});
