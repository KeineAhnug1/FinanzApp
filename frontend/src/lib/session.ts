import { invalidateCsrfCache, apiUrl } from './api-client';

export interface ClientUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  profile_image?: string;
  income?: number;
  age?: number;
}

const USER_STORAGE_KEY = 'finanzapp.currentUser';

const isBrowser = (): boolean =>
  typeof window !== 'undefined' && typeof sessionStorage !== 'undefined';

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

export function storeUser(user: Partial<ClientUser>): ClientUser | null {
  if (!isBrowser() || !user) return null;
  const current = getStoredUser() ?? ({} as Partial<ClientUser>);
  const merged = { ...current, ...user } as ClientUser;
  window.sessionStorage.setItem(USER_STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function clearUser(): void {
  if (!isBrowser()) return;
  window.sessionStorage.removeItem(USER_STORAGE_KEY);
}

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
