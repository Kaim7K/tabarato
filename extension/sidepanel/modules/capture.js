(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.capture) return;

  const { LIMITS, activeTab, elements, setBusy, state } = panel;
  const runtime = globalThis.TaBaratoRuntime;
  const { comparableUrl } = globalThis.TaBaratoProductUtils;

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
      target: { tabId: tab.id },
      files: ["shared/runtime.js", "shared/coupon-code.js", ...files],
    });
  }

  async function extractFromTab(tab) {
    const send = () => runtime.withTimeout(
      chrome.tabs.sendMessage(tab.id, { type: "TABARATO_EXTRACT_PRODUCT" }),
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
      chrome.tabs.sendMessage(tabId, { type: "TABARATO_CAPTURE_AFFILIATE_LINK" }),
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

  async function recoverAffiliateLink(tabId, product, signal, { reloadOnFailure = true } = {}) {
    if (product?.platform !== "Mercado Livre" || isMeliAffiliateLink(product?.affiliateLink)) return product;
    if (signal?.aborted) throw new Error("Envio interrompido.");

    const direct = await requestAffiliateLink(tabId).catch(() => null);
    if (isMeliAffiliateLink(direct?.affiliateLink)) return withRecoveredAffiliateLink(product, direct.affiliateLink);
    if (!reloadOnFailure) return product;

    const tab = await chrome.tabs.get(tabId);
    const expectedUrl = tab.url || product.sourceUrl;
    await chrome.tabs.reload(tabId);
    await waitForProductDom(tabId, expectedUrl, signal, 32000);
    if (signal?.aborted) throw new Error("Envio interrompido.");
    await runtime.delay(350);

    const refreshed = await requestAffiliateLink(tabId).catch(() => null);
    return isMeliAffiliateLink(refreshed?.affiliateLink)
      ? withRecoveredAffiliateLink(product, refreshed.affiliateLink)
      : product;
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

  async function apply(product, tab, reconcile = true) {
    panel.product.fill(product);
    state.capturedTabId = tab.id;
    state.capturedPageUrl = comparableUrl(tab.url);
    await panel.product.persistDraft();
    elements.refreshButton.classList.remove("needs-refresh");
    if (reconcile) {
      await panel.publishing?.reconcile(product).catch((error) => runtime.reportError("reconcile-product", error));
    }
  }

  function showFailure(error) {
    const message = runtime.reportError("capture-product", error);
    elements.empty.querySelector("p").textContent = message;
    elements.empty.classList.remove("hidden");
    elements.captureSource.textContent = "Falha na captura.";
    elements.refreshButton.classList.add("needs-refresh");
    if (state.activeProduct) elements.offerForm.classList.remove("hidden");
  }

  async function current({ reconcile = true } = {}) {
    const runId = ++state.captureSequence;
    let productVisible = false;
    setBusy(elements.refreshButton, true, "...");
    elements.loading.classList.remove("hidden");
    elements.empty.classList.add("hidden");
    if (!state.activeProduct) elements.offerForm.classList.add("hidden");
    try {
      const tab = await activeTab();
      if (!tab?.id) throw new Error("Nenhuma aba ativa encontrada.");
      if (isCouponManagementUrl(tab.url)) return;
      const catalogRequest = panel.catalog.synchronize().catch(() => null);
      const result = await extractFromTab(tab);
      if (!result?.ok) throw new Error(result?.error || "Produto nao encontrado.");
      if (runId !== state.captureSequence) return;
      await apply(result.product, tab, false);
      productVisible = true;
      elements.loading.classList.add("hidden");
      setBusy(elements.refreshButton, false);
      panel.renderActionLocks();

      const product = await enrich(result.product);
      if (runId !== state.captureSequence) return;
      if (product !== result.product) await apply(product, tab, false);
      await catalogRequest;
      if (runId !== state.captureSequence) return;
      const suggestedCategory = panel.catalog.suggestCategory(product);
      if (suggestedCategory && elements.fields.category.value !== suggestedCategory) {
        elements.fields.category.value = suggestedCategory;
        panel.product.updatePreview();
        await panel.product.persistDraft();
      }
      if (reconcile) {
        await panel.publishing?.reconcile(product).catch((error) => runtime.reportError("reconcile-product", error));
      }
    } catch (error) {
      if (runId === state.captureSequence) showFailure(error);
    } finally {
      if (runId === state.captureSequence && !productVisible) {
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
      result = await chrome.tabs.sendMessage(tab.id, { type: "TABARATO_LIST_VISIBLE_PRODUCTS", limit });
    } catch {
      await ensureScripts(tab);
      result = await chrome.tabs.sendMessage(tab.id, { type: "TABARATO_LIST_VISIBLE_PRODUCTS", limit });
    }
    if (!result?.ok) throw new Error(result?.error || "Nao foi possivel listar produtos na tela.");
    return globalThis.TaBaratoBatchUtils.normalizeProductUrls(result.urls, result.storeId, limit);
  }

  async function urlInWorker(tabId, url, signal) {
    if (signal.aborted) throw new Error("Envio interrompido.");
    let tab = await chrome.tabs.update(tabId, { url, active: true });
    if (tab.windowId) await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
    await waitForProductDom(tabId, url, signal);
    if (signal.aborted) throw new Error("Envio interrompido.");
    await runtime.delay(120);
    tab = await chrome.tabs.get(tabId);
    const result = await extractFromTab(tab);
    if (!result?.ok) throw new Error(result?.error || "Produto nao encontrado.");
    return result.product;
  }

  async function waitForProductDom(tabId, expectedUrl, signal, timeout = 32000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      if (signal.aborted) throw new Error("Envio interrompido.");
      const ready = await chrome.scripting.executeScript({
        target: { tabId },
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
          const selectors = [
            "h1.ui-pdp-title",
            ".ui-pdp-container h1",
            "[itemprop='name']",
            ".product-briefing h1",
            "[data-testid='pdp-product-title']",
          ];
          return productKey(location.href) === productKey(targetUrl)
            && document.readyState !== "loading"
            && selectors.some((selector) => {
            const element = document.querySelector(selector);
            return Boolean(element && String(element.textContent || "").trim());
          });
        },
        args: [expectedUrl],
      }).then((results) => Boolean(results[0]?.result)).catch(() => false);
      if (ready) return;
      await runtime.delay(150);
    }
    throw new Error("O produto nao apareceu na pagina dentro do tempo esperado.");
  }

  function highlightNavigation(tab) {
    if (state.batchController) return;
    const nextUrl = comparableUrl(tab?.url);
    if (!state.session || !tab?.id || !nextUrl || isCouponManagementUrl(tab.url) || !scriptsForUrl(nextUrl).length) return;
    if (tab.id === state.capturedTabId && nextUrl === state.capturedPageUrl) return;
    elements.captureSource.textContent = "Pagina mudou. Capturando o novo produto...";
    elements.refreshButton.classList.add("needs-refresh");
    const marketplaceProduct = /mercadolivre|mercadolibre/i.test(tab.url || "")
      ? /(?:^|[/?-])MLB-?\d{6,}(?:$|[/?#-])/i.test(tab.url || "")
      : /shopee/i.test(tab.url || "") && /(?:\/product\/|[-.]i\.\d+\.\d+)/i.test(tab.url || "");
    if (!marketplaceProduct || isPrimarySiteUrl(tab.url) || /web\.whatsapp\.com/i.test(tab.url || "")) return;
    window.clearTimeout(state.navigationCaptureTimer);
    state.navigationCaptureTimer = window.setTimeout(async () => {
      const selected = await activeTab().catch(() => null);
      if (selected?.id === tab.id && comparableUrl(selected?.url) === nextUrl) current();
    }, 550);
  }

  panel.capture = {
    current,
    ensureScripts,
    extractFromTab,
    highlightNavigation,
    isCouponManagementUrl,
    isPrimarySiteUrl,
    recoverAffiliateLink,
    scriptsForUrl,
    showFailure,
    waitForProductDom,
    urlInWorker,
    visibleProductUrls,
  };
})();
