(() => {
  if (globalThis.__taBaratoShopeeAffiliateLoaded) return;
  globalThis.__taBaratoShopeeAffiliateLoaded = true;

  const STORAGE_KEY = "tabarato_shopee_affiliate_request_v1";
  const RESULT_KEY = "tabarato_shopee_affiliate_result_v1";
  const SELECTION_KEY = `${STORAGE_KEY}_selection`;
  const FLOW_KEY = `${STORAGE_KEY}_flow`;
  const runtime = globalThis.TaBaratoRuntime;
  const pageContext = globalThis.TaBaratoPageContext;
  let flowController = null;
  let flowRequestId = "";
  const clean = pageContext?.clean || ((value = "") => String(value).replace(/\s+/g, " ").trim());
  const normalized = pageContext?.normalized || ((value = "") => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
  const visible = pageContext?.visible || ((element) => {
    if (!element?.isConnected) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  });
  const waitFor = (read, options = {}) => {
    const signal = options.signal || flowController?.signal;
    return pageContext?.waitFor
      ? pageContext.waitFor(read, { ...options, signal })
      : runtime.poll(read, { timeout: options.timeout || 12000, interval: 250, signal });
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
      if (!visible(element) && !element.closest("[role='dialog'], .ant-modal, [class*='modal' i]")) return;
      values.push(element.value || element.href || element.getAttribute("data-clipboard-text") || element.textContent || "");
    });
    return values.flatMap(urlsIn).filter(validAffiliate);
  };
  const findResult = () => resultCandidates()[0] || "";

  const clickElement = (element) => {
    runtime?.throwIfAborted?.(flowController?.signal);
    if (!element || !visible(element)) return false;
    element.scrollIntoView?.({ block: "center", behavior: "instant" });
    element.focus?.({ preventScroll: true });
    element.click?.();
    return true;
  };

  const nativeSetValue = (element, value) => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
  };

  const setValue = async (element, value) => {
    runtime?.throwIfAborted?.(flowController?.signal);
    if (!element) return false;
    element.scrollIntoView?.({ block: "center", behavior: "instant" });
    element.focus?.();
    nativeSetValue(element, "");
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward", data: null }));
    nativeSetValue(element, value);
    element.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    await waitFor(() => clean(element.value) === clean(value), { timeout: 1200 });
    return clean(element.value) === clean(value);
  };

  const allClickable = () => [...document.querySelectorAll(
    "a, button, select, [role='button'], [role='combobox'], [role='option'], .ant-select-selector, input[type='button'], input[type='submit']",
  )].filter(visible);
  const byText = (pattern) => allClickable().find((element) => pattern.test(normalized(
    `${element.textContent} ${element.value || ""} ${element.getAttribute("aria-label") || ""}`,
  )));

  const route = () => pageContext?.snapshot?.().route || "affiliate-other";
  const noResults = () => /nenhum resultado|nao encontramos|sem resultados|nenhum produto/i.test(normalized(document.body?.innerText || ""));
  const isProductOfferPage = () => route() === "affiliate-product-offers"
    || (/oferta de produto/i.test(normalized(document.body?.innerText || "")) && Boolean(searchInput()));

  const fail = async (request, message, code = "SHOPEE_AFFILIATE_FLOW_ERROR") => {
    await chrome.storage.local.set({
      [RESULT_KEY]: {
        requestId: request?.requestId || "",
        error: message,
        errorCode: code,
        at: Date.now(),
      },
    });
    await chrome.storage.local.remove([STORAGE_KEY, SELECTION_KEY, FLOW_KEY]);
  };

  const navigateToProductOffers = async () => {
    if (isProductOfferPage()) return true;
    const menu = byText(/^oferta de produto$/i) || byText(/oferta de produto/i);
    if (!menu) return false;
    clickElement(menu);
    return Boolean(await waitFor(isProductOfferPage, {
      timeout: 15000,
      timeoutMessage: "O painel da Shopee não abriu a página Oferta de produto.",
    }));
  };

  function searchInput() {
    const inputs = [...document.querySelectorAll("input[type='text'], input:not([type]), input[type='search']")].filter(visible);
    return inputs.find((input) => /buscar por todos os produtos na shopee|buscar.*produtos/i.test(normalized(
      `${input.placeholder} ${input.getAttribute("aria-label") || ""}`,
    ))) || inputs.find((input) => input.closest("form") && /pesquisar/i.test(normalized(input.closest("form").textContent)));
  }

  const searchButton = () => byText(/^pesquisar$/i) || byText(/pesquisar/i);

  const searchTerms = (value = "") => {
    const original = clean(value);
    const stop = new Set(["novo", "nova", "original", "premium", "oficial", "produto", "alta", "qualidade", "global", "com", "para", "por", "de", "da", "do", "das", "dos", "e", "em", "a", "o"]);
    const meaningful = original.split(/\s+/).filter((word) => {
      const token = normalized(word).replace(/[^a-z0-9]/g, "");
      return token.length > 2 && !stop.has(token);
    });
    return [...new Set([
      original,
      meaningful.slice(0, 10).join(" "),
      meaningful.slice(0, 7).join(" "),
      meaningful.slice(0, 5).join(" "),
    ].map(clean).filter((term) => term.length >= 5))];
  };

  const applyLowestPriceFilter = async () => {
    const pattern = /preco.*mais baixo.*mais alto|mais baixo.*mais alto/i;
    const nativeSelect = [...document.querySelectorAll("select")].find((element) => visible(element)
      && [...element.options].some((option) => pattern.test(normalized(option.textContent))));
    if (nativeSelect) {
      const option = [...nativeSelect.options].find((item) => pattern.test(normalized(item.textContent)));
      if (!option) return false;
      if (nativeSelect.value !== option.value) {
        nativeSelect.value = option.value;
        nativeSelect.dispatchEvent(new Event("input", { bubbles: true }));
        nativeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return Boolean(await waitFor(() => {
        const selected = nativeSelect.options[nativeSelect.selectedIndex];
        return selected && pattern.test(normalized(selected.textContent));
      }, { timeout: 2200 }));
    }

    const selectedPriceLabel = () => [...document.querySelectorAll(
      "[role='combobox'], .ant-select-selection-item, .ant-select-selector, [class*='select' i]",
    )].find((element) => visible(element) && pattern.test(normalized(
      `${element.textContent} ${element.getAttribute("aria-label") || ""}`,
    )));
    if (selectedPriceLabel()) return true;

    const trigger = allClickable().find((element) => {
      const label = normalized(`${element.textContent} ${element.value || ""} ${element.getAttribute("aria-label") || ""}`);
      return /^preco$/.test(label) || /^preco:/.test(label) || /ordenar.*preco/.test(label) || /selecionar.*preco/.test(label);
    });
    if (!trigger || !clickElement(trigger)) return false;
    const option = await waitFor(() => [...document.querySelectorAll("[role='option'], li, .ant-select-item-option, button, a")]
      .filter(visible)
      .find((element) => pattern.test(normalized(`${element.textContent} ${element.getAttribute("aria-label") || ""}`))), { timeout: 4000 });
    if (!clickElement(option)) return false;
    return Boolean(await waitFor(selectedPriceLabel, { timeout: 3200 }));
  };


  const similarity = (left, right) => {
    const a = new Set(normalized(left).split(/\W+/).filter((word) => word.length > 2));
    const b = new Set(normalized(right).split(/\W+/).filter((word) => word.length > 2));
    if (!a.size || !b.size) return 0;
    let matches = 0;
    a.forEach((word) => { if (b.has(word)) matches += 1; });
    return matches / Math.min(a.size, b.size);
  };

  const parseMoney = (text = "") => {
    const matches = [...clean(text).matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/gi)]
      .map((match) => Number(match[1].replace(/\./g, "").replace(",", ".")))
      .filter((value) => Number.isFinite(value) && value > 0);
    return matches[0] || 0;
  };

  const parseSales = (text = "") => {
    const match = normalized(text).match(/(\d+(?:[.,]\d+)?)\s*(mil|k)?\+?\s*vendas?/i);
    if (!match) return 0;
    const base = Number(match[1].replace(",", "."));
    return Number.isFinite(base) ? base * (match[2] ? 1000 : 1) : 0;
  };

  const productUrlFrom = (root = document) => {
    const links = [...root.querySelectorAll("a[href]")]
      .filter((link) => visible(link) || root !== document)
      .map((link) => ({ href: link.href, label: normalized(`${link.textContent} ${link.getAttribute("aria-label") || ""}`) }));
    const productPattern = /shopee\.com\.br\/.*(?:-i\.\d+\.\d+|\/product\/\d+\/\d+)/i;
    return links.find((item) => /ver produto|visualizar produto|abrir produto/.test(item.label) && productPattern.test(item.href))?.href
      || links.find((item) => productPattern.test(item.href))?.href
      || "";
  };

  const productTitleFromCard = (card) => {
    const selectors = ["[title]", "a[href]", "h3", "h4", "[class*='name' i]", "[class*='title' i]"];
    for (const selector of selectors) {
      const candidates = [...card.querySelectorAll(selector)].map((element) => clean(element.getAttribute("title") || element.textContent));
      const title = candidates.find((value) => value.length >= 12 && !/obter link|comissao|taxa de comissao|vendas|r\$/i.test(value));
      if (title) return title;
    }
    return clean(card.textContent).split(/comissao extra|r\$/i)[0].trim();
  };

  const productCards = () => {
    const buttons = allClickable().filter((element) => /obter link/i.test(normalized(element.textContent || element.value)));
    const cards = [];
    buttons.forEach((button) => {
      let card = button;
      for (let index = 0; index < 7 && card?.parentElement; index += 1) {
        card = card.parentElement;
        const text = normalized(card.textContent);
        if (/R\$/.test(card.textContent || "") && /vendas?/.test(text)) break;
      }
      if (card && !cards.includes(card)) cards.push(card);
    });
    return cards.filter(visible);
  };

  const cardCandidates = (request) => {
    const itemId = String(request.externalProductId || "").split(".").pop();
    const requestedTitle = normalized(request.productName || "");
    return productCards().map((card, index) => {
      const text = clean(card.textContent);
      const title = productTitleFromCard(card);
      const cardLinks = [...card.querySelectorAll("a[href]")].map((link) => link.href);
      const links = cardLinks.join(" ");
      const productUrl = productUrlFrom(card);
      const titleNormalized = normalized(title || text);
      const relevance = similarity(request.productName || "", title || text);
      const price = parseMoney(text);
      return {
        card,
        text,
        title,
        relevance,
        price,
        sales: parseSales(text),
        productUrl,
        index,
        offerKey: `${titleNormalized}|${price.toFixed(2)}`,
        exact: Boolean(
          (itemId && links.includes(itemId))
          || (request.sourceUrl && links.includes(request.sourceUrl))
          || (requestedTitle && titleNormalized === requestedTitle)
          || relevance >= 0.96
        ),
      };
    }).filter((item) => item.price > 0 && item.relevance >= 0.34);
  };

  const chooseExactCard = (request) => cardCandidates(request)
    .filter((item) => item.exact)
    .sort((left, right) => right.relevance - left.relevance || left.price - right.price || right.sales - left.sales || left.index - right.index)[0] || null;

  const chooseBestAlternativeCard = (request) => cardCandidates(request)
    .filter((item) => !item.exact)
    .sort((left, right) => left.price - right.price || right.sales - left.sales || right.relevance - left.relevance || left.index - right.index)[0] || null;

  const detailsPageMatches = (request) => {
    if (route() !== "affiliate-offer-details" && !/detalhes da oferta do produto/i.test(normalized(document.body?.innerText || ""))) return false;
    const heading = [...document.querySelectorAll("h1, h2, h3")].map((item) => clean(item.textContent)).join(" ");
    const currentProductUrl = clean(productUrlFrom(document)).split(/[?#]/)[0];
    const excluded = new Set((request.excludedProductUrls || []).map((url) => clean(url).split(/[?#]/)[0]));
    return !(currentProductUrl && excluded.has(currentProductUrl))
      && similarity(request.productName || "", heading || document.body.innerText.slice(0, 2500)) >= 0.2;
  };

  const clickObterLink = (root = document) => {
    const button = [...root.querySelectorAll("button, a, [role='button']")]
      .filter(visible)
      .find((element) => /^obter link$/i.test(normalized(element.textContent)))
      || [...root.querySelectorAll("button, a, [role='button']")]
        .filter(visible)
        .find((element) => /obter link/i.test(normalized(element.textContent)));
    return clickElement(button);
  };

  const submitSearch = async (input) => {
    const button = await waitFor(searchButton, { timeout: 3500 });
    if (button) return clickElement(button);
    const form = input.closest("form");
    if (form?.requestSubmit) {
      form.requestSubmit();
      return true;
    }
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true, cancelable: true }));
    return true;
  };

  const resultsSignature = () => productCards().map((card) => normalized(card.textContent)).join("|");

  const runSearch = async (input, searchTerm) => {
    if (!(await setValue(input, searchTerm))) {
      throw new Error("A Shopee não confirmou o preenchimento da barra de busca.");
    }
    const before = resultsSignature();
    if (!(await submitSearch(input))) throw new Error("O botão Pesquisar da Shopee não respondeu.");
    await waitFor(() => {
      const now = resultsSignature();
      return noResults() || (productCards().length > 0 && (now !== before || normalized(input.value) === normalized(searchTerm)));
    }, { timeout: 7000 });
    if (noResults()) return { found: false, lowestPriceApplied: false };
    const lowestPriceApplied = await applyLowestPriceFilter();
    await waitFor(() => productCards().length > 0, { timeout: 3500 });
    return { found: productCards().length > 0, lowestPriceApplied };
  };

  const recordSelection = async (request, chosen, searchTerm, matchType) => {
    await chrome.storage.local.set({
      [SELECTION_KEY]: {
        requestId: request.requestId,
        searchTerm,
        productName: clean(chosen.title || chosen.text).slice(0, 300),
        price: chosen.price,
        sales: chosen.sales,
        selectedProductUrl: chosen.productUrl || "",
        selectedProductName: clean(chosen.title || chosen.text).slice(0, 300),
        offerKey: chosen.offerKey,
        matchType,
        at: Date.now(),
      },
      [FLOW_KEY]: { requestId: request.requestId, phase: "waiting-link", at: Date.now() },
    });
  };

  const updateSelectionFromDetails = async (request) => {
    const stored = await chrome.storage.local.get(SELECTION_KEY);
    const selection = stored[SELECTION_KEY] || {};
    if (selection.requestId !== request.requestId) return selection;
    const selectedProductUrl = productUrlFrom(document) || selection.selectedProductUrl || "";
    const heading = [...document.querySelectorAll("h1, h2, h3")]
      .map((item) => clean(item.textContent))
      .find((value) => value.length >= 12 && !/detalhes da oferta/i.test(value)) || selection.selectedProductName || "";
    const detailPrice = parseMoney(document.body?.innerText || "") || selection.price || 0;
    const next = { ...selection, selectedProductUrl, selectedProductName: heading, detailPrice, at: Date.now() };
    await chrome.storage.local.set({ [SELECTION_KEY]: next });
    return next;
  };

  const persistBrowseReady = async (request, searchTerm, lowestPriceApplied) => {
    await chrome.storage.local.set({
      [RESULT_KEY]: {
        requestId: request.requestId,
        browseReady: true,
        searchTerm,
        lowestPriceApplied: Boolean(lowestPriceApplied),
        at: Date.now(),
      },
    });
    await chrome.storage.local.remove([STORAGE_KEY, SELECTION_KEY, FLOW_KEY]);
  };

  const searchProduct = async (request) => {
    const input = await waitFor(searchInput, { timeout: 12000 });
    if (!input) throw new Error("A barra de busca de ofertas não foi encontrada.");
    const exactTerm = clean(request.productName || request.externalProductId || request.sourceUrl);
    if (!exactTerm) throw new Error("O produto não possui um nome válido para pesquisa.");

    const exactSearch = await runSearch(input, exactTerm);
    if (request.mode === "browse-only") {
      if (!exactSearch.found) throw new Error("A Shopee não encontrou resultados para o nome exato do produto.");
      if (!exactSearch.lowestPriceApplied) throw new Error("A Shopee exibiu resultados, mas o filtro de menor preço não pôde ser confirmado.");
      await persistBrowseReady(request, exactTerm, exactSearch.lowestPriceApplied);
      return "browse-ready";
    }

    let chosen = await waitFor(() => chooseExactCard(request), { timeout: 2200 });
    let matchType = "exact";
    let usedTerm = exactTerm;

    if (!chosen) {
      chosen = await waitFor(() => chooseBestAlternativeCard(request), { timeout: 1200 });
      matchType = "alternative";
    }

    if (!chosen) {
      const fallbackTerms = searchTerms(exactTerm).filter((term) => normalized(term) !== normalized(exactTerm));
      for (const term of fallbackTerms) {
        await runSearch(input, term);
        chosen = await waitFor(() => chooseExactCard(request) || chooseBestAlternativeCard(request), { timeout: 1800 });
        if (chosen) {
          usedTerm = term;
          matchType = chosen.exact ? "exact" : "alternative";
          break;
        }
      }
    }

    if (!chosen) throw new Error("Nenhuma oferta compatível foi encontrada no painel da Shopee.");
    await recordSelection(request, chosen, usedTerm, matchType);
    if (!clickObterLink(chosen.card)) throw new Error("O botão Obter link da oferta escolhida não foi encontrado.");
    return "waiting-link";
  };

  const closeLinkModal = () => {
    const dialog = [...document.querySelectorAll("[role='dialog'], .ant-modal, [class*='modal' i]")]
      .find((item) => visible(item) && /link de oferta de produto/i.test(normalized(item.textContent)));
    if (!dialog) return false;
    const close = [...dialog.querySelectorAll("button, [role='button'], [aria-label]")].find((element) => {
      const label = normalized(`${element.textContent} ${element.getAttribute("aria-label") || ""}`);
      return /^(fechar|close|x)$/.test(label) || /fechar|close/.test(label);
    });
    return clickElement(close);
  };

  const readLinkResult = async () => {
    const link = await waitFor(findResult, { timeout: 10000 });
    if (!link) return "";
    closeLinkModal();
    return link;
  };

  const persistResult = async (request, affiliateLink) => {
    if (detailsPageMatches(request)) await updateSelectionFromDetails(request);
    const stored = await chrome.storage.local.get(SELECTION_KEY);
    const selection = stored[SELECTION_KEY] || {};
    await chrome.storage.local.set({
      [RESULT_KEY]: {
        ...request,
        affiliateLink,
        selectedProductUrl: selection.requestId === request.requestId ? selection.selectedProductUrl || "" : "",
        selectedProductName: selection.requestId === request.requestId ? selection.selectedProductName || "" : "",
        selectedPrice: selection.requestId === request.requestId ? selection.detailPrice || selection.price || 0 : 0,
        selectedSales: selection.requestId === request.requestId ? selection.sales || 0 : 0,
        selectedOfferKey: selection.requestId === request.requestId ? selection.offerKey || "" : "",
        matchType: selection.requestId === request.requestId ? selection.matchType || "alternative" : "alternative",
        at: Date.now(),
      },
    });
    await chrome.storage.local.remove([STORAGE_KEY, SELECTION_KEY, FLOW_KEY]);
  };

  let running = false;
  let queued = false;
  let scheduleTimer = null;
  let activeRequestId = "";

  async function process() {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      const stored = await chrome.storage.local.get([STORAGE_KEY, FLOW_KEY]);
      const request = stored[STORAGE_KEY];
      const flow = stored[FLOW_KEY];
      activeRequestId = request?.requestId || "";
      if (!request?.sourceUrl) {
        if (flowController && !flowController.signal.aborted) flowController.abort(new Error("Solicitação encerrada."));
        flowController = null;
        flowRequestId = "";
        return;
      }
      if (!flowController || flowRequestId !== request.requestId || flowController.signal.aborted) {
        if (flowController && !flowController.signal.aborted) flowController.abort(new Error("Solicitação substituída."));
        flowController = new AbortController();
        flowRequestId = request.requestId;
      }
      if (request.expiresAt < Date.now()) {
        await fail(request, "A solicitação expirou. Inicie novamente pelo painel.", "REQUEST_EXPIRED");
        return;
      }

      const context = pageContext?.snapshot?.() || { route: route() };
      if (context.route === "auth-required") {
        await fail(request, "Entre novamente no Portal de Afiliados da Shopee e repita a ação.", "AUTH_REQUIRED");
        return;
      }
      if (context.route === "error") {
        await fail(request, "O Portal de Afiliados apresentou um erro. Recarregue a página e tente novamente.", "PLATFORM_ERROR");
        return;
      }

      const existing = findResult();
      if (existing) {
        await persistResult(request, existing);
        return;
      }

      if (detailsPageMatches(request)) {
        await updateSelectionFromDetails(request);
        if (!clickObterLink(document)) return;
        const result = await readLinkResult();
        if (result) await persistResult(request, result);
        return;
      }

      if (flow?.requestId === request.requestId && flow.phase === "waiting-link") {
        const result = await readLinkResult();
        if (result) await persistResult(request, result);
        return;
      }

      if (!(await navigateToProductOffers())) return;
      await searchProduct(request);
    } catch (error) {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const request = stored[STORAGE_KEY];
      if (request) await fail(request, runtime?.errorMessage?.(error, "Não foi possível concluir o fluxo da Shopee.") || error.message);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        scheduleProcess(0);
      }
    }
  }

  function scheduleProcess(delay = 120) {
    clearTimeout(scheduleTimer);
    scheduleTimer = setTimeout(() => process().catch(() => {}), delay);
  }

  scheduleProcess(0);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || (!changes[STORAGE_KEY] && !changes[FLOW_KEY])) return;
    if (changes[STORAGE_KEY]) {
      activeRequestId = changes[STORAGE_KEY].newValue?.requestId || "";
      if (!activeRequestId && flowController && !flowController.signal.aborted) {
        flowController.abort(new Error("Solicitação cancelada pelo painel."));
      }
    }
    scheduleProcess(0);
  });
  pageContext?.observeNavigation?.(() => { if (activeRequestId) scheduleProcess(60); });
  const observer = new MutationObserver(() => { if (activeRequestId) scheduleProcess(140); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 180000);
})();
