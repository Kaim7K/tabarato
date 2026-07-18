(() => {
  const AUTOMATION_KEY = "__TABARATO_COUPON_AUTOMATION__";
  const previousAutomation = globalThis[AUTOMATION_KEY];

  if (previousAutomation?.messageHandler) {
    try {
      chrome.runtime.onMessage.removeListener(previousAutomation.messageHandler);
    } catch {
      // The previous listener can belong to an invalidated extension context.
    }
  }

  const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
  const normalized = (value = "") => clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const controlSelector = [
    "button",
    "a",
    "label",
    "input[type='button']",
    "input[type='submit']",
    "input[type='radio']",
    "[role='button']",
    "[role='radio']",
  ].join(", ");

  const visible = (element) => {
    const rectangle = element?.getBoundingClientRect();
    const style = element ? getComputedStyle(element) : null;
    return Boolean(
      rectangle
      && rectangle.width > 0
      && rectangle.height > 0
      && style?.display !== "none"
      && style?.visibility !== "hidden"
      && Number(style?.opacity ?? 1) > 0,
    );
  };

  const disabled = (element) => Boolean(
    element?.disabled
    || element?.getAttribute?.("aria-disabled") === "true"
    || element?.matches?.("[disabled]"),
  );

  const controlText = (element) => {
    const radio = element?.matches?.("input[type='radio'], [role='radio']");
    const direct = normalized([
      radio ? "" : element?.textContent,
      radio ? "" : element?.value,
      element?.getAttribute?.("aria-label"),
      element?.getAttribute?.("title"),
    ].filter(Boolean).join(" "));
    if (direct) return direct;
    return normalized(`${element?.closest?.("label")?.textContent || ""} ${element?.parentElement?.textContent || ""}`);
  };

  const controls = (root = document) => [...root.querySelectorAll(controlSelector)].filter(visible);
  const findControl = (pattern, root = document) => controls(root).find((element) => pattern.test(controlText(element)));
  const visibleDialog = () => [...document.querySelectorAll("[role='dialog'], [aria-modal='true'], .andes-modal")].find(visible);

  async function waitFor(read, timeout = 5000, interval = 100) {
    const startedAt = Date.now();
    let value = read();
    while (!value && Date.now() - startedAt < timeout) {
      await wait(interval);
      value = read();
    }
    return value || null;
  }

  const inactiveFilterSelected = (root = document) => [...root.querySelectorAll("input[type='radio'], [role='radio']")]
    .some((element) => /nao ativados/.test(controlText(element)) && (element.checked || element.getAttribute("aria-checked") === "true"));

  const inactiveFilterChipVisible = () => controls().some((element) => {
    if (element.closest("[role='dialog'], [aria-modal='true'], .andes-modal")) return false;
    return /^nao ativados(?: remover filtro)?$/.test(controlText(element));
  });

  const inactiveFilterRoute = () => {
    const url = new URL(location.href);
    return /^\/cupons(?:\/filter)?\/?$/i.test(url.pathname) && url.searchParams.get("new") === "true";
  };

  async function waitForCouponGrid() {
    return waitFor(() => {
      if (activationControls().length) return true;
      const pageText = normalized(document.body?.innerText || "");
      return /cupons/.test(pageText) && /nao ativados/.test(pageText);
    }, 10000, 150);
  }

  async function applyInactiveFilter() {
    if (inactiveFilterSelected() || inactiveFilterChipVisible() || inactiveFilterRoute()) {
      await waitForCouponGrid();
      return true;
    }

    let dialog = visibleDialog();
    if (!dialog || !/status dos cupons|filtrar e ordenar/.test(normalized(dialog.textContent))) {
      const openFilter = findControl(/^(filtrar(?: e ordenar)?|filtros?)(?: \d+)?$/);
      if (!openFilter) throw new Error("Nao foi possivel abrir o filtro de cupons.");
      openFilter.click();
      dialog = await waitFor(() => {
        const candidate = visibleDialog();
        return candidate && /status dos cupons|nao ativados/.test(normalized(candidate.textContent)) ? candidate : null;
      }, 6000);
    }
    if (!dialog) throw new Error("O filtro de cupons nao carregou.");

    if (!inactiveFilterSelected(dialog)) {
      const option = findControl(/nao ativados/, dialog);
      if (!option) throw new Error("A opcao 'Nao ativados' nao foi encontrada.");
      const radio = option.matches?.("input[type='radio'], [role='radio']")
        ? option
        : option.querySelector?.("input[type='radio'], [role='radio']");
      (radio || option).click();
    }

    const apply = await waitFor(() => {
      const button = findControl(/^aplicar$/, dialog);
      return button && !disabled(button) ? button : null;
    }, 4000);
    if (!apply) throw new Error("O botao para aplicar o filtro nao foi habilitado.");
    apply.click();
    await waitFor(() => !visible(dialog), 6000);
    await waitForCouponGrid();
    return true;
  }

  function couponCard(element) {
    let candidate = element.parentElement;
    let contextualCandidate = candidate;
    for (let depth = 0; candidate && candidate !== document.body && depth < 8; depth += 1, candidate = candidate.parentElement) {
      const text = normalized(candidate.textContent || "");
      if (!/compra minima|limite de r\$|vence|produtos selecionados/.test(text)) continue;
      contextualCandidate = candidate;
      const actionCount = [...candidate.querySelectorAll(controlSelector)]
        .filter((control) => /^(ativar|aplicar|resgatar|conferir)( cupom)?$/.test(controlText(control)))
        .length;
      if (actionCount === 1) return candidate;
    }
    return contextualCandidate;
  }

  const activationControls = () => controls().filter((element) => {
    if (disabled(element) || !/^(ativar|aplicar|resgatar)( cupom)?$/.test(controlText(element))) return false;
    const context = normalized(couponCard(element)?.textContent || "");
    return !/ja ativado|cupom ativado|aplicado|resgatado/.test(context);
  });

  const couponKey = (element) => normalized(couponCard(element)?.textContent || controlText(element))
    .replace(/\b(ativar|aplicar|resgatar)( cupom)?\b/g, "")
    .slice(0, 500);

  async function activationConfirmed(element, card, previousText, timeout = 5000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const cardText = normalized(card?.textContent || "");
      const currentText = controlText(element);
      if (!document.contains(element) || disabled(element)) return true;
      if (currentText !== previousText || /ativado|aplicado|resgatado|conferir/.test(`${currentText} ${cardText}`)) return true;
      await wait(140);
    }
    return false;
  }

  async function clickCouponControl(element) {
    const card = couponCard(element);
    const previousText = controlText(element);
    element.scrollIntoView({ block: "center", behavior: "instant" });
    await wait(80);
    element.focus?.({ preventScroll: true });
    element.click();
    return activationConfirmed(element, card, previousText);
  }

  async function activateCoupons(requestedLimit) {
    const limit = Math.max(1, Math.min(100, Number(requestedLimit) || 5));
    await applyInactiveFilter();
    await waitFor(() => activationControls().length > 0 || /nenhum cupom|nao encontramos cupons/.test(normalized(document.body?.innerText || "")), 12000, 160);

    let activated = 0;
    let attempted = 0;
    let failed = 0;
    let emptyRounds = 0;
    let found = 0;
    const skippedKeys = new Set();

    while (activated < limit && emptyRounds < 6) {
      const available = activationControls();
      found = Math.max(found, available.length);
      const target = available.find((element) => !skippedKeys.has(couponKey(element)));

      if (!target) {
        const previousScroll = window.scrollY;
        window.scrollBy({ top: Math.max(480, window.innerHeight * 0.75), behavior: "instant" });
        emptyRounds += 1;
        await wait(450);
        if (window.scrollY === previousScroll) break;
        continue;
      }

      const key = couponKey(target);
      attempted += 1;
      if (await clickCouponControl(target)) {
        activated += 1;
        emptyRounds = 0;
      } else {
        failed += 1;
        skippedKeys.add(key);
        emptyRounds += 1;
      }
      await wait(220);
    }

    if (!activated && failed) {
      return {
        ok: false,
        error: `Foram encontrados ${found} cupons, mas o Mercado Livre nao confirmou os cliques em Aplicar.`,
        activated,
        attempted,
        failed,
        found,
        requested: limit,
      };
    }

    return {
      ok: true,
      activated,
      attempted,
      failed,
      found,
      requested: limit,
      filteredBy: "Nao ativados",
    };
  }

  const messageHandler = (message, _sender, sendResponse) => {
    if (message?.type !== "TABARATO_ACTIVATE_COUPONS") return false;
    activateCoupons(message.limit)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || "Falha ao ativar cupons." }));
    return true;
  };

  globalThis[AUTOMATION_KEY] = { version: 4, activate: activateCoupons, messageHandler };
  chrome.runtime.onMessage.addListener(messageHandler);
})();
