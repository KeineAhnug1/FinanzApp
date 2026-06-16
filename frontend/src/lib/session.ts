/**
 * session.ts — Client-side session utilities (SSR-safe).
 *
 * Migrated from frontend/src/shared/js/session-utils.js
 *
 * User data is stored in sessionStorage so it is cleared automatically
 * when the browser tab is closed.
 */

import { invalidateCsrfCache, apiUrl } from './api-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClientUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  /** URL or base64 of the profile image. */
  profile_image?: string;
  income?: number;
  age?: number;
}

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

const USER_STORAGE_KEY = 'finanzapp.currentUser';

// ---------------------------------------------------------------------------
// SSR guard
// ---------------------------------------------------------------------------

const isBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';

// ---------------------------------------------------------------------------
// Initials helper
// ---------------------------------------------------------------------------

/**
 * Derive initials from a user object.
 *
 * @example
 * initialsFromUser({ first_name: 'Jane', last_name: 'Doe' }) // "JD"
 * initialsFromUser({ username: 'jdoe' })                     // "J"
 */
export function initialsFromUser(user: Partial<ClientUser>): string {
  const first = String(user?.first_name || user?.username || 'U')
    .charAt(0)
    .toUpperCase();
  const last = String(user?.last_name || '')
    .charAt(0)
    .toUpperCase();
  return `${first}${last}`.trim() || 'U';
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

/**
 * Read the stored user from sessionStorage.
 * Returns `null` on the server or when nothing is stored.
 */
export function getStoredUser(): ClientUser | null {
  if (!isBrowser()) return null;
  const raw = window.sessionStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ClientUser;
  } catch {
    return null;
  }
}

/** Alias kept for parity with legacy `getCurrentUserFromStorage`. */
export const getCurrentUserFromStorage = getStoredUser;

/**
 * Merge `user` into the current stored user and persist the result.
 * Returns the merged user, or `null` when called on the server.
 */
export function storeUser(user: Partial<ClientUser>): ClientUser | null {
  if (!isBrowser() || !user) return null;
  const current = getStoredUser() ?? ({} as Partial<ClientUser>);
  const merged = { ...current, ...user } as ClientUser;
  window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

/** Alias kept for parity with legacy `setCurrentUserInStorage`. */
export const setCurrentUserInStorage = storeUser;

/**
 * Remove the stored user from sessionStorage.
 * No-op on the server.
 */
export function clearUser(): void {
  if (!isBrowser()) return;
  window.sessionStorage.removeItem(USER_STORAGE_KEY);
}

/** Alias kept for parity with legacy `clearCurrentUserFromStorage`. */
export const clearCurrentUserFromStorage = clearUser;

// ---------------------------------------------------------------------------
// Session fetch
// ---------------------------------------------------------------------------

/**
 * Fetch the current session user from the server.
 * Throws if the session is invalid or unreachable.
 */
export async function fetchSessionUser(): Promise<ClientUser> {
  const response = await fetch(apiUrl('/api/auth/session'), { credentials: 'include' });
  const payload = (await response.json()) as {
    ok?: boolean;
    session_user?: ClientUser;
    message?: string;
  };
  if (!response.ok || !payload?.ok || !payload?.session_user) {
    throw new Error(payload?.message ?? 'Session konnte nicht geladen werden.');
  }
  return payload.session_user;
}

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

/**
 * Invalidate the CSRF cache, POST to `/api/logout`, clear the stored user
 * and redirect to `/`.
 */
export async function logoutAndRedirect(): Promise<void> {
  invalidateCsrfCache();
  try {
    await fetch(apiUrl('/api/auth/logout'), { method: 'POST', credentials: 'include' });
  } catch {
    // no-op — redirect regardless
  }
  clearUser();
  if (isBrowser()) {
    window.location.assign('/');
  }
}
