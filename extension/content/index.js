(() => {
  if (globalThis.__TABARATO_STORE_CONTENT__) return;
  globalThis.__TABARATO_STORE_CONTENT__ = true;

  const BUTTON_ID = "tabarato-send-product";
  const runtime = globalThis.TaBaratoRuntime;
  let extractionPromise = null;
  let extractionUrl = "";

  const currentAdapter = () => globalThis.TaBaratoStores.find((adapter) => adapter.matches());

  const updateButton = () => {
    const adapter = currentAdapter();
    const existing = document.getElementById(BUTTON_ID);
    if (!adapter?.isProduct()) {
      existing?.remove();
      return;
    }
    if (existing) return;

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "Enviar produto";
    button.setAttribute("aria-label", "Enviar produto para o Ta Barato");
    Object.assign(button.style, {
      position: "fixed",
      right: "20px",
      bottom: "20px",
      zIndex: "2147483647",
      minHeight: "46px",
      padding: "0 18px",
      border: "1px solid rgba(255,255,255,.22)",
      borderRadius: "7px",
      background: "#111111",
      color: "#ffffff",
      boxShadow: "0 10px 30px rgba(0,0,0,.22)",
      font: "600 14px/1 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      cursor: "pointer",
    });
    button.addEventListener("mouseenter", () => { button.style.background = "#ff6b35"; });
    button.addEventListener("mouseleave", () => { button.style.background = "#111111"; });
    button.addEventListener("click", () => {
      adapter.prepareAffiliateLink?.();
      chrome.runtime.sendMessage({ type: "TABARATO_OPEN_PANEL" }).catch(() => {});
    });
    document.body.appendChild(button);
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "TABARATO_EXTRACT_PRODUCT") return;
    const adapter = currentAdapter();
    if (!adapter?.isProduct()) {
      sendResponse({ ok: false, error: "Abra a pagina exata de um produto compativel." });
      return;
    }
    const currentUrl = location.href;
    if (!extractionPromise || extractionUrl !== currentUrl) {
      extractionUrl = currentUrl;
      const pendingExtraction = runtime.withTimeout(
        Promise.resolve().then(() => adapter.extract()),
        28000,
        "A leitura desta pagina demorou demais. Recarregue o produto e tente novamente.",
      );
      extractionPromise = pendingExtraction;
      pendingExtraction.finally(() => {
        if (extractionPromise !== pendingExtraction) return;
        extractionPromise = null;
        extractionUrl = "";
      }).catch(() => {});
    }
    extractionPromise
      .then((product) => sendResponse({ ok: true, product }))
      .catch((error) => {
        runtime.reportError("store-extraction", error);
        sendResponse({ ok: false, error: runtime.errorMessage(error, "Nao foi possivel ler os dados desta pagina.") });
      });
    return true;
  });

  updateButton();
  let lastUrl = location.href;
  window.setInterval(() => {
    try {
      if (lastUrl !== location.href) lastUrl = location.href;
      updateButton();
    } catch (error) {
      runtime.reportError("store-button", error);
    }
  }, 1500);
})();
