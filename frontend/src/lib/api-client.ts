/** Resolve a path against the API base URL. */
export function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? '';
  if (!base) return path;
  return `${base.replace(/\/$/, '')}${path}`;
}

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

/** Call this after login/logout to clear any cached CSRF state. */
export function invalidateCsrfCache(): void {}
