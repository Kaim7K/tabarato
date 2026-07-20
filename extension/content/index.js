(() => {
  if (window.top !== window) return;
  if (globalThis.__TABARATO_STORE_CONTENT__) return;
  globalThis.__TABARATO_STORE_CONTENT__ = true;

  const BUTTON_ID = "tabarato-launcher";
  const BUTTON_POSITION_KEY = "tabarato_launcher_position_v1";
  const BUTTON_MARGIN = 12;
  const runtime = globalThis.TaBaratoRuntime;
  let extractionPromise = null;
  let extractionUrl = "";
  let enrichmentPromise = null;
  let enrichmentUrl = "";
  let allowedPage = false;
  let navigationTimer = null;
  let launcherRatio = null;

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
    });

    button.addEventListener("pointerup", finish);
    button.addEventListener("pointercancel", finish);
    button.addEventListener("lostpointercapture", finish);

    return () => suppressClick;
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

  async function extractCurrentProduct() {
    const adapter = await currentAdapter();
    if (!adapter?.isProduct?.()) throw new Error("Abra a pagina exata de um produto compativel.");
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
    const adapter = await currentAdapter();
    if (!adapter?.isProduct?.()) throw new Error("Abra a pagina exata de um produto compativel.");
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
  });

  updateButton().catch((error) => runtime.reportError("launcher", error));
  syncAdminMarker().catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
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
  let lastUrl = location.href;
  const handleNavigation = () => {
    if (lastUrl === location.href) return;
    lastUrl = location.href;
    window.clearTimeout(navigationTimer);
    navigationTimer = window.setTimeout(() => {
      try {
        extractionPromise = null;
        extractionUrl = "";
        enrichmentPromise = null;
        enrichmentUrl = "";
        updateButton().catch(() => {});
      } catch (error) {
        runtime.reportError("store-button", error);
      }
    }, 80);
  };

  window.addEventListener("popstate", handleNavigation);
  window.addEventListener("hashchange", handleNavigation);
  window.addEventListener("pageshow", handleNavigation);
  window.addEventListener("resize", () => applyLauncherPosition(document.getElementById(BUTTON_ID)));
  // Marketplaces usam navegacao SPA. O verificador e adaptativo: responde
  // rapidamente com a aba visivel e reduz atividade quando ela fica em segundo plano.
  let navigationWatch = 0;
  const scheduleNavigationWatch = () => {
    window.clearTimeout(navigationWatch);
    navigationWatch = window.setTimeout(() => {
      handleNavigation();
      scheduleNavigationWatch();
    }, document.hidden ? 2500 : 750);
  };
  document.addEventListener("visibilitychange", () => {
    handleNavigation();
    scheduleNavigationWatch();
  });
  scheduleNavigationWatch();
  window.addEventListener("pagehide", () => window.clearTimeout(navigationWatch), { once: true });
})();
