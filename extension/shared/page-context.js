(() => {
  if (globalThis.TaBaratoPageContext) return;

  const runtime = globalThis.TaBaratoRuntime;
  const clean = (value = "") => String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const normalized = (value = "") => clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const visible = (element) => {
    if (!element?.isConnected) return false;
    const style = globalThis.getComputedStyle?.(element);
    const rect = element.getBoundingClientRect?.();
    return Boolean(rect && rect.width > 0 && rect.height > 0
      && style?.display !== "none" && style?.visibility !== "hidden" && Number(style?.opacity ?? 1) > 0);
  };

  const bodyText = (documentRef = document) => normalized(documentRef.body?.innerText || documentRef.body?.textContent || "");
  const hasVisible = (selector, documentRef = document) => [...documentRef.querySelectorAll(selector)].some(visible);
  const hasText = (pattern, documentRef = document) => pattern.test(bodyText(documentRef));

  function platformFor(hostname = location.hostname) {
    const host = String(hostname || "").toLowerCase();
    if (host === "affiliate.shopee.com.br") return "Shopee Afiliados";
    if (/(?:^|\.)shopee\.com\.br$/.test(host) || host === "s.shopee.com.br") return "Shopee";
    if (/mercadolivre\.com\.br$|mercadolibre\.[a-z.]+$/.test(host)) return "Mercado Livre";
    if (host === "web.whatsapp.com") return "WhatsApp";
    if (/tabaratoofertas\.shop$|localhost$|127\.0\.0\.1$/.test(host)) return "Tá Barato";
    return "Desconhecida";
  }

  function isAuthRequired(documentRef = document, url = location.href) {
    const path = (() => { try { return new URL(url).pathname; } catch { return ""; } })();
    if (/\/(?:login|signin|auth)(?:\/|$)/i.test(path)) return true;
    const hasPassword = hasVisible('input[type="password"]', documentRef);
    return hasPassword && hasText(/\b(?:entrar|fazer login|iniciar sessao|acessar conta)\b/i, documentRef);
  }

  function isErrorPage(documentRef = document) {
    return hasText(/\b(?:algo deu errado|erro do sistema|pagina indisponivel|servico indisponivel|tente novamente mais tarde|nao foi possivel carregar)\b/i, documentRef)
      || hasVisible('[data-testid*="error" i], [class*="error-page" i], [class*="not-found" i]', documentRef);
  }

  function routeFor({ url = location.href, documentRef = document } = {}) {
    let parsed;
    try { parsed = new URL(url); } catch { return "invalid-url"; }
    const platform = platformFor(parsed.hostname);
    const path = parsed.pathname;

    if (isAuthRequired(documentRef, url)) return "auth-required";
    if (isErrorPage(documentRef)) return "error";

    if (platform === "Shopee Afiliados") {
      if (hasVisible('[role="dialog"], .ant-modal, [class*="modal" i]', documentRef)
        && hasText(/link de oferta de produto|copiar link/i, documentRef)) return "affiliate-link-modal";
      if (hasText(/detalhes da oferta do produto/i, documentRef)) return "affiliate-offer-details";
      if (hasText(/oferta de produto/i, documentRef)
        && hasVisible('input[type="search"], input[type="text"], input:not([type])', documentRef)) return "affiliate-product-offers";
      if (hasText(/painel de controle|metricas principais|relatorio de vendas/i, documentRef)) return "affiliate-dashboard";
      return "affiliate-other";
    }

    if (platform === "Shopee") {
      if (hasText(/produto nao encontrado|este produto nao existe|produto indisponivel/i, documentRef)) return "product-unavailable";
      if (/\/product\/\d+\/\d+/i.test(path) || /-i\.\d+\.\d+(?:$|[/?#])/i.test(path)) return "product";
      if (/\/search(?:\/|$)/i.test(path) || parsed.searchParams.has("keyword") || parsed.searchParams.has("searchKeyword")) return "search";
      return "store-other";
    }

    if (platform === "Mercado Livre") {
      if (/^\/cupons(?:\/|$)/i.test(path)) return "coupon-management";
      if (hasText(/publicacao pausada|produto indisponivel|anuncio finalizado|nao esta disponivel/i, documentRef)) return "product-unavailable";
      if (/lista\./i.test(parsed.hostname) || /^\/(?:search|ofertas)(?:\/|$)/i.test(path)) return "search";
      if (/\/p\/ML[A-Z]\d+/i.test(path) || /\/ML[A-Z]-?\d{6,}/i.test(path)) return "product";
      if (hasText(/gerador de links|portal do afiliado|afiliados e criadores/i, documentRef)) return "affiliate-portal";
      return "store-other";
    }

    if (platform === "WhatsApp") return "whatsapp";
    if (platform === "Tá Barato") return "site";
    return "unsupported";
  }

  function snapshot(options = {}) {
    const url = options.url || location.href;
    const documentRef = options.documentRef || document;
    const platform = platformFor((() => { try { return new URL(url).hostname; } catch { return ""; } })());
    const route = routeFor({ url, documentRef });
    return {
      platform,
      route,
      url,
      authenticated: route !== "auth-required",
      error: route === "error",
      product: route === "product",
      unavailable: route === "product-unavailable",
      loading: documentRef.readyState !== "complete",
      overlay: hasVisible('[role="dialog"], [aria-modal="true"], .andes-modal, .ant-modal, [class*="modal" i]', documentRef),
      at: Date.now(),
    };
  }

  function waitFor(read, options = {}) {
    const {
      timeout = 12000,
      signal,
      accept = Boolean,
      root = document.documentElement,
      timeoutMessage = "A página não apresentou o estado esperado.",
      throwOnTimeout = false,
    } = options;
    runtime?.throwIfAborted?.(signal);

    return new Promise((resolve, reject) => {
      let settled = false;
      let observer = null;
      let timer = null;
      let fallbackTimer = null;

      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        observer?.disconnect();
        globalThis.clearTimeout(timer);
        globalThis.clearTimeout(fallbackTimer);
        signal?.removeEventListener("abort", onAbort);
        callback(value);
      };
      const onAbort = () => finish(reject, runtime?.abortError?.(signal?.reason) || new DOMException("Operação cancelada.", "AbortError"));
      const check = () => {
        if (settled) return;
        try {
          const value = read();
          if (accept(value)) finish(resolve, value);
        } catch (error) {
          finish(reject, error);
        }
      };
      const scheduleFallback = () => {
        globalThis.clearTimeout(fallbackTimer);
        fallbackTimer = globalThis.setTimeout(() => {
          check();
          if (!settled) scheduleFallback();
        }, document.hidden ? 900 : 300);
      };

      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
      timer = globalThis.setTimeout(() => {
        if (throwOnTimeout) finish(reject, new Error(timeoutMessage));
        else finish(resolve, null);
      }, Math.max(1, Number(timeout) || 12000));
      if (root && globalThis.MutationObserver) {
        observer = new MutationObserver(check);
        observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "aria-hidden", "disabled"] });
      }
      scheduleFallback();
      check();
    });
  }

  function observeNavigation(callback) {
    let lastUrl = location.href;
    let scheduled = false;
    const check = () => {
      scheduled = false;
      if (lastUrl === location.href) return;
      const previousUrl = lastUrl;
      lastUrl = location.href;
      callback(snapshot(), previousUrl);
    };
    const emit = () => {
      if (scheduled) return;
      scheduled = true;
      if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(check);
      else globalThis.setTimeout(check, 40);
    };
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function (...args) {
      const result = originalPushState.apply(this, args);
      emit();
      return result;
    };
    history.replaceState = function (...args) {
      const result = originalReplaceState.apply(this, args);
      emit();
      return result;
    };
    const routeObserver = globalThis.MutationObserver && document.documentElement
      ? new MutationObserver(emit)
      : null;
    routeObserver?.observe(document.documentElement, { childList: true, subtree: true });
    addEventListener("popstate", emit);
    addEventListener("hashchange", emit);
    addEventListener("pageshow", emit);
    return () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      routeObserver?.disconnect();
      removeEventListener("popstate", emit);
      removeEventListener("hashchange", emit);
      removeEventListener("pageshow", emit);
      scheduled = false;
    };
  }


  globalThis.TaBaratoPageContext = {
    bodyText,
    clean,
    normalized,
    observeNavigation,
    platformFor,
    routeFor,
    snapshot,
    visible,
    waitFor,
  };
})();
