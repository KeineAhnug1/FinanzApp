export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}
export const ok = <T>(data: T, extra?: Record<string, string>): Response =>
  jsonResponse({ ok: true, ...((data && typeof data === 'object') ? data : { data }) }, 200, extra);
export const badRequest = (message: string): Response => jsonResponse({ ok: false, message }, 400);
export const unauthorized = (message: string): Response => jsonResponse({ ok: false, message }, 401);
export const forbidden = (message: string): Response => jsonResponse({ ok: false, message }, 403);
export const notFound = (message: string): Response => jsonResponse({ ok: false, message }, 404);
export const conflict = (message: string): Response => jsonResponse({ ok: false, message }, 409);
export const serverError = (message = 'Interner Serverfehler.'): Response => jsonResponse({ ok: false, message }, 500);
