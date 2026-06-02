// @ts-check
import http from "node:http";

/**
 * @typedef {Object} ApiRouteContext
 * @property {http.IncomingMessage} req
 * @property {http.ServerResponse} res
 * @property {URL} url
 * @property {string} pathname
 * @property {{ user: { id: string; username: string; email: string } }} session
 * @property {(res: http.ServerResponse, status: number, payload: unknown, headers?: Record<string,string>) => void} sendJson
 * @property {Record<string, Function>} handlers
 */
