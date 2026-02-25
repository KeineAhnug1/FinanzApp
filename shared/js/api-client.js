(function initFinanzAppApiClient() {
  function normalizeHeaders(rawHeaders = {}) {
    const headers = {};
    for (const [key, value] of Object.entries(rawHeaders || {})) {
      headers[key] = value;
    }
    return headers;
  }

  async function requestJson(url, options = {}) {
    const method = options.method || "GET";
    const headers = normalizeHeaders(options.headers);
    const requestInit = {
      credentials: options.credentials || "same-origin",
      ...options,
      method,
      headers
    };

    if (options.body !== undefined && options.body !== null && typeof options.body !== "string") {
      if (!requestInit.headers["Content-Type"]) {
        requestInit.headers["Content-Type"] = "application/json";
      }
      requestInit.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, requestInit);
      const raw = await response.text();
      let data = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }

      return {
        ok: response.ok && Boolean(data?.ok),
        status: response.status,
        responseOk: response.ok,
        data
      };
    } catch {
      return {
        ok: false,
        status: 0,
        responseOk: false,
        data: {},
        message: "Server nicht erreichbar."
      };
    }
  }

  async function requestJsonMerged(url, options = {}) {
    const result = await requestJson(url, options);
    return { ...result.data, ok: result.ok, status: result.status, responseOk: result.responseOk };
  }

  window.FinanzAppApi = {
    requestJson,
    requestJsonMerged
  };
})();
