(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.capture) return;

  const { LIMITS, STORAGE, activeTab, beginOperation, endOperation, elements, setBusy, showToast, state, updateOperation } = panel;
  const runtime = globalThis.TaBaratoRuntime;
  const { comparableUrl, parsePrice, formatPrice } = globalThis.TaBaratoProductUtils;

  function comparisonSnapshot(product = state.activeProduct) {
    const price = parsePrice(product?.currentPrice);
    if (!product || !Number.isFinite(price)) return null;
    return {
      productName: product.productName || "",
      platform: product.platform || "",
      sourceUrl: product.sourceUrl || "",
      originalPrice: price,
      foundPrice: null,
      startedAt: Date.now(),
    };
  }

  function renderComparison() {
    const comparison = state.priceComparison;
    elements.priceComparison.classList.toggle("hidden", !comparison);
    if (!comparison) return;
    elements.comparisonOriginalPrice.textContent = formatPrice(comparison.originalPrice);
    elements.comparisonFoundPrice.textContent = Number.isFinite(comparison.foundPrice) ? formatPrice(comparison.foundPrice) : "—";
    const difference = Number.isFinite(comparison.foundPrice) ? comparison.originalPrice - comparison.foundPrice : null;
    const percent = Number.isFinite(difference) && comparison.originalPrice > 0 ? (difference / comparison.originalPrice) * 100 : null;
    elements.comparisonDifference.textContent = Number.isFinite(difference) ? `${difference >= 0 ? "-" : "+"} ${formatPrice(Math.abs(difference))}` : "—";
    elements.comparisonPercent.textContent = Number.isFinite(percent) ? `${percent >= 0 ? "" : "+"}${Math.abs(percent).toFixed(1).replace(".", ",")}%` : "—";
    elements.comparisonDifference.dataset.tone = Number.isFinite(difference) ? (difference >= 0 ? "positive" : "negative") : "";
    elements.comparisonPercent.dataset.tone = Number.isFinite(percent) ? (percent >= 0 ? "positive" : "negative") : "";
    elements.comparisonStatus.textContent = Number.isFinite(comparison.foundPrice)
      ? "Produto encontrado capturado. Compare antes de substituir ou publicar."
      : "O preço original ficará visível durante a pesquisa.";
  }

  async function startComparison(product) {
    state.priceComparison = comparisonSnapshot(product);
    if (!state.priceComparison) return;
    await chrome.storage.local.set({ [STORAGE.priceComparison]: state.priceComparison }).catch(() => {});
    renderComparison();
  }

  async function updateComparison(product) {
    if (!state.priceComparison) return;
    const price = parsePrice(product?.currentPrice);
    if (!Number.isFinite(price)) return;
    state.priceComparison = { ...state.priceComparison, foundPrice: price, foundProductName: product.productName || "", updatedAt: Date.now() };
    await chrome.storage.local.set({ [STORAGE.priceComparison]: state.priceComparison }).catch(() => {});
    renderComparison();
  }

  async function clearComparison() {
    state.priceComparison = null;
    await chrome.storage.local.remove(STORAGE.priceComparison).catch(() => {});
    renderComparison();
  }

  function scriptsForUrl(value) {
    try {
      const hostname = new URL(value).hostname;
      const shared = ["shared/page-context.js", "content/shared.js"];
      if (/mercadolivre|mercadolibre/i.test(hostname)) {
        return [...shared, "content/stores/mercado-livre.js", "content/stores/generic.js", "content/index.js"];
      }
      if (/shopee/i.test(hostname)) {
        return [...shared, "content/stores/shopee.js", "content/stores/generic.js", "content/index.js"];
      }
      return [...shared, "content/stores/generic.js", "content/index.js"];
    } catch {
      return [];
    }
  }

  function isCouponManagementUrl(value) {
    try {
      const url = new URL(value);
      return /(?:^|\.)mercadolivre\.com\.br$/i.test(url.hostname) && /^\/cupons(?:\/|$)/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function isPrimarySiteUrl(value) {
    try {
      return Boolean(state.session?.baseUrl) && new URL(value).origin === new URL(state.session.baseUrl).origin;
    } catch {
      return false;
    }
  }

  async function ensureScripts(tab, signal) {
    runtime.throwIfAborted(signal);
    const availability = await chrome.runtime.sendMessage({ type: "TABARATO_IS_ALLOWED_PAGE", url: tab.url });
    if (!availability?.allowed) throw new Error("Abra uma pagina permitida pelo Ta Barato.");
    const files = scriptsForUrl(tab.url);
    if (!files.length) throw new Error("Esta pagina nao oferece captura de produtos.");
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      files: ["shared/runtime.js", "shared/coupon-code.js", ...files],
    });
    runtime.throwIfAborted(signal);
  }

  async function extractFromTab(tab, signal) {
    const send = () => runtime.withTimeout(
      chrome.tabs.sendMessage(tab.id, { type: "TABARATO_EXTRACT_PRODUCT" }, { frameId: 0 }),
      LIMITS.captureTimeout,
      "A loja demorou para responder. Recarregue a pagina e tente novamente.",
      { signal },
    );
    try {
      return await send();
    } catch (error) {
      const missingReceiver = /receiving end does not exist|could not establish connection|message port closed|extension context invalidated/i.test(error?.message || "");
      if (!missingReceiver) throw error;
      await ensureScripts(tab, signal);
      return send();
    }
  }

  async function enrichFromTab(tab, product, signal) {
    const send = () => runtime.withTimeout(
      chrome.tabs.sendMessage(tab.id, { type: "TABARATO_ENRICH_PRODUCT", product }, { frameId: 0 }),
      36000,
      "O Mercado Livre demorou para completar link, cupom e pagamento.",
      { signal },
    );
    try {
      return await send();
    } catch (error) {
      const missingReceiver = /receiving end does not exist|could not establish connection|message port closed|extension context invalidated/i.test(error?.message || "");
      if (!missingReceiver) throw error;
      await ensureScripts(tab, signal);
      return send();
    }
  }

  function isMeliAffiliateLink(value) {
    try {
      const url = new URL(String(value || "").trim());
      return url.protocol === "https:" && /^(?:www\.)?meli\.la$/i.test(url.hostname) && url.pathname.length > 1;
    } catch {
      return false;
    }
  }

  function withRecoveredAffiliateLink(product, affiliateLink) {
    const next = {
      ...product,
      affiliateLink,
      affiliateLinkType: "mercado-livre-generated",
    };
    const required = [next.productName, next.currentPrice, next.imageUrl || next.imageCandidates?.[0]?.url, next.externalProductId, isMeliAffiliateLink(next.affiliateLink)];
    next.confidence = required.filter(Boolean).length / required.length;
    return next;
  }

  async function requestAffiliateLink(tabId, signal) {
    const send = () => runtime.withTimeout(
      chrome.tabs.sendMessage(tabId, { type: "TABARATO_CAPTURE_AFFILIATE_LINK" }, { frameId: 0 }),
      30000,
      "O Mercado Livre demorou para gerar o link afiliado.",
      { signal },
    );
    try {
      return await send();
    } catch (error) {
      const missingReceiver = /receiving end does not exist|could not establish connection|message port closed|extension context invalidated/i.test(error?.message || "");
      if (!missingReceiver) throw error;
      const tab = await chrome.tabs.get(tabId);
      await ensureScripts(tab, signal);
      return send();
    }
  }

  async function recoverAffiliateLink(tabId, product, signal) {
    if (product?.platform !== "Mercado Livre" || isMeliAffiliateLink(product?.affiliateLink)) return product;
    if (signal?.aborted) throw new Error("Envio interrompido.");

    const direct = await requestAffiliateLink(tabId, signal).catch(() => null);
    if (isMeliAffiliateLink(direct?.affiliateLink)) return withRecoveredAffiliateLink(product, direct.affiliateLink);
    return product;
  }

  async function enrich(product, signal) {
    const complete = product.productName && product.currentPrice && product.imageUrl && product.shortDescription;
    const previewLink = product.affiliateLink || product.sourceUrl;
    if (complete || !previewLink) return product;
    try {
      const preview = await panel.api.request("/api/admin/product-preview", {
        method: "POST",
        body: { link: previewLink },
        timeout: 5000,
        signal,
      });
      return {
        ...preview.product,
        ...product,
        affiliateLink: product.affiliateLink || (product.platform === "Mercado Livre" ? "" : preview.product?.affiliateLink || ""),
        imageUrl: product.imageUrl || preview.product?.imageUrl || "",
        shortDescription: product.shortDescription || preview.product?.shortDescription || "",
      };
    } catch {
      return product;
    }
  }

  async function apply(product, tab) {
    panel.product.fill(product);
    state.capturedTabId = tab.id;
    state.capturedPageUrl = comparableUrl(tab.url);
    await panel.product.persistDraft();
    await updateComparison(product);
    elements.refreshButton.classList.remove("needs-refresh");
  }

  function showFailure(error) {
    const message = runtime.reportError("capture-product", error);
    elements.empty.querySelector("p").textContent = message;
    elements.empty.classList.remove("hidden");
    elements.captureSource.textContent = "Falha na captura.";
    elements.refreshButton.classList.add("needs-refresh");
    if (state.activeProduct) elements.offerForm.classList.remove("hidden");
  }

  async function current() {
    const runId = ++state.captureSequence;
    const controller = beginOperation("Capturando produto", "Reconhecendo a página e a loja...");
    const { signal } = controller;
    setBusy(elements.refreshButton, true, "...");
    elements.loading.classList.remove("hidden");
    elements.empty.classList.add("hidden");
    if (!state.activeProduct) elements.offerForm.classList.add("hidden");
    try {
      const tab = await activeTab();
      runtime.throwIfAborted(signal);
      if (!tab?.id) throw new Error("Nenhuma aba ativa encontrada.");
      if (isCouponManagementUrl(tab.url)) {
        throw new Error("Volte para a página do produto e clique em Capturar.");
      }
      updateOperation("Lendo nome, preço, imagem e identificação do anúncio...");
      const catalogRequest = panel.catalog.synchronize().catch((error) => {
        runtime.reportError("capture-catalog-sync", error);
        return null;
      });
      const result = await extractFromTab(tab, signal);
      if (!result?.ok) throw new Error(result?.error || "Produto não encontrado nesta página.");
      if (runId !== state.captureSequence) return;
      runtime.throwIfAborted(signal);
      await apply(result.product, tab);
      elements.loading.classList.add("hidden");
      setBusy(elements.refreshButton, true, "Completando...");
      updateOperation("Dados principais prontos. Completando benefícios e link disponíveis...");

      const storeEnrichment = result.product.platform === "Mercado Livre"
        ? enrichFromTab(tab, result.product, signal).catch((error) => {
          if (signal.aborted) throw error;
          runtime.reportError("mercado-livre-enrichment", error);
          return null;
        })
        : Promise.resolve(null);

      let product = await enrich(result.product, signal);
      if (runId !== state.captureSequence) return;
      runtime.throwIfAborted(signal);
      if (product !== result.product) {
        product = panel.product.mergeEnrichment(product);
        await panel.product.persistDraft();
      }
      const enrichedResult = await storeEnrichment;
      if (runId !== state.captureSequence) return;
      runtime.throwIfAborted(signal);
      if (enrichedResult?.ok && enrichedResult.product) {
        product = panel.product.mergeEnrichment(enrichedResult.product);
        await panel.product.persistDraft();
      }

      updateOperation("Relacionando o produto às categorias já existentes...");
      await catalogRequest;
      if (runId !== state.captureSequence) return;
      runtime.throwIfAborted(signal);
      const suggestedCategory = await panel.catalog.ensureCategory(product);
      if (suggestedCategory && elements.fields.category.value !== suggestedCategory) {
        elements.fields.category.value = suggestedCategory;
        panel.product.updatePreview();
        await panel.product.persistDraft();
      } else if (!suggestedCategory) {
        elements.fields.category.value = "";
        panel.product.updatePreview();
        elements.captureQuality.textContent = "Categoria não identificada com segurança. Confirme uma categoria existente antes de publicar.";
        elements.captureQuality.classList.remove("hidden");
      }
      panel.publishing?.inspectExisting(product);
      showToast("Produto capturado e pronto para revisão.", "success");
    } catch (error) {
      if (runId !== state.captureSequence) return;
      if (signal.aborted || error?.name === "AbortError" || /cancelad|substituída/i.test(error?.message || "")) {
        showToast("Captura cancelada. O produto anterior foi preservado.", "neutral");
      } else {
        showFailure(error);
      }
    } finally {
      if (runId === state.captureSequence) {
        elements.loading.classList.add("hidden");
        setBusy(elements.refreshButton, false);
        endOperation(controller);
      }
    }
  }

  async function visibleProductUrls(limit, sourceTab = null) {
    const tab = sourceTab || await activeTab();
    if (!tab?.id) throw new Error("Nenhuma aba ativa encontrada.");
    let result;
    try {
      result = await chrome.tabs.sendMessage(tab.id, { type: "TABARATO_LIST_VISIBLE_PRODUCTS", limit }, { frameId: 0 });
    } catch {
      await ensureScripts(tab);
      result = await chrome.tabs.sendMessage(tab.id, { type: "TABARATO_LIST_VISIBLE_PRODUCTS", limit }, { frameId: 0 });
    }
    if (!result?.ok) throw new Error(result?.error || "Nao foi possivel listar produtos na tela.");
    return globalThis.TaBaratoBatchUtils.normalizeProductUrls(result.urls, result.storeId, limit);
  }

  function assertBatchActive(signal) {
    if (signal?.aborted) throw new Error("Envio interrompido.");
  }

  async function focusWorker(tabId, windowId = null) {
    const tab = await chrome.tabs.update(tabId, { active: true });
    const targetWindowId = windowId || tab.windowId;
    if (targetWindowId) await chrome.windows.update(targetWindowId, { focused: true }).catch(() => {});
    return tab;
  }

  function coreProductIsComplete(product) {
    const imageUrl = product?.imageUrl || product?.imageCandidates?.[0]?.url || "";
    const core = String(product?.productName || "").trim().length >= 4
      && parsePrice(product?.currentPrice) > 0
      && /^https?:\/\//i.test(imageUrl);
    if (!core) return false;
    return product.platform !== "Mercado Livre" || /^MLB\d{6,}$/i.test(product.externalProductId || "");
  }

  async function reloadWorker(tabId, expectedUrl, signal, timeout = 45000) {
    assertBatchActive(signal);
    const tab = await focusWorker(tabId);
    const targetUrl = expectedUrl || tab.url;
    if (isCouponManagementUrl(tab.url) && targetUrl && !isCouponManagementUrl(targetUrl)) {
      await chrome.tabs.update(tabId, { url: targetUrl, active: true });
    } else {
      await chrome.tabs.reload(tabId);
    }
    await waitForProductDom(tabId, targetUrl, signal, timeout);
    assertBatchActive(signal);
    await runtime.delay(250, signal);
    return chrome.tabs.get(tabId);
  }

  async function loadedWorker(tabId, url, signal, windowId = null, { reloadOnIncomplete = true } = {}) {
    assertBatchActive(signal);
    await focusWorker(tabId, windowId);
    await waitForProductDom(tabId, url, signal, 45000);
    assertBatchActive(signal);
    await runtime.delay(80, signal);

    let tab = await chrome.tabs.get(tabId);
    let result = await extractFromTab(tab, signal);
    if (result?.ok && coreProductIsComplete(result.product)) return result.product;
    if (!reloadOnIncomplete) throw new Error(result?.error || "A pagina ainda nao terminou de carregar os dados do produto.");

    await reloadWorker(tabId, url, signal);
    assertBatchActive(signal);
    tab = await chrome.tabs.get(tabId);
    result = await extractFromTab(tab, signal);
    if (!result?.ok) throw new Error(result?.error || "Produto nao encontrado.");
    if (!coreProductIsComplete(result.product)) throw new Error("O Mercado Livre nao terminou de carregar nome, preco ou imagem do produto.");
    return result.product;
  }

  async function urlInWorker(tabId, url, signal) {
    assertBatchActive(signal);
    await chrome.tabs.update(tabId, { url, active: true });
    return loadedWorker(tabId, url, signal);
  }

  async function waitForProductDom(tabId, expectedUrl, signal, timeout = 45000) {
    const startedAt = Date.now();
    let stableSignature = "";
    let stableSamples = 0;
    let pollDelay = 220;
    while (Date.now() - startedAt < timeout) {
      assertBatchActive(signal);
      const snapshot = await chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        func: (targetUrl) => {
          const productKey = (value) => {
            const mercadoLivre = String(value).match(/\bMLB-?(\d{6,})\b/i);
            if (mercadoLivre) return `mlb:${mercadoLivre[1]}`;
            const shopee = String(value).match(/(?:i\.|\/product\/)(\d+)[./](\d+)/i);
            if (shopee) return `shopee:${shopee[1]}:${shopee[2]}`;
            try {
              const parsed = new URL(value);
              return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
            } catch {
              return "";
            }
          };
          const visible = (element) => {
            if (!element) return false;
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
          };
          const textFrom = (selectors) => {
            for (const selector of selectors) {
              const element = [...document.querySelectorAll(selector)].find(visible);
              const text = String(element?.textContent || "").replace(/\s+/g, " ").trim();
              if (text) return text;
            }
            return "";
          };
          const imageFrom = (selectors) => {
            for (const selector of selectors) {
              const image = [...document.querySelectorAll(selector)].find((element) => visible(element)
                && Boolean(element.currentSrc || element.src || element.getAttribute("data-src")));
              const source = image?.currentSrc || image?.src || image?.getAttribute("data-src") || "";
              if (source) return source;
            }
            return document.querySelector('meta[property="og:image"]')?.content || "";
          };

          const title = textFrom([
            "h1.ui-pdp-title",
            ".ui-pdp-container h1",
            "[data-testid='pdp-product-title']",
            ".product-briefing h1",
            "[itemprop='name']",
            "h1",
          ]);
          const price = textFrom([
            ".ui-pdp-price__main-container .ui-pdp-price__second-line .andes-money-amount",
            ".ui-pdp-price__second-line .andes-money-amount",
            "[data-testid='pdp-price']",
            ".product-briefing [class*='price' i]",
            "[itemprop='price']",
          ]) || document.querySelector('[itemprop="price"]')?.getAttribute("content") || "";
          const image = imageFrom([
            ".ui-pdp-gallery__figure img",
            ".ui-pdp-gallery img",
            "[data-testid*='gallery' i] img",
            ".product-briefing img",
            "[itemprop='image']",
          ]);
          const sameProduct = productKey(location.href) === productKey(targetUrl);
          const ready = sameProduct
            && document.readyState === "complete"
            && title.length >= 4
            && Boolean(price)
            && /^https?:/i.test(image);
          return {
            ready,
            signature: ready ? `${productKey(location.href)}|${title}|${price}|${image}` : "",
          };
        },
        args: [expectedUrl],
      }).then((results) => results[0]?.result || { ready: false, signature: "" }).catch(() => ({ ready: false, signature: "" }));

      if (snapshot.ready) {
        if (snapshot.signature === stableSignature) stableSamples += 1;
        else {
          stableSignature = snapshot.signature;
          stableSamples = 1;
        }
        if (stableSamples >= 3) return;
      } else {
        stableSignature = "";
        stableSamples = 0;
      }
      await runtime.delay(pollDelay, signal);
      pollDelay = Math.min(850, Math.round(pollDelay * 1.2));
    }
    throw new Error("O produto nao terminou de carregar nome, preco e imagem dentro do tempo esperado.");
  }

  function highlightNavigation(tab) {
    if (state.batchController) return;
    const nextUrl = comparableUrl(tab?.url);
    if (!state.session || !tab?.id || !nextUrl || isCouponManagementUrl(tab.url) || !scriptsForUrl(nextUrl).length) return;
    if (tab.id === state.capturedTabId && nextUrl === state.capturedPageUrl) return;
    window.clearTimeout(state.navigationCaptureTimer);
    elements.captureSource.textContent = "Produto aberto. Clique em Capturar para iniciar a coleta.";
    elements.refreshButton.classList.add("needs-refresh");
  }

  function isMarketplaceProductUrl(value) {
    const url = String(value || "");
    if (/mercadolivre|mercadolibre/i.test(url)) return /(?:^|[/?-])MLB-?\d{6,}(?:$|[/?#-])/i.test(url);
    if (/shopee/i.test(url)) return /(?:\/product\/|[-.]i\.\d+\.\d+)/i.test(url);
    return false;
  }

  async function productTabsToRight(sourceTab, limit = 50) {
    if (!sourceTab?.windowId || !Number.isInteger(sourceTab.index)) return [];
    const tabs = await chrome.tabs.query({ windowId: sourceTab.windowId });
    return tabs
      .filter((tab) => tab.id && tab.index > sourceTab.index && isMarketplaceProductUrl(tab.url))
      .sort((left, right) => left.index - right.index)
      .slice(0, Math.max(0, limit))
      .map((tab) => ({ tabId: tab.id, url: tab.url, owned: false }));
  }




  async function waitForMarketplaceProductTab(tabId, platform, timeout = 30000, signal) {
    const storePattern = platform === "Shopee" ? /(?:^|\.)shopee\.com\.br$/i : /mercadolivre|mercadolibre/i;
    return runtime.poll(async () => {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab) throw new Error("A aba usada no processo foi fechada.");
      let hostname = "";
      try { hostname = new URL(tab.url || "").hostname; } catch { /* URL intermediária. */ }
      return tab.status === "complete" && storePattern.test(hostname) && isMarketplaceProductUrl(tab.url) ? tab : null;
    }, {
      timeout,
      interval: 120,
      maxInterval: 650,
      signal,
      throwOnTimeout: false,
    });
  }

  async function waitForStoredResult(key, predicate, timeout, signal) {
    return runtime.runWithTimeout(() => new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        chrome.storage.onChanged.removeListener(onChanged);
        signal?.removeEventListener("abort", onAbort);
        callback(value);
      };
      const onAbort = () => finish(reject, runtime.abortError(signal?.reason));
      const onChanged = (changes, area) => {
        if (area !== "local" || !changes[key]) return;
        const value = changes[key].newValue;
        if (predicate(value)) finish(resolve, value);
      };
      chrome.storage.onChanged.addListener(onChanged);
      signal?.addEventListener("abort", onAbort, { once: true });
      chrome.storage.local.get(key)
        .then((stored) => {
          const value = stored[key];
          if (predicate(value)) finish(resolve, value);
        })
        .catch((error) => finish(reject, error));
    }), {
      milliseconds: timeout,
      message: "A Shopee não retornou o link afiliado dentro do tempo esperado.",
      signal,
    });
  }



  async function openShopeeAffiliatePanel(signal) {
    runtime.throwIfAborted(signal);
    const existing = await chrome.tabs.query({ url: "https://affiliate.shopee.com.br/*" });
    let affiliateTab = existing[0];
    if (affiliateTab?.id) {
      await chrome.tabs.update(affiliateTab.id, { active: true });
      await chrome.windows.update(affiliateTab.windowId, { focused: true }).catch(() => {});
    } else {
      affiliateTab = await chrome.tabs.create({ url: "https://affiliate.shopee.com.br/", active: true });
    }
    runtime.throwIfAborted(signal);
    return affiliateTab;
  }

  async function requestShopeeAffiliateLink() {
    const originalProduct = state.activeProduct;
    if (!originalProduct || originalProduct.platform !== "Shopee") throw new Error("Capture primeiro um produto da Shopee.");
    if (!originalProduct.sourceUrl || !originalProduct.externalProductId) throw new Error("O produto da Shopee não possui identificação suficiente.");

    const controller = beginOperation("Gerando link da Shopee", "Abrindo o painel de afiliados...");
    const { signal } = controller;
    const sourceTabId = state.capturedTabId || (await activeTab().catch(() => null))?.id;
    if (!sourceTabId) {
      endOperation(controller);
      throw new Error("A aba original do produto não foi encontrada.");
    }
    const sourceTab = await chrome.tabs.get(sourceTabId).catch(() => null);
    const sourceWindowId = sourceTab?.windowId || null;
    const focusSourceProduct = async (url = "") => {
      runtime.throwIfAborted(signal);
      const current = await chrome.tabs.get(sourceTabId).catch(() => null);
      if (!current) throw new Error("A aba original do produto foi fechada.");
      if (url && comparableUrl(current.url) !== comparableUrl(url)) await chrome.tabs.update(sourceTabId, { url, active: true });
      else await chrome.tabs.update(sourceTabId, { active: true });
      if (sourceWindowId) await chrome.windows.update(sourceWindowId, { focused: true }).catch(() => {});
    };

    setBusy(elements.shopeeLinkButton, true, "Gerando...");
    let requestId = "";
    try {
      await openShopeeAffiliatePanel(signal);
      requestId = `shopee:${originalProduct.externalProductId}:${Date.now()}`;
      await chrome.storage.local.remove(STORAGE.shopeeAffiliateResult);
      await chrome.storage.local.set({
        [STORAGE.shopeeAffiliateRequest]: {
          requestId,
          mode: "generate-link",
          sourceUrl: originalProduct.sourceUrl,
          productName: originalProduct.productName,
          externalProductId: originalProduct.externalProductId,
          createdAt: Date.now(),
          sourceTabId,
          sourceWindowId,
          expiresAt: Date.now() + 3 * 60 * 1000,
        },
      });
      updateOperation("Buscando primeiro o anúncio exato. Uma alternativa só será usada se ele não existir.");

      const result = await waitForStoredResult(
        STORAGE.shopeeAffiliateResult,
        (candidate) => candidate?.requestId === requestId && Boolean(candidate.affiliateLink || candidate.error),
        55000,
        signal,
      );
      if (result?.error) throw new Error(result.error);
      if (!result?.affiliateLink) throw new Error("A Shopee não retornou um link afiliado válido.");

      updateOperation("Abrindo o anúncio realmente vinculado ao link...");
      const selectedUrl = String(result.selectedProductUrl || result.affiliateLink || "").trim();
      if (!selectedUrl) throw new Error("A Shopee não informou o anúncio vinculado ao link afiliado.");
      await focusSourceProduct(selectedUrl);
      const selectedTab = await waitForMarketplaceProductTab(sourceTabId, "Shopee", 35000, signal);
      if (!selectedTab) throw new Error("O anúncio afiliado escolhido não abriu na página do produto.");

      updateOperation("Atualizando nome, preço, imagem e categoria com os dados do anúncio afiliado...");
      await ensureScripts(selectedTab, signal);
      const selectedCapture = await extractFromTab(selectedTab, signal);
      const candidateProduct = selectedCapture?.product;
      if (!selectedCapture?.ok || !candidateProduct?.externalProductId) {
        throw new Error(selectedCapture?.error || "O produto afiliado escolhido não pôde ser capturado.");
      }

      const merged = {
        ...candidateProduct,
        affiliateLink: result.affiliateLink,
        affiliateLinkType: "shopee-generated",
        captureStage: "complete",
      };
      await apply(merged, selectedTab);
      const category = await panel.catalog.ensureCategory(merged);
      if (category) elements.fields.category.value = category;
      await panel.product.persistDraft();
      await focusSourceProduct();
      showToast(result.matchType === "exact"
        ? "Link gerado para o anúncio exato. Os dados foram atualizados."
        : "O anúncio exato não estava disponível. A alternativa escolhida foi aberta e atualizada.", "success");
      return merged;
    } catch (error) {
      if (signal.aborted || error?.name === "AbortError" || /cancelad|substituída/i.test(error?.message || "")) {
        await focusSourceProduct(originalProduct.sourceUrl).catch(() => {});
        showToast("Geração de link cancelada. O produto anterior foi preservado.", "neutral");
        return null;
      }
      throw error;
    } finally {
      if (requestId) {
        const stored = await chrome.storage.local.get([STORAGE.shopeeAffiliateRequest, STORAGE.shopeeAffiliateResult]).catch(() => ({}));
        const remove = [];
        if (stored[STORAGE.shopeeAffiliateRequest]?.requestId === requestId) remove.push(STORAGE.shopeeAffiliateRequest);
        if (stored[STORAGE.shopeeAffiliateResult]?.requestId === requestId) remove.push(STORAGE.shopeeAffiliateResult);
        if (remove.length) await chrome.storage.local.remove(remove).catch(() => {});
      }
      setBusy(elements.shopeeLinkButton, false);
      endOperation(controller);
    }
  }

  async function prepareShopeeBestOptionSearch(product, signal) {
    await openShopeeAffiliatePanel(signal);
    const requestId = `shopee-browse:${product.externalProductId || Date.now()}:${Date.now()}`;
    await chrome.storage.local.remove(STORAGE.shopeeAffiliateResult);
    await chrome.storage.local.set({
      [STORAGE.shopeeAffiliateRequest]: {
        requestId,
        mode: "browse-only",
        sourceUrl: product.sourceUrl,
        productName: product.productName,
        externalProductId: product.externalProductId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 3 * 60 * 1000,
      },
    });
    updateOperation("Preenchendo o nome exato e aplicando o filtro de menor preço...");
    const result = await waitForStoredResult(
      STORAGE.shopeeAffiliateResult,
      (candidate) => candidate?.requestId === requestId && Boolean(candidate.browseReady || candidate.error),
      24000,
      signal,
    );
    if (result?.error) throw new Error(result.error);
    await chrome.storage.local.remove([STORAGE.shopeeAffiliateRequest, STORAGE.shopeeAffiliateResult]).catch(() => {});
    showToast("Busca pronta na Shopee: nome exato e menor preço. A escolha do anúncio é manual.", "success");
    return { opened: true, platform: "Shopee" };
  }

  async function searchBestMercadoLivreOption(product, signal) {
    runtime.throwIfAborted(signal);
    const query = String(product.productName || "").replace(/\s+/g, " ").trim();
    if (!query) throw new Error("O produto não possui nome para pesquisa.");
    const searchUrl = `https://lista.mercadolivre.com.br/${encodeURIComponent(query).replace(/%20/g, "-")}_OrderId_PRICE`;
    const tab = await chrome.tabs.create({ url: searchUrl, active: true });
    runtime.throwIfAborted(signal);
    showToast("Busca do Mercado Livre aberta pelo nome exato e ordenada pelo menor preço. A escolha é manual.", "success");
    return { opened: true, platform: "Mercado Livre", tabId: tab.id };
  }

  async function searchBestOption() {
    const product = state.activeProduct;
    if (!product) throw new Error("Capture primeiro um produto.");
    const controller = beginOperation("Abrindo busca de melhor preço", "Preparando a pesquisa sem selecionar anúncios automaticamente...");
    const { signal } = controller;
    setBusy(elements.bestOptionButton, true, "Abrindo...");
    await startComparison(product);
    try {
      if (product.platform === "Shopee") return await prepareShopeeBestOptionSearch(product, signal);
      if (product.platform === "Mercado Livre") return await searchBestMercadoLivreOption(product, signal);
      throw new Error("A busca por menor preço está disponível apenas para Shopee e Mercado Livre.");
    } catch (error) {
      if (signal.aborted || error?.name === "AbortError" || /cancelad|substituída/i.test(error?.message || "")) {
        showToast("Abertura da busca cancelada.", "neutral");
        return null;
      }
      showToast(runtime.errorMessage(error), "error");
      throw error;
    } finally {
      setBusy(elements.bestOptionButton, false);
      endOperation(controller);
    }
  }


  panel.capture = {
    requestShopeeAffiliateLink,
    searchBestOption,
    current,
    ensureScripts,
    enrichFromTab,
    extractFromTab,
    highlightNavigation,
    isCouponManagementUrl,
    isPrimarySiteUrl,
    recoverAffiliateLink,
    reloadWorker,
    loadedWorker,
    productTabsToRight,
    scriptsForUrl,
    showFailure,
    waitForProductDom,
    urlInWorker,
    visibleProductUrls,
    clearComparison,
    renderComparison,
    startComparison,
    updateComparison,
  };
})();
