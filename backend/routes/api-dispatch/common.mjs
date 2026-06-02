// @ts-check

/**
 * @param {string} pathname
 * @param {string} prefix
 * @returns {string | null}
 */
export function parsePathParam(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return null;
  const rawValue = pathname.slice(prefix.length);
  if (!rawValue) return null;
  return decodeURIComponent(rawValue);
}
