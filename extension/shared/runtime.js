(() => {
  if (globalThis.TaBaratoRuntime) return;

  const DEFAULT_TIMEOUT = 20000;
  let diagnosticQueue = Promise.resolve();

  const errorMessage = (error, fallback = "A operacao nao foi concluida.") => {
    const message = String(error?.message || error || "").trim();
    return message || fallback;
  };

  const abortError = (reason, fallback = "Operacao cancelada.") => {
    if (reason instanceof Error) return reason;
    const error = new Error(String(reason || fallback));
    error.name = "AbortError";
    return error;
  };

  const throwIfAborted = (signal) => {
    if (signal?.aborted) throw abortError(signal.reason);
  };

  const delay = (milliseconds, signal) => new Promise((resolve, reject) => {
    throwIfAborted(signal);
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, abortError(signal?.reason));
    const timer = globalThis.setTimeout(() => finish(resolve), Math.max(0, Number(milliseconds) || 0));
    signal?.addEventListener("abort", onAbort, { once: true });
  });

  const runWithTimeout = (task, options = {}) => {
    const {
      milliseconds = DEFAULT_TIMEOUT,
      message = "A operacao demorou demais. Tente novamente.",
      signal: externalSignal,
    } = options;
    const controller = new AbortController();

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timer);
        externalSignal?.removeEventListener("abort", abortFromExternal);
        callback(value);
      };
      const abortFromExternal = () => {
        const error = abortError(externalSignal?.reason);
        if (!controller.signal.aborted) controller.abort(error);
        finish(reject, error);
      };
      const timer = globalThis.setTimeout(() => {
        const error = new Error(message);
        if (!controller.signal.aborted) controller.abort(error);
        finish(reject, error);
      }, Math.max(1, Number(milliseconds) || DEFAULT_TIMEOUT));

      if (externalSignal?.aborted) {
        abortFromExternal();
        return;
      }
      externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
      Promise.resolve()
        .then(() => task(controller.signal))
        .then(
          (value) => finish(resolve, value),
          (error) => finish(reject, error),
        );
    });
  };

  const withTimeout = (operation, milliseconds = DEFAULT_TIMEOUT, message = "A operacao demorou demais. Tente novamente.", options = {}) => {
    if (typeof operation === "function") {
      return runWithTimeout(operation, { ...options, milliseconds, message });
    }
    return runWithTimeout(() => Promise.resolve(operation), { ...options, milliseconds, message });
  };

  const isMissingReceiverError = (error) => /receiving end does not exist|could not establish connection|message port closed|extension context invalidated|no tab with id/i.test(errorMessage(error, ""));

  const isTransientError = (error) => {
    const status = Number(error?.status || error?.statusCode || 0);
    if ([408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
    return /timeout|time.?out|temporar|network|failed to fetch|load failed|connection|receiving end does not exist|message port closed|service unavailable|too many requests/i.test(errorMessage(error, ""));
  };

  const retry = async (task, options = {}) => {
    const {
      attempts = 3,
      baseDelay = 300,
      maxDelay = 2500,
      factor = 2,
      jitter = 0.2,
      signal,
      shouldRetry = isTransientError,
      onRetry,
    } = options;
    let lastError;
    const total = Math.max(1, Number(attempts) || 1);
    for (let attempt = 1; attempt <= total; attempt += 1) {
      throwIfAborted(signal);
      try {
        return await task({ attempt, signal });
      } catch (error) {
        lastError = error;
        if (attempt >= total || signal?.aborted || !shouldRetry(error, attempt)) throw error;
        const nominal = Math.min(maxDelay, baseDelay * (factor ** (attempt - 1)));
        const variation = nominal * jitter * (Math.random() * 2 - 1);
        const wait = Math.max(0, Math.round(nominal + variation));
        onRetry?.({ attempt, nextAttempt: attempt + 1, wait, error });
        await delay(wait, signal);
      }
    }
    throw lastError;
  };

  const poll = async (read, options = {}) => {
    const {
      timeout = DEFAULT_TIMEOUT,
      interval = 120,
      maxInterval = 700,
      factor = 1.25,
      stableSamples = 1,
      signal,
      accept = Boolean,
      throwOnTimeout = false,
      timeoutMessage = "A pagina nao ficou pronta dentro do tempo esperado.",
    } = options;
    const startedAt = Date.now();
    let wait = Math.max(10, Number(interval) || 120);
    let acceptedSamples = 0;
    let lastAccepted;
    while (Date.now() - startedAt < timeout) {
      throwIfAborted(signal);
      const value = await read();
      if (accept(value)) {
        acceptedSamples += 1;
        lastAccepted = value;
        if (acceptedSamples >= Math.max(1, stableSamples)) return lastAccepted;
      } else {
        acceptedSamples = 0;
        lastAccepted = undefined;
      }
      await delay(Math.min(wait, Math.max(10, timeout - (Date.now() - startedAt))), signal);
      wait = Math.min(maxInterval, Math.round(wait * factor));
    }
    throwIfAborted(signal);
    if (throwOnTimeout) throw new Error(timeoutMessage);
    return null;
  };

  const fetchWithTimeout = (url, options = {}, milliseconds = DEFAULT_TIMEOUT, message = "O servidor demorou para responder. Tente novamente.") => runWithTimeout(
    (signal) => fetch(url, { ...options, signal }),
    { milliseconds, message, signal: options.signal },
  );

  const waitForTabComplete = (tabId, milliseconds = 30000, message = "A pagina demorou para carregar.", signal) => runWithTimeout(
    (operationSignal) => new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        operationSignal.removeEventListener("abort", onAbort);
        callback(value);
      };
      const onAbort = () => finish(reject, abortError(operationSignal.reason));
      const onUpdated = (updatedId, changeInfo, tab) => {
        if (updatedId === tabId && changeInfo.status === "complete") finish(resolve, tab);
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
      operationSignal.addEventListener("abort", onAbort, { once: true });
      chrome.tabs.get(tabId)
        .then((tab) => {
          if (tab.status === "complete") finish(resolve, tab);
        })
        .catch((error) => finish(reject, error));
    }),
    { milliseconds, message, signal },
  );

  const reportError = (scope, error) => {
    const entry = {
      scope: String(scope || "extension").slice(0, 80),
      message: errorMessage(error).slice(0, 300),
      occurredAt: new Date().toISOString(),
    };
    console.error(`[TaBarato:${entry.scope}]`, error);
    try {
      const storage = globalThis.chrome?.storage?.session;
      if (storage?.get && storage?.set) {
        diagnosticQueue = diagnosticQueue.then(async () => {
          const stored = await storage.get(["tabarato_extension_error_log"]);
          const history = Array.isArray(stored?.tabarato_extension_error_log)
            ? stored.tabarato_extension_error_log.slice(-29)
            : [];
          history.push(entry);
          await storage.set({
            tabarato_last_extension_error: entry,
            tabarato_extension_error_log: history,
          });
        }).catch(() => {});
      }
    } catch { /* Diagnostics must never interfere with the active operation. */ }
    return entry.message;
  };

  globalThis.TaBaratoRuntime = {
    abortError,
    delay,
    errorMessage,
    fetchWithTimeout,
    isMissingReceiverError,
    isTransientError,
    poll,
    reportError,
    retry,
    runWithTimeout,
    throwIfAborted,
    waitForTabComplete,
    withTimeout,
  };
})();
