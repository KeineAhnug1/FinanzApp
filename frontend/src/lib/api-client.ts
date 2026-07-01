/** Resolve a path against the API base URL. */
export function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? '';
  if (!base) return path;
  return `${base.replace(/\/$/, '')}${path}`;
}

// CSRF-Token wird sowohl als Cookie gesetzt als auch im /api/auth/session-
// JSON-Body zurückgegeben. Wenn Frontend und Backend auf verschiedenen Parent-
// Domains laufen (z.B. *.pages.dev vs. *.workers.dev), darf das Frontend-JS
// den Cookie nicht über document.cookie lesen — der Browser schickt ihn aber
// trotzdem mit jeder Anfrage mit. Deshalb cachen wir den Token zusätzlich in
// einem Modul-globalen Speicher, sobald wir ihn aus einer JSON-Response sehen.
let cachedCsrfToken: string | null = null;

function readCsrfTokenFromCookie(): string | null {
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

/** Module-internal — call when we see a fresh CSRF token in an API response. */
export function rememberCsrfToken(token: string | null | undefined): void {
  if (typeof token === 'string' && token.length > 0) {
    cachedCsrfToken = token;
  }
}

/** Read the csrf_token for use in x-csrf-token request headers.
 * Prefers the in-memory cache (set from JSON responses), falls back to the
 * document.cookie reading (same-origin / same-site deployments). */
export function getCsrfToken(): string {
  if (cachedCsrfToken) return cachedCsrfToken;
  const fromCookie = readCsrfTokenFromCookie();
  if (fromCookie) {
    cachedCsrfToken = fromCookie;
    return fromCookie;
  }
  return '';
}

/** Call this after login/logout to clear any cached CSRF state. */
export function invalidateCsrfCache(): void {
  cachedCsrfToken = null;
}

/**
 * Read a response body as JSON, defending against backend errors that return
 * HTML/empty/garbled bodies (5xx, edge runtime crash, etc.). Always returns
 * a parsed object; falls back to `{ ok: false, message: ... }` if JSON parse
 * fails. Callers can rely on `result.ok` even when the network misbehaves.
 *
 * Return type is `any` so existing call sites (`result.entries`, `result.accounts`,
 * etc.) stay ergonomic — the helper exists for runtime safety, not stricter typing.
 *
 * IMPORTANT: This helper does NOT throw on HTTP errors. Use `safeJsonOrThrow`
 * for list/data fetches that should propagate failures to React Query's
 * `isError` state instead of silently returning an empty list.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function safeJson(res: Response): Promise<any> {
  try {
    const parsed = await res.json();
    if (parsed && typeof parsed === 'object') {
      // Backend-Endpoints wie /api/auth/session und /api/auth/login geben
      // den CSRF-Token im Body als `csrf`-Feld zurück. Cachen, damit
      // mutierende Requests den x-csrf-token-Header setzen können — gerade
      // dann wichtig, wenn Frontend & Backend auf verschiedenen Parent-
      // Domains laufen und document.cookie den Cookie nicht sieht.
      if (typeof (parsed as { csrf?: unknown }).csrf === 'string') {
        rememberCsrfToken((parsed as { csrf: string }).csrf);
      }
      return parsed;
    }
    return { ok: false, message: `Unerwartete Antwort (HTTP ${res.status})` };
  } catch {
    return { ok: false, message: `Serverfehler (HTTP ${res.status})` };
  }
}

/**
 * Variant of `safeJson` that throws on HTTP error or `{ok: false}` body, so
 * list/data fetches surface errors to React Query's `isError` instead of
 * silently showing empty lists. Throws an Error with the backend's message
 * (or a generic message on parse failure).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function safeJsonOrThrow(res: Response): Promise<any> {
  const parsed = await safeJson(res);
  if (!res.ok || (parsed && parsed.ok === false)) {
    throw new Error(parsed?.message ?? `Serverfehler (HTTP ${res.status})`);
  }
  return parsed;
}
