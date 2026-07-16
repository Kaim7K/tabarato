(() => {
  if (globalThis.TaBaratoRuntime) return;

  const DEFAULT_TIMEOUT = 20000;

  const errorMessage = (error, fallback = "A operacao nao foi concluida.") => {
    const message = String(error?.message || error || "").trim();
    return message || fallback;
  };

  const delay = (milliseconds) => new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));

  const withTimeout = (promise, milliseconds = DEFAULT_TIMEOUT, message = "A operacao demorou demais. Tente novamente.") => new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      callback(value);
    };
    const timer = globalThis.setTimeout(() => finish(reject, new Error(message)), milliseconds);
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
      if (controller.signal.aborted && !externalSignal?.aborted) throw new Error(message);
      throw error;
    } finally {
      globalThis.clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    }
  };

  const reportError = (scope, error) => {
    const entry = {
      scope: String(scope || "extension").slice(0, 80),
      message: errorMessage(error).slice(0, 300),
      occurredAt: new Date().toISOString(),
    };
    console.error(`[TaBarato:${entry.scope}]`, error);
    try {
      globalThis.chrome?.storage?.session?.set({ tabarato_last_extension_error: entry })?.catch(() => {});
    } catch { /* Diagnostics must never interfere with the active operation. */ }
    return entry.message;
  };

  globalThis.TaBaratoRuntime = {
    DEFAULT_TIMEOUT,
    delay,
    errorMessage,
    fetchWithTimeout,
    reportError,
    withTimeout,
  };
})();
