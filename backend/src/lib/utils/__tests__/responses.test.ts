import { describe, expect, it } from 'vitest';
import {
  badRequest,
  conflict,
  forbidden,
  jsonResponse,
  notFound,
  ok,
  serverError,
  unauthorized,
} from '../responses';

const readJson = async <T>(res: Response): Promise<T> => (await res.json()) as T;

describe('jsonResponse', () => {
  it('serializes the body as JSON with the default status and content-type', async () => {
    const res = jsonResponse({ hello: 'world' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await readJson<{ hello: string }>(res)).toEqual({ hello: 'world' });
  });

  it('honors a custom status code and merges extra headers', async () => {
    const res = jsonResponse({ x: 1 }, 418, { 'x-extra': 'teapot' });
    expect(res.status).toBe(418);
    expect(res.headers.get('x-extra')).toBe('teapot');
    expect(await readJson<{ x: number }>(res)).toEqual({ x: 1 });
  });
});

describe('ok', () => {
  it('spreads object payloads alongside ok: true', async () => {
    const res = ok({ id: 'a', count: 2 });
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, id: 'a', count: 2 });
  });

  it('wraps non-object payloads under a data field', async () => {
    const res = ok('hi');
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, data: 'hi' });
  });

  it('forwards extra headers to the response', () => {
    const res = ok({ id: 1 }, { 'set-cookie': 'session=abc' });
    expect(res.headers.get('set-cookie')).toBe('session=abc');
  });
});

describe.each([
  ['badRequest', badRequest, 400],
  ['unauthorized', unauthorized, 401],
  ['forbidden', forbidden, 403],
  ['notFound', notFound, 404],
  ['conflict', conflict, 409],
] as const)('%s', (_name, helper, status) => {
  it(`returns a ${status} JSON envelope`, async () => {
    const res = helper('boom');
    expect(res.status).toBe(status);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(await readJson(res)).toEqual({ ok: false, message: 'boom' });
  });
});

describe('serverError', () => {
  it('defaults to a German fallback message with status 500', async () => {
    const res = serverError();
    expect(res.status).toBe(500);
    expect(await readJson<{ ok: boolean; message: string }>(res)).toEqual({
      ok: false,
      message: 'Interner Serverfehler.',
    });
  });

  it('accepts a custom message', async () => {
    const res = serverError('db down');
    expect(res.status).toBe(500);
    expect(await readJson(res)).toEqual({ ok: false, message: 'db down' });
  });
});
