(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.batch) return;

  const { LIMITS, activeTab, elements, lockActions, showToast, state, unlockActions } = panel;
  const runtime = globalThis.TaBaratoRuntime;
  const { parsePrice } = globalThis.TaBaratoProductUtils;
  const batchUtils = globalThis.TaBaratoBatchUtils;
  const BATCH_WINDOW_SIZE = 5;

  function log(message, tone = "neutral") {
    const item = document.createElement("li");
    item.textContent = message;
    item.dataset.tone = tone;
    elements.batchLog.appendChild(item);
    item.scrollIntoView({ block: "nearest" });
  }

  function registeredWorkerIds() {
    return [...new Set([
      ...(Array.isArray(state.batchWorkerTabIds) ? state.batchWorkerTabIds : []),
      state.batchWorkerTabId,
    ].filter(Boolean))];
  }

  function registerWorkers(tabIds) {
    const current = registeredWorkerIds();
    state.batchWorkerTabIds = [...new Set([...current, ...tabIds.filter(Boolean)])];
    state.batchWorkerTabId = state.batchWorkerTabIds[0] || null;
  }

  function unregisterWorker(tabId) {
    state.batchWorkerTabIds = registeredWorkerIds().filter((id) => id !== tabId);
    state.batchWorkerTabId = state.batchWorkerTabIds[0] || null;
  }

  async function closeWorker(tabId) {
    if (!tabId) return;
    unregisterWorker(tabId);
    await chrome.tabs.remove(tabId).catch(() => {});
  }

  async function closeAllWorkers() {
    const tabIds = registeredWorkerIds();
    state.batchWorkerTabIds = [];
    state.batchWorkerTabId = null;
    if (tabIds.length) await chrome.tabs.remove(tabIds).catch(() => {});
  }

  async function stop() {
    state.batchController?.abort();
    await closeAllWorkers();
    await Promise.all([
      chrome.runtime.sendMessage({ type: "TABARATO_STOP_WHATSAPP" }).catch(() => {}),
      chrome.runtime.sendMessage({ type: "TABARATO_STOP_ML_COUPONS" }).catch(() => {}),
    ]);
    showToast("Operacao interrompida.", "success");
  }

  async function preloadWorkers(urls, sourceTab, signal, offset, total) {
    if (signal.aborted) throw new Error("Envio interrompido.");
    const first = offset + 1;
    const last = offset + urls.length;
    log(`Abrindo ${first}-${last}/${total} em paralelo...`);

    const workers = await Promise.all(urls.map(async (url, localIndex) => {
      if (signal.aborted) throw new Error("Envio interrompido.");
      const tab = await chrome.tabs.create({
        url,
        active: false,
        windowId: sourceTab.windowId,
      });
      registerWorkers([tab.id]);
      const ready = panel.capture.waitForProductDom(tab.id, url, signal, 45000)
        .then(() => ({ ok: true }))
        .catch((error) => ({ ok: false, error }));
      return {
        tabId: tab.id,
        url,
        index: offset + localIndex,
        ready,
      };
    }));

    return workers;
  }

  async function readWorker(worker, sourceTab, signal, total) {
    const position = worker.index + 1;
    log(`Aguardando carregamento ${position}/${total}...`);
    const preloaded = await worker.ready;
    if (!preloaded.ok) {
      log(`Recarregando ${position}/${total}: a pagina nao terminou de montar...`);
      await panel.capture.reloadWorker(worker.tabId, worker.url, signal);
    }

    log(`Lendo ${position}/${total}...`);
    let product = await panel.capture.loadedWorker(worker.tabId, worker.url, signal, sourceTab.windowId);
    if (product.platform === "Mercado Livre" && !/^https:\/\/(?:www\.)?meli\.la\//i.test(product.affiliateLink || "")) {
      log(`Recuperando link afiliado ${position}/${total}...`);
      product = await panel.capture.recoverAffiliateLink(worker.tabId, product, signal);
    }
    return product;
  }

  async function processProduct(product, url, controller) {
    const reviewReasons = batchUtils.reviewProduct(product, LIMITS.minimumBatchConfidence, parsePrice);
    if (reviewReasons.length) {
      return {
        status: "skipped",
        message: `Ignorado apos todas as tentativas (${reviewReasons.join(", ")}): ${product.productName || url}`,
        tone: "error",
      };
    }

    state.activeProduct = product;
    const existing = panel.catalog.findExisting(product);
    if (existing) {
      const result = await panel.publishing.reconcile(product, {
        refreshCatalog: false,
        notifyUser: false,
        notifyWhatsApp: true,
      });
      const labels = {
        updated: "Preco melhor atualizado e republicado",
        deleted: "Preco pior removido do site",
        unchanged: "Ja cadastrado com o mesmo preco",
        invalid: "Cadastro existente com preco invalido",
      };
      return {
        status: result.action === "updated" ? "published" : "skipped",
        message: `${labels[result.action] || "Produto revisado"}: ${product.productName}`,
        tone: result.action === "updated" ? "success" : "neutral",
        whatsappError: result.publication?.whatsappError || "",
      };
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
    return {
      status: "published",
      message: `Publicado: ${payload.productName}`,
      tone: "success",
      whatsappError: publication.whatsappError || "",
    };
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
    let sourceTab = null;
    let published = 0;
    let skipped = 0;
    let failed = 0;
    state.batchController = controller;
    state.batchWorkerTabIds = [];
    state.batchWorkerTabId = null;
    elements.batchLog.replaceChildren();
    lockActions("batch", elements.batchStartButton, "Enviando...");

    try {
      sourceTab = await activeTab();
      if (!sourceTab?.id) throw new Error("Abra a pagina com a lista de produtos antes de iniciar o lote.");
      const [urls] = await Promise.all([
        panel.capture.visibleProductUrls(limit, sourceTab),
        panel.catalog.synchronize(),
      ]);
      if (!urls.length) throw new Error("Nenhum produto visivel foi encontrado.");
      log(`${urls.length} produtos encontrados.`);

      log("Verificando o historico antes de abrir as abas...");
      const previouslyPosted = await panel.catalog.previouslyPostedUrls?.(urls) || [];
      const postedUrlSet = new Set(previouslyPosted.map((item) => item.url));
      previouslyPosted.forEach((item) => {
        skipped += 1;
        log(`Ja publicado, nao foi aberto: ${item.sourceProductId}`, "neutral");
      });
      const pendingUrls = urls.filter((url) => !postedUrlSet.has(url));
      if (!pendingUrls.length) {
        showToast(`Lote finalizado: 0 publicados, ${skipped} ja publicados, 0 erros.`, "success");
        return;
      }
      if (previouslyPosted.length) log(`${pendingUrls.length} produtos novos serao processados.`);

      const chunks = batchUtils.chunkValues(pendingUrls, BATCH_WINDOW_SIZE);
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        if (controller.signal.aborted) break;
        const offset = chunkIndex * BATCH_WINDOW_SIZE;
        const workers = await preloadWorkers(chunks[chunkIndex], sourceTab, controller.signal, offset, pendingUrls.length);

        for (const worker of workers) {
          if (controller.signal.aborted) break;
          try {
            const product = await readWorker(worker, sourceTab, controller.signal, pendingUrls.length);
            const result = await processProduct(product, worker.url, controller);
            if (result.status === "published") published += 1;
            else skipped += 1;
            log(result.message, result.tone);
            if (result.whatsappError) log(`WhatsApp nao confirmou: ${result.whatsappError}`, "error");
          } catch (error) {
            if (controller.signal.aborted) break;
            failed += 1;
            log(runtime.errorMessage(error), "error");
          } finally {
            await closeWorker(worker.tabId);
          }
        }

        await Promise.all(workers.map((worker) => closeWorker(worker.tabId)));
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
      await closeAllWorkers();
      if (sourceTab?.id) await chrome.tabs.update(sourceTab.id, { active: true }).catch(() => {});
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
