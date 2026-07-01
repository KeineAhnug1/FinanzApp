import { apiUrl, getCsrfToken, safeJson } from '@/lib/api-client';

export async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(apiUrl(url), { credentials: 'include', ...options });
  return safeJson(res);
}

export function formatMoney(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

export function csrfHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-csrf-token': getCsrfToken() };
}
