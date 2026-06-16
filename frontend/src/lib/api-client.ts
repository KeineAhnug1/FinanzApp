/**
 * api-client.ts — HTTP client for client-side requests.
 *
 * Migrated from frontend/src/shared/js/api-client.js
 *
 * Features:
 * - CSRF token management (cookie-first, then /api/auth/csrf fallback)
 * - Typed generic responses compatible with TanStack Query
 * - Convenience wrappers: get, post, put, del
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JsonResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status: number;
  /** True when the HTTP response itself was 2xx (regardless of body `ok`). */
  responseOk: boolean;
  /** Value of the Retry-After header when present. */
  retryAfter: number | null;
  /** Network-level error message. */
  message?: string;
}

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ShowToastOptions {
  duration?: number;
}

// ---------------------------------------------------------------------------
// Base URL (set to NEXT_PUBLIC_API_URL so calls hit the Hono Worker)
// ---------------------------------------------------------------------------

/** Resolve a path against the API base URL. */
export function apiUrl(path: string): string {
  // Read at call-time so Next.js static replacement works correctly
  const base = process.env.NEXT_PUBLIC_API_URL ?? '';
  if (!base) return path;
  return `${base.replace(/\/$/, '')}${path}`;
}

/** The configured API base URL (for reference). */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

// ---------------------------------------------------------------------------
// CSRF helpers
// ---------------------------------------------------------------------------

function normalizeHeaders(rawHeaders: HeadersInit = {}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (rawHeaders instanceof Headers) {
    rawHeaders.forEach((value, key) => {
      headers[key] = value;
    });
  } else if (Array.isArray(rawHeaders)) {
    for (const [key, value] of rawHeaders) {
      headers[key as string] = value as string;
    }
  } else {
    for (const [key, value] of Object.entries(rawHeaders as Record<string, string>)) {
      headers[key] = value;
    }
  }
  return headers;
}

/** Read csrf_token from cookie without a network request. */
function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('csrf_token='));
  if (!match) return null;
  try {
    return decodeURIComponent(match.slice('csrf_token='.length));
  } catch {
    return null;
  }
}

/** Read the csrf_token cookie for use in x-csrf-token request headers. */
export function getCsrfToken(): string {
  return getCsrfTokenFromCookie() ?? '';
}

let _csrfCache: string | null = null;

async function getOrFetchCsrfToken(): Promise<string | null> {
  // 1. Try cookie first (no network needed)
  const fromCookie = getCsrfTokenFromCookie();
  if (fromCookie) {
    _csrfCache = fromCookie;
    return fromCookie;
  }
  // 2. Already cached in memory
  if (_csrfCache) return _csrfCache;
  // 3. Only fetch once when cookie isn't set yet (first load)
  try {
    const resp = await fetch(apiUrl('/api/auth/session'), { credentials: 'include' });
    if (resp.ok) {
      const json = await resp.json().catch(() => ({}));
      if (json?.csrf) {
        _csrfCache = json.csrf as string;
        return _csrfCache;
      }
    }
  } catch {
    // ignore network errors
  }
  return null;
}

/** Call this after login/logout to clear the in-memory CSRF cache. */
export function invalidateCsrfCache(): void {
  _csrfCache = null;
}

// ---------------------------------------------------------------------------
// Core request function
// ---------------------------------------------------------------------------

export interface RequestJsonOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export async function requestJson<T = unknown>(
  url: string,
  options: RequestJsonOptions = {},
): Promise<JsonResponse<T>> {
  const resolvedUrl = url.startsWith('http') ? url : apiUrl(url);
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = normalizeHeaders(options.headers as Record<string, string>);

  if (method !== 'GET' && method !== 'HEAD' && !headers['x-csrf-token']) {
    const csrf = await getOrFetchCsrfToken();
    if (csrf) headers['x-csrf-token'] = csrf;
  }

  let body: BodyInit | null | undefined = undefined;

  if (options.body !== undefined && options.body !== null) {
    if (typeof options.body === 'string') {
      body = options.body;
    } else {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      body = JSON.stringify(options.body);
    }
  }

  const requestInit: RequestInit = {
    credentials: options.credentials ?? 'include',
    ...options,
    method,
    headers,
    body,
  };

  try {
    const response = await fetch(resolvedUrl, requestInit);
    const raw = await response.text();
    let data: T | Record<string, unknown> = {};
    try {
      data = raw ? (JSON.parse(raw) as T) : {};
    } catch {
      data = {};
    }

    return {
      ok: response.ok &&
        (Array.isArray(data) || typeof data !== 'object' || data === null
          ? true
          : Boolean((data as Record<string, unknown>)?.ok)),
      status: response.status,
      responseOk: response.ok,
      retryAfter: response.headers.has('Retry-After')
        ? Number(response.headers.get('Retry-After'))
        : null,
      data: data as T,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      responseOk: false,
      data: undefined,
      retryAfter: null,
      message: 'Server nicht erreichbar.',
    };
  }
}

