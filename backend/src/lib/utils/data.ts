export function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}
