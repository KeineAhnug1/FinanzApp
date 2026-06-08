// @ts-check

/**
 * @typedef {Object} ApiRouteContext
 * @property {Request} request
 * @property {URL} url
 * @property {string} pathname
 * @property {{ user: { id: string; username: string; email: string } }} session
 * @property {Record<string, Function>} handlers
 */