/**
 * Like `requestJson` but merges the response data fields with `ok` / `status`
 * / `responseOk` for convenience — mirrors `requestJsonMerged` in the legacy client.
 */
export async function requestJsonMerged<T = Record<string, unknown>>(
  url: string,
  options: RequestJsonOptions = {},
): Promise<T & { ok: boolean; status: number; responseOk: boolean }> {
  const result = await requestJson<T>(url, options);
  return {
    ...(result.data as T),
    ok: result.ok,
    status: result.status,
    responseOk: result.responseOk,
  };
}

// ---------------------------------------------------------------------------
// Typed convenience wrappers
// ---------------------------------------------------------------------------

export async function get<T = unknown>(
  url: string,
  options?: Omit<RequestJsonOptions, 'method'>,
): Promise<JsonResponse<T>> {
  return requestJson<T>(url, { ...options, method: 'GET' });
}

export async function post<T = unknown>(
  url: string,
  body?: unknown,
  options?: Omit<RequestJsonOptions, 'method' | 'body'>,
): Promise<JsonResponse<T>> {
  return requestJson<T>(url, { ...options, method: 'POST', body });
}

export async function put<T = unknown>(
  url: string,
  body?: unknown,
  options?: Omit<RequestJsonOptions, 'method' | 'body'>,
): Promise<JsonResponse<T>> {
  return requestJson<T>(url, { ...options, method: 'PUT', body });
}

export async function del<T = unknown>(
  url: string,
  options?: Omit<RequestJsonOptions, 'method'>,
): Promise<JsonResponse<T>> {
  return requestJson<T>(url, { ...options, method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Toast notifications (client-only)
// ---------------------------------------------------------------------------

const DURATION: Record<ToastType, number> = {
  success: 3200,
  error: 5000,
  warning: 4000,
  info: 3200,
};

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error: '✕',
  warning: '!',
  info: 'i',
};

let _toastRegion: HTMLDivElement | null = null;

function getRegion(): HTMLDivElement {
  if (_toastRegion?.isConnected) return _toastRegion;
  _toastRegion = document.createElement('div');
  _toastRegion.className = 'toast-region';
  _toastRegion.setAttribute('aria-live', 'polite');
  _toastRegion.setAttribute('aria-atomic', 'false');
  document.body.appendChild(_toastRegion);
  return _toastRegion;
}

function dismissToast(toast: HTMLDivElement): void {
  if (!toast.isConnected) return;
  toast.classList.add('is-exiting');
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
  setTimeout(() => toast.remove(), 250);
}

export function showToast(
  message: string,
  type: ToastType = 'info',
  opts: ShowToastOptions = {},
): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;
  const region = getRegion();
  const toast = document.createElement('div');
  toast.className = `toast is-${type}`;
  toast.setAttribute('role', 'status');

  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = ICONS[type] ?? 'i';

  const text = document.createElement('span');
  text.textContent = message;

  toast.append(icon, text);
  region.appendChild(toast);

  const timer = setTimeout(
    () => dismissToast(toast),
    opts.duration ?? DURATION[type] ?? 3200,
  );
  toast.addEventListener('click', () => {
    clearTimeout(timer);
    dismissToast(toast);
  });
  return toast;
}

export const toastSuccess = (m: string, o?: ShowToastOptions): HTMLDivElement | null =>
  showToast(m, 'success', o);
export const toastError = (m: string, o?: ShowToastOptions): HTMLDivElement | null =>
  showToast(m, 'error', o);
export const toastWarning = (m: string, o?: ShowToastOptions): HTMLDivElement | null =>
  showToast(m, 'warning', o);
export const toastInfo = (m: string, o?: ShowToastOptions): HTMLDivElement | null =>
  showToast(m, 'info', o);

// ---------------------------------------------------------------------------
// Global unhandled rejection → toast (client-only)
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason as Error | undefined;
    if (reason && reason.name === 'AbortError') return;
    const msg =
      (reason && (reason.message || String(reason))) ||
      'Ein unerwarteter Fehler ist aufgetreten.';
    toastError(msg);
  });
}
