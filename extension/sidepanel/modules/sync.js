(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.sync) return;

  const { DEFAULT_WHATSAPP_GROUP, STORAGE, activeTab, elements, state } = panel;
  const { comparableUrl } = globalThis.TaBaratoProductUtils;
  let bound = false;

  function validCouponLimit(value) {
    return String(Math.max(1, Math.min(100, Number(value) || 5)));
  }

  function validBatchCadence(value = {}) {
    const mode = value?.mode === "rate" ? "rate" : "interval";
    return {
      mode,
      intervalSeconds: Math.max(5, Math.min(3600, Number(value?.intervalSeconds) || 60)),
      perMinute: Math.max(1, Math.min(20, Number(value?.perMinute) || 3)),
    };
  }

  function applyGlobalSettings(stored = {}) {
    if (Object.hasOwn(stored, STORAGE.groups)) {
      elements.whatsappGroups.value = String(stored[STORAGE.groups] ?? "");
    } else if (!String(elements.whatsappGroups.value || "").trim()) {
      elements.whatsappGroups.value = DEFAULT_WHATSAPP_GROUP;
      chrome.storage.local.set({ [STORAGE.groups]: DEFAULT_WHATSAPP_GROUP }).catch(() => {});
    }
    if (Object.hasOwn(stored, STORAGE.couponLimit)) {
      elements.couponLimit.value = validCouponLimit(stored[STORAGE.couponLimit]);
    }
    if (Object.hasOwn(stored, STORAGE.batchCadence)) {
      const cadence = validBatchCadence(stored[STORAGE.batchCadence]);
      elements.batchCadenceInterval.checked = cadence.mode === "interval";
      elements.batchCadenceRate.checked = cadence.mode === "rate";
      elements.batchIntervalSeconds.value = String(cadence.intervalSeconds);
      elements.batchPerMinute.value = String(cadence.perMinute);
      elements.batchIntervalField.classList.toggle("hidden", cadence.mode !== "interval");
      elements.batchRateField.classList.toggle("hidden", cadence.mode !== "rate");
    }
    if (Object.hasOwn(stored, STORAGE.batchOpenTabsOnly)) {
      elements.batchOpenTabsOnly.checked = Boolean(stored[STORAGE.batchOpenTabsOnly]);
    }
    if (Object.hasOwn(stored, STORAGE.lastBaseUrl) && document.activeElement !== elements.baseUrl) {
      elements.baseUrl.value = String(stored[STORAGE.lastBaseUrl] || elements.baseUrl.value || "");
    }
    if (Object.hasOwn(stored, STORAGE.session)) {
      state.session = stored[STORAGE.session] || null;
      if (state.session && !panel.api.sessionIsValid(state.session)) state.session = null;
      panel.api.renderAuth();
    }
  }

  async function restoreProductForTab(tab, stored = null) {
    if (!tab?.id || !tab?.url) return Boolean(state.activeProduct);

    // Ao abrir ou alternar para o WhatsApp, mantenha o ultimo produto capturado
    // visivel no painel. Ele so deve mudar quando uma nova pagina de produto
    // for realmente identificada e capturada.
    if (/^https:\/\/web\.whatsapp\.com\//i.test(tab.url)) {
      if (state.activeProduct) {
        elements.offerForm.classList.remove("hidden");
        return true;
      }
      const whatsappStored = stored || await chrome.storage.local.get(STORAGE.lastActiveProduct);
      return panel.product.restoreDraft(whatsappStored[STORAGE.lastActiveProduct]);
    }
    const saved = stored || await chrome.storage.local.get([STORAGE.productDrafts, STORAGE.legacyProductDraft]);
    const restored = panel.product.restoreDraftForTab(
      saved[STORAGE.productDrafts],
      tab,
      saved[STORAGE.legacyProductDraft],
    );
    if (!restored && (state.capturedTabId !== tab.id || comparableUrl(state.capturedPageUrl) !== comparableUrl(tab.url))) {
      panel.product.clearForTab();
    }
    return restored;
  }

  function handleStorageChanges(changes, area) {
    if (area !== "local") return;
    const next = {};
    [STORAGE.session, STORAGE.groups, STORAGE.lastBaseUrl, STORAGE.couponLimit, STORAGE.batchCadence, STORAGE.batchOpenTabsOnly].forEach((key) => {
      if (changes[key]) next[key] = changes[key].newValue;
    });
    if (Object.keys(next).length) applyGlobalSettings(next);
  }

  function handleProductPatch(message) {
    if (message?.type !== "TABARATO_PRODUCT_PATCH_BROADCAST" || !message.patch) return false;
    const sameTab = Number(message.tabId) === Number(state.capturedTabId);
    const sameUrl = comparableUrl(message.url) === comparableUrl(state.capturedPageUrl);
    if (!state.activeProduct || (!sameTab && !sameUrl)) return false;
    panel.product.mergeEnrichment({ ...message.patch, captureStage: state.activeProduct.captureStage });
    panel.product.persistDraft().catch(() => {});
    return false;
  }

  function bind() {
    if (bound) return;
    bound = true;
    chrome.storage.onChanged.addListener(handleStorageChanges);
    chrome.runtime.onMessage.addListener(handleProductPatch);
  }

  async function initialize(stored) {
    bind();
    applyGlobalSettings(stored);
    const tab = await activeTab().catch(() => null);
    await restoreProductForTab(tab, stored);
  }

  panel.sync = {
    applyGlobalSettings,
    bind,
    initialize,
    restoreProductForTab,
  };
})();
