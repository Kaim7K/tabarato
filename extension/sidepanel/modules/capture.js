(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.capture) return;

  const { LIMITS, STORAGE, activeTab, elements, setBusy, showToast, state } = panel;
  const runtime = globalThis.TaBaratoRuntime;
  const { comparableUrl, parsePrice } = globalThis.TaBaratoProductUtils;

  function scriptsForUrl(value) {
    try {
      const hostname = new URL(value).hostname;
      const shared = ["content/shared.js"];
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

  async function ensureScripts(tab) {
    const availability = await chrome.runtime.sendMessage({ type: "TABARATO_IS_ALLOWED_PAGE", url: tab.url });
    if (!availability?.allowed) throw new Error("Abra uma pagina permitida pelo Ta Barato.");
    const files = scriptsForUrl(tab.url);
    if (!files.length) throw new Error("Esta pagina nao oferece captura de produtos.");
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      files: ["shared/runtime.js", "shared/coupon-code.js", ...files],
    });
  }

  async function extractFromTab(tab) {
    const send = () => runtime.withTimeout(
      chrome.tabs.sendMessage(tab.id, { type: "TABARATO_EXTRACT_PRODUCT" }, { frameId: 0 }),
      LIMITS.captureTimeout,
      "A loja demorou para responder. Recarregue a pagina e tente novamente.",
    );
    try {
      return await send();
    } catch (error) {
      const missingReceiver = /receiving end does not exist|could not establish connection|message port closed|extension context invalidated/i.test(error?.message || "");
      if (!missingReceiver) throw error;
      await ensureScripts(tab);
      return send();
    }
  }

  async function enrichFromTab(tab, product) {
    const send = () => runtime.withTimeout(
      chrome.tabs.sendMessage(tab.id, { type: "TABARATO_ENRICH_PRODUCT", product }, { frameId: 0 }),
      36000,
      "O Mercado Livre demorou para completar link, cupom e pagamento.",
    );
    try {
      return await send();
    } catch (error) {
      const missingReceiver = /receiving end does not exist|could not establish connection|message port closed|extension context invalidated/i.test(error?.message || "");
      if (!missingReceiver) throw error;
      await ensureScripts(tab);
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

  async function requestAffiliateLink(tabId) {
    const send = () => runtime.withTimeout(
      chrome.tabs.sendMessage(tabId, { type: "TABARATO_CAPTURE_AFFILIATE_LINK" }, { frameId: 0 }),
      30000,
      "O Mercado Livre demorou para gerar o link afiliado.",
    );
    try {
      return await send();
    } catch (error) {
      const missingReceiver = /receiving end does not exist|could not establish connection|message port closed|extension context invalidated/i.test(error?.message || "");
      if (!missingReceiver) throw error;
      const tab = await chrome.tabs.get(tabId);
      await ensureScripts(tab);
      return send();
    }
  }

  async function recoverAffiliateLink(tabId, product, signal) {
    if (product?.platform !== "Mercado Livre" || isMeliAffiliateLink(product?.affiliateLink)) return product;
    if (signal?.aborted) throw new Error("Envio interrompido.");

    const direct = await requestAffiliateLink(tabId).catch(() => null);
    if (isMeliAffiliateLink(direct?.affiliateLink)) return withRecoveredAffiliateLink(product, direct.affiliateLink);
    return product;
  }

  async function enrich(product) {
    const complete = product.productName && product.currentPrice && product.imageUrl && product.shortDescription;
    const previewLink = product.affiliateLink || product.sourceUrl;
    if (complete || !previewLink) return product;
    try {
      const preview = await panel.api.request("/api/admin/product-preview", {
        method: "POST",
        body: { link: previewLink },
        timeout: 5000,
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
    setBusy(elements.refreshButton, true, "...");
    elements.loading.classList.remove("hidden");
    elements.empty.classList.add("hidden");
    if (!state.activeProduct) elements.offerForm.classList.add("hidden");
    try {
      const tab = await activeTab();
      if (!tab?.id) throw new Error("Nenhuma aba ativa encontrada.");
      if (isCouponManagementUrl(tab.url)) {
        throw new Error("Volte para a pagina do produto e clique em Capturar.");
      }
      const catalogRequest = panel.catalog.synchronize().catch((error) => {
        runtime.reportError("capture-catalog-sync", error);
        return null;
      });
      const result = await extractFromTab(tab);
      if (!result?.ok) throw new Error(result?.error || "Produto nao encontrado.");
      if (runId !== state.captureSequence) return;
      await apply(result.product, tab);
      elements.loading.classList.add("hidden");
      setBusy(elements.refreshButton, true, "Completando...");
      panel.renderActionLocks();

      const storeEnrichment = result.product.platform === "Mercado Livre"
        ? enrichFromTab(tab, result.product).catch((error) => {
          runtime.reportError("mercado-livre-enrichment", error);
          return null;
        })
        : Promise.resolve(null);

      let product = await enrich(result.product);
      if (runId !== state.captureSequence) return;
      if (product !== result.product) {
        product = panel.product.mergeEnrichment(product);
        await panel.product.persistDraft();
      }
      // Link, cupom e pagamento devem aparecer assim que a loja responder.
      // A sincronizacao do catalogo nao pode bloquear esses dados visiveis.
      const enrichedResult = await storeEnrichment;
      if (runId !== state.captureSequence) return;
      if (enrichedResult?.ok && enrichedResult.product) {
        product = panel.product.mergeEnrichment(enrichedResult.product);
        await panel.product.persistDraft();
      }

      await catalogRequest;
      if (runId !== state.captureSequence) return;
      const suggestedCategory = await panel.catalog.ensureCategory(product);
      if (suggestedCategory && elements.fields.category.value !== suggestedCategory) {
        elements.fields.category.value = suggestedCategory;
        panel.product.updatePreview();
        await panel.product.persistDraft();
      }
      panel.publishing?.inspectExisting(product);
    } catch (error) {
      if (runId === state.captureSequence) showFailure(error);
    } finally {
      if (runId === state.captureSequence) {
        elements.loading.classList.add("hidden");
        setBusy(elements.refreshButton, false);
        panel.renderActionLocks();
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
    let result = await extractFromTab(tab);
    if (result?.ok && coreProductIsComplete(result.product)) return result.product;
    if (!reloadOnIncomplete) throw new Error(result?.error || "A pagina ainda nao terminou de carregar os dados do produto.");

    await reloadWorker(tabId, url, signal);
    assertBatchActive(signal);
    tab = await chrome.tabs.get(tabId);
    result = await extractFromTab(tab);
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


  async function waitForTabComplete(tabId, timeout = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (tab?.status === "complete") return tab;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error("A pagina do produto escolhido demorou para carregar.");
  }

  async function requestShopeeAffiliateLink() {
    let product = state.activeProduct;
    if (!product || product.platform !== "Shopee") throw new Error("Capture primeiro um produto da Shopee.");
    if (!product.sourceUrl || !product.externalProductId) throw new Error("O produto da Shopee não possui identificação suficiente.");
    const requestId = `shopee:${product.externalProductId}:${Date.now()}`;
    await chrome.storage.local.set({
      [STORAGE.shopeeAffiliateRequest]: {
        requestId,
        sourceUrl: product.sourceUrl,
        productName: product.productName,
        externalProductId: product.externalProductId,
        createdAt: Date.now(),
        sourceTabId: state.capturedTabId,
        sourceWindowId: (await activeTab().catch(() => null))?.windowId || null,
        expiresAt: Date.now() + 5 * 60 * 1000,
      },
    });
    setBusy(elements.shopeeLinkButton, true, "Abrindo...");
    try {
      const existing = await chrome.tabs.query({ url: "https://affiliate.shopee.com.br/*" });
      let tab = existing[0];
      if (tab?.id) {
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
      } else {
        tab = await chrome.tabs.create({ url: "https://affiliate.shopee.com.br/", active: true });
      }
      showToast("O painel da Shopee foi aberto. A extensão tentará preencher e coletar o link automaticamente.", "neutral");
      const started = Date.now();
      while (Date.now() - started < 60000) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        const stored = await chrome.storage.local.get(STORAGE.shopeeAffiliateResult);
        const result = stored[STORAGE.shopeeAffiliateResult];
        if (result?.requestId !== requestId || !result.affiliateLink) continue;
        await chrome.storage.local.remove(STORAGE.shopeeAffiliateResult);
        const selectedUrl = String(result.selectedProductUrl || "").trim();
        const selectedIsDifferent = selectedUrl && comparableUrl(selectedUrl) !== comparableUrl(product.sourceUrl || "");
        if (selectedIsDifferent && result.sourceTabId) {
          await chrome.tabs.update(result.sourceTabId, { url: selectedUrl, active: true });
          if (result.sourceWindowId) await chrome.windows.update(result.sourceWindowId, { focused: true }).catch(() => {});
          const selectedTab = await waitForTabComplete(result.sourceTabId);
          await ensureScripts(selectedTab);
          const selectedCapture = await extractFromTab(selectedTab);
          if (!selectedCapture?.ok || !selectedCapture.product?.externalProductId) {
            throw new Error("A melhor oferta foi encontrada, mas os dados dela nao puderam ser capturados.");
          }
          product = selectedCapture.product;
          await apply(product, selectedTab);
        }
        const merged = panel.product.mergeEnrichment({
          ...product,
          affiliateLink: result.affiliateLink,
          affiliateLinkType: "shopee-generated",
          captureStage: "complete",
        });
        elements.fields.affiliateLink.value = result.affiliateLink;
        await panel.product.persistDraft();
        if (result.sourceTabId) {
          await chrome.tabs.update(result.sourceTabId, { active: true }).catch(() => {});
          if (result.sourceWindowId) await chrome.windows.update(result.sourceWindowId, { focused: true }).catch(() => {});
        }
        showToast(selectedIsDifferent
          ? "Melhor oferta escolhida, dados atualizados e link afiliado coletado."
          : "Link de afiliado da Shopee coletado e preenchido.", "success");
        return merged;
      }
      throw new Error("O link não apareceu automaticamente. Envie prints do painel de geração para eu ajustar os seletores exatos.");
    } finally {
      setBusy(elements.shopeeLinkButton, false);
    }
  }


  async function searchBestMercadoLivreOption(product) {
    const query = String(product.productName || "").replace(/\s+/g, " ").trim();
    if (!query) throw new Error("O produto nao possui nome para pesquisa.");
    const slug = encodeURIComponent(query).replace(/%20/g, "-");
    const searchTab = await chrome.tabs.create({ url: `https://lista.mercadolivre.com.br/${slug}`, active: true });
    try {
      await waitForTabComplete(searchTab.id, 30000);
      const [{ result } = {}] = await chrome.scripting.executeScript({
        target: { tabId: searchTab.id, frameIds: [0] },
        func: (productName) => {
          const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
          const norm = (value = "") => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          const words = (value) => new Set(norm(value).split(/[^a-z0-9]+/).filter((word) => word.length > 2));
          const similarity = (left, right) => {
            const a = words(left); const b = words(right);
            if (!a.size || !b.size) return 0;
            let matches = 0; a.forEach((word) => { if (b.has(word)) matches += 1; });
            return matches / Math.min(a.size, b.size);
          };
          const money = (text) => {
            const match = clean(text).match(/R\$\s*([\d.]+(?:,\d{1,2})?)/i);
            return match ? Number(match[1].replace(/\./g, "").replace(",", ".")) : 0;
          };
          const sales = (text) => {
            const match = norm(text).match(/(?:\+?\s*)?(\d+(?:[.,]\d+)?)\s*(mil|k)?\+?\s*vendid[oa]s?/i);
            if (!match) return 0;
            const base = Number(match[1].replace(",", "."));
            return Number.isFinite(base) ? base * (match[2] ? 1000 : 1) : 0;
          };
          const cards = [...document.querySelectorAll(".ui-search-layout__item, .poly-card, li.ui-search-layout__item")];
          const candidates = cards.map((card) => {
            const titleElement = card.querySelector("h2, h3, .poly-component__title, .ui-search-item__title");
            const link = titleElement?.closest("a[href]") || card.querySelector("a[href*='MLB']");
            const title = clean(titleElement?.textContent || link?.textContent || "");
            const text = clean(card.textContent || "");
            const price = money(text);
            const relevance = similarity(productName, title);
            return { url: link?.href || "", title, price, sales: sales(text), relevance };
          }).filter((item) => item.url && item.price > 0 && item.relevance >= 0.35);
          if (!candidates.length) return null;
          const maxSales = Math.max(...candidates.map((item) => item.sales), 1);
          const minPrice = Math.min(...candidates.map((item) => item.price));
          const maxPrice = Math.max(...candidates.map((item) => item.price));
          candidates.forEach((item) => {
            const salesScore = Math.log10(item.sales + 1) / Math.log10(maxSales + 1);
            const priceScore = maxPrice === minPrice ? 1 : (maxPrice - item.price) / (maxPrice - minPrice);
            item.score = Math.min(1, item.relevance) * 0.4 + salesScore * 0.35 + priceScore * 0.25;
          });
          candidates.sort((a, b) => b.score - a.score || b.sales - a.sales || a.price - b.price);
          return candidates[0];
        },
        args: [query],
      });
      if (!result?.url) throw new Error("Nenhuma oferta suficientemente parecida foi encontrada no Mercado Livre.");
      const targetTabId = state.capturedTabId || (await activeTab())?.id;
      if (!targetTabId) throw new Error("A aba original do produto nao foi encontrada.");
      await chrome.tabs.update(targetTabId, { url: result.url, active: true });
      const targetTab = await waitForTabComplete(targetTabId, 30000);
      await ensureScripts(targetTab);
      const captured = await extractFromTab(targetTab);
      if (!captured?.ok) throw new Error(captured?.error || "A melhor oferta nao pôde ser capturada.");
      await apply(captured.product, targetTab);
      let enriched = await enrich(captured.product);
      const storeEnriched = await enrichFromTab(targetTab, enriched).catch(() => null);
      if (storeEnriched?.ok && storeEnriched.product) enriched = panel.product.mergeEnrichment(storeEnriched.product);
      const category = await panel.catalog.ensureCategory(enriched);
      if (category) elements.fields.category.value = category;
      await panel.product.persistDraft();
      showToast(`Melhor opção encontrada: ${result.title} por R$ ${result.price.toFixed(2).replace(".", ",")}.`, "success");
      return enriched;
    } finally {
      await chrome.tabs.remove(searchTab.id).catch(() => {});
    }
  }

  async function searchBestOption() {
    const product = state.activeProduct;
    if (!product) throw new Error("Capture primeiro um produto.");
    setBusy(elements.bestOptionButton, true, "Buscando...");
    try {
      if (product.platform === "Shopee") return await requestShopeeAffiliateLink();
      if (product.platform === "Mercado Livre") return await searchBestMercadoLivreOption(product);
      throw new Error("A busca inteligente esta disponível apenas para Shopee e Mercado Livre.");
    } catch (error) {
      showToast(runtime.errorMessage(error), "error");
      throw error;
    } finally {
      setBusy(elements.bestOptionButton, false);
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
  };
})();
