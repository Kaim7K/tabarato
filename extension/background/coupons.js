(() => {
  if (globalThis.TaBaratoBackgroundCoupons) return;

  const runtime = globalThis.TaBaratoRuntime;
  const PAGE_URL = "https://www.mercadolivre.com.br/cupons/filter?new=true&source_page=int_coupons_shortcut";
  let activeOperation = null;

  function isCouponUrl(value = "") {
    try {
      const url = new URL(value);
      return /(?:^|\.)mercadolivre\.com\.br$/i.test(url.hostname) && /^\/cupons(?:\/|$)/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  async function trustedClick(message, sender) {
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
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1,
    });
    await runtime.delay(45);
    await chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", {
      type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1,
    });
    return { ok: true };
  }

  async function openPage() {
    const tabs = await chrome.tabs.query({});
    let tab = tabs.filter((item) => isCouponUrl(item.url))
      .sort((left, right) => Number(right.active) - Number(left.active) || (right.lastAccessed || 0) - (left.lastAccessed || 0))[0];
    let navigating = false;
    if (tab?.id) {
      await chrome.windows.update(tab.windowId, { focused: true });
      const filtered = new URL(tab.url).searchParams.get("new") === "true";
      navigating = !filtered;
      tab = await chrome.tabs.update(tab.id, filtered ? { active: true } : { active: true, url: PAGE_URL });
    } else {
      navigating = true;
      tab = await chrome.tabs.create({ url: PAGE_URL, active: true });
    }
    if (navigating || tab.status !== "complete") {
      await runtime.waitForTabComplete(tab.id, 45000, "A pagina de cupons demorou para carregar.");
    }
    await runtime.delay(650);
    return chrome.tabs.get(tab.id);
  }

  async function stop() {
    if (!activeOperation) return { ok: true, stopped: false };
    activeOperation.cancelled = true;
    if (activeOperation.tabId) {
      await chrome.tabs.sendMessage(activeOperation.tabId, { type: "TABARATO_STOP_COUPONS" }).catch(() => {});
    }
    return { ok: true, stopped: true };
  }

  async function activate(limit) {
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
        await chrome.debugger.attach({ tabId: tab.id }, "1.3");
        operation.debuggerAttached = true;
      } catch (error) {
        runtime.reportError("coupon-debugger-attach", error);
        throw new Error("O Chrome nao permitiu controlar a pagina de cupons. Feche o DevTools dessa pagina e tente novamente.");
      }

      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/coupons.js"] });
      const result = await runtime.withTimeout(
        chrome.tabs.sendMessage(tab.id, {
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
      if (operation.tabId) await chrome.tabs.sendMessage(operation.tabId, { type: "TABARATO_STOP_COUPONS" }).catch(() => {});
      if (operation.debuggerAttached && operation.tabId) await chrome.debugger.detach({ tabId: operation.tabId }).catch(() => {});
      if (activeOperation === operation) activeOperation = null;
    }
  }

  function handleDebuggerDetach(source) {
    if (activeOperation?.tabId !== source.tabId) return;
    activeOperation.debuggerAttached = false;
    activeOperation.cancelled = true;
    chrome.tabs.sendMessage(source.tabId, { type: "TABARATO_STOP_COUPONS" }).catch(() => {});
  }

  globalThis.TaBaratoBackgroundCoupons = { activate, handleDebuggerDetach, isCouponUrl, stop, trustedClick };
})();
