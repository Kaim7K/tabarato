(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.capture) return;

  const { LIMITS, activeTab, elements, setBusy, state } = panel;
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
      panel.media?.prepareShare(panel.product.payload())
        .catch((error) => runtime.reportError("prewarm-share-image", error));
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

  function assertBatchActive(signal) {
    if (signal?.aborted) throw new Error("Envio interrompido.");
  }

  async function focusWorker(tabId) {
    // Ativar a aba e suficiente para componentes do marketplace que carregam
    // sob demanda. Nao roube o foco da janela do usuario a cada produto.
    return chrome.tabs.update(tabId, { active: true });
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
    await chrome.tabs.reload(tabId);
    await waitForProductDom(tabId, expectedUrl || tab.url, signal, timeout);
    assertBatchActive(signal);
    return chrome.tabs.get(tabId);
  }

  async function pinWorkerToTop(tabId, expectedUrl, signal) {
    if (!/mercadolivre|mercadolibre/i.test(expectedUrl || "")) return true;
    assertBatchActive(signal);
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const scrollTop = () => Number(
          globalThis.scrollY
            || document.scrollingElement?.scrollTop
            || document.documentElement?.scrollTop
            || document.body?.scrollTop
            || 0
        );
        const pin = () => {
          [document.scrollingElement, document.documentElement, document.body].filter(Boolean).forEach((root) => {
            root.scrollTop = 0;
            root.scrollLeft = 0;
          });
          try {
            globalThis.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
          } catch {
            globalThis.scrollTo?.(0, 0);
          }
        };
        for (let sample = 0; sample < 3; sample += 1) {
          pin();
          await new Promise((resolve) => globalThis.setTimeout(resolve, 80));
        }
        pin();
        return scrollTop() <= 2;
      },
    }).catch(() => []);
    assertBatchActive(signal);
    return Boolean(result[0]?.result);
  }

  async function waitForAffiliateSurface(tabId, expectedUrl, signal, timeout = 7000) {
    if (!/mercadolivre|mercadolibre/i.test(expectedUrl || "")) return true;
    assertBatchActive(signal);
    const execution = chrome.scripting.executeScript({
      target: { tabId },
      func: async (timeoutMs) => new Promise((resolve) => {
        const visible = (element) => {
          if (!element) return false;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none"
            && style.visibility !== "hidden"
            && rect.width > 0
            && rect.height > 0
            && rect.top < Math.max(1200, innerHeight * 1.25);
        };
        const read = () => [...document.querySelectorAll("button, [role='button'], a")]
          .filter(visible)
          .some((element) => {
            const label = [
              element.textContent,
              element.getAttribute("aria-label"),
              element.getAttribute("title"),
              element.getAttribute("data-testid"),
            ].filter(Boolean).join(" ");
            if (!/compartilhar|compartilhe|gerar\s+link|link\s+de\s+afiliado|afiliad/i.test(label)) return false;
            let context = element;
            for (let depth = 0; context && depth < 6; depth += 1, context = context.parentElement) {
              if (/programa\s+de\s+afiliados?|afiliados?\s+e\s+criadores|ganhos?\s+extras?/i.test(context.textContent || "")) return true;
            }
            return /afiliad|gerar\s+link/i.test(label);
          });

        let done = false;
        const finish = (value) => {
          if (done) return;
          done = true;
          observer.disconnect();
          clearTimeout(timer);
          clearInterval(fallback);
          resolve(value);
        };
        const inspect = () => { if (read()) finish(true); };
        const observer = new MutationObserver(inspect);
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class", "style", "aria-label", "title", "data-testid"],
        });
        const fallback = setInterval(inspect, 400);
        const timer = setTimeout(() => finish(false), timeoutMs);
        inspect();
      }),
      args: [timeout],
    });
    const result = await runtime.withTimeout(
      execution,
      timeout + 1500,
      "O componente de afiliados demorou para carregar.",
    ).catch(() => []);
    assertBatchActive(signal);
    return Boolean(result[0]?.result);
  }

  async function loadedWorker(tabId, url, signal, _windowId = null, { reloadOnIncomplete = true } = {}) {
    void _windowId;
    assertBatchActive(signal);
    await focusWorker(tabId);
    await waitForProductDom(tabId, url, signal, 45000);
    await pinWorkerToTop(tabId, url, signal);
    await waitForAffiliateSurface(tabId, url, signal);
    assertBatchActive(signal);

    let tab = await chrome.tabs.get(tabId);
    let result = await extractFromTab(tab);
    if (result?.ok && coreProductIsComplete(result.product)) return result.product;
    if (!reloadOnIncomplete) throw new Error(result?.error || "A pagina ainda nao terminou de carregar os dados do produto.");

    await reloadWorker(tabId, url, signal);
    await pinWorkerToTop(tabId, url, signal);
    await waitForAffiliateSurface(tabId, url, signal, 9000);
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
    assertBatchActive(signal);
    const execution = chrome.scripting.executeScript({
      target: { tabId },
      func: async (targetUrl, timeoutMs) => new Promise((resolve) => {
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
        const snapshot = () => {
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
        };

        let stableSignature = "";
        let stableSamples = 0;
        let lastStableAt = 0;
        let done = false;
        let inspectQueued = false;
        const finish = (value) => {
          if (done) return;
          done = true;
          observer.disconnect();
          clearTimeout(timer);
          clearInterval(stabilityClock);
          resolve(value);
        };
        const inspect = () => {
          inspectQueued = false;
          const current = snapshot();
          if (!current.ready) {
            stableSignature = "";
            stableSamples = 0;
            lastStableAt = 0;
            return;
          }
          const now = Date.now();
          if (current.signature !== stableSignature) {
            stableSignature = current.signature;
            stableSamples = 1;
            lastStableAt = now;
          } else if (now - lastStableAt >= 120) {
            stableSamples += 1;
            lastStableAt = now;
          }
          if (stableSamples >= 3) finish(true);
        };
        const queueInspect = () => {
          if (inspectQueued || done) return;
          inspectQueued = true;
          queueMicrotask(inspect);
        };
        const observer = new MutationObserver(queueInspect);
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          characterData: true,
          attributeFilter: ["src", "srcset", "content", "class", "style"],
        });
        const stabilityClock = setInterval(inspect, 150);
        const timer = setTimeout(() => finish(false), timeoutMs);
        inspect();
      }),
      args: [expectedUrl, timeout],
    });
    const result = await runtime.withTimeout(
      execution,
      timeout + 2000,
      "O produto demorou para carregar.",
    ).catch(() => []);
    assertBatchActive(signal);
    if (result[0]?.result) return;
    throw new Error("O produto nao terminou de carregar nome, preco e imagem dentro do tempo esperado.");
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
    }, 250);
  }

  panel.capture = {
    current,
    ensureScripts,
    extractFromTab,
    highlightNavigation,
    isCouponManagementUrl,
    isPrimarySiteUrl,
    recoverAffiliateLink,
    reloadWorker,
    pinWorkerToTop,
    loadedWorker,
    scriptsForUrl,
    showFailure,
    waitForProductDom,
    urlInWorker,
    visibleProductUrls,
  };
})();
