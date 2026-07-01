import { describe, expect, it } from 'vitest';
import { checkCsrf } from '../csrf';

function makeRequest(headers: Record<string, string>): Request {
  return new Request('http://test.local/', { method: 'POST', headers });
}

async function parseBody(res: Response): Promise<{ ok: boolean; message: string }> {
  return (await res.json()) as { ok: boolean; message: string };
}

describe('checkCsrf', () => {
  it('returns a 403 Response when neither cookie nor header is present', async () => {
    const result = await checkCsrf(makeRequest({}));
    expect(result).toBeInstanceOf(Response);
    expect(result?.status).toBe(403);
    const body = await parseBody(result as Response);
    expect(body.ok).toBe(false);
    expect(body.message).toBe('CSRF-Token fehlt.');
  });

  it('returns 403 when header is present but cookie is missing', async () => {
    const result = await checkCsrf(makeRequest({ 'x-csrf-token': 'abc' }));
    expect(result?.status).toBe(403);
    expect((await parseBody(result as Response)).message).toBe('CSRF-Token fehlt.');
  });

  it('returns 403 when cookie is present but header is missing', async () => {
    const result = await checkCsrf(makeRequest({ cookie: 'csrf_token=abc' }));
    expect(result?.status).toBe(403);
    expect((await parseBody(result as Response)).message).toBe('CSRF-Token fehlt.');
  });

  it('returns 403 with "Ungültiger CSRF-Token" when cookie and header mismatch', async () => {
    const result = await checkCsrf(
      makeRequest({ cookie: 'csrf_token=abc', 'x-csrf-token': 'xyz' }),
    );
    expect(result?.status).toBe(403);
    expect((await parseBody(result as Response)).message).toBe('Ungültiger CSRF-Token.');
  });

  it('returns 403 when the two tokens differ only by length (prefix attack)', async () => {
    const result = await checkCsrf(
      makeRequest({ cookie: 'csrf_token=abc', 'x-csrf-token': 'abcd' }),
    );
    expect(result?.status).toBe(403);
    expect((await parseBody(result as Response)).message).toBe('Ungültiger CSRF-Token.');
  });

  it('returns null when cookie and header tokens match', async () => {
    const token = 'a1b2c3d4e5f6';
    const result = await checkCsrf(
      makeRequest({ cookie: `csrf_token=${token}`, 'x-csrf-token': token }),
    );
    expect(result).toBeNull();
  });

  it('returns null when the cookie contains additional pairs around csrf_token', async () => {
    const token = 'shared-token-value';
    const result = await checkCsrf(
      makeRequest({
        cookie: `session=foo; csrf_token=${token}; theme=dark`,
        'x-csrf-token': token,
      }),
    );
    expect(result).toBeNull();
  });

  it('decodes URI-encoded cookie values before comparing', async () => {
    const raw = 'tok with spaces';
    const result = await checkCsrf(
      makeRequest({
        cookie: `csrf_token=${encodeURIComponent(raw)}`,
        'x-csrf-token': raw,
      }),
    );
    expect(result).toBeNull();
  });

  it('returns a JSON Content-Type on the 403 response', async () => {
    const result = await checkCsrf(makeRequest({}));
    expect(result?.headers.get('Content-Type')).toBe('application/json; charset=utf-8');
  });

  it('treats an empty x-csrf-token header as missing', async () => {
    const result = await checkCsrf(
      makeRequest({ cookie: 'csrf_token=abc', 'x-csrf-token': '' }),
    );
    expect(result?.status).toBe(403);
    expect((await parseBody(result as Response)).message).toBe('CSRF-Token fehlt.');
  });
});
