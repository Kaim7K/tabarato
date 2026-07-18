(() => {
  if (globalThis.TaBaratoRuntime) return;

  const api = globalThis.browser || globalThis.chrome;
  if (!api?.runtime) throw new Error("A API de extensao deste navegador nao esta disponivel.");
  globalThis.TaBaratoExtensionApi = api;

  const DEFAULT_TIMEOUT = 20000;

  const errorMessage = (error, fallback = "A operacao nao foi concluida.") => {
    const message = String(error?.message || error || "").trim();
    return message || fallback;
  };

  const delay = (milliseconds, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error("Operacao cancelada."));
      return;
    }
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve();
    }, Math.max(0, Number(milliseconds) || 0));
    const onAbort = () => {
      globalThis.clearTimeout(timer);
      reject(signal.reason instanceof Error ? signal.reason : new Error("Operacao cancelada."));
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });

  const withTimeout = (promise, milliseconds = DEFAULT_TIMEOUT, message = "A operacao demorou demais. Tente novamente.", onTimeout) => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      callback(value);
    };
    const timer = globalThis.setTimeout(() => {
      try { onTimeout?.(); } catch { /* Timeout cleanup must not replace the original error. */ }
      finish(reject, new Error(message));
    }, milliseconds);
    Promise.resolve(promise).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    );
  });

  const fetchWithTimeout = async (url, options = {}, milliseconds = DEFAULT_TIMEOUT, message = "O servidor demorou para responder. Tente novamente.") => {
    const controller = new AbortController();
    const externalSignal = options.signal;
    const abortFromExternal = () => controller.abort(externalSignal?.reason);
    if (externalSignal?.aborted) abortFromExternal();
    else externalSignal?.addEventListener("abort", abortFromExternal, { once: true });

    const timer = globalThis.setTimeout(() => controller.abort(new Error(message)), milliseconds);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted && !externalSignal?.aborted) {
        const timeoutError = new Error(message);
        timeoutError.code = "TABARATO_TIMEOUT";
        throw timeoutError;
      }
      throw error;
    } finally {
      globalThis.clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }
  };

  async function retry(task, options = {}) {
    const attempts = Math.max(1, Number(options.attempts) || 1);
    const shouldRetry = options.shouldRetry || (() => true);
    const delays = Array.isArray(options.delays) ? options.delays : [];
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (options.signal?.aborted) throw options.signal.reason || new Error("Operacao cancelada.");
      try {
        return await task(attempt);
      } catch (error) {
        lastError = error;
        if (attempt >= attempts || !shouldRetry(error, attempt)) throw error;
        const wait = delays[attempt - 1] ?? Math.min(2500, 300 * (2 ** (attempt - 1)));
        await delay(wait, options.signal);
      }
    }
    throw lastError;
  }

  const waitForTabComplete = (tabId, milliseconds = 30000, message = "A pagina demorou para carregar.") => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      api.tabs.onUpdated.removeListener(onUpdated);
      callback(value);
    };
    const onUpdated = (updatedId, changeInfo, tab) => {
      if (updatedId === tabId && changeInfo.status === "complete") finish(resolve, tab);
    };
    const timer = globalThis.setTimeout(() => finish(reject, new Error(message)), milliseconds);
    api.tabs.onUpdated.addListener(onUpdated);
    api.tabs.get(tabId)
      .then((tab) => {
        if (tab.status === "complete") finish(resolve, tab);
      })
      .catch((error) => finish(reject, error));
  });

  const reportError = (scope, error) => {
    const entry = {
      scope: String(scope || "extension").slice(0, 80),
      message: errorMessage(error).slice(0, 300),
      occurredAt: new Date().toISOString(),
    };
    console.error(`[TaBarato:${entry.scope}]`, error);
    try {
      api.storage?.session?.set({ tabarato_last_extension_error: entry })?.catch(() => {});
    } catch { /* Diagnostics must never interfere with the active operation. */ }
    return entry.message;
  };

  globalThis.TaBaratoRuntime = {
    api,
    delay,
    errorMessage,
    fetchWithTimeout,
    reportError,
    retry,
    waitForTabComplete,
    withTimeout,
  };
})();
