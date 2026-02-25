export function parsePathParam(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return null;
  const rawValue = pathname.slice(prefix.length);
  if (!rawValue) return null;
  return decodeURIComponent(rawValue);
}
