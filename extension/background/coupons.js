(() => {
  if (globalThis.TaBaratoBackgroundCoupons) return;

  const runtime = globalThis.TaBaratoRuntime;
  const PAGE_URL = "https://www.mercadolivre.com.br/cupons/";
  let activeOperation = null;

  function isCouponUrl(value = "") {
    try {
      const url = new URL(value);
      return /(?:^|\.)mercadolivre\.com\.br$/i.test(url.hostname) && /^\/cupons(?:\/|$)/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function ensureTrustedInputSupport() {
    if (!globalThis.TaBaratoExtensionApi.debugger?.attach || !globalThis.TaBaratoExtensionApi.debugger?.sendCommand) {
      throw new Error("A ativacao automatica de cupons nao e suportada neste navegador. A captura e a publicacao continuam funcionando normalmente.");
    }
  }

  async function trustedClick(message, sender) {
    ensureTrustedInputSupport();
    const tabId = sender.tab?.id;
    const x = Number(message.x);
    const y = Number(message.y);
    if (!activeOperation
      || activeOperation.cancelled
      || !activeOperation.debuggerAttached
      || activeOperation.id !== message.operationId
      || activeOperation.tabId !== tabId
      || !isCouponUrl(sender.tab?.url)) {
      throw new Error("A sessao confiavel de cupons nao esta ativa.");
    }
    if (![x, y].every((value) => Number.isFinite(value) && value >= 0 && value <= 10000)) {
      throw new Error("A posicao do botao Aplicar e invalida.");
    }

    const target = { tabId };
    await globalThis.TaBaratoExtensionApi.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await globalThis.TaBaratoExtensionApi.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1,
    });
    await runtime.delay(30);
    await globalThis.TaBaratoExtensionApi.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1,
    });
    return { ok: true };
  }

  async function waitForCouponPage(tabId, timeout = 30000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const ready = await globalThis.TaBaratoExtensionApi.scripting.executeScript({
        target: { tabId },
        func: () => {
          const text = String(document.body?.innerText || "").replace(/\s+/g, " ").toLowerCase();
          return document.readyState !== "loading"
            && /\/cupons(?:\/|$)/i.test(location.pathname)
            && /cupons/.test(text)
            && /filtrar/.test(text);
        },
      }).then((results) => Boolean(results[0]?.result)).catch(() => false);
      if (ready) return;
      await runtime.delay(150);
    }
    throw new Error("A pagina de cupons nao terminou de carregar.");
  }

  async function openPage() {
    const tabs = await globalThis.TaBaratoExtensionApi.tabs.query({});
    let tab = tabs.filter((item) => isCouponUrl(item.url))
      .sort((left, right) => Number(right.active) - Number(left.active) || (right.lastAccessed || 0) - (left.lastAccessed || 0))[0];
    if (tab?.id) {
      if (globalThis.TaBaratoExtensionApi.windows?.update && tab.windowId) {
        await globalThis.TaBaratoExtensionApi.windows.update(tab.windowId, { focused: true });
      }
      tab = await globalThis.TaBaratoExtensionApi.tabs.update(tab.id, { active: true });
    } else {
      tab = await globalThis.TaBaratoExtensionApi.tabs.create({ url: PAGE_URL, active: true });
    }
    await waitForCouponPage(tab.id);
    return globalThis.TaBaratoExtensionApi.tabs.get(tab.id);
  }

  async function ensureCouponAutomation(tabId) {
    await globalThis.TaBaratoExtensionApi.scripting.executeScript({ target: { tabId }, files: ["content/coupons.js"] });
    const loaded = await globalThis.TaBaratoExtensionApi.scripting.executeScript({
      target: { tabId },
      func: () => Boolean(globalThis.TaBaratoCoupons?.activate && globalThis.__TABARATO_COUPON_ENGINE__?.messageHandler),
    }).then((results) => Boolean(results[0]?.result)).catch(() => false);
    if (!loaded) throw new Error("O automatizador de cupons nao foi carregado. Recarregue a extensao e tente novamente.");
  }

  async function startCouponAutomation(tabId, message) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await ensureCouponAutomation(tabId);
      try {
        return await globalThis.TaBaratoExtensionApi.tabs.sendMessage(tabId, message);
      } catch (error) {
        const text = runtime.errorMessage(error);
        if (attempt > 0 || !/receiving end does not exist|could not establish connection|message port closed|extension context invalidated|automatizador de cupons/i.test(text)) throw error;
        await runtime.delay(250);
      }
    }
    throw new Error("O automatizador de cupons nao respondeu.");
  }

  async function stop() {
    if (!activeOperation) return { ok: true, stopped: false };
    activeOperation.cancelled = true;
    if (activeOperation.tabId) {
      await globalThis.TaBaratoExtensionApi.tabs.sendMessage(activeOperation.tabId, { type: "TABARATO_STOP_COUPONS" }).catch(() => {});
    }
    return { ok: true, stopped: true };
  }

  async function activate(limit) {
    ensureTrustedInputSupport();
    if (activeOperation) throw new Error("Ja existe uma ativacao de cupons em andamento.");
    const requested = Math.max(1, Math.min(100, Number(limit) || 5));
    const operation = {
      id: crypto.randomUUID(),
      tabId: null,
      cancelled: false,
      debuggerAttached: false,
    };
    activeOperation = operation;
    try {
      const tab = await openPage();
      operation.tabId = tab.id;
      if (operation.cancelled) return { ok: true, stopped: true, activated: 0, requested };
      try {
        await globalThis.TaBaratoExtensionApi.debugger.attach({ tabId: tab.id }, "1.3");
        operation.debuggerAttached = true;
      } catch (error) {
        runtime.reportError("coupon-debugger-attach", error);
        throw new Error("O navegador nao permitiu controlar a pagina de cupons. Feche as ferramentas de desenvolvedor dessa pagina e tente novamente.");
      }

      const result = await runtime.withTimeout(
        startCouponAutomation(tab.id, {
          type: "TABARATO_START_COUPONS",
          operationId: operation.id,
          limit: requested,
        }),
        Math.max(60000, requested * 12000),
        "A ativacao de cupons demorou demais.",
      );
      if (!result) throw new Error("A pagina de cupons nao retornou o resultado da ativacao.");
      return { ...result, trustedInput: true };
    } finally {
      if (operation.tabId) await globalThis.TaBaratoExtensionApi.tabs.sendMessage(operation.tabId, { type: "TABARATO_STOP_COUPONS" }).catch(() => {});
      if (operation.debuggerAttached && operation.tabId) await Promise.resolve(globalThis.TaBaratoExtensionApi.debugger?.detach?.({ tabId: operation.tabId })).catch(() => {});
      if (activeOperation === operation) activeOperation = null;
    }
  }

  function handleDebuggerDetach(source) {
    if (activeOperation?.tabId !== source.tabId) return;
    activeOperation.debuggerAttached = false;
    activeOperation.cancelled = true;
    globalThis.TaBaratoExtensionApi.tabs.sendMessage(source.tabId, { type: "TABARATO_STOP_COUPONS" }).catch(() => {});
  }

  globalThis.TaBaratoBackgroundCoupons = { activate, handleDebuggerDetach, isCouponUrl, stop, trustedClick, waitForCouponPage };
})();
