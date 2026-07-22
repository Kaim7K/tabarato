(() => {
  if (window.top !== window) return;
  if (globalThis.__TABARATO_STORE_CONTENT__) return;
  globalThis.__TABARATO_STORE_CONTENT__ = true;

  const BUTTON_ID = "tabarato-launcher";
  const BUTTON_POSITION_KEY = "tabarato_launcher_position_v1";
  const BUTTON_MARGIN = 12;
  const HIDDEN_PRODUCTS_KEY = "tabarato_hidden_products_v1";
  const SELECTED_PRODUCTS_KEY = "tabarato_selected_products_v1";
  const runtime = globalThis.TaBaratoRuntime;
  const tools = globalThis.TaBaratoCapture;
  const pageContext = globalThis.TaBaratoPageContext;
  let extractionPromise = null;
  let extractionUrl = "";
  let enrichmentPromise = null;
  let enrichmentUrl = "";
  let allowedPage = false;
  let navigationTimer = null;
  let launcherRatio = null;
  let productControlsTimer = null;
  let productControlsObserver = null;
  let hiddenProductMap = {};
  let selectedProductMap = {};

  async function syncAdminMarker() {
    const stored = await chrome.storage.local.get("tabarato_extension_session").catch(() => ({}));
    const extensionSession = stored.tabarato_extension_session;
    const active = Boolean(extensionSession?.token && new Date(extensionSession.expiresAt).getTime() > Date.now());
    if (active) document.documentElement.dataset.tabaratoExtensionAdmin = "true";
    else delete document.documentElement.dataset.tabaratoExtensionAdmin;
    window.dispatchEvent(new CustomEvent("tabarato:admin-extension", { detail: { active } }));
  }

  async function currentAdapter() {
    const stores = globalThis.TaBaratoStores || [];
    for (const adapter of stores) {
      if (adapter.matches?.()) return adapter;
      if (adapter.matchesAsync && await adapter.matchesAsync()) return adapter;
    }
    return null;
  }

  async function updateAllowedPage() {
    try {
      const result = await chrome.runtime.sendMessage({ type: "TABARATO_IS_ALLOWED_PAGE", url: location.href });
      allowedPage = Boolean(result?.allowed);
    } catch {
      allowedPage = false;
    }
  }

  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

  function launcherBounds(button) {
    const height = Math.max(1, button?.offsetHeight || 52);
    const maximumTop = Math.max(BUTTON_MARGIN, window.innerHeight - height - BUTTON_MARGIN);
    return { minimumTop: BUTTON_MARGIN, maximumTop };
  }

  function applyLauncherPosition(button, ratio = launcherRatio) {
    if (!button) return;
    const { minimumTop, maximumTop } = launcherBounds(button);
    const normalizedRatio = Number.isFinite(Number(ratio)) ? clamp(Number(ratio), 0, 1) : 1;
    const top = minimumTop + ((maximumTop - minimumTop) * normalizedRatio);
    button.style.top = `${Math.round(clamp(top, minimumTop, maximumTop))}px`;
    button.style.bottom = "auto";
  }

  async function loadLauncherPosition() {
    if (launcherRatio !== null) return launcherRatio;
    const stored = await chrome.storage.local.get(BUTTON_POSITION_KEY).catch(() => ({}));
    const value = stored?.[BUTTON_POSITION_KEY];
    launcherRatio = Number.isFinite(Number(value?.ratio)) ? clamp(Number(value.ratio), 0, 1) : 1;
    return launcherRatio;
  }

  async function saveLauncherPosition(button) {
    const { minimumTop, maximumTop } = launcherBounds(button);
    const top = clamp(Number.parseFloat(button.style.top) || minimumTop, minimumTop, maximumTop);
    launcherRatio = maximumTop > minimumTop ? (top - minimumTop) / (maximumTop - minimumTop) : 0;
    await chrome.storage.local.set({
      [BUTTON_POSITION_KEY]: {
        ratio: launcherRatio,
        updatedAt: Date.now(),
      },
    }).catch(() => {});
  }

  function makeLauncherDraggable(button) {
    let pointerId = null;
    let startY = 0;
    let startTop = 0;
    let dragging = false;
    let suppressClick = false;

    const finish = async (event) => {
      if (pointerId === null || (event?.pointerId != null && event.pointerId !== pointerId)) return;
      try { button.releasePointerCapture?.(pointerId); } catch { /* Capture may already be released. */ }
      pointerId = null;
      button.style.transition = "transform .16s ease, box-shadow .16s ease";
      button.style.cursor = "pointer";
      if (!dragging) return;
      suppressClick = true;
      button.dataset.tabaratoDragged = "true";
      await saveLauncherPosition(button);
      window.setTimeout(() => {
        suppressClick = false;
        delete button.dataset.tabaratoDragged;
      }, 180);
      dragging = false;
    };

    button.style.touchAction = "none";
    button.style.userSelect = "none";

    button.addEventListener("pointerdown", (event) => {
      if (button.disabled || event.button !== 0) return;
      pointerId = event.pointerId;
      startY = event.clientY;
      startTop = Number.parseFloat(button.style.top) || launcherBounds(button).maximumTop;
      dragging = false;
      button.setPointerCapture?.(pointerId);
    });

    button.addEventListener("pointermove", (event) => {
      if (pointerId === null || event.pointerId !== pointerId) return;
      const deltaY = event.clientY - startY;
      if (!dragging && Math.abs(deltaY) < 5) return;
      dragging = true;
      event.preventDefault();
      const { minimumTop, maximumTop } = launcherBounds(button);
      button.style.transition = "none";
      button.style.cursor = "grabbing";
      button.style.transform = "scale(1.03)";
      button.style.top = `${Math.round(clamp(startTop + deltaY, minimumTop, maximumTop))}px`;
      document.getElementById("tabarato-quick-actions")?.dispatchEvent(new Event("mouseenter"));
    });

    button.addEventListener("pointerup", finish);
    button.addEventListener("pointercancel", finish);
    button.addEventListener("lostpointercapture", finish);

    return () => suppressClick;
  }


  const QUICK_LINKS = [
    { key: "shopee", label: "Afiliados Shopee", url: "https://affiliate.shopee.com.br/offer/product_offer", icon: "S" },
    { key: "meli", label: "Afiliados Mercado Livre", url: "https://www.mercadolivre.com.br/afiliados/hub#menu-lateral", icon: "ML" },
    { key: "coupons", label: "Cupons Mercado Livre", url: "https://www.pelando.com.br/cupons-de-descontos/mercado-livre", icon: "%" },
  ];

  function createQuickActions(button) {
    const menu = document.createElement("div");
    menu.id = "tabarato-quick-actions";
    Object.assign(menu.style, {
      position: "fixed",
      right: "76px",
      zIndex: "2147483646",
      display: "grid",
      gap: "8px",
      opacity: "0",
      pointerEvents: "none",
      transform: "translateX(8px)",
      transition: "opacity .16s ease, transform .16s ease",
    });
    QUICK_LINKS.forEach((item) => {
      const action = document.createElement("button");
      action.type = "button";
      action.title = item.label;
      action.setAttribute("aria-label", item.label);
      action.textContent = item.icon;
      Object.assign(action.style, {
        width: "42px", height: "42px", borderRadius: "50%", border: "1px solid rgba(17,17,17,.14)",
        background: "#fff", color: item.key === "shopee" ? "#ee4d2d" : item.key === "meli" ? "#111" : "#f97316",
        fontWeight: "800", fontSize: item.key === "meli" ? "11px" : "15px", cursor: "pointer",
        boxShadow: "0 10px 26px rgba(17,17,17,.18)",
      });
      action.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        action.disabled = true;
        try {
          const result = await chrome.runtime.sendMessage({ type: "TABARATO_OPEN_EXTERNAL", url: item.url });
          if (!result?.ok) throw new Error(result?.error || "Nao foi possivel abrir o atalho.");
          action.style.transform = "scale(.92)";
          window.setTimeout(() => { action.style.transform = ""; }, 160);
        } catch (error) {
          action.title = runtime.errorMessage(error, "Nao foi possivel abrir o atalho.");
        } finally {
          action.disabled = false;
        }
      });
      menu.appendChild(action);
    });
    const position = () => {
      const rect = button.getBoundingClientRect();
      const menuHeight = 42 * QUICK_LINKS.length + 8 * (QUICK_LINKS.length - 1);
      menu.style.top = `${Math.round(clamp(rect.top + rect.height / 2 - menuHeight / 2, BUTTON_MARGIN, window.innerHeight - menuHeight - BUTTON_MARGIN))}px`;
    };
    const open = () => { position(); menu.style.opacity = "1"; menu.style.pointerEvents = "auto"; menu.style.transform = "translateX(0)"; };
    const close = () => { menu.style.opacity = "0"; menu.style.pointerEvents = "none"; menu.style.transform = "translateX(8px)"; };
    let closeTimer = null;
    const delayedClose = () => { window.clearTimeout(closeTimer); closeTimer = window.setTimeout(close, 280); };
    button.addEventListener("mouseenter", () => { window.clearTimeout(closeTimer); open(); });
    button.addEventListener("mouseleave", delayedClose);
    menu.addEventListener("mouseenter", () => { window.clearTimeout(closeTimer); open(); });
    menu.addEventListener("mouseleave", delayedClose);
    button.addEventListener("contextmenu", (event) => { event.preventDefault(); open(); });
    document.documentElement.appendChild(menu);
    return menu;
  }

  function productIdentityFromUrl(value = "") {
    const url = String(value || "");
    const mercadoLivre = url.match(/\bMLB-?(\d{6,})\b/i);
    if (mercadoLivre) return `mlb:${mercadoLivre[1]}`;
    const shopee = url.match(/(?:i\.|\/product\/)(\d+)[./](\d+)/i);
    if (shopee) return `shopee:${shopee[1]}:${shopee[2]}`;
    try {
      const parsed = new URL(url, location.href);
      parsed.hash = "";
      return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
    } catch {
      return "";
    }
  }

  function canonicalProductUrlFromLink(link) {
    const href = link?.href || link?.getAttribute?.("href") || "";
    try {
      const url = new URL(href, location.href);
      if (/mercadolivre|mercadolibre/i.test(url.hostname)) {
        if (!/(?:^|[/?-])MLB-?\d{6,}(?:$|[/?#-])/i.test(url.href)) return "";
      } else if (/shopee/i.test(url.hostname)) {
        if (!/(?:\/product\/|[-.]i\.\d+\.\d+)/i.test(url.href)) return "";
      } else {
        return "";
      }
      url.hash = "";
      return url.toString();
    } catch {
      return "";
    }
  }

  function productCardForLink(link) {
    return link?.closest?.([
      ".poly-card",
      "li.ui-search-layout__item",
      ".ui-search-result__wrapper",
      ".ui-search-result",
      ".shops__layout-item",
      "[class*='search-result' i]",
      "[class*='poly-card' i]",
    ].join(", ")) || null;
  }

  function productTitleFromCard(card, link) {
    return tools.clean(
      card?.querySelector?.(".poly-component__title, .ui-search-item__title, h2, h3")?.textContent
      || link?.getAttribute?.("title")
      || link?.textContent
      || ""
    ).slice(0, 220);
  }

  function selectedRecords() {
    return Object.values(selectedProductMap || {})
      .filter((item) => item?.url && item.selected !== false)
      .sort((left, right) => Number(left.selectedAt || 0) - Number(right.selectedAt || 0));
  }

  async function saveProductUiState() {
    await chrome.storage.local.set({
      [HIDDEN_PRODUCTS_KEY]: hiddenProductMap,
      [SELECTED_PRODUCTS_KEY]: selectedProductMap,
    }).catch(() => {});
  }

  function applyCardHiddenState(card, identity) {
    const hidden = Boolean(hiddenProductMap?.[identity]);
    card.dataset.tabaratoHiddenProduct = hidden ? "true" : "false";
    card.style.display = hidden ? "none" : "";
  }

  function renderCardSelection(button, identity) {
    const selected = Boolean(selectedProductMap?.[identity]);
    button.dataset.selected = selected ? "true" : "false";
    button.title = selected ? "Remover da seleção do lote" : "Selecionar para lote no WhatsApp";
    button.setAttribute("aria-label", button.title);
    button.textContent = selected ? "-" : "+";
  }

  function ensureCardControls() {
    if (!tools?.clean) return;
    if (!/mercadolivre|mercadolibre|shopee/i.test(location.hostname)) return;
    const links = [...document.querySelectorAll("a[href]")].map((link) => {
      const url = canonicalProductUrlFromLink(link);
      if (!url) return null;
      const identity = productIdentityFromUrl(url);
      const card = productCardForLink(link);
      if (!identity || !card || card.dataset.tabaratoProductControls === "true") return null;
      return { link, url, identity, card };
    }).filter(Boolean);

    links.forEach(({ link, url, identity, card }) => {
      card.dataset.tabaratoProductControls = "true";
      card.dataset.tabaratoProductIdentity = identity;
      if (getComputedStyle(card).position === "static") card.style.position = "relative";

      const tray = document.createElement("div");
      tray.className = "tabarato-card-actions";
      Object.assign(tray.style, {
        position: "absolute",
        right: "10px",
        bottom: "10px",
        zIndex: "20",
        display: "flex",
        gap: "6px",
        alignItems: "center",
      });

      const makeButton = (label, title) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.title = title;
        button.setAttribute("aria-label", title);
        Object.assign(button.style, {
          width: "28px",
          height: "28px",
          border: "1px solid rgba(17,17,17,.18)",
          borderRadius: "50%",
          background: "#fff",
          color: "#111827",
          boxShadow: "0 6px 18px rgba(17,17,17,.18)",
          cursor: "pointer",
          fontWeight: "800",
          lineHeight: "1",
        });
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        return button;
      };

      const selectButton = makeButton("+", "Selecionar para lote no WhatsApp");
      const hideButton = makeButton("x", "Esconder este produto");
      hideButton.style.color = "#d93025";
      renderCardSelection(selectButton, identity);

      selectButton.addEventListener("click", async () => {
        if (selectedProductMap[identity]) delete selectedProductMap[identity];
        else {
          selectedProductMap[identity] = {
            identity,
            url,
            title: productTitleFromCard(card, link),
            platform: /shopee/i.test(new URL(url).hostname) ? "Shopee" : "Mercado Livre",
            selectedAt: Date.now(),
          };
        }
        renderCardSelection(selectButton, identity);
        await saveProductUiState();
      });

      hideButton.addEventListener("click", async () => {
        hiddenProductMap[identity] = { identity, url, title: productTitleFromCard(card, link), hiddenAt: Date.now() };
        applyCardHiddenState(card, identity);
        await saveProductUiState();
      });

      tray.append(selectButton, hideButton);
      card.appendChild(tray);
      applyCardHiddenState(card, identity);
    });
  }

  function scheduleProductControls() {
    window.clearTimeout(productControlsTimer);
    productControlsTimer = window.setTimeout(() => {
      try { ensureCardControls(); } catch (error) { runtime.reportError("product-card-controls", error); }
    }, 120);
  }

  async function loadProductUiState() {
    const stored = await chrome.storage.local.get([HIDDEN_PRODUCTS_KEY, SELECTED_PRODUCTS_KEY]).catch(() => ({}));
    hiddenProductMap = stored[HIDDEN_PRODUCTS_KEY] || {};
    selectedProductMap = stored[SELECTED_PRODUCTS_KEY] || {};
    scheduleProductControls();
  }

  async function showHiddenProducts() {
    hiddenProductMap = {};
    await chrome.storage.local.set({ [HIDDEN_PRODUCTS_KEY]: hiddenProductMap }).catch(() => {});
    document.querySelectorAll("[data-tabarato-hidden-product='true']").forEach((card) => {
      card.style.display = "";
      card.dataset.tabaratoHiddenProduct = "false";
    });
    scheduleProductControls();
    return { ok: true };
  }

  function startProductControlsObserver() {
    if (productControlsObserver || !/mercadolivre|mercadolibre|shopee/i.test(location.hostname)) return;
    productControlsObserver = new MutationObserver(scheduleProductControls);
    productControlsObserver.observe(document.documentElement, { childList: true, subtree: true });
    scheduleProductControls();
  }

  async function updateButton() {
    await updateAllowedPage();
    const existing = document.getElementById(BUTTON_ID);
    if (!allowedPage) {
      existing?.remove();
      return;
    }
    if (existing) {
      applyLauncherPosition(existing);
      return;
    }

    await loadLauncherPosition();
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.setAttribute("aria-label", "Abrir Ta Barato");
    button.title = "Abrir Tá Barato — arraste para posicionar";
    Object.assign(button.style, {
      position: "fixed",
      right: "18px",
      zIndex: "2147483647",
      width: "52px",
      height: "52px",
      padding: "0",
      border: "1px solid rgba(17,17,17,.14)",
      borderRadius: "50%",
      background: "#ffffff",
      backgroundImage: `url("${chrome.runtime.getURL("assets/icon-128.png")}")`,
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
      backgroundSize: "34px 34px",
      boxShadow: "0 16px 42px rgba(17,17,17,.24)",
      cursor: "pointer",
      transition: "transform .16s ease, box-shadow .16s ease",
    });
    document.documentElement.appendChild(button);
    createQuickActions(button);
    applyLauncherPosition(button);

    const clickSuppressed = makeLauncherDraggable(button);
    button.addEventListener("mouseenter", () => {
      if (!button.matches(":active") && !button.dataset.tabaratoDragged) button.style.transform = "translateY(-1px)";
    });
    button.addEventListener("mouseleave", () => {
      if (!button.dataset.tabaratoDragged) button.style.transform = "";
    });
    button.addEventListener("click", async (event) => {
      if (clickSuppressed() || button.dataset.tabaratoDragged === "true") {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (button.disabled) return;
      button.disabled = true;
      try {
        const panelRequest = chrome.runtime.sendMessage({ type: "TABARATO_OPEN_PANEL" });
        if (globalThis.TaBaratoStores?.some((adapter) => {
          try { return adapter.matches?.() && adapter.isProduct?.(); } catch { return false; }
        })) {
          chrome.storage.local.set({ tabarato_capture_request: { url: location.href, at: Date.now() } }).catch(() => {});
        }
        const result = await panelRequest;
        if (!result?.ok) throw new Error(result?.error || "Nao foi possivel abrir a extensao.");
      } catch (error) {
        runtime.reportError("open-panel-launcher", error);
        button.title = runtime.errorMessage(error, "Nao foi possivel abrir a extensao.");
      } finally {
        button.disabled = false;
      }
    });
  }

  function pageActionError(action = "capturar") {
    const context = pageContext?.snapshot?.() || { route: "unsupported", platform: "Desconhecida" };
    if (context.route === "auth-required") return `Entre novamente na ${context.platform} antes de ${action} o produto.`;
    if (context.route === "traffic-verification") return `${context.platform} pediu uma verificacao de seguranca. Conclua-a no site e tente ${action} novamente.`;
    if (context.route === "product-unavailable") return "Este produto está indisponível ou o anúncio foi encerrado.";
    if (context.route === "error") return "A plataforma apresentou um erro. Recarregue a página e tente novamente.";
    if (context.route === "search") return "Abra a página exata do produto antes de iniciar a captura.";
    if (context.loading) return "A página ainda está carregando. Aguarde os dados principais do produto.";
    return "Abra a página exata de um produto da Shopee ou do Mercado Livre.";
  }

  async function extractCurrentProduct() {
    const context = pageContext?.snapshot?.();
    if (context && context.route !== "product") throw new Error(pageActionError("capturar"));
    const adapter = await currentAdapter();
    if (!adapter?.isProduct?.()) throw new Error(pageActionError("capturar"));
    const currentUrl = location.href;
    if (!extractionPromise || extractionUrl !== currentUrl) {
      extractionUrl = currentUrl;
      const pendingExtraction = runtime.withTimeout(
        Promise.resolve().then(() => adapter.extract()),
        35000,
        "A leitura desta pagina demorou demais. Recarregue o produto e tente novamente.",
      );
      extractionPromise = pendingExtraction;
      pendingExtraction.finally(() => {
        if (extractionPromise !== pendingExtraction) return;
        extractionPromise = null;
        extractionUrl = "";
      }).catch(() => {});
    }
    return extractionPromise;
  }

  async function enrichCurrentProduct(baseProduct = {}) {
    const context = pageContext?.snapshot?.();
    if (context && context.route !== "product") throw new Error(pageActionError("completar"));
    const adapter = await currentAdapter();
    if (!adapter?.isProduct?.()) throw new Error(pageActionError("completar"));
    if (!adapter.enrich) return baseProduct;
    const currentUrl = location.href;
    if (!enrichmentPromise || enrichmentUrl !== currentUrl) {
      enrichmentUrl = currentUrl;
      const pendingEnrichment = runtime.withTimeout(
        Promise.resolve().then(() => adapter.enrich(baseProduct)),
        34000,
        "O Mercado Livre demorou para completar link, cupom e pagamento.",
      );
      enrichmentPromise = pendingEnrichment;
      pendingEnrichment.finally(() => {
        if (enrichmentPromise !== pendingEnrichment) return;
        enrichmentPromise = null;
        enrichmentUrl = "";
      }).catch(() => {});
    }
    return enrichmentPromise;
  }

  const isCouponManagementPage = () => /(?:^|\.)mercadolivre\.com\.br$/i.test(location.hostname)
    && /^\/cupons(?:\/|$)/i.test(location.pathname);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "TABARATO_EXTRACT_PRODUCT") {
      if (isCouponManagementPage()) {
        sendResponse({ ok: false, ignored: true, error: "A pagina de cupons nao e uma pagina de produto." });
        return false;
      }
      extractCurrentProduct()
        .then((product) => sendResponse({ ok: true, product }))
        .catch((error) => {
          runtime.reportError("store-extraction", error);
          sendResponse({ ok: false, error: runtime.errorMessage(error, "Nao foi possivel ler os dados desta pagina.") });
        });
      return true;
    }

    if (message?.type === "TABARATO_ENRICH_PRODUCT") {
      enrichCurrentProduct(message.product || {})
        .then((product) => sendResponse({ ok: true, product }))
        .catch((error) => {
          runtime.reportError("store-enrichment", error);
          sendResponse({ ok: false, error: runtime.errorMessage(error, "Nao foi possivel completar os dados desta pagina.") });
        });
      return true;
    }

    if (message?.type === "TABARATO_CAPTURE_AFFILIATE_LINK") {
      currentAdapter()
        .then(async (adapter) => {
          if (!adapter?.captureAffiliateLink) {
            sendResponse({ ok: false, error: "Esta loja nao oferece recuperacao de link afiliado." });
            return;
          }
          const affiliateLink = await adapter.captureAffiliateLink({ force: true });
          sendResponse({
            ok: Boolean(affiliateLink),
            affiliateLink: affiliateLink || "",
            error: affiliateLink ? "" : "O Mercado Livre nao retornou o link meli.la.",
          });
        })
        .catch((error) => sendResponse({ ok: false, error: runtime.errorMessage(error) }));
      return true;
    }

    if (message?.type === "TABARATO_LIST_VISIBLE_PRODUCTS") {
      currentAdapter()
        .then(async (adapter) => {
          const urls = await Promise.resolve(adapter?.listProducts?.(Number(message.limit) || 20) || []);
          sendResponse({ ok: true, urls, storeId: adapter?.id || "" });
        })
        .catch((error) => sendResponse({ ok: false, error: runtime.errorMessage(error), urls: [] }));
      return true;
    }

    if (message?.type === "TABARATO_GET_SELECTED_PRODUCTS") {
      sendResponse({ ok: true, products: selectedRecords() });
      return false;
    }

    if (message?.type === "TABARATO_SHOW_HIDDEN_PRODUCTS") {
      showHiddenProducts()
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ ok: false, error: runtime.errorMessage(error) }));
      return true;
    }
  });

  updateButton().catch((error) => runtime.reportError("launcher", error));
  loadProductUiState().catch((error) => runtime.reportError("product-card-state", error));
  startProductControlsObserver();
  syncAdminMarker().catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[HIDDEN_PRODUCTS_KEY]) {
      hiddenProductMap = changes[HIDDEN_PRODUCTS_KEY].newValue || {};
      scheduleProductControls();
    }
    if (changes[SELECTED_PRODUCTS_KEY]) {
      selectedProductMap = changes[SELECTED_PRODUCTS_KEY].newValue || {};
      document.querySelectorAll("[data-tabarato-product-identity]").forEach((card) => {
        const button = card.querySelector(".tabarato-card-actions button:first-child");
        if (button) renderCardSelection(button, card.dataset.tabaratoProductIdentity);
      });
    }
    if (changes.tabarato_extension_session) syncAdminMarker().catch(() => {});
    if (changes[BUTTON_POSITION_KEY]) {
      const value = changes[BUTTON_POSITION_KEY].newValue;
      launcherRatio = Number.isFinite(Number(value?.ratio)) ? clamp(Number(value.ratio), 0, 1) : 1;
      applyLauncherPosition(document.getElementById(BUTTON_ID));
    }
    if (changes.tabarato_extension_session || changes.tabarato_connected_store_hosts || changes.tabarato_last_base_url) {
      updateButton().catch(() => {});
    }
  });
  const handleNavigation = () => {
    window.clearTimeout(navigationTimer);
    navigationTimer = window.setTimeout(() => {
      try {
        extractionPromise = null;
        extractionUrl = "";
        enrichmentPromise = null;
        enrichmentUrl = "";
        updateButton().catch(() => {});
        scheduleProductControls();
      } catch (error) {
        runtime.reportError("store-button", error);
      }
    }, 60);
  };

  const stopNavigationObserver = pageContext?.observeNavigation?.(handleNavigation);
  window.addEventListener("resize", () => applyLauncherPosition(document.getElementById(BUTTON_ID)));
  // Fallback leve para páginas que alteram a URL fora da History API.
  let fallbackUrl = location.href;
  let navigationWatch = 0;
  const scheduleNavigationWatch = () => {
    window.clearTimeout(navigationWatch);
    navigationWatch = window.setTimeout(() => {
      if (fallbackUrl !== location.href) {
        fallbackUrl = location.href;
        handleNavigation();
      }
      scheduleNavigationWatch();
    }, document.hidden ? 12000 : 4000);
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && fallbackUrl !== location.href) {
      fallbackUrl = location.href;
      handleNavigation();
    }
  });
  scheduleNavigationWatch();
  window.addEventListener("pagehide", () => {
    window.clearTimeout(navigationWatch);
    if (productControlsObserver) productControlsObserver.disconnect();
    stopNavigationObserver?.();
  }, { once: true });
})();
