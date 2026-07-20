(() => {
  const panel = globalThis.TaBaratoPanel;
  const runtime = globalThis.TaBaratoRuntime;
  const { STORAGE, activeTab, elements, renderThemeControl, setBusy, setMode, setStatus, showToast, state } = panel;
  const { comparableUrl, normalizeCouponValue } = globalThis.TaBaratoProductUtils;
  async function login(event) {
    event.preventDefault();
    setBusy(elements.loginButton, true, "Conectando...");
    try {
      await panel.api.authenticate(elements.username.value, elements.password.value, elements.baseUrl.value);
      elements.password.value = "";
      panel.api.renderAuth();
      await captureCurrentPageAfterAuth();
      showToast("Extensao conectada ao painel.", "success");
    } catch (error) {
      runtime.reportError("admin-login", error);
      setStatus("Erro", "error");
      showToast(runtime.errorMessage(error), "error");
    } finally {
      setBusy(elements.loginButton, false);
    }
  }

  function bindEvents() {
    elements.loginForm.addEventListener("submit", login);
    elements.offerForm.addEventListener("submit", (event) => { event.preventDefault(); panel.publishing.save(); });
    elements.publishButton.addEventListener("click", panel.publishing.publish);
    elements.whatsappButton.addEventListener("click", panel.publishing.whatsapp);
    elements.adminPanelButton.addEventListener("click", () => panel.api.openAdminPanel().catch((error) => showToast(runtime.errorMessage(error), "error")));
    elements.themeToggle.addEventListener("click", () => globalThis.TaBaratoTheme?.toggle());
    window.addEventListener("tabarato-theme-change", renderThemeControl);
    panel.automation.bind();
    elements.groupsToggle.addEventListener("click", () => {
      const opening = elements.groupsPanel.classList.contains("hidden");
      elements.groupsPanel.classList.toggle("hidden", !opening);
      elements.groupsToggle.setAttribute("aria-expanded", String(opening));
    });
    elements.saveGroupsButton.addEventListener("click", async () => {
      await chrome.storage.local.set({ [STORAGE.groups]: elements.whatsappGroups.value });
      showToast(`${panel.groupNames().length} grupos registrados.`, "success");
    });
    elements.batchStopButton.addEventListener("click", panel.batch.stop);
    elements.batchPauseButton.addEventListener("click", panel.batch.pause);
    elements.refreshButton.addEventListener("click", () => panel.capture.current());
    elements.modeSingle.addEventListener("click", () => setMode("single"));
    elements.modeBatch.addEventListener("click", () => setMode("batch"));
    elements.batchStartButton.addEventListener("click", panel.batch.start);
    elements.customToggle.addEventListener("click", () => {
      const opening = elements.customBody.classList.contains("hidden");
      elements.customBody.classList.toggle("hidden", !opening);
      elements.customToggle.setAttribute("aria-expanded", String(opening));
    });
    elements.customSendButton.addEventListener("click", panel.publishing.sendCustomMessage);
    elements.logoutButton.addEventListener("click", async () => {
      await panel.api.clearSession();
      panel.api.renderAuth();
    });

    Object.values(elements.fields).forEach((field) => field.addEventListener("input", () => {
      panel.product.updatePreview();
      panel.product.scheduleDraftPersist();
    }));
    elements.fields.coupon.addEventListener("change", () => {
      elements.fields.coupon.value = normalizeCouponValue(elements.fields.coupon.value);
      panel.product.updatePreview();
      panel.product.scheduleDraftPersist();
    });
    [elements.fields.currentPrice, elements.fields.previousPrice]
      .forEach((field) => field.addEventListener("change", panel.product.normalizePriceFields));

    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if ((!changeInfo.url && changeInfo.status !== "complete") || !tab.active) return;
      const updated = { ...tab, id: tabId, url: changeInfo.url || tab.url };
      if (changeInfo.url) await panel.sync.restoreProductForTab(updated).catch(() => {});
      panel.capture.highlightNavigation(updated);
    });
    chrome.tabs.onActivated.addListener(async ({ tabId }) => {
      try {
        const tab = await chrome.tabs.get(tabId);
        await panel.sync.restoreProductForTab(tab);
        panel.capture.highlightNavigation(tab);
      } catch { /* Closed tabs are ignored. */ }
    });
  }

  function freshCaptureRequest(request, tab) {
    return request?.at > Date.now() - 15000 && comparableUrl(request.url) === comparableUrl(tab?.url);
  }

  async function captureCurrentPageAfterAuth(stored = null) {
    if (!panel.api.sessionIsValid()) return;
    const tab = await activeTab().catch(() => null);
    const saved = stored || await chrome.storage.local.get(STORAGE.captureRequest);
    const captureRequest = saved?.[STORAGE.captureRequest];
    if (freshCaptureRequest(captureRequest, tab)) {
      await chrome.storage.local.remove(STORAGE.captureRequest);
      await panel.capture.current();
      return;
    }
    if (tab?.url
      && !panel.capture.isCouponManagementUrl(tab.url)
      && !panel.capture.isPrimarySiteUrl(tab.url)
      && !/web\.whatsapp\.com/i.test(tab.url)
      && (!state.activeProduct || comparableUrl(tab.url) !== state.capturedPageUrl)) {
      elements.captureSource.textContent = "Produto aberto. Clique em Capturar para iniciar a coleta.";
      elements.refreshButton.classList.add("needs-refresh");
    }
  }

  async function initialize() {
    renderThemeControl();
    bindEvents();
    const stored = await chrome.storage.local.get(Object.values(STORAGE));
    await panel.api.restoreSession(stored);
    await panel.sync.initialize(stored);
    await panel.automation.initialize();
    panel.api.renderAuth();
    await captureCurrentPageAfterAuth(stored);
  }

  initialize().catch((error) => {
    runtime.reportError("load-settings", error);
    panel.api.renderAuth();
    showToast("Nao foi possivel carregar as configuracoes.", "error");
  });
})();
