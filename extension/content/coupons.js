(() => {
  const ENGINE_KEY = "__TABARATO_COUPON_ENGINE__";
  const previousEngine = globalThis[ENGINE_KEY];
  previousEngine?.stop?.();
  if (previousEngine?.messageHandler) {
    try {
      chrome.runtime.onMessage.removeListener(previousEngine.messageHandler);
    } catch {
      // An invalidated extension context no longer owns a removable listener.
    }
  }

  const ACTION_PATTERN = /^(?:aplicar|ativar|resgatar)(?: cupom)?$/;
  const APPLIED_PATTERN = /\b(?:conferir|ativado|aplicado|resgatado)\b/;
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
    const radio = element?.matches?.("input[type='radio'], [role='radio']");
    const ownText = normalize([
      radio ? "" : element?.textContent,
      radio ? "" : element?.value,
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title"),
    ].filter(Boolean).join(" "));
    if (ownText) return ownText;
    return normalize(`${element?.closest?.("label")?.textContent || ""} ${element?.parentElement?.textContent || ""}`);
  }

  const controls = (root = document) => [...root.querySelectorAll(CONTROL_SELECTOR)].filter(isVisible);
  const visibleDialog = () => [...document.querySelectorAll("[role='dialog'], [aria-modal='true'], .andes-modal")].find(isVisible) || null;

  async function waitFor(read, timeout = 8000, interval = 120) {
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
    if (!isVisible(element) || isDisabled(element)) throw new Error("O controle do Mercado Livre nao esta disponivel para clique.");
    element.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
    await delay(140);
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
    if (!response?.ok) throw new Error(response?.error || "O Chrome nao confirmou o clique no Mercado Livre.");
    await delay(240);
  }

  function outsideDialog(element) {
    return !element.closest("[role='dialog'], [aria-modal='true'], .andes-modal");
  }

  function filterChip(pattern) {
    return controls().find((element) => outsideDialog(element) && pattern.test(controlText(element))) || null;
  }

  const inactiveFilterApplied = () => Boolean(filterChip(/^nao ativados(?: remover filtro)?$/));
  const newestOrderApplied = () => Boolean(filterChip(/^(?:mais )?novos(?: remover filtro)?$/));
  const filtersApplied = () => inactiveFilterApplied() && newestOrderApplied();

  function findControl(root, pattern) {
    return controls(root).find((element) => pattern.test(controlText(element))) || null;
  }

  function selected(element) {
    const input = element.matches?.("input[type='radio']") ? element : element.querySelector?.("input[type='radio']");
    return Boolean(
      input?.checked
      || element.getAttribute?.("aria-checked") === "true"
      || element.getAttribute?.("aria-selected") === "true"
      || element.getAttribute?.("aria-pressed") === "true",
    );
  }

  async function openFilterDialog(run) {
    let dialog = visibleDialog();
    if (dialog && /filtrar e ordenar|status dos cupons/.test(normalize(dialog.textContent))) return dialog;
    const trigger = findControl(document, /^filtrar e ordenar(?:\s*\(\d+\))?$/)
      || findControl(document, /^filtrar(?:\s*\(\d+\))?$/);
    if (!trigger) throw new Error("O botao 'Filtrar e ordenar' nao foi encontrado.");
    await trustedClick(trigger, run);
    dialog = await waitFor(() => {
      const candidate = visibleDialog();
      return candidate && /nao ativados|status dos cupons/.test(normalize(candidate.textContent)) ? candidate : null;
    }, 8000);
    if (!dialog) throw new Error("O Mercado Livre nao abriu o filtro de cupons.");
    return dialog;
  }

  async function ensureCouponFilters(run) {
    await waitFor(() => /cupons/.test(normalize(document.body?.innerText || "")), 12000);
    if (filtersApplied()) return;

    const dialog = await openFilterDialog(run);
    assertRunning(run);

    if (!newestOrderApplied()) {
      const newest = findControl(dialog, /^(?:mais )?novos$/);
      if (!newest) throw new Error("A ordenacao 'Mais novos' nao foi encontrada no filtro.");
      if (!selected(newest)) await trustedClick(newest, run);
    }

    if (!inactiveFilterApplied()) {
      const inactive = findControl(dialog, /^nao ativados$/)
        || findControl(dialog, /nao ativados/);
      if (!inactive) throw new Error("A opcao 'Nao ativados' nao foi encontrada no filtro.");
      if (!selected(inactive)) {
        const input = inactive.matches?.("input[type='radio'], [role='radio']")
          ? inactive
          : inactive.querySelector?.("input[type='radio'], [role='radio']");
        await trustedClick(input || inactive, run);
      }
    }

    const applyButton = await waitFor(() => {
      const control = findControl(dialog, /^aplicar$/);
      return control && !isDisabled(control) ? control : null;
    }, 5000);
    if (!applyButton) throw new Error("O Mercado Livre nao habilitou o botao 'Aplicar' do filtro.");
    await trustedClick(applyButton, run);
    await waitFor(() => !isVisible(dialog), 8000);

    const confirmed = await waitFor(filtersApplied, 12000, 150);
    if (!confirmed) throw new Error("Os filtros 'Nao ativados' e 'Mais novos' nao foram confirmados.");
  }

  function activationControls(root = document) {
    return controls(root).filter((element) => {
      if (!outsideDialog(element) || isDisabled(element) || !ACTION_PATTERN.test(controlText(element))) return false;
      return !APPLIED_PATTERN.test(normalize(element.parentElement?.textContent || ""));
    });
  }

  function couponCard(action) {
    let node = action.parentElement;
    let candidate = null;
    for (let depth = 0; node && node !== document.body && depth < 10; depth += 1, node = node.parentElement) {
      const actions = activationControls(node);
      if (actions.length > 1) break;
      const text = normalize(node.textContent || "");
      if (actions.length === 1 && text.length >= 20 && /(?:% off|r\$|compra minima|produtos selecionados|em produtos)/.test(text)) {
        candidate = node;
      }
    }
    return candidate || action.parentElement;
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

  async function activationConfirmed(action, card, previousText, run, timeout = 9000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      assertRunning(run);
      const cardText = normalize(card?.textContent || "");
      const currentText = controlText(action);
      if (!action.isConnected || !card?.isConnected || isDisabled(action)) return true;
      if (currentText !== previousText && !ACTION_PATTERN.test(currentText)) return true;
      if (APPLIED_PATTERN.test(`${currentText} ${cardText}`)) return true;
      if (!activationControls(card).length) return true;
      await delay(160);
    }
    return false;
  }

  async function activateCoupon(action, run) {
    const key = couponKey(action);
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      assertRunning(run);
      const currentAction = attempt === 1 ? action : actionForKey(key);
      if (!currentAction) return { confirmed: true, key, attempts: attempt - 1 };
      const card = couponCard(currentAction);
      const previousText = controlText(currentAction);
      await trustedClick(currentAction, run);
      if (await activationConfirmed(currentAction, card, previousText, run)) {
        return { confirmed: true, key, attempts: attempt };
      }
      await delay(350);
    }
    return { confirmed: false, key, attempts: 2 };
  }

  async function activateCoupons({ limit, operationId }) {
    if (activeRun) throw new Error("Ja existe uma ativacao de cupons em andamento nesta pagina.");
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
    let emptyRounds = 0;
    const foundKeys = new Set();
    const skippedKeys = new Set();

    try {
      await ensureCouponFilters(run);
      window.scrollTo({ top: 0, behavior: "auto" });
      await delay(450);
      await waitFor(
        () => activationControls().length || EMPTY_PATTERN.test(normalize(document.body?.innerText || "")),
        15000,
        180,
      );

      while (activated < run.limit && emptyRounds < 5) {
        assertRunning(run);
        const available = activationControls();
        available.forEach((action) => foundKeys.add(couponKey(action)));
        const target = available.find((action) => !skippedKeys.has(couponKey(action)));

        if (!target) {
          const previousY = window.scrollY;
          const previousHeight = document.documentElement.scrollHeight;
          window.scrollBy({ top: Math.max(520, Math.round(window.innerHeight * 0.8)), behavior: "auto" });
          await delay(700);
          const pageAdvanced = window.scrollY > previousY || document.documentElement.scrollHeight > previousHeight;
          emptyRounds = pageAdvanced ? emptyRounds + 1 : 5;
          continue;
        }

        attempted += 1;
        const result = await activateCoupon(target, run);
        if (result.confirmed) {
          activated += 1;
          emptyRounds = 0;
        } else {
          failed += 1;
          skippedKeys.add(result.key);
        }
        await delay(400);
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
        return {
          ok: true,
          activated,
          attempted,
          failed,
          found: foundKeys.size,
          requested: run.limit,
          stopped: true,
          filteredBy: "Nao ativados, Mais novos",
        };
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
      return false;
    }
    return false;
  };

  globalThis[ENGINE_KEY] = { version: 1, activate: activateCoupons, stop, messageHandler };
  chrome.runtime.onMessage.addListener(messageHandler);
})();
