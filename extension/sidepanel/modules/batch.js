(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.batch) return;

  const { LIMITS, activeTab, elements, lockActions, showToast, state, unlockActions } = panel;
  const runtime = globalThis.TaBaratoRuntime;
  const { parsePrice } = globalThis.TaBaratoProductUtils;
  const batchUtils = globalThis.TaBaratoBatchUtils;

  function log(message, tone = "neutral") {
    const item = document.createElement("li");
    item.textContent = message;
    item.dataset.tone = tone;
    elements.batchLog.appendChild(item);
    item.scrollIntoView({ block: "nearest" });
  }

  async function stop() {
    state.batchController?.abort();
    const workerTabId = state.batchWorkerTabId;
    state.batchWorkerTabId = null;
    if (workerTabId) await chrome.tabs.remove(workerTabId).catch(() => {});
    await Promise.all([
      chrome.runtime.sendMessage({ type: "TABARATO_STOP_WHATSAPP" }).catch(() => {}),
      chrome.runtime.sendMessage({ type: "TABARATO_STOP_ML_COUPONS" }).catch(() => {}),
    ]);
    showToast("Operacao interrompida.", "success");
  }

  async function start() {
    if (state.batchController) {
      showToast("Ja existe um lote em andamento.", "neutral");
      return;
    }
    const limit = Math.max(1, Math.min(50, Number(elements.batchLimit.value) || 5));
    const controller = new AbortController();
    const productBeforeBatch = state.activeProduct;
    const warningBeforeBatch = {
      hidden: elements.duplicateWarning.classList.contains("hidden"),
      text: elements.duplicateWarning.textContent,
    };
    let workerTab = null;
    let published = 0;
    let skipped = 0;
    let failed = 0;
    state.batchController = controller;
    elements.batchLog.replaceChildren();
    lockActions("batch", elements.batchStartButton, "Enviando...");

    try {
      const sourceTab = await activeTab();
      if (!sourceTab?.id) throw new Error("Abra a pagina com a lista de produtos antes de iniciar o lote.");
      const [urls] = await Promise.all([
        panel.capture.visibleProductUrls(limit, sourceTab),
        panel.catalog.synchronize(),
      ]);
      if (!urls.length) throw new Error("Nenhum produto visivel foi encontrado.");
      log(`${urls.length} produtos encontrados.`);
      workerTab = await chrome.tabs.create({ url: "about:blank", active: false });
      state.batchWorkerTabId = workerTab.id;

      for (const [index, url] of urls.entries()) {
        if (controller.signal.aborted) break;
        try {
          log(`Lendo ${index + 1}/${urls.length}...`);
          const product = await panel.capture.urlInWorker(workerTab.id, url, controller.signal);
          const reviewReasons = batchUtils.reviewProduct(product, LIMITS.minimumBatchConfidence, parsePrice);
          if (reviewReasons.length) {
            skipped += 1;
            log(`Ignorado por dados incertos (${reviewReasons.join(", ")}): ${product.productName || url}`, "error");
            continue;
          }

          state.activeProduct = product;
          const existing = panel.catalog.findExisting(product);
          if (existing) {
            const result = await panel.publishing.reconcile(product, {
              refreshCatalog: false,
              notifyUser: false,
              notifyWhatsApp: true,
            });
            if (result.action === "updated") published += 1;
            else skipped += 1;
            const labels = {
              updated: "Preco melhor atualizado e republicado",
              deleted: "Preco pior removido do site",
              unchanged: "Ja cadastrado com o mesmo preco",
              invalid: "Cadastro existente com preco invalido",
            };
            log(`${labels[result.action] || "Produto revisado"}: ${product.productName}`, result.action === "updated" ? "success" : "neutral");
            if (result.publication?.whatsappError) log(`WhatsApp nao confirmou: ${result.publication.whatsappError}`, "error");
            continue;
          }

          const payload = panel.product.toPayload(product, "APROVADO");
          const created = await panel.api.request("/api/admin/ofertas", {
            method: "POST",
            body: payload,
            signal: controller.signal,
          });
          state.synchronizedOffers.unshift(created.offer);
          const publication = await panel.publishing.publishOfferId(created.offer.id, payload, {
            notifyWhatsApp: true,
            tolerateWhatsAppFailure: true,
          });
          published += 1;
          log(`Publicado: ${payload.productName}`, "success");
          if (publication.whatsappError) log(`WhatsApp nao confirmou: ${publication.whatsappError}`, "error");
        } catch (error) {
          if (controller.signal.aborted) break;
          failed += 1;
          log(runtime.errorMessage(error), "error");
        }
      }

      showToast(
        controller.signal.aborted
          ? `Lote interrompido. ${published} publicados.`
          : `Lote finalizado: ${published} publicados, ${skipped} ignorados, ${failed} erros.`,
        failed ? "neutral" : "success",
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        runtime.reportError("batch-send", error);
        showToast(runtime.errorMessage(error), "error");
      }
    } finally {
      if (workerTab?.id) await chrome.tabs.remove(workerTab.id).catch(() => {});
      if (state.batchWorkerTabId === workerTab?.id) state.batchWorkerTabId = null;
      state.activeProduct = productBeforeBatch;
      panel.product.invalidateShareImage();
      elements.duplicateWarning.textContent = warningBeforeBatch.text;
      elements.duplicateWarning.classList.toggle("hidden", warningBeforeBatch.hidden);
      if (state.batchController === controller) state.batchController = null;
      unlockActions("batch", elements.batchStartButton);
    }
  }

  panel.batch = { log, start, stop };
})();
