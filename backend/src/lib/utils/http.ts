// ---------------------------------------------------------------------------
// Cookie parsing
// ---------------------------------------------------------------------------

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const name = part.slice(0, idx).trim();
    try {
      result[name] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      result[name] = part.slice(idx + 1).trim();
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------

export async function parseBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return (await request.json()) as T;
    } catch {
      return {} as T;
    }
  }
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const formData = await request.formData().catch(() => new FormData());
    const obj: Record<string, unknown> = {};
    formData.forEach((value, key) => {
      obj[key] = value;
    });
    return obj as T;
  }
  return {} as T;
}

// ---------------------------------------------------------------------------
// Is the request HTTPS?
// ---------------------------------------------------------------------------

export function isSecure(request: Request): boolean {
  return (
    request.url.startsWith('https://') ||
    request.headers.get('x-forwarded-proto') === 'https' ||
    request.headers.get('cf-visitor')?.includes('"scheme":"https"') === true
  );
}
