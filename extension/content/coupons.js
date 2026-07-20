(() => {
  if (window.top !== window) return;
  const ENGINE_KEY = "__TABARATO_COUPON_ENGINE__";
  const previousEngine = globalThis[ENGINE_KEY];
  previousEngine?.stop?.();
  if (previousEngine?.messageHandler) {
    try {
      chrome.runtime.onMessage.removeListener(previousEngine.messageHandler);
    } catch {
      // The previous extension context may already be invalid.
    }
  }
  globalThis.TaBaratoCoupons = null;

  const COUPON_CONTEXT = /(?:%\s*off|r\$|compra minima|limite de|produtos selecionados|em produtos|vence|esgotando|cupom)/;
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
  const CARD_SELECTOR = [
    "article",
    "li",
    "[role='listitem']",
    ".andes-card",
    "[class*='coupon-card' i]",
    "[class*='coupon_item' i]",
    "[class*='coupon-item' i]",
    "[class*='coupon' i]",
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

  function controlVariants(element) {
    const isInput = element?.matches?.("input[type='radio'], input[type='button'], input[type='submit']");
    const label = element?.closest?.("label")?.textContent || "";
    return [
      isInput ? "" : element?.innerText,
      isInput ? "" : element?.textContent,
      isInput ? element?.value : "",
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title"),
      label,
    ].filter(Boolean).map(normalize).filter(Boolean);
  }

  const controlText = (element) => controlVariants(element).join(" ");
  const controlMatches = (element, pattern) => controlVariants(element).some((value) => pattern.test(value));

  function applyAction(element) {
    if (!isVisible(element) || isDisabled(element)) return false;
    const visibleText = normalize(element.innerText || element.textContent || "");
    const aria = normalize(element.getAttribute?.("aria-label") || "");
    const title = normalize(element.getAttribute?.("title") || "");
    return /^(?:aplicar|ativar|resgatar)(?: cupom)?$/.test(visibleText)
      || /^(?:aplicar|ativar|resgatar) cupom\b/.test(aria)
      || /^(?:aplicar|ativar|resgatar) cupom\b/.test(title);
  }

  const controls = (root = document) => [...root.querySelectorAll(CONTROL_SELECTOR)].filter(isVisible);
  function assertRunning(run) {
    if (!run || run.cancelled || activeRun !== run) throw new CouponAutomationStopped();
  }

  async function interactClick(element, run) {
    assertRunning(run);
    if (!isVisible(element) || isDisabled(element)) throw new Error("O controle do Mercado Livre nao esta disponivel.");
    element.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
    await delay(100);
    assertRunning(run);

    const rectangle = element.getBoundingClientRect();
    const x = Math.round(rectangle.left + rectangle.width / 2);
    const y = Math.round(rectangle.top + rectangle.height / 2);
    const hit = document.elementFromPoint(x, y);
    if (!hit || (!element.contains(hit) && !hit.contains(element))) {
      throw new Error("Outro elemento esta cobrindo o controle do Mercado Livre.");
    }

    const target = element.matches?.("input")
      ? element
      : element.querySelector?.("input[type='radio'], input[type='checkbox'], button") || element;
    target.focus?.({ preventScroll: true });
    target.click();
    await delay(190);
  }

  const outsideDialog = (element) => !element.closest("[role='dialog'], [aria-modal='true'], .andes-modal, [class*='modal']");
  function outsideControl(pattern) {
    return controls().find((element) => outsideDialog(element) && controlMatches(element, pattern)) || null;
  }

  function currentUrl() {
    try {
      return new URL(location.href);
    } catch {
      return null;
    }
  }

  const inactiveFilterApplied = () => Boolean(
    outsideControl(/^nao ativados(?: remover filtro)?$/)
    || controls().some((element) => outsideDialog(element) && /^nao ativados$/.test(controlText(element)) && selected(element))
    || ["inactive", "not_activated"].includes(currentUrl()?.searchParams.get("status")),
  );

  const moreUsedFilterApplied = () => Boolean(
    outsideControl(/^mais usados(?: remover filtro)?$/)
    || controls().some((element) => outsideDialog(element) && /^mais usados$/.test(controlText(element)) && selected(element))
    || currentUrl()?.searchParams.get("most_used") === "true",
  );

  function canonicalFilteredUrl() {
    const url = new URL("https://www.mercadolivre.com.br/cupons/filter");
    url.searchParams.set("status", "inactive");
    url.searchParams.set("most_used", "true");
    url.searchParams.set("source_page", "int_applied_filters");
    return url.href;
  }

  async function ensureCouponFilters(run) {
    const ready = await waitFor(() => /cupons/.test(normalize(document.body?.innerText || "")), 12000);
    if (!ready) throw new Error("A pagina de cupons nao terminou de carregar.");
    if (inactiveFilterApplied() && moreUsedFilterApplied()) return { ready: true, reloading: false };

    // O Mercado Livre altera com frequencia a estrutura visual dos filtros. A URL
    // canonica usa os mesmos filtros e evita depender de textos/classes instaveis.
    await chrome.runtime.sendMessage({
      type: "TABARATO_COUPON_FILTER_RELOAD_PENDING",
      operationId: run.operationId,
    }).catch(() => {});

    const targetUrl = canonicalFilteredUrl();
    if (location.href !== targetUrl) location.assign(targetUrl);
    else location.reload();
    return { ready: false, reloading: true };
  }

  const actionElements = (root = document) => [...root.querySelectorAll("button, a, [role='button']")]
    .filter((element) => outsideDialog(element) && applyAction(element));

  function couponCard(action) {
    let node = action.parentElement;
    let candidate = null;
    for (let depth = 0; node && node !== document.body && depth < 10; depth += 1, node = node.parentElement) {
      const text = normalize(node.textContent || "");
      if (text.length > 2200) break;
      const actions = [...node.querySelectorAll("button, a, [role='button']")].filter(applyAction);
      if (actions.length > 1) break;
      if (actions.length === 1 && COUPON_CONTEXT.test(text)) candidate = node;
    }
    return candidate || action.parentElement;
  }

  function activationControls(root = document) {
    return actionElements(root).filter((element) => {
      const card = couponCard(element);
      return COUPON_CONTEXT.test(normalize(card?.textContent || ""));
    });
  }

  function couponCardCandidates() {
    const candidates = new Set();
    const actions = activationControls();
    actions.forEach((action) => {
      const card = couponCard(action);
      if (!card) return;
      candidates.add(card);
      [...(card.parentElement?.children || [])].forEach((sibling) => {
        const text = normalize(sibling.textContent || "");
        if (text.length >= 20 && text.length <= 2200 && COUPON_CONTEXT.test(text)) candidates.add(sibling);
      });
    });

    [...document.querySelectorAll(CARD_SELECTOR)].forEach((element) => {
      const text = normalize(element.textContent || "");
      const rectangle = element.getBoundingClientRect();
      if (text.length < 20 || text.length > 2200 || !COUPON_CONTEXT.test(text)) return;
      if (rectangle.width <= 0 || rectangle.height <= 0 || rectangle.height > Math.max(520, window.innerHeight * 0.9)) return;
      candidates.add(element);
    });

    const values = [...candidates].filter((element) => element?.isConnected);
    return values.filter((candidate) => !values.some((other) => other !== candidate && candidate.contains(other)));
  }

  function hideAlreadyActiveCards() {
    let hidden = 0;
    let kept = 0;
    couponCardCandidates().forEach((card) => {
      const hasApply = [...card.querySelectorAll("button, a, [role='button']")].some(applyAction);
      if (hasApply) {
        card.style.removeProperty("display");
        delete card.dataset.tabaratoCouponHidden;
        kept += 1;
        return;
      }
      const newlyHidden = card.dataset.tabaratoCouponHidden !== "true";
      card.dataset.tabaratoCouponHidden = "true";
      card.style.setProperty("display", "none", "important");
      if (newlyHidden) hidden += 1;
    });
    return { hidden, kept };
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

  async function activationConfirmed(action, card, key, run, timeout = 8500) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      assertRunning(run);
      if (!action.isConnected || !card?.isConnected || isDisabled(action)) return true;
      if (!actionForKey(key)) return true;
      await delay(140);
    }
    return false;
  }

  async function activateCoupon(action, run) {
    const key = couponKey(action);
    const currentAction = actionForKey(key) || action;
    if (!currentAction) return { confirmed: true, key };
    const card = couponCard(currentAction);
    await interactClick(currentAction, run);
    if (await activationConfirmed(currentAction, card, key, run)) {
      if (card?.isConnected) {
        card.dataset.tabaratoCouponHidden = "true";
        card.style.setProperty("display", "none", "important");
      }
      return { confirmed: true, key };
    }
    return { confirmed: false, key };
  }

  function nextPageControl() {
    return controls().find((element) => {
      if (!outsideDialog(element) || isDisabled(element)) return false;
      const text = normalize(element.innerText || element.textContent || "");
      const aria = normalize(element.getAttribute?.("aria-label") || "");
      return text === "proximo"
        || text === "proxima"
        || /^proxima pagina\b/.test(aria)
        || /^proximo\b/.test(aria);
    }) || null;
  }

  function nextPageInfo() {
    const control = nextPageControl();
    if (!control) return { hasNextPage: false, nextUrl: "" };
    const link = control.matches?.("a[href]") ? control : control.closest?.("a[href]");
    return {
      hasNextPage: true,
      nextUrl: link?.href || "",
    };
  }

  async function pageStep({ remaining, operationId }) {
    if (activeRun) throw new Error("Ja existe uma ativacao de cupons em andamento nesta pagina.");
    const run = {
      operationId: String(operationId || ""),
      limit: Math.max(1, Math.min(100, Number(remaining) || 1)),
      cancelled: false,
    };
    if (!run.operationId) throw new Error("A operacao de cupons nao foi identificada.");
    activeRun = run;

    let activated = 0;
    let attempted = 0;
    let failed = 0;
    let hiddenActive = 0;
    let scrollRounds = 0;
    const skippedKeys = new Set();

    try {
      const filterState = await ensureCouponFilters(run);
      if (filterState.reloading) {
        return { ok: true, reloading: true, activated: 0, attempted: 0, failed: 0, hiddenActive: 0 };
      }

      window.scrollTo({ top: 0, behavior: "auto" });
      await delay(260);
      const initialHidden = hideAlreadyActiveCards();
      hiddenActive += initialHidden.hidden;
      await waitFor(() => activationControls().length || EMPTY_PATTERN.test(normalize(document.body?.innerText || "")), 1800, 120);

      while (activated < run.limit && scrollRounds < 3) {
        assertRunning(run);
        const visual = hideAlreadyActiveCards();
        hiddenActive += visual.hidden;
        const available = activationControls();
        const target = available.find((action) => !skippedKeys.has(couponKey(action)));
        if (!target) {
          const previousY = window.scrollY;
          const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
          if (previousY >= maxY - 4) break;
          window.scrollBy({ top: Math.max(460, Math.round(window.innerHeight * 0.74)), behavior: "auto" });
          await delay(180);
          scrollRounds = window.scrollY > previousY ? scrollRounds + 1 : 12;
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
        await delay(420);
      }

      hideAlreadyActiveCards();
      const next = nextPageInfo();
      return {
        ok: activated > 0 || failed === 0,
        activated,
        attempted,
        failed,
        hiddenActive,
        requested: run.limit,
        stopped: false,
        filteredBy: "Mais usados, Nao ativados",
        hasNextPage: next.hasNextPage,
        nextUrl: next.nextUrl,
        error: !activated && failed ? "O Mercado Livre nao confirmou a ativacao dos cupons encontrados." : "",
      };
    } catch (error) {
      if (error instanceof CouponAutomationStopped) {
        return { ok: true, activated, attempted, failed, hiddenActive, requested: run.limit, stopped: true, ...nextPageInfo() };
      }
      throw error;
    } finally {
      if (activeRun === run) activeRun = null;
    }
  }

  async function navigateNext({ operationId }) {
    if (!operationId) throw new Error("A operacao de cupons nao foi identificada.");
    const control = nextPageControl();
    if (!control) return { ok: false, error: "O botao Proximo nao foi encontrado." };
    control.scrollIntoView({ block: "center", behavior: "auto" });
    await delay(120);
    control.focus?.({ preventScroll: true });
    control.click();
    return { ok: true, navigating: true };
  }

  function stop() {
    if (activeRun) activeRun.cancelled = true;
  }

  const messageHandler = (message, _sender, sendResponse) => {
    if (message?.type === "TABARATO_COUPON_PAGE_STEP") {
      pageStep(message)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message || "Falha ao ativar cupons." }));
      return true;
    }
    if (message?.type === "TABARATO_COUPON_NEXT_PAGE") {
      navigateNext(message)
        .then(sendResponse)
        .catch((error) => sendResponse({ ok: false, error: error.message || "Falha ao abrir a proxima pagina." }));
      return true;
    }
    if (message?.type === "TABARATO_STOP_COUPONS") {
      stop();
      sendResponse({ ok: true });
      return false;
    }
    return false;
  };

  globalThis[ENGINE_KEY] = { version: 8, pageStep, stop, messageHandler };
  globalThis.TaBaratoCoupons = globalThis[ENGINE_KEY];
  chrome.runtime.onMessage.addListener(messageHandler);
})();
