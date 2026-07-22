(() => {
  if (globalThis.TaBaratoBackgroundCoupons) return;

  const runtime = globalThis.TaBaratoRuntime;
  const PAGE_URL = "https://www.mercadolivre.com.br/cupons/";
  const STORAGE_KEY = "tabarato_coupon_activation_operation_v3";
  const TERMINAL_STATUSES = new Set(["completed", "stopped", "exhausted", "failed"]);
  const resumeLocks = new Map();
  const operationControllers = new Map();

  function isCouponUrl(value = "") {
    try {
      const url = new URL(value);
      return /(?:^|\.)mercadolivre\.com\.br$/i.test(url.hostname) && /^\/cupons(?:\/|$)/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  async function operationState() {
    const stored = await chrome.storage.session.get(STORAGE_KEY).catch(() => ({}));
    return stored?.[STORAGE_KEY] || null;
  }

  async function saveOperation(operation) {
    const next = { ...operation, updatedAt: Date.now() };
    await chrome.storage.session.set({ [STORAGE_KEY]: next });
    return next;
  }

  async function broadcast(type, operation, extra = {}) {
    await chrome.runtime.sendMessage({
      type,
      operation: operation ? { ...operation } : null,
      ...extra,
    }).catch(() => {});
  }

  async function waitForCouponPage(tabId, timeout = 30000, signal) {
    await runtime.poll(async () => {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const text = String(document.body?.innerText || "").replace(/\s+/g, " ").toLowerCase();
          return document.readyState !== "loading"
            && /\/cupons(?:\/|$)/i.test(location.pathname)
            && /cupons/.test(text);
        },
      }).catch(() => []);
      return Boolean(results[0]?.result);
    }, {
      timeout,
      interval: 180,
      maxInterval: 650,
      signal,
      throwOnTimeout: true,
      timeoutMessage: "A pagina de cupons nao terminou de carregar.",
    });
  }

  async function openPage() {
    const tabs = await chrome.tabs.query({});
    let tab = tabs.filter((item) => isCouponUrl(item.url))
      .sort((left, right) => Number(right.active) - Number(left.active) || (right.lastAccessed || 0) - (left.lastAccessed || 0))[0];
    if (tab?.id) {
      await chrome.windows.update(tab.windowId, { focused: true });
      tab = await chrome.tabs.update(tab.id, { active: true });
    } else {
      tab = await chrome.tabs.create({ url: PAGE_URL, active: true });
    }
    await waitForCouponPage(tab.id);
    return chrome.tabs.get(tab.id);
  }

  async function ensureCouponAutomation(tabId) {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content/coupons.js"] });
    const loaded = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => Boolean(globalThis.TaBaratoCoupons?.pageStep && globalThis.__TABARATO_COUPON_ENGINE__?.messageHandler),
    }).then((results) => Boolean(results[0]?.result)).catch(() => false);
    if (!loaded) throw new Error("O automatizador de cupons nao foi carregado. Recarregue a extensao e tente novamente.");
  }

  async function sendCouponMessage(tabId, message, { retry = true, signal } = {}) {
    const attempts = retry ? 2 : 1;
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        runtime.throwIfAborted(signal);
        await ensureCouponAutomation(tabId);
        return await runtime.runWithTimeout(
          () => chrome.tabs.sendMessage(tabId, message),
          {
            milliseconds: 12000,
            message: "A pagina de cupons demorou para responder.",
            signal,
          },
        );
      } catch (error) {
        lastError = error;
        const text = runtime.errorMessage(error);
        const transient = /receiving end does not exist|could not establish connection|message port closed|extension context invalidated|automatizador de cupons/i.test(text);
        if (!transient || attempt + 1 >= attempts) break;
        await runtime.delay(280);
      }
    }
    throw lastError || new Error("O automatizador de cupons nao respondeu.");
  }

  async function finish(operation, status, extra = {}) {
    const next = await saveOperation({
      ...operation,
      ...extra,
      status,
      finishedAt: Date.now(),
    });
    await broadcast("TABARATO_COUPON_FINISHED", next);
    return next;
  }

  async function resume(tabId) {
    const operation = await operationState();
    if (!operation || TERMINAL_STATUSES.has(operation.status) || Number(operation.tabId) !== Number(tabId)) return operation;
    if (resumeLocks.has(operation.id)) return resumeLocks.get(operation.id);

    const controller = new AbortController();
    operationControllers.set(operation.id, controller);
    const task = (async () => {
      try {
        const { signal } = controller;
        const tab = await chrome.tabs.get(tabId);
        if (!isCouponUrl(tab.url)) throw new Error("A aba de cupons saiu da pagina esperada.");
        await waitForCouponPage(tabId, 30000, signal);

        let current = await operationState();
        if (!current || current.id !== operation.id || TERMINAL_STATUSES.has(current.status)) return current;
        const remaining = Math.max(0, Number(current.limit) - Number(current.activated || 0));
        if (!remaining) return finish(current, "completed");

        current = await saveOperation({ ...current, status: "processing", currentUrl: tab.url });
        await broadcast("TABARATO_COUPON_PROGRESS", current);

        let result;
        try {
          result = await sendCouponMessage(tabId, {
            type: "TABARATO_COUPON_PAGE_STEP",
            operationId: current.id,
            remaining,
          }, { signal });
        } catch (error) {
          const text = runtime.errorMessage(error);
          if (/message port closed|receiving end does not exist|could not establish connection|extension context invalidated/i.test(text)) {
            const waiting = await saveOperation({ ...current, status: "waiting-reload" });
            await broadcast("TABARATO_COUPON_PROGRESS", waiting);
            return waiting;
          }
          throw error;
        }

        current = await operationState();
        if (!current || current.id !== operation.id || TERMINAL_STATUSES.has(current.status)) return current;
        if (!result?.ok) throw new Error(result?.error || "A pagina de cupons nao concluiu a etapa atual.");

        if (result.reloading) {
          const waiting = await saveOperation({
            ...current,
            status: "waiting-reload",
            filterAttempts: Number(current.filterAttempts || 0) + 1,
          });
          if (waiting.filterAttempts > 3) throw new Error("O filtro de cupons recarregou repetidamente sem ser confirmado.");
          await broadcast("TABARATO_COUPON_PROGRESS", waiting);
          return waiting;
        }

        const activated = Math.min(
          Number(current.limit),
          Number(current.activated || 0) + Math.max(0, Number(result.activated || 0)),
        );
        const failed = Number(current.failed || 0) + Math.max(0, Number(result.failed || 0));
        const visitedUrls = Array.isArray(current.visitedUrls) ? [...current.visitedUrls] : [];
        if (tab.url && !visitedUrls.includes(tab.url)) visitedUrls.push(tab.url);

        current = await saveOperation({
          ...current,
          activated,
          failed,
          attempted: Number(current.attempted || 0) + Math.max(0, Number(result.attempted || 0)),
          hiddenActive: Number(current.hiddenActive || 0) + Math.max(0, Number(result.hiddenActive || 0)),
          visitedUrls: visitedUrls.slice(-100),
          status: "processing",
        });
        await broadcast("TABARATO_COUPON_PROGRESS", current, { pageResult: result });

        if (activated >= Number(current.limit)) return finish(current, "completed");
        if (result.stopped) return finish(current, "stopped");
        if (!result.hasNextPage) return finish(current, "exhausted", { exhaustedReason: "Nao ha outra pagina com cupons aplicaveis." });

        const pageNumber = Number(current.pageNumber || 1) + 1;
        current = await saveOperation({
          ...current,
          status: "navigating",
          pageNumber,
          nextUrl: result.nextUrl || "",
        });
        await broadcast("TABARATO_COUPON_PROGRESS", current);

        if (result.nextUrl) {
          await chrome.tabs.update(tabId, { url: result.nextUrl });
          return current;
        }

        try {
          await sendCouponMessage(tabId, {
            type: "TABARATO_COUPON_NEXT_PAGE",
            operationId: current.id,
          }, { retry: false, signal });
        } catch (error) {
          const text = runtime.errorMessage(error);
          if (!/message port closed|receiving end does not exist|could not establish connection|extension context invalidated/i.test(text)) throw error;
        }
        return current;
      } catch (error) {
        const latest = await operationState();
        if (!latest || latest.id !== operation.id || TERMINAL_STATUSES.has(latest.status)) return latest;
        runtime.reportError("coupon-resume", error);
        return finish(latest, "failed", { error: runtime.errorMessage(error) });
      }
    })().finally(() => {
      resumeLocks.delete(operation.id);
      if (operationControllers.get(operation.id) === controller) operationControllers.delete(operation.id);
    });

    resumeLocks.set(operation.id, task);
    return task;
  }

  async function activate(limit) {
    const previous = await operationState();
    if (previous && !TERMINAL_STATUSES.has(previous.status)) {
      throw new Error("Ja existe uma ativacao de cupons em andamento.");
    }

    const requested = Math.max(1, Math.min(100, Number(limit) || 5));
    const tab = await openPage();
    const operation = await saveOperation({
      id: crypto.randomUUID(),
      tabId: tab.id,
      windowId: tab.windowId,
      limit: requested,
      activated: 0,
      attempted: 0,
      failed: 0,
      hiddenActive: 0,
      pageNumber: 1,
      filterAttempts: 0,
      visitedUrls: [],
      status: "starting",
      startedAt: Date.now(),
      currentUrl: tab.url || PAGE_URL,
      error: "",
    });
    await broadcast("TABARATO_COUPON_PROGRESS", operation);
    resume(tab.id).catch((error) => runtime.reportError("coupon-start", error));
    return { ok: true, started: true, operationId: operation.id, requested };
  }

  async function stop() {
    const operation = await operationState();
    if (!operation || TERMINAL_STATUSES.has(operation.status)) return { ok: true, stopped: false };
    operationControllers.get(operation.id)?.abort(runtime.abortError("Ativacao de cupons cancelada pelo usuario."));
    await chrome.tabs.sendMessage(operation.tabId, { type: "TABARATO_STOP_COUPONS" }).catch(() => {});
    const stopped = await finish(operation, "stopped");
    return { ok: true, stopped: true, activated: stopped.activated || 0 };
  }

  async function handleTabUpdated(tabId, changeInfo, tab) {
    if (changeInfo.status !== "complete") return false;
    const operation = await operationState();
    if (!operation || TERMINAL_STATUSES.has(operation.status) || Number(operation.tabId) !== Number(tabId)) return false;
    if (!isCouponUrl(tab?.url || changeInfo.url || "")) return false;
    resume(tabId).catch((error) => runtime.reportError("coupon-tab-resume", error));
    return true;
  }

  async function markFilterReloadPending(message, sender) {
    const operation = await operationState();
    if (!operation || operation.id !== String(message.operationId || "") || Number(operation.tabId) !== Number(sender.tab?.id)) {
      return { ok: false };
    }
    const next = await saveOperation({ ...operation, status: "waiting-reload" });
    await broadcast("TABARATO_COUPON_PROGRESS", next);
    return { ok: true };
  }

  async function status() {
    return { ok: true, operation: await operationState() };
  }

  async function resumePersisted() {
    const operation = await operationState();
    if (!operation || TERMINAL_STATUSES.has(operation.status) || !operation.tabId) return operation;
    const tab = await chrome.tabs.get(operation.tabId).catch(() => null);
    if (!tab || !isCouponUrl(tab.url)) return finish(operation, "failed", { error: "A aba usada para ativar cupons nao esta mais disponivel." });
    resume(tab.id).catch((error) => runtime.reportError("coupon-worker-resume", error));
    return operation;
  }

  globalThis.TaBaratoBackgroundCoupons = {
    activate,
    handleTabUpdated,
    isCouponUrl,
    markFilterReloadPending,
    resumePersisted,
    status,
    stop,
    waitForCouponPage,
  };
})();
