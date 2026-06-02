// @ts-check

/**
 * @typedef {Object} ApiRouteContext
 * @property {import('node:http').IncomingMessage} req
 * @property {import('node:http').ServerResponse} res
 * @property {URL} url
 * @property {string} pathname
 * @property {{ user: { id: string; username: string; email: string } }} session
 * @property {(res: import('node:http').ServerResponse, status: number, payload: unknown, headers?: Record<string,string>) => void} sendJson
 * @property {Record<string, Function>} handlers
 */
