(() => {
  const ENGINE_KEY = "__TABARATO_COUPON_ENGINE__";
  const previousEngine = globalThis[ENGINE_KEY];
  previousEngine?.stop?.();
  if (previousEngine?.messageHandler) {
    try {
      chrome.runtime.onMessage.removeListener(previousEngine.messageHandler);
    } catch {
      // The old extension context may already be invalid.
    }
  }
  globalThis.TaBaratoCoupons = null;

  const ACTION_PATTERN = /^(?:aplicar|ativar|resgatar)(?: cupom)?$/;
  const APPLIED_PATTERN = /\b(?:conferir|ativado|aplicado|resgatado)\b/;
  const COUPON_CONTEXT = /(?:%\s*off|r\$|compra minima|limite de|produtos selecionados|em produtos|vence|esgotando)/;
  const EMPTY_PATTERN = /nenhum cupom|nao encontramos cupons|sem cupons disponiveis/;
  const CONTROL_SELECTOR = [
    "button",
    "a",
    "label",
    "input[type='button']",
    "input[type='submit']",
    "input[type='radio']",
    "[role='button']",
    "[role='radio']",
    "[role='option']",
    "[role='tab']",
  ].join(",");

  class CouponAutomationStopped extends Error {
    constructor() {
      super("Ativacao de cupons interrompida.");
      this.name = "CouponAutomationStopped";
    }
  }

  let activeRun = null;
  const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
  const normalize = (value = "") => clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const delay = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

  function isVisible(element) {
    if (!element?.isConnected) return false;
    const rectangle = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rectangle.width > 0
      && rectangle.height > 0
      && style.display !== "none"
      && style.visibility !== "hidden"
      && Number(style.opacity || 1) > 0;
  }

  const isDisabled = (element) => Boolean(
    element?.disabled
    || element?.matches?.("[disabled]")
    || element?.getAttribute?.("aria-disabled") === "true",
  );

  function controlText(element) {
    const isInput = element?.matches?.("input[type='radio'], input[type='button'], input[type='submit']");
    const label = element?.closest?.("label")?.textContent || "";
    return normalize([
      isInput ? "" : element?.textContent,
      isInput ? element?.value : "",
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title"),
      label,
    ].filter(Boolean).join(" "));
  }

  const controls = (root = document) => [...root.querySelectorAll(CONTROL_SELECTOR)].filter(isVisible);
  const visibleDialog = () => [...document.querySelectorAll("[role='dialog'], [aria-modal='true'], .andes-modal, [class*='modal']")]
    .find((element) => isVisible(element) && /filtrar|status dos cupons|nao ativados/.test(normalize(element.textContent))) || null;

  async function waitFor(read, timeout = 8000, interval = 100) {
    const startedAt = Date.now();
    let value = read();
    while (!value && Date.now() - startedAt < timeout) {
      await delay(interval);
      value = read();
    }
    return value || null;
  }

  function assertRunning(run) {
    if (!run || run.cancelled || activeRun !== run) throw new CouponAutomationStopped();
  }

  async function trustedClick(element, run) {
    assertRunning(run);
    if (!isVisible(element) || isDisabled(element)) throw new Error("O controle do Mercado Livre nao esta disponivel.");
    element.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
    await delay(70);
    assertRunning(run);

    const rectangle = element.getBoundingClientRect();
    const x = Math.round(rectangle.left + rectangle.width / 2);
    const y = Math.round(rectangle.top + rectangle.height / 2);
    const hit = document.elementFromPoint(x, y);
    if (!hit || (!element.contains(hit) && !hit.contains(element))) {
      throw new Error("Outro elemento esta cobrindo o controle do Mercado Livre.");
    }

    const response = await chrome.runtime.sendMessage({
      type: "TABARATO_COUPON_CLICK",
      operationId: run.operationId,
      x,
      y,
    });
    if (!response?.ok) throw new Error(response?.error || "O Chrome nao confirmou o clique.");
    await delay(120);
  }

  const outsideDialog = (element) => !element.closest("[role='dialog'], [aria-modal='true'], .andes-modal, [class*='modal']");
  const findControl = (root, pattern) => controls(root).find((element) => pattern.test(controlText(element))) || null;

  function selected(element) {
    const input = element.matches?.("input[type='radio']") ? element : element.querySelector?.("input[type='radio']");
    const className = String(element.className || "");
    return Boolean(
      input?.checked
      || element.getAttribute?.("aria-checked") === "true"
      || element.getAttribute?.("aria-selected") === "true"
      || element.getAttribute?.("aria-pressed") === "true"
      || /(?:^|\s)(?:active|selected)(?:\s|$)/i.test(className),
    );
  }

  function outsideControl(pattern) {
    return controls().find((element) => outsideDialog(element) && pattern.test(controlText(element))) || null;
  }

  const inactiveFilterApplied = () => Boolean(outsideControl(/^nao ativados(?: remover filtro)?$/));
  const newestOrderApplied = () => Boolean(
    outsideControl(/^mais novos(?: remover filtro)?$/)
    || controls().some((element) => outsideDialog(element) && /^novos$/.test(controlText(element)) && selected(element))
    || new URL(location.href).searchParams.get("new") === "true",
  );

  async function openFilterDialog(run) {
    const open = visibleDialog();
    if (open) return open;
    const trigger = outsideControl(/^filtrar e ordenar(?:\s*\(?\d+\)?)?$/)
      || outsideControl(/^filtrar(?:\s*\(?\d+\)?)?$/);
    if (!trigger) throw new Error("O botao 'Filtrar e ordenar' nao foi encontrado.");
    await trustedClick(trigger, run);
    const dialog = await waitFor(visibleDialog, 7000);
    if (!dialog) throw new Error("O Mercado Livre nao abriu o filtro de cupons.");
    return dialog;
  }

  async function ensureInactiveFilter(run) {
    if (inactiveFilterApplied()) return;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assertRunning(run);
      const dialog = await openFilterDialog(run);
      let inactive = findControl(dialog, /^nao ativados$/)
        || findControl(dialog, /(?:^|\s)nao ativados(?:\s|$)/);
      if (!inactive) throw new Error("A opcao 'Nao ativados' nao foi encontrada.");
      if (!selected(inactive)) {
        await trustedClick(inactive, run);
      }

      const applyButton = await waitFor(() => {
        const currentDialog = visibleDialog() || dialog;
        const control = findControl(currentDialog, /^aplicar$/);
        return control && !isDisabled(control) ? control : null;
      }, 5000);
      if (!applyButton) throw new Error("O botao 'Aplicar' do filtro nao foi habilitado.");
      await trustedClick(applyButton, run);
      if (await waitFor(inactiveFilterApplied, 9000, 120)) return;
    }
    throw new Error("O filtro 'Nao ativados' nao foi confirmado pelo Mercado Livre.");
  }

  async function ensureNewestOrder(run) {
    if (newestOrderApplied()) return;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assertRunning(run);
      const newest = outsideControl(/^novos$/) || outsideControl(/^mais novos$/);
      if (!newest) throw new Error("O botao 'Novos' nao foi encontrado na pagina de cupons.");
      await trustedClick(newest, run);
      if (await waitFor(newestOrderApplied, 8000, 120)) return;
    }
    throw new Error("A ordenacao 'Mais novos' nao foi confirmada pelo Mercado Livre.");
  }

  async function ensureCouponFilters(run) {
    const ready = await waitFor(() => /cupons/.test(normalize(document.body?.innerText || "")), 12000);
    if (!ready) throw new Error("A pagina de cupons nao terminou de carregar.");
    await ensureInactiveFilter(run);
    await waitFor(() => !visibleDialog(), 5000);
    await ensureNewestOrder(run);
    if (!inactiveFilterApplied() || !newestOrderApplied()) {
      throw new Error("Os filtros 'Nao ativados' e 'Mais novos' nao ficaram ativos.");
    }
  }

  const actionElements = (root = document) => [...root.querySelectorAll("button, a, [role='button']")]
    .filter((element) => isVisible(element) && !isDisabled(element) && ACTION_PATTERN.test(controlText(element)));

  function couponCard(action) {
    let node = action.parentElement;
    let candidate = null;
    for (let depth = 0; node && node !== document.body && depth < 9; depth += 1, node = node.parentElement) {
      const text = normalize(node.textContent || "");
      if (text.length > 1800) break;
      const actions = actionElements(node);
      if (actions.length > 1) break;
      if (actions.length === 1 && COUPON_CONTEXT.test(text)) candidate = node;
    }
    return candidate || action.parentElement;
  }

  function activationControls() {
    return actionElements().filter((element) => {
      if (!outsideDialog(element)) return false;
      const card = couponCard(element);
      const text = normalize(card?.textContent || "");
      return COUPON_CONTEXT.test(text) && !APPLIED_PATTERN.test(`${controlText(element)} ${text}`);
    });
  }

  function couponKey(action) {
    return normalize(couponCard(action)?.textContent || controlText(action))
      .replace(/\b(?:aplicar|ativar|resgatar|conferir)(?: cupom)?\b/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 700);
  }

  function actionForKey(key) {
    return activationControls().find((action) => couponKey(action) === key) || null;
  }

  async function activationConfirmed(action, card, key, run, timeout = 6500) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      assertRunning(run);
      const cardText = normalize(card?.textContent || "");
      if (!action.isConnected || !card?.isConnected || isDisabled(action)) return true;
      if (APPLIED_PATTERN.test(`${controlText(action)} ${cardText}`)) return true;
      if (!actionForKey(key)) return true;
      await delay(120);
    }
    return false;
  }

  async function activateCoupon(action, run) {
    const key = couponKey(action);
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const currentAction = attempt === 1 ? action : actionForKey(key);
      if (!currentAction) return { confirmed: true, key };
      const card = couponCard(currentAction);
      await trustedClick(currentAction, run);
      if (await activationConfirmed(currentAction, card, key, run)) return { confirmed: true, key };
    }
    return { confirmed: false, key };
  }

  async function activateCoupons({ limit, operationId }) {
    if (activeRun) throw new Error("Ja existe uma ativacao de cupons em andamento.");
    const run = {
      operationId: String(operationId || ""),
      limit: Math.max(1, Math.min(100, Number(limit) || 5)),
      cancelled: false,
    };
    if (!run.operationId) throw new Error("A operacao de cupons nao foi identificada.");
    activeRun = run;

    let activated = 0;
    let attempted = 0;
    let failed = 0;
    let scrollRounds = 0;
    const foundKeys = new Set();
    const skippedKeys = new Set();

    try {
      await ensureCouponFilters(run);
      window.scrollTo({ top: 0, behavior: "auto" });
      await delay(180);
      await waitFor(() => activationControls().length || EMPTY_PATTERN.test(normalize(document.body?.innerText || "")), 10000, 120);

      while (activated < run.limit && scrollRounds < 8) {
        assertRunning(run);
        const available = activationControls();
        available.forEach((action) => foundKeys.add(couponKey(action)));
        const target = available.find((action) => !skippedKeys.has(couponKey(action)));
        if (!target) {
          const previousY = window.scrollY;
          window.scrollBy({ top: Math.max(460, Math.round(window.innerHeight * 0.72)), behavior: "auto" });
          await delay(280);
          scrollRounds = window.scrollY > previousY ? scrollRounds + 1 : 8;
          continue;
        }

        attempted += 1;
        const result = await activateCoupon(target, run);
        if (result.confirmed) {
          activated += 1;
          scrollRounds = 0;
        } else {
          failed += 1;
          skippedKeys.add(result.key);
        }
        await delay(180);
      }

      return {
        ok: activated > 0 || failed === 0,
        activated,
        attempted,
        failed,
        found: foundKeys.size,
        requested: run.limit,
        stopped: false,
        filteredBy: "Nao ativados, Mais novos",
        error: !activated && failed ? "O Mercado Livre nao confirmou a ativacao dos cupons encontrados." : "",
      };
    } catch (error) {
      if (error instanceof CouponAutomationStopped) {
        return { ok: true, activated, attempted, failed, found: foundKeys.size, requested: run.limit, stopped: true };
      }
      throw error;
    } finally {
      if (activeRun === run) activeRun = null;
    }
  }

  function stop() {
    if (activeRun) activeRun.cancelled = true;
  }

  const messageHandler = (message, _sender, sendResponse) => {
    if (message?.type === "TABARATO_START_COUPONS") {
      activateCoupons(message)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message || "Falha ao ativar cupons." }));
      return true;
    }
    if (message?.type === "TABARATO_STOP_COUPONS") {
      stop();
      sendResponse({ ok: true });
    }
    return false;
  };

  globalThis[ENGINE_KEY] = { version: 3, activate: activateCoupons, stop, messageHandler };
  globalThis.TaBaratoCoupons = globalThis[ENGINE_KEY];
  chrome.runtime.onMessage.addListener(messageHandler);
})();
