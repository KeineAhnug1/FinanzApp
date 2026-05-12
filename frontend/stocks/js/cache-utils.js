export function toBase64Utf8(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  const chunkSize = 32768;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export function cacheKey(payload) {
  return `td_cache_${toBase64Utf8(JSON.stringify(payload || {}))}`;
}

export function cacheRead(storageKey, ttlMs) {
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || !("data" in parsed)) return null;
    if (Date.now() - parsed.ts > Number(ttlMs || 0)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function cacheWrite(storageKey, data) {
  window.localStorage.setItem(storageKey, JSON.stringify({ ts: Date.now(), data }));
}

