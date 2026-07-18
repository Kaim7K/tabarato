(() => {
  if (globalThis.__TABARATO_COUPON_AUTOMATION__) return;
  globalThis.__TABARATO_COUPON_AUTOMATION__ = true;

  const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
  const normalized = (value = "") => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
  const visible = (element) => {
    const rectangle = element?.getBoundingClientRect();
    const style = element ? getComputedStyle(element) : null;
    return Boolean(rectangle && rectangle.width > 0 && rectangle.height > 0 && style?.display !== "none" && style?.visibility !== "hidden");
  };
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
  const controls = (root = document) => [...root.querySelectorAll("button, a, label, input[type='radio'], [role='button'], [role='radio']")].filter(visible);
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

  async function applyInactiveFilter() {
    if (inactiveFilterSelected()) return true;
    let dialog = visibleDialog();
    if (!dialog || !/status dos cupons|filtrar e ordenar/.test(normalized(dialog.textContent))) {
      const openFilter = findControl(/^(filtrar(?: e ordenar)?|filtros?)$/);
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
      await wait(120);
    }

    const apply = await waitFor(() => {
      const button = findControl(/^aplicar$/, dialog);
      return button && !button.disabled && button.getAttribute("aria-disabled") !== "true" ? button : null;
    }, 3000);
    if (!apply) throw new Error("O botao para aplicar o filtro nao foi habilitado.");
    apply.click();
    await waitFor(() => !visible(dialog), 5000);
    await wait(300);
    return true;
  }

  async function activationConfirmed(element, previousLabel, timeout = 2600) {
    const card = element.closest("li, article, [class*='coupon'], [class*='card']");
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      const label = controlText(element);
      const cardText = normalized(card?.textContent || "");
      if (!document.contains(element) || element.disabled || element.getAttribute("aria-disabled") === "true") return true;
      if (label !== previousLabel || /ativado|aplicado|resgatado/.test(`${label} ${cardText}`)) return true;
      await wait(110);
    }
    return false;
  }

  const activationControl = (attempted) => controls().find((element) => {
    if (attempted.has(element) || element.disabled || element.getAttribute("aria-disabled") === "true") return false;
    const label = controlText(element);
    if (!/^(ativar|aplicar|resgatar)( cupom)?$/.test(label)) return false;
    const context = normalized(element.closest("li, article, [class*='coupon'], [class*='card']")?.textContent || "");
    return !/ja ativado|cupom ativado|aplicado|resgatado/.test(context);
  });

  async function activateCoupons(limit) {
    await applyInactiveFilter();
    let activated = 0;
    let emptyRounds = 0;
    const attempted = new WeakSet();

    while (activated < limit && emptyRounds < 5) {
      const target = activationControl(attempted);
      if (!target) {
        window.scrollBy({ top: Math.max(420, window.innerHeight * 0.7), behavior: "instant" });
        emptyRounds += 1;
        await wait(350);
        continue;
      }
      attempted.add(target);
      target.scrollIntoView({ block: "center", behavior: "instant" });
      const previousLabel = controlText(target);
      target.click();
      if (await activationConfirmed(target, previousLabel)) {
        activated += 1;
        emptyRounds = 0;
        await wait(120);
      } else {
        emptyRounds += 1;
      }
    }
    return { ok: true, activated, requested: limit, filteredBy: "Nao ativados" };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "TABARATO_ACTIVATE_COUPONS") return false;
    activateCoupons(Math.max(1, Math.min(100, Number(message.limit) || 5)))
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || "Falha ao ativar cupons." }));
    return true;
  });
})();
