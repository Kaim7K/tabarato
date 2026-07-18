(() => {
  const panel = globalThis.TaBaratoPanel;
  const runtime = globalThis.TaBaratoRuntime;
  const { STORAGE, activeTab, elements, renderThemeControl, setBusy, setMode, setStatus, showToast, state } = panel;
  const { comparableUrl, normalizeCouponValue } = globalThis.TaBaratoProductUtils;

  function changeCouponLimit(delta) {
    const current = Number(elements.couponLimit.value) || 5;
    elements.couponLimit.value = String(Math.max(1, Math.min(100, current + delta)));
  }

  function renderCouponActivationState() {
    const running = state.couponActivationRunning;
    elements.activateCouponsButton.classList.toggle("is-running", running);
    elements.activateCouponsButton.title = running ? "Parar ativacao de cupons" : "Ativar cupons do Mercado Livre";
    const label = elements.activateCouponsButton.querySelector("span");
    if (label) label.textContent = running ? "Parar cupons" : "Ativar cupons";
    elements.couponLimit.disabled = running;
    elements.couponDecrease.disabled = running;
    elements.couponIncrease.disabled = running;
  }

  async function activateCoupons() {
    if (state.couponActivationRunning) {
      await globalThis.TaBaratoExtensionApi.runtime.sendMessage({ type: "TABARATO_STOP_ML_COUPONS" }).catch(() => {});
      showToast("Interrompendo a ativacao de cupons...", "neutral");
      return;
    }
    state.couponActivationRunning = true;
    renderCouponActivationState();
    try {
      const result = await globalThis.TaBaratoExtensionApi.runtime.sendMessage({
        type: "TABARATO_ACTIVATE_ML_COUPONS",
        limit: Number(elements.couponLimit.value) || 5,
      });
      if (!result?.ok) throw new Error(result?.error || "Nao foi possivel ativar os cupons.");
      if (result.stopped) showToast(`Ativacao interrompida. ${result.activated || 0} cupons foram ativados.`, "neutral");
      else if (result.activated) {
        const failures = result.failed ? ` ${result.failed} nao foram confirmados.` : "";
        showToast(`${result.activated} cupons ativados.${failures}`, result.failed ? "neutral" : "success");
      } else showToast("Nao ha cupons nao ativados com o botao Aplicar.", "neutral");
    } catch (error) {
      runtime.reportError("activate-coupons", error);
      showToast(runtime.errorMessage(error), "error");
    } finally {
      state.couponActivationRunning = false;
      renderCouponActivationState();
    }
  }

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
    elements.groupsToggle.addEventListener("click", () => elements.groupsPanel.classList.toggle("hidden"));
    elements.saveGroupsButton.addEventListener("click", async () => {
      await globalThis.TaBaratoExtensionApi.storage.local.set({ [STORAGE.groups]: elements.whatsappGroups.value });
      showToast(`${panel.groupNames().length} grupos registrados.`, "success");
    });
    elements.stopMacroButton.addEventListener("click", panel.batch.stop);
    elements.batchStopButton.addEventListener("click", panel.batch.stop);
    elements.refreshButton.addEventListener("click", () => panel.capture.current());
    elements.couponDecrease.addEventListener("click", () => changeCouponLimit(-1));
    elements.couponIncrease.addEventListener("click", () => changeCouponLimit(1));
    elements.couponLimit.addEventListener("change", () => changeCouponLimit(0));
    elements.activateCouponsButton.addEventListener("click", activateCoupons);
    elements.modeSingle.addEventListener("click", () => setMode("single"));
    elements.modeBatch.addEventListener("click", () => setMode("batch"));
    elements.batchStartButton.addEventListener("click", panel.batch.start);
    elements.customToggle.addEventListener("click", () => elements.customBody.classList.toggle("hidden"));
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

    globalThis.TaBaratoExtensionApi.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if ((!changeInfo.url && changeInfo.status !== "complete") || !tab.active) return;
      panel.capture.highlightNavigation({ ...tab, id: tabId, url: changeInfo.url || tab.url });
    });
    globalThis.TaBaratoExtensionApi.tabs.onActivated.addListener(async ({ tabId }) => {
      try {
        panel.capture.highlightNavigation(await globalThis.TaBaratoExtensionApi.tabs.get(tabId));
      } catch { /* Closed tabs are ignored. */ }
    });
  }

  function freshCaptureRequest(request, tab) {
    return request?.at > Date.now() - 15000 && comparableUrl(request.url) === comparableUrl(tab?.url);
  }

  async function captureCurrentPageAfterAuth(stored = null) {
    if (!panel.api.sessionIsValid()) return;
    const tab = await activeTab().catch(() => null);
    const saved = stored || await globalThis.TaBaratoExtensionApi.storage.local.get(STORAGE.captureRequest);
    const captureRequest = saved?.[STORAGE.captureRequest];
    if (freshCaptureRequest(captureRequest, tab)) {
      await globalThis.TaBaratoExtensionApi.storage.local.remove(STORAGE.captureRequest);
      await panel.capture.current();
      return;
    }
    if (tab?.url
      && !panel.capture.isCouponManagementUrl(tab.url)
      && !panel.capture.isPrimarySiteUrl(tab.url)
      && !/web\.whatsapp\.com/i.test(tab.url)
      && (!state.activeProduct || comparableUrl(tab.url) !== state.capturedPageUrl)) {
      await panel.capture.current();
    }
  }

  async function initialize() {
    renderThemeControl();
    bindEvents();
    const stored = await globalThis.TaBaratoExtensionApi.storage.local.get(Object.values(STORAGE));
    await panel.api.restoreSession(stored);
    elements.whatsappGroups.value = stored[STORAGE.groups] || "";
    panel.product.restoreDraft(stored[STORAGE.productDraft]);
    panel.api.renderAuth();
    await captureCurrentPageAfterAuth(stored);
  }

  initialize().catch((error) => {
    runtime.reportError("load-settings", error);
    panel.api.renderAuth();
    showToast("Nao foi possivel carregar as configuracoes.", "error");
  });
})();
