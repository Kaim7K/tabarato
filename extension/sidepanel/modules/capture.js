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

  async function enrich(product) {
    const complete = product.productName && product.currentPrice && product.imageUrl && product.shortDescription;
    const previewLink = product.affiliateLink || product.sourceUrl;
    if (complete || !previewLink) return product;
    try {
      const preview = await panel.api.request("/api/admin/product-preview", {
        method: "POST",
        body: { link: previewLink },
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
      const product = await enrich(result.product);
      await catalogRequest;
      if (runId !== state.captureSequence) return;
      await apply(product, tab, reconcile);
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
    let tab = await chrome.tabs.update(tabId, { url, active: false });
    await runtime.waitForTabComplete(tabId, 40000, "O produto demorou para carregar.");
    if (signal.aborted) throw new Error("Envio interrompido.");
    await runtime.delay(300);
    tab = await chrome.tabs.get(tabId);
    const result = await extractFromTab(tab);
    if (!result?.ok) throw new Error(result?.error || "Produto nao encontrado.");
    return result.product;
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
    scriptsForUrl,
    showFailure,
    urlInWorker,
    visibleProductUrls,
  };
})();
