(() => {
  if (globalThis.TaBaratoPanel) return;

  const DEFAULT_WHATSAPP_GROUP = "🏷️ Tá Barato | Ofertas e Achados";

  const STORAGE = Object.freeze({
    session: "tabarato_extension_session",
    groups: "tabarato_whatsapp_groups",
    lastBaseUrl: "tabarato_last_base_url",
    connectedHosts: "tabarato_connected_store_hosts",
    productDrafts: "tabarato_product_drafts_v2",
    legacyProductDraft: "tabarato_product_draft",
    lastActiveProduct: "tabarato_last_active_product_v1",
    couponLimit: "tabarato_coupon_activation_limit",
    captureRequest: "tabarato_capture_request",
    batchCadence: "tabarato_batch_cadence_v1",
    batchOpenTabsOnly: "tabarato_batch_open_tabs_only_v1",
    shopeeAffiliateRequest: "tabarato_shopee_affiliate_request_v1",
    shopeeAffiliateResult: "tabarato_shopee_affiliate_result_v1",
    sendDestinations: "tabarato_send_destinations_v1",
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
    couponToggle: byId("coupon-toggle"),
    couponPanel: byId("coupon-panel"),
    couponProgress: byId("coupon-progress"),
    groupsToggle: byId("groups-toggle"),
    groupsPanel: byId("groups-panel"),
    whatsappGroups: byId("whatsapp-groups"),
    saveGroupsButton: byId("save-groups-button"),
    destinationSite: byId("destination-site"),
    destinationTelegram: byId("destination-telegram"),
    destinationWhatsapp: byId("destination-whatsapp"),
    status: byId("connection-status"),
    modeSingle: byId("mode-single"),
    modeBatch: byId("mode-batch"),
    singleView: byId("single-view"),
    batchView: byId("batch-view"),
    loading: byId("loading-state"),
    empty: byId("empty-state"),
    captureSource: byId("capture-source"),
    refreshButton: byId("refresh-button"),
    collectCurrentButton: byId("collect-current-button"),
    emptyCaptureButton: byId("empty-capture-button"),
    shopeeLinkButton: byId("shopee-link-button"),
    bestOptionButton: byId("best-option-button"),
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
    batchOpenTabsOnly: byId("batch-open-tabs-only"),
    batchStartButton: byId("batch-start-button"),
    batchStopButton: byId("batch-stop-button"),
    batchPauseButton: byId("batch-pause-button"),
    batchCadenceInterval: byId("batch-cadence-interval"),
    batchCadenceRate: byId("batch-cadence-rate"),
    batchIntervalField: byId("batch-interval-field"),
    batchRateField: byId("batch-rate-field"),
    batchIntervalSeconds: byId("batch-interval-seconds"),
    batchPerMinute: byId("batch-per-minute"),
    batchNextTime: byId("batch-next-time"),
    batchLog: byId("batch-log"),
    batchSummary: byId("batch-summary"),
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
    batchController: null,
    batchWorkerTabId: null,
    batchWorkerTabIds: [],
    batchOwnedWorkerTabIds: [],
    couponActivationRunning: false,
    couponOperationId: "",
    batchPaused: false,
    batchPauseWaiters: [],
    batchPostTimestamps: [],
    navigationCaptureTimer: null,
    draftPersistTimer: null,
    autoFieldValues: {},
  };

  const actionLocks = new Set();
  const idleButtonContent = new WeakMap();
  let toastTimer = null;

  function selectedDestinations() {
    return {
      site: Boolean(elements.destinationSite.checked),
      telegram: Boolean(elements.destinationTelegram.checked),
      whatsapp: Boolean(elements.destinationWhatsapp.checked),
    };
  }

  function groupNames() {
    const groups = [...new Set(String(elements.whatsappGroups.value || "")
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean))];
    return groups;
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
      elements.couponToggle,
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
    elements.modeSingle.setAttribute("aria-pressed", String(!batch));
    elements.modeBatch.setAttribute("aria-pressed", String(batch));
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
    DEFAULT_WHATSAPP_GROUP,
    LIMITS,
    STORAGE,
    activeTab,
    elements,
    groupNames,
    lockActions,
    renderActionLocks,
    renderThemeControl,
    selectedDestinations,
    setBusy,
    setMode,
    setStatus,
    showToast,
    state,
    unlockActions,
  };
})();
