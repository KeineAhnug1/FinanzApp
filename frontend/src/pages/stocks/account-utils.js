export function buildUrlWithQuery(endpoint, params = {}) {
  const url = new URL(endpoint, window.location.origin);
  Object.entries(params).forEach(([key, value]) => {
    const trimmedValue = String(value || "").trim();
    if (!trimmedValue) return;
    url.searchParams.set(key, trimmedValue);
  });
  return url;
}

export function mapApiAccounts(rawAccounts, fallbackPrefix) {
  return (Array.isArray(rawAccounts) ? rawAccounts : [])
    .map((account, index) => {
      const id = String(account?.id || "").trim();
      if (!id) return null;
      const labelRaw = String(account?.label || account?.name || "").trim();
      return {
        id,
        label: labelRaw || `${fallbackPrefix} ${index + 1}`,
      };
    })
    .filter(Boolean);
}

export async function loadAccountsByEndpoints(endpoints, fallbackPrefix, options = {}) {
  const warnHttp = Boolean(options.warnHttp);
  const warnPrefix = String(options.warnPrefix || "").trim();

  for (const endpoint of endpoints || []) {
    try {
      const url = buildUrlWithQuery(endpoint);
      const response = await fetch(url.toString());
      if (!response.ok) {
        if (warnHttp) {
          console.warn(`${warnPrefix} Backend Fehler (${endpoint}): HTTP ${response.status}.`);
        }
        continue;
      }
      const data = await response.json();
      return mapApiAccounts(data?.accounts, fallbackPrefix);
    } catch (error) {
      if (warnPrefix) {
        console.warn(`${warnPrefix} Backend nicht erreichbar (${endpoint}).`, error);
      }
    }
  }

  return [];
}
