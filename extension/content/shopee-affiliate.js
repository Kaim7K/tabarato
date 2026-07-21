(() => {
  if (globalThis.__taBaratoShopeeAffiliateLoaded) return;
  globalThis.__taBaratoShopeeAffiliateLoaded = true;

  const STORAGE_KEY = "tabarato_shopee_affiliate_request_v1";
  const RESULT_KEY = "tabarato_shopee_affiliate_result_v1";
  const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
  const normalized = (value = "") => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visible = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitFor = async (read, timeout = 15000, interval = 250) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const value = read();
      if (value) return value;
      await wait(interval);
    }
    return null;
  };

  const validAffiliate = (value = "") => {
    try {
      const url = new URL(clean(value));
      const target = `${url.hostname}${url.pathname}`;
      if (/careers|about|seller|help|support/i.test(target)) return false;
      if (/^s\.shopee\.com\.br$/i.test(url.hostname)) return url.pathname.length > 2;
      if (/^(?:shope\.ee|s\.shopee\.ee)$/i.test(url.hostname)) return url.pathname.length > 1;
      return /^(?:www\.)?shopee\.com\.br$/i.test(url.hostname)
        && /(?:af_siteid|affiliate_id|aff_id|utm_source|utm_medium=affiliates?)/i.test(url.search);
    } catch { return false; }
  };

  const urlsIn = (value = "") => clean(value).match(/https:\/\/[^\s"'<>]+/gi) || [];
  const resultCandidates = () => {
    const values = [];
    document.querySelectorAll("input, textarea, a[href], [role='textbox'], [data-clipboard-text]").forEach((element) => {
      values.push(element.value || element.href || element.getAttribute("data-clipboard-text") || element.textContent || "");
    });
    return values.flatMap(urlsIn).filter(validAffiliate);
  };
  const findResult = () => resultCandidates()[0] || "";

  const clickElement = (element) => {
    if (!element) return false;
    element.scrollIntoView?.({ block: "center", behavior: "instant" });
    element.focus?.({ preventScroll: true });
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach((type) => {
      const EventClass = type.startsWith("pointer") && globalThis.PointerEvent ? PointerEvent : MouseEvent;
      element.dispatchEvent(new EventClass(type, { bubbles: true, cancelable: true, view: window }));
    });
    return true;
  };

  const nativeSetValue = (element, value) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(element, value);
  };

  const setValue = async (element, value) => {
    if (!element) return false;
    element.scrollIntoView?.({ block: "center", behavior: "instant" });
    element.focus?.();
    nativeSetValue(element, "");
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward", data: null }));
    nativeSetValue(element, value);
    element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
    await wait(120);
    if (clean(element.value) !== clean(value)) {
      element.focus?.();
      nativeSetValue(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return clean(element.value) === clean(value);
  };

  const allClickable = () => [...document.querySelectorAll("a, button, [role='button'], input[type='button'], input[type='submit']")].filter(visible);
  const byText = (pattern) => allClickable().find((element) => pattern.test(normalized(`${element.textContent} ${element.value || ""} ${element.getAttribute("aria-label") || ""}`)));

  const isProductOfferPage = () => /oferta de produto/i.test(normalized(document.body.innerText))
    && Boolean([...document.querySelectorAll("input")].find((input) => /buscar por todos os produtos/i.test(normalized(input.placeholder))));

  const navigateToProductOffers = async () => {
    if (isProductOfferPage()) return true;
    const menu = byText(/^oferta de produto$/i) || byText(/oferta de produto/i);
    if (!menu) return false;
    clickElement(menu);
    return Boolean(await waitFor(isProductOfferPage, 18000));
  };

  const searchInput = () => [...document.querySelectorAll("input[type='text'], input:not([type]), input[type='search']")]
    .filter(visible)
    .find((input) => /buscar por todos os produtos na shopee|buscar.*produtos/i.test(normalized(`${input.placeholder} ${input.getAttribute("aria-label") || ""}`)));

  const searchButton = () => byText(/^pesquisar$/i) || byText(/pesquisar/i);

  const similarity = (left, right) => {
    const a = new Set(normalized(left).split(/\W+/).filter((word) => word.length > 2));
    const b = new Set(normalized(right).split(/\W+/).filter((word) => word.length > 2));
    if (!a.size || !b.size) return 0;
    let matches = 0;
    a.forEach((word) => { if (b.has(word)) matches += 1; });
    return matches / Math.min(a.size, b.size);
  };

  const parseMoney = (text = "") => {
    const match = clean(text).match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i);
    if (!match) return 0;
    const number = Number(match[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(number) ? number : 0;
  };

  const parseSales = (text = "") => {
    const match = normalized(text).match(/(\d+(?:[.,]\d+)?)\s*(mil|k)?\+?\s*vendas?/i);
    if (!match) return 0;
    const base = Number(match[1].replace(",", "."));
    if (!Number.isFinite(base)) return 0;
    return base * (match[2] ? 1000 : 1);
  };

  const productCards = () => {
    const buttons = allClickable().filter((element) => /obter link/i.test(normalized(element.textContent || element.value)));
    const cards = [];
    buttons.forEach((button) => {
      let card = button;
      for (let i = 0; i < 7 && card?.parentElement; i += 1) {
        card = card.parentElement;
        const text = normalized(card.textContent);
        if (/R\$/.test(card.textContent || "") && /vendas?/.test(text)) break;
      }
      if (card && !cards.includes(card)) cards.push(card);
    });
    return cards.filter(visible);
  };

  const chooseBestCard = (request) => {
    const itemId = String(request.externalProductId || "").split(".").pop();
    const candidates = productCards().map((card) => {
      const text = clean(card.textContent);
      const cardLinks = [...card.querySelectorAll("a[href]")].map((link) => link.href);
      const links = cardLinks.join(" ");
      const productUrl = cardLinks.find((href) => /shopee\.com\.br\/.*(?:-i\.\d+\.\d+|\/product\/\d+\/\d+)/i.test(href)) || "";
      let relevance = similarity(request.productName || "", text);
      if (itemId && links.includes(itemId)) relevance += 2;
      if (request.sourceUrl && links.includes(request.sourceUrl)) relevance += 3;
      return { card, text, relevance, price: parseMoney(text), sales: parseSales(text), productUrl };
    }).filter((item) => item.relevance >= 0.28 && item.price > 0);

    if (!candidates.length) return null;
    const maximumSales = Math.max(...candidates.map((item) => item.sales), 1);
    const minimumPrice = Math.min(...candidates.map((item) => item.price));
    const maximumPrice = Math.max(...candidates.map((item) => item.price));
    candidates.forEach((item) => {
      const salesScore = Math.log10(item.sales + 1) / Math.log10(maximumSales + 1);
      const priceScore = maximumPrice === minimumPrice ? 1 : (maximumPrice - item.price) / (maximumPrice - minimumPrice);
      const relevanceScore = Math.min(1, item.relevance);
      // Buyer value: sufficiently similar, proven by sales, and competitively priced.
      item.buyerScore = relevanceScore * 0.25 + salesScore * 0.45 + priceScore * 0.30;
    });
    candidates.sort((left, right) => right.buyerScore - left.buyerScore || right.sales - left.sales || left.price - right.price);
    return candidates[0];
  };

  const detailsPageMatches = (request) => {
    const heading = [...document.querySelectorAll("h1, h2, h3")].map((item) => clean(item.textContent)).join(" ");
    return /detalhes da oferta do produto/i.test(normalized(document.body.innerText))
      && similarity(request.productName || "", heading || document.body.innerText.slice(0, 2500)) >= 0.2;
  };

  const clickObterLink = (root = document) => {
    const buttons = [...root.querySelectorAll("button, a, [role='button']")].filter(visible);
    const button = buttons.find((element) => /^obter link$/i.test(normalized(element.textContent)))
      || buttons.find((element) => /obter link/i.test(normalized(element.textContent)));
    return clickElement(button);
  };

  const submitSearch = async (input) => {
    const button = await waitFor(searchButton, 3500, 150);
    if (button) {
      clickElement(button);
      await wait(300);
      return true;
    }
    const form = input.closest("form");
    if (form?.requestSubmit) {
      form.requestSubmit();
      await wait(300);
      return true;
    }
    ["keydown", "keypress", "keyup"].forEach((type) => input.dispatchEvent(new KeyboardEvent(type, {
      key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true,
    })));
    return true;
  };

  const searchProduct = async (request) => {
    const input = await waitFor(searchInput, 12000);
    if (!input) return false;
    const searchTerm = clean(request.productName || request.externalProductId || request.sourceUrl);
    let filled = await setValue(input, searchTerm);
    if (!filled) {
      await wait(300);
      filled = await setValue(input, searchTerm);
    }
    if (!filled) return false;
    await submitSearch(input);
    await wait(1000);
    const chosen = await waitFor(() => chooseBestCard(request), 20000, 400);
    if (!chosen) return false;
    await chrome.storage.local.set({ [`${STORAGE_KEY}_selection`]: {
      requestId: request.requestId,
      productName: clean(chosen.text).slice(0, 300),
      price: chosen.price,
      sales: chosen.sales,
      buyerScore: chosen.buyerScore,
      selectedProductUrl: chosen.productUrl || "",
      selectedProductName: clean(chosen.text).slice(0, 300),
      at: Date.now(),
    } });
    return clickObterLink(chosen.card);
  };

  const closeLinkModal = () => {
    const dialog = [...document.querySelectorAll("[role='dialog'], .ant-modal, [class*='modal']")].find((item) => visible(item) && /link de oferta de produto/i.test(normalized(item.textContent)));
    if (!dialog) return false;
    const close = [...dialog.querySelectorAll("button, [role='button'], [aria-label]")].find((element) => {
      const label = normalized(`${element.textContent} ${element.getAttribute("aria-label") || ""}`);
      return /^(fechar|close|x)$/.test(label) || /fechar|close/.test(label);
    });
    return clickElement(close);
  };

  const clickCopyAndRead = async () => {
    // O link é lido diretamente do campo. Não clicamos em “Copiar Link”, pois
    // o portal abre um prompt nativo que exige interação manual.
    const link = await waitFor(findResult, 18000, 250);
    if (!link) return "";
    closeLinkModal();
    return link;
  };

  const persistResult = async (request, affiliateLink) => {
    const selectionKey = `${STORAGE_KEY}_selection`;
    const stored = await chrome.storage.local.get(selectionKey);
    const selection = stored[selectionKey] || {};
    await chrome.storage.local.set({ [RESULT_KEY]: {
      ...request,
      affiliateLink,
      selectedProductUrl: selection.requestId === request.requestId ? selection.selectedProductUrl || "" : "",
      selectedProductName: selection.requestId === request.requestId ? selection.selectedProductName || "" : "",
      selectedPrice: selection.requestId === request.requestId ? selection.price || 0 : 0,
      selectedSales: selection.requestId === request.requestId ? selection.sales || 0 : 0,
      at: Date.now(),
    } });
    await chrome.storage.local.remove([STORAGE_KEY, selectionKey]);
  };

  let running = false;
  async function process() {
    if (running) return;
    running = true;
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const request = stored[STORAGE_KEY];
      if (!request?.sourceUrl || request.expiresAt < Date.now()) return;

      const existing = findResult();
      if (existing) return persistResult(request, existing);

      if (detailsPageMatches(request)) {
        clickObterLink(document);
        const result = await clickCopyAndRead();
        if (result) await persistResult(request, result);
        return;
      }

      const ready = await navigateToProductOffers();
      if (!ready) return;
      const opened = await searchProduct(request);
      if (!opened) return;

      const directResult = await clickCopyAndRead();
      if (directResult) {
        await persistResult(request, directResult);
        return;
      }

      if (detailsPageMatches(request)) {
        clickObterLink(document);
        const finalResult = await clickCopyAndRead();
        if (finalResult) await persistResult(request, finalResult);
      }
    } finally {
      running = false;
    }
  }

  process().catch(() => {});
  const observer = new MutationObserver(() => process().catch(() => {}));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 180000);
})();
