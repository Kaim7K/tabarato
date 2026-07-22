(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.automation) return;

  const { STORAGE, elements, showToast, state } = panel;
  const runtime = globalThis.TaBaratoRuntime;
  const COUPON_TERMINAL = new Set(["completed", "stopped", "exhausted", "failed"]);
  let bound = false;

  async function changeCouponLimit(delta) {
    const current = Number(elements.couponLimit.value) || 5;
    elements.couponLimit.value = String(Math.max(1, Math.min(100, current + delta)));
    await chrome.storage.local.set({ [STORAGE.couponLimit]: Number(elements.couponLimit.value) });
  }

  function couponProgressText(operation = null) {
    if (!operation) return "Aguardando início.";
    const activated = Number(operation.activated || 0);
    const limit = Number(operation.limit || elements.couponLimit.value || 0);
    const page = Number(operation.pageNumber || 1);
    const statusLabels = {
      starting: "Abrindo a página de cupons",
      processing: "Ativando cupons",
      "waiting-reload": "Aguardando o recarregamento",
      navigating: "Abrindo a próxima página",
      completed: "Meta concluída",
      exhausted: "Não há mais cupons aplicáveis",
      stopped: "Ativação interrompida",
      failed: "Falha na ativação",
    };
    const label = statusLabels[operation.status] || "Preparando ativação";
    return `${label} · ${activated}/${limit} · página ${page}${operation.error ? ` · ${operation.error}` : ""}`;
  }

  function renderCouponActivationState(operation = null) {
    const running = state.couponActivationRunning;
    elements.activateCouponsButton.classList.toggle("is-running", running);
    elements.activateCouponsButton.title = running ? "Parar ativacao de cupons" : "Ativar cupons do Mercado Livre";
    const label = elements.activateCouponsButton.querySelector("span");
    if (label) label.textContent = running ? "Parar ativação" : "Iniciar ativação";
    elements.couponLimit.disabled = running;
    elements.couponDecrease.disabled = running;
    elements.couponIncrease.disabled = running;
    elements.couponProgress.textContent = operation ? couponProgressText(operation) : "Aguardando início.";
  }

  function applyCouponOperation(operation, notify = false) {
    const running = Boolean(operation && !COUPON_TERMINAL.has(operation.status));
    state.couponActivationRunning = running;
    state.couponOperationId = running ? String(operation.id || "") : "";
    renderCouponActivationState(operation);
    if (!notify || !operation || running) return;

    const activated = Number(operation.activated || 0);
    if (operation.status === "completed") showToast(`Meta concluída: ${activated} cupons ativados.`, "success");
    else if (operation.status === "exhausted") showToast(`Cupons encerrados: ${activated} ativados. Não há mais páginas aplicáveis.`, "neutral");
    else if (operation.status === "stopped") showToast(`Ativação interrompida: ${activated} cupons ativados.`, "neutral");
    else showToast(operation.error || "A ativação de cupons falhou.", "error");
  }

  async function activateCoupons() {
    if (state.couponActivationRunning) {
      showToast("Interrompendo a ativação de cupons...", "neutral");
      const result = await chrome.runtime.sendMessage({ type: "TABARATO_STOP_ML_COUPONS" }).catch(() => null);
      if (!result?.ok) showToast(result?.error || "Não foi possível interromper a ativação.", "error");
      return;
    }

    try {
      const result = await chrome.runtime.sendMessage({
        type: "TABARATO_ACTIVATE_ML_COUPONS",
        limit: Number(elements.couponLimit.value) || 5,
      });
      if (!result?.ok) throw new Error(result?.error || "Nao foi possivel ativar os cupons.");
      state.couponActivationRunning = true;
      state.couponOperationId = String(result.operationId || "");
      renderCouponActivationState({ status: "starting", activated: 0, limit: result.requested, pageNumber: 1 });
      showToast("Ativação iniciada. O progresso continuará após cada recarregamento.", "success");
    } catch (error) {
      runtime.reportError("activate-coupons", error);
      state.couponActivationRunning = false;
      renderCouponActivationState();
      showToast(runtime.errorMessage(error), "error");
    }
  }

  function toggleCouponPanel() {
    const opening = elements.couponPanel.classList.contains("hidden");
    elements.couponPanel.classList.toggle("hidden", !opening);
    elements.couponToggle.setAttribute("aria-expanded", String(opening));
    elements.couponToggle.title = opening ? "Fechar ativacao de cupons" : "Abrir ativacao de cupons";
  }

  function currentBatchCadence() {
    return {
      mode: elements.batchCadenceRate.checked ? "rate" : "interval",
      intervalSeconds: Math.max(5, Math.min(3600, Number(elements.batchIntervalSeconds.value) || 60)),
      perMinute: Math.max(1, Math.min(20, Number(elements.batchPerMinute.value) || 3)),
    };
  }

  function renderBatchCadence() {
    const rate = elements.batchCadenceRate.checked;
    elements.batchIntervalField.classList.toggle("hidden", rate);
    elements.batchRateField.classList.toggle("hidden", !rate);
  }

  async function saveBatchCadence() {
    renderBatchCadence();
    const cadence = currentBatchCadence();
    elements.batchIntervalSeconds.value = String(cadence.intervalSeconds);
    elements.batchPerMinute.value = String(cadence.perMinute);
    await chrome.storage.local.set({ [STORAGE.batchCadence]: cadence });
  }

  function handleRuntimeMessage(message) {
    if (message?.type === "TABARATO_COUPON_PROGRESS") {
      applyCouponOperation(message.operation, false);
      return false;
    }
    if (message?.type === "TABARATO_COUPON_FINISHED") {
      applyCouponOperation(message.operation, true);
      return false;
    }
    return false;
  }

  function bind() {
    if (bound) return;
    bound = true;
    elements.couponToggle.addEventListener("click", toggleCouponPanel);
    elements.couponDecrease.addEventListener("click", () => changeCouponLimit(-1).catch(() => {}));
    elements.couponIncrease.addEventListener("click", () => changeCouponLimit(1).catch(() => {}));
    elements.couponLimit.addEventListener("change", () => changeCouponLimit(0).catch(() => {}));
    elements.activateCouponsButton.addEventListener("click", activateCoupons);
    [elements.batchCadenceInterval, elements.batchCadenceRate, elements.batchIntervalSeconds, elements.batchPerMinute]
      .forEach((control) => control.addEventListener("change", () => saveBatchCadence().catch(() => {})));
    elements.batchOpenTabsOnly.addEventListener("change", () => {
      chrome.storage.local.set({ [STORAGE.batchOpenTabsOnly]: elements.batchOpenTabsOnly.checked }).catch(() => {});
    });
    elements.batchShowRecent?.addEventListener("change", () => {
      chrome.storage.local.set({ [STORAGE.batchShowRecent]: elements.batchShowRecent.checked }).catch(() => {});
    });
    elements.batchLinks?.addEventListener("input", () => {
      chrome.storage.local.set({ [STORAGE.batchLinks]: elements.batchLinks.value.slice(0, 20000) }).catch(() => {});
    });
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  }

  async function initialize() {
    renderBatchCadence();
    const stored = await chrome.storage.local.get([STORAGE.batchLinks, STORAGE.batchShowRecent]).catch(() => ({}));
    if (elements.batchLinks) elements.batchLinks.value = String(stored[STORAGE.batchLinks] || "");
    if (elements.batchShowRecent) elements.batchShowRecent.checked = stored[STORAGE.batchShowRecent] === true;
    const couponStatus = await chrome.runtime.sendMessage({ type: "TABARATO_COUPON_STATUS" }).catch(() => null);
    if (couponStatus?.operation) applyCouponOperation(couponStatus.operation, false);
    else renderCouponActivationState();
  }

  panel.automation = {
    applyCouponOperation,
    bind,
    initialize,
    renderBatchCadence,
    saveBatchCadence,
    toggleCouponPanel,
  };
})();
