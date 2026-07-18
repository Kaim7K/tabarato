(() => {
  if (globalThis.TaBaratoPanel) return;

  const STORAGE = Object.freeze({
    session: "tabarato_extension_session",
    groups: "tabarato_whatsapp_groups",
    lastBaseUrl: "tabarato_last_base_url",
    connectedHosts: "tabarato_connected_store_hosts",
    productDraft: "tabarato_product_draft",
    captureRequest: "tabarato_capture_request",
  });

  const LIMITS = Object.freeze({
    requestTimeout: 22000,
    captureTimeout: 38000,
    whatsappTimeout: 120000,
    minimumBatchConfidence: 0.8,
  });

  const byId = (id) => document.getElementById(id);
  const elements = {
    setup: byId("setup-view"),
    editor: byId("editor-view"),
    loginForm: byId("login-form"),
    offerForm: byId("offer-form"),
    baseUrl: byId("base-url"),
    username: byId("username"),
    password: byId("password"),
    loginButton: byId("login-button"),
    adminPanelButton: byId("admin-panel-button"),
    themeToggle: byId("theme-toggle"),
    groupsToggle: byId("groups-toggle"),
    groupsPanel: byId("groups-panel"),
    whatsappGroups: byId("whatsapp-groups"),
    saveGroupsButton: byId("save-groups-button"),
    stopMacroButton: byId("stop-macro-button"),
    status: byId("connection-status"),
    modeSingle: byId("mode-single"),
    modeBatch: byId("mode-batch"),
    singleView: byId("single-view"),
    batchView: byId("batch-view"),
    loading: byId("loading-state"),
    empty: byId("empty-state"),
    captureSource: byId("capture-source"),
    refreshButton: byId("refresh-button"),
    logoutButton: byId("logout-button"),
    saveButton: byId("save-button"),
    publishButton: byId("publish-button"),
    whatsappButton: byId("whatsapp-button"),
    duplicateWarning: byId("duplicate-warning"),
    captureQuality: byId("capture-quality"),
    toast: byId("toast"),
    previewImage: byId("preview-image"),
    previewName: byId("preview-name"),
    previewPrice: byId("preview-price"),
    previewPreviousPrice: byId("preview-previous-price"),
    previewCategory: byId("preview-category"),
    platformBadge: byId("platform-badge"),
    batchLimit: byId("batch-limit"),
    batchStartButton: byId("batch-start-button"),
    batchStopButton: byId("batch-stop-button"),
    batchLog: byId("batch-log"),
    customToggle: byId("custom-toggle"),
    customBody: byId("custom-body"),
    customMessage: byId("custom-message"),
    customImageUrl: byId("custom-image-url"),
    customImageFile: byId("custom-image-file"),
    customTelegram: byId("custom-telegram"),
    customWhatsapp: byId("custom-whatsapp"),
    customSendButton: byId("custom-send-button"),
    couponLimit: byId("coupon-limit"),
    couponDecrease: byId("coupon-decrease"),
    couponIncrease: byId("coupon-increase"),
    activateCouponsButton: byId("activate-coupons-button"),
    fields: {
      affiliateLink: byId("affiliate-link"),
      productName: byId("product-name"),
      messageHeadline: byId("message-headline"),
      currentPrice: byId("current-price"),
      previousPrice: byId("previous-price"),
      platform: byId("platform"),
      category: byId("category"),
      coupon: byId("coupon"),
      shortDescription: byId("short-description"),
      imageUrl: byId("image-url"),
      extraText: byId("extra-text"),
    },
  };

  const missingElements = Object.entries({ ...elements, ...elements.fields })
    .filter(([, element]) => !element)
    .map(([name]) => name);
  if (missingElements.length) throw new Error(`Elementos ausentes no painel: ${missingElements.join(", ")}`);

  const state = {
    session: null,
    activeProduct: null,
    availableCategories: [...elements.fields.category.options].map((option) => option.value),
    synchronizedOffers: [],
    catalogPromise: null,
    captureSequence: 0,
    capturedTabId: null,
    capturedPageUrl: "",
    shareImagePromise: null,
    shareImageKey: "",
    sharePackagePromise: null,
    sharePackageKey: "",
    batchController: null,
    batchWorkerTabId: null,
    batchWorkerTabIds: [],
    couponActivationRunning: false,
    navigationCaptureTimer: null,
    draftPersistTimer: null,
  };

  const actionLocks = new Set();
  const idleButtonContent = new WeakMap();
  let toastTimer = null;

  function groupNames() {
    return [...new Set(String(elements.whatsappGroups.value || "")
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean))];
  }

  async function activeTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  }

  function setStatus(label, tone = "neutral") {
    const indicator = document.createElement("i");
    indicator.setAttribute("aria-hidden", "true");
    elements.status.replaceChildren(indicator, document.createTextNode(label));
    elements.status.dataset.tone = tone;
  }

  function showToast(message, tone = "neutral") {
    elements.toast.textContent = String(message || "");
    elements.toast.dataset.tone = tone;
    elements.toast.classList.remove("hidden");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.add("hidden"), 4300);
  }

  function setBusy(button, busy, label = "Aguarde...") {
    if (!button) return;
    if (busy) {
      if (!idleButtonContent.has(button)) {
        idleButtonContent.set(button, [...button.childNodes].map((node) => node.cloneNode(true)));
      }
      button.replaceChildren(document.createTextNode(label));
      button.disabled = true;
      return;
    }
    if (idleButtonContent.has(button)) {
      button.replaceChildren(...idleButtonContent.get(button).map((node) => node.cloneNode(true)));
      idleButtonContent.delete(button);
    }
    button.disabled = false;
  }

  function renderActionLocks() {
    const disabled = actionLocks.size > 0;
    [
      elements.saveButton,
      elements.publishButton,
      elements.whatsappButton,
      elements.batchStartButton,
      elements.customSendButton,
      elements.activateCouponsButton,
      elements.refreshButton,
      elements.modeSingle,
      elements.modeBatch,
    ].forEach((button) => { button.disabled = disabled; });
  }

  function lockActions(owner, button, label) {
    actionLocks.add(owner);
    setBusy(button, true, label);
    renderActionLocks();
  }

  function unlockActions(owner, button) {
    actionLocks.delete(owner);
    setBusy(button, false);
    renderActionLocks();
  }

  function setMode(mode) {
    const batch = mode === "batch";
    elements.modeSingle.classList.toggle("active", !batch);
    elements.modeBatch.classList.toggle("active", batch);
    elements.singleView.classList.toggle("hidden", batch);
    elements.batchView.classList.toggle("hidden", !batch);
  }

  function renderThemeControl() {
    const dark = globalThis.TaBaratoTheme?.current() === "dark";
    const label = dark ? "Usar modo claro" : "Usar modo escuro";
    elements.themeToggle.title = label;
    elements.themeToggle.setAttribute("aria-label", label);
    elements.themeToggle.setAttribute("aria-pressed", String(dark));
  }

  globalThis.TaBaratoPanel = {
    LIMITS,
    STORAGE,
    activeTab,
    elements,
    groupNames,
    lockActions,
    renderActionLocks,
    renderThemeControl,
    setBusy,
    setMode,
    setStatus,
    showToast,
    state,
    unlockActions,
  };
})();
