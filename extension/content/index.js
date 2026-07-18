(() => {
  if (globalThis.__TABARATO_STORE_CONTENT__) return;
  globalThis.__TABARATO_STORE_CONTENT__ = true;

  const BUTTON_ID = "tabarato-launcher";
  const runtime = globalThis.TaBaratoRuntime;
  let extractionPromise = null;
  let extractionUrl = "";
  let allowedPage = false;
  let navigationTimer = null;

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

  async function updateButton() {
    await updateAllowedPage();
    const existing = document.getElementById(BUTTON_ID);
    if (!allowedPage) {
      existing?.remove();
      return;
    }
    if (existing) return;

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.setAttribute("aria-label", "Abrir Ta Barato");
    Object.assign(button.style, {
      position: "fixed",
      right: "18px",
      bottom: "18px",
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
    });
    button.addEventListener("mouseenter", () => { button.style.transform = "translateY(-1px)"; });
    button.addEventListener("mouseleave", () => { button.style.transform = ""; });
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        const adapter = await currentAdapter();
        if (adapter?.isProduct?.()) {
          adapter.prepareAffiliateLink?.();
          await chrome.storage.local.set({ tabarato_capture_request: { url: location.href, at: Date.now() } });
        }
        const result = await chrome.runtime.sendMessage({ type: "TABARATO_OPEN_PANEL" });
        if (!result?.ok) throw new Error(result?.error || "Nao foi possivel abrir a extensao.");
      } catch (error) {
        runtime.reportError("open-panel-launcher", error);
        button.title = runtime.errorMessage(error, "Nao foi possivel abrir a extensao.");
      } finally {
        button.disabled = false;
      }
    });
    document.documentElement.appendChild(button);
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
        updateButton().catch(() => {});
      } catch (error) {
        runtime.reportError("store-button", error);
      }
    }, 80);
  };

  ["pushState", "replaceState"].forEach((method) => {
    const original = history[method];
    history[method] = function tabaratoHistoryUpdate(...args) {
      const result = original.apply(this, args);
      queueMicrotask(handleNavigation);
      return result;
    };
  });
  window.addEventListener("popstate", handleNavigation);
  window.addEventListener("hashchange", handleNavigation);
  window.addEventListener("pageshow", handleNavigation);
  new MutationObserver(handleNavigation).observe(document.documentElement, { childList: true, subtree: true });
})();
