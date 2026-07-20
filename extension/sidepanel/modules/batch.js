(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.batch) return;

  const { LIMITS, activeTab, elements, lockActions, showToast, state, unlockActions } = panel;
  const runtime = globalThis.TaBaratoRuntime;
  const { parsePrice } = globalThis.TaBaratoProductUtils;
  const batchUtils = globalThis.TaBaratoBatchUtils;
  const BATCH_WINDOW_SIZE = 5;
  const MINIMUM_POST_GAP_MS = 3000;
  const MAX_LOG_ITEMS = 300;

  function log(message, tone = "neutral") {
    const item = document.createElement("li");
    item.textContent = message;
    item.dataset.tone = tone;
    elements.batchLog.appendChild(item);
    while (elements.batchLog.children.length > MAX_LOG_ITEMS) {
      elements.batchLog.firstElementChild?.remove();
    }
    const scroll = () => { elements.batchLog.scrollTop = elements.batchLog.scrollHeight; };
    if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(scroll);
    else scroll();
  }

  function randomUnit() {
    if (globalThis.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      globalThis.crypto.getRandomValues(values);
      return values[0] / 0x100000000;
    }
    return Math.random();
  }

  function renderSummary({ published = 0, skipped = 0, failed = 0 } = {}) {
    if (!elements.batchSummary) return;
    const values = [published, skipped, failed];
    [...elements.batchSummary.querySelectorAll("strong")].forEach((element, index) => {
      element.textContent = String(values[index] || 0);
    });
  }

  function randomInteger(minimum, maximum) {
    const min = Math.ceil(Math.min(minimum, maximum));
    const max = Math.floor(Math.max(minimum, maximum));
    return min + Math.floor(randomUnit() * ((max - min) + 1));
  }

  function currentCadence() {
    return {
      mode: elements.batchCadenceRate?.checked ? "rate" : "interval",
      intervalSeconds: Math.max(5, Math.min(3600, Number(elements.batchIntervalSeconds?.value) || 60)),
      perMinute: Math.max(1, Math.min(20, Number(elements.batchPerMinute?.value) || 3)),
    };
  }

  function cadenceLabel(cadence) {
    return cadence.mode === "rate"
      ? `até ${cadence.perMinute} postagem(ns) por minuto, com distribuição variável`
      : `espera variável de até ${cadence.intervalSeconds} segundos antes de cada postagem`;
  }

  function setCadenceControlsDisabled(disabled) {
    [
      elements.batchCadenceInterval,
      elements.batchCadenceRate,
      elements.batchIntervalSeconds,
      elements.batchPerMinute,
      elements.batchLimit,
      elements.batchOpenTabsOnly,
    ].filter(Boolean).forEach((control) => { control.disabled = disabled; });
  }

  function resumePauseWaiters() {
    const waiters = Array.isArray(state.batchPauseWaiters) ? state.batchPauseWaiters.splice(0) : [];
    waiters.forEach((resolve) => resolve());
  }

  async function waitWhilePaused(signal) {
    while (state.batchPaused && !signal.aborted) {
      if (elements.batchNextTime) elements.batchNextTime.textContent = "Lote pausado. O tempo restante continuará após retomar.";
      await new Promise((resolve, reject) => {
        const finish = () => {
          signal.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          const index = state.batchPauseWaiters.indexOf(finish);
          if (index >= 0) state.batchPauseWaiters.splice(index, 1);
          reject(new DOMException("Envio interrompido.", "AbortError"));
        };
        state.batchPauseWaiters.push(finish);
        signal.addEventListener("abort", abort, { once: true });
      });
    }
    if (signal.aborted) throw new DOMException("Envio interrompido.", "AbortError");
  }

  function rollingPostTimestamps(now = Date.now()) {
    const threshold = now - 60000;
    state.batchPostTimestamps = (Array.isArray(state.batchPostTimestamps) ? state.batchPostTimestamps : [])
      .filter((timestamp) => Number(timestamp) > threshold)
      .sort((left, right) => left - right);
    return state.batchPostTimestamps;
  }

  function calculateCadenceDelay(cadence) {
    if (cadence.mode === "interval") {
      const maximum = Math.max(MINIMUM_POST_GAP_MS, cadence.intervalSeconds * 1000);
      const minimum = Math.min(maximum, Math.max(MINIMUM_POST_GAP_MS, Math.round(maximum * 0.15)));
      return randomInteger(minimum, maximum);
    }

    const now = Date.now();
    const timestamps = rollingPostTimestamps(now);
    const slot = 60000 / cadence.perMinute;
    const minimum = Math.max(MINIMUM_POST_GAP_MS, Math.round(slot * 0.35));
    const maximum = Math.max(minimum, Math.round(slot * 1.05));
    const distributedDelay = randomInteger(minimum, maximum);

    if (timestamps.length < cadence.perMinute) return distributedDelay;
    const capacityDelay = Math.max(0, (timestamps[0] + 60000) - now);
    return capacityDelay + randomInteger(500, Math.max(800, Math.round(slot * 0.18)));
  }

  async function waitForCadence(cadence, signal, position, total) {
    await waitWhilePaused(signal);
    let remaining = calculateCadenceDelay(cadence);
    const plannedAt = Date.now() + remaining;
    const plannedLabel = new Date(plannedAt).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    log(`Postagem ${position}/${total} programada para ${plannedLabel}.`);

    while (remaining > 0) {
      await waitWhilePaused(signal);
      const slice = Math.min(1000, remaining);
      const seconds = Math.max(1, Math.ceil(remaining / 1000));
      if (elements.batchNextTime) elements.batchNextTime.textContent = `Próxima postagem: ${plannedLabel} (em ${seconds}s).`;
      if (runtime.delay) await runtime.delay(slice, signal);
      else remaining = slice;
      remaining -= slice;
    }

    if (elements.batchNextTime) elements.batchNextTime.textContent = `Publicando item ${position}/${total} agora.`;
  }

  function registerPostAttempt() {
    const timestamps = rollingPostTimestamps();
    timestamps.push(Date.now());
    state.batchPostTimestamps = timestamps;
  }

  function pause() {
    if (!state.batchController) {
      showToast("Nenhum lote está em andamento.", "neutral");
      return;
    }
    state.batchPaused = !state.batchPaused;
    if (elements.batchPauseButton) elements.batchPauseButton.textContent = state.batchPaused ? "Retomar" : "Pausar";
    if (state.batchPaused) {
      if (elements.batchNextTime) elements.batchNextTime.textContent = "Lote pausado após concluir a ação atual.";
      showToast("Lote pausado.", "neutral");
      return;
    }
    resumePauseWaiters();
    showToast("Lote retomado.", "success");
  }

  function registeredWorkerIds() {
    return [...new Set([
      ...(Array.isArray(state.batchWorkerTabIds) ? state.batchWorkerTabIds : []),
      state.batchWorkerTabId,
    ].filter(Boolean))];
  }

  function ownedWorkerIds() {
    return [...new Set((Array.isArray(state.batchOwnedWorkerTabIds) ? state.batchOwnedWorkerTabIds : []).filter(Boolean))];
  }

  async function registerWorkers(tabIds, owned = false) {
    const valid = tabIds.filter(Boolean);
    state.batchWorkerTabIds = [...new Set([...registeredWorkerIds(), ...valid])];
    state.batchWorkerTabId = state.batchWorkerTabIds[0] || null;
    if (!owned) return;
    state.batchOwnedWorkerTabIds = [...new Set([...ownedWorkerIds(), ...valid])];
    await chrome.runtime.sendMessage({ type: "TABARATO_BATCH_TRACK_WORKERS", tabIds: valid }).catch(() => {});
  }

  async function unregisterWorker(tabId) {
    const wasOwned = ownedWorkerIds().includes(tabId);
    state.batchWorkerTabIds = registeredWorkerIds().filter((id) => id !== tabId);
    state.batchOwnedWorkerTabIds = ownedWorkerIds().filter((id) => id !== tabId);
    state.batchWorkerTabId = state.batchWorkerTabIds[0] || null;
    if (wasOwned) await chrome.runtime.sendMessage({ type: "TABARATO_BATCH_UNTRACK_WORKERS", tabIds: [tabId] }).catch(() => {});
  }

  async function closeWorker(tabId, owned = true) {
    if (!tabId) return;
    await unregisterWorker(tabId);
    if (owned) await chrome.tabs.remove(tabId).catch(() => {});
  }

  async function closeAllWorkers() {
    const owned = ownedWorkerIds();
    state.batchWorkerTabIds = [];
    state.batchOwnedWorkerTabIds = [];
    state.batchWorkerTabId = null;
    await chrome.runtime.sendMessage({ type: "TABARATO_STOP_BATCH_WORKERS" }).catch(() => {});
    // Segurança caso o service worker seja interrompido antes de concluir.
    if (owned.length) await chrome.tabs.remove(owned).catch(() => {});
  }

  async function stop() {
    if (!state.batchController && !registeredWorkerIds().length) {
      showToast("Nenhum lote está em andamento.", "neutral");
      return;
    }
    state.batchPaused = false;
    resumePauseWaiters();
    state.batchController?.abort();
    await closeAllWorkers();
    await chrome.runtime.sendMessage({ type: "TABARATO_STOP_WHATSAPP" }).catch(() => {});
    if (elements.batchNextTime) elements.batchNextTime.textContent = "Lote cancelado.";
    showToast("Operação interrompida.", "neutral");
  }

  async function preloadWorkers(entries, sourceTab, signal, offset, total) {
    if (signal.aborted) throw new Error("Envio interrompido.");
    const first = offset + 1;
    const last = offset + entries.length;
    log(`Preparando ${first}-${last}/${total} em paralelo...`);

    const workers = await Promise.all(entries.map(async (entry, localIndex) => {
      const normalized = typeof entry === "string" ? { url: entry, tabId: null, owned: true } : entry;
      let tab = null;
      try {
        if (signal.aborted) throw new Error("Envio interrompido.");
        if (normalized.tabId) {
          tab = await chrome.tabs.get(normalized.tabId);
          log(`Usando aba aberta à direita: ${localIndex + first}/${total}.`);
        } else {
          tab = await chrome.tabs.create({ url: normalized.url, active: false, windowId: sourceTab.windowId });
        }
        await registerWorkers([tab.id], normalized.owned !== false);
        const readyPromise = runtime.waitForTabComplete
          ? runtime.waitForTabComplete(tab.id, 45000, "A pagina do produto demorou para carregar.", signal)
          : panel.capture.waitForProductDom(tab.id, normalized.url, signal, 45000);
        const ready = readyPromise.then(() => ({ ok: true })).catch((error) => ({ ok: false, error }));
        return {
          tabId: tab.id,
          url: normalized.url,
          owned: normalized.owned !== false,
          index: offset + localIndex,
          ready,
          error: null,
        };
      } catch (error) {
        return {
          tabId: tab?.id || normalized.tabId || null,
          url: normalized.url,
          owned: normalized.owned !== false,
          index: offset + localIndex,
          ready: Promise.resolve({ ok: false, error }),
          error,
        };
      }
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
    let product = await runtime.retry(
      () => panel.capture.loadedWorker(worker.tabId, worker.url, signal, sourceTab.windowId),
      {
        attempts: 2,
        baseDelay: 500,
        signal,
        onRetry: () => log(`Nova tentativa de leitura ${position}/${total}...`, "neutral"),
      },
    );
    if (product.platform === "Mercado Livre") {
      log(`Lendo cupom e dados complementares ${position}/${total}...`);
      const tab = await chrome.tabs.get(worker.tabId);
      const enriched = await runtime.retry(
        () => panel.capture.enrichFromTab(tab, product),
        { attempts: 2, baseDelay: 600, signal },
      ).catch((error) => {
        runtime.reportError("batch-mercado-livre-enrichment", error);
        return null;
      });
      if (enriched?.ok && enriched.product) product = { ...product, ...enriched.product };
      if (!/^https:\/\/(?:www\.)?meli\.la\//i.test(product.affiliateLink || "")) {
        log(`Recuperando link afiliado ${position}/${total}...`);
        product = await panel.capture.recoverAffiliateLink(worker.tabId, product, signal);
      }
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
        "worse-price": "Preço pior detectado; publicação existente preservada",
        unchanged: "Ja cadastrado com o mesmo preco",
        invalid: "Cadastro existente com preco invalido",
      };
      const republished = result.action === "updated";
      const telegramOk = !republished || Boolean(result.publication?.channels?.telegram?.ok);
      return {
        status: republished ? "published" : "skipped",
        message: republished && !telegramOk
          ? `Preço atualizado no site; Telegram não confirmado: ${product.productName}`
          : `${labels[result.action] || "Produto revisado"}: ${product.productName}`,
        tone: republished ? (telegramOk ? "success" : "neutral") : "neutral",
        telegramError: result.publication?.telegramError || "",
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
    });
    if (publication.offer) Object.assign(created.offer, publication.offer);
    const telegramOk = Boolean(publication.channels?.telegram?.ok);
    return {
      status: "published",
      message: telegramOk ? `Publicado: ${payload.productName}` : `Oferta salva no site; Telegram não confirmado: ${payload.productName}`,
      tone: telegramOk ? "success" : "neutral",
      telegramError: publication.telegramError || "",
      whatsappError: publication.whatsappError || "",
    };
  }

  async function start() {
    if (state.batchController) {
      showToast("Ja existe um lote em andamento.", "neutral");
      return;
    }
    const limit = Math.max(1, Math.min(50, Number(elements.batchLimit.value) || 5));
    const cadence = currentCadence();
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
    state.batchHeartbeatTimer = globalThis.setInterval?.(() => {
      chrome.runtime.sendMessage({ type: "TABARATO_BATCH_HEARTBEAT", tabIds: ownedWorkerIds() }).catch(() => {});
    }, 25000);
    state.batchWorkerTabIds = [];
    state.batchOwnedWorkerTabIds = [];
    state.batchWorkerTabId = null;
    state.batchPaused = false;
    state.batchPauseWaiters = [];
    state.batchPostTimestamps = [];
    if (elements.batchPauseButton) {
      elements.batchPauseButton.disabled = false;
      elements.batchPauseButton.textContent = "Pausar";
    }
    if (elements.batchStopButton) elements.batchStopButton.disabled = false;
    if (elements.batchNextTime) elements.batchNextTime.textContent = "Preparando fila de postagens...";
    elements.batchLog.replaceChildren();
    renderSummary();
    setCadenceControlsDisabled(true);
    lockActions("batch", elements.batchStartButton, "Enviando...");

    try {
      sourceTab = await activeTab();
      if (!sourceTab?.id) throw new Error("Abra a pagina com a lista de produtos antes de iniciar o lote.");
      const openTabsOnly = Boolean(elements.batchOpenTabsOnly?.checked);
      const catalogSync = runtime.withTimeout(
        panel.catalog.synchronize(),
        14000,
        "O histórico online demorou demais para atualizar.",
      ).catch((error) => {
        runtime.reportError("batch-catalog-sync", error);
        log("O histórico online não pôde ser atualizado a tempo. O lote continuará com os dados locais.", "neutral");
        return null;
      });
      const [visibleUrls, rightTabs] = await Promise.all([
        openTabsOnly ? Promise.resolve([]) : panel.capture.visibleProductUrls(limit, sourceTab).catch((error) => {
          runtime.reportError("batch-visible-products", error);
          log("Não foi possível ler os produtos visíveis. As abas à direita ainda serão processadas.", "neutral");
          return [];
        }),
        panel.capture.productTabsToRight(sourceTab, limit).catch((error) => {
          runtime.reportError("batch-right-tabs", error);
          log("Não foi possível consultar as abas à direita. A coleta padrão ainda será usada.", "neutral");
          return [];
        }),
        catalogSync,
      ]);
      const seen = new Set();
      const queue = [];
      for (const tab of rightTabs) {
        const identity = batchUtils.productIdentityFromUrl(tab.url)?.key || tab.url;
        if (seen.has(identity)) continue;
        seen.add(identity);
        queue.push(tab);
      }
      for (const url of visibleUrls) {
        const identity = batchUtils.productIdentityFromUrl(url)?.key || url;
        if (seen.has(identity)) continue;
        seen.add(identity);
        queue.push({ url, tabId: null, owned: true });
      }
      const limitedQueue = queue.slice(0, limit);
      const urls = limitedQueue.map((item) => item.url);
      if (!urls.length) {
        throw new Error(openTabsOnly
          ? "Nenhum produto aberto em abas à direita foi encontrado."
          : "Nenhum produto visível ou aberto em abas à direita foi encontrado.");
      }
      log(openTabsOnly
        ? `${urls.length} produtos encontrados somente em abas à direita.`
        : `${urls.length} produtos encontrados (${rightTabs.length} em abas à direita).`);
      log(`Cadência escolhida: ${cadenceLabel(cadence)}.`);

      log("Verificando o histórico antes de abrir as abas...");
      const previouslyPosted = await panel.catalog.previouslyPostedUrls?.(urls) || [];
      const postedUrlSet = new Set(previouslyPosted.map((item) => item.url));
      previouslyPosted.forEach((item) => {
        skipped += 1;
        log(`Já publicado, não foi aberto: ${item.sourceProductId}`, "neutral");
      });
      renderSummary({ published, skipped, failed });
      const pendingEntries = limitedQueue.filter((item) => !postedUrlSet.has(item.url));
      const pendingUrls = pendingEntries.map((item) => item.url);
      if (!pendingEntries.length) {
        showToast(`Lote finalizado: 0 publicados, ${skipped} ja publicados, 0 erros.`, "success");
        return;
      }
      if (previouslyPosted.length) log(`${pendingUrls.length} produtos novos serao processados.`);

      const chunks = batchUtils.chunkValues(pendingEntries, BATCH_WINDOW_SIZE);
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        if (controller.signal.aborted) break;
        const offset = chunkIndex * BATCH_WINDOW_SIZE;
        const workers = await preloadWorkers(chunks[chunkIndex], sourceTab, controller.signal, offset, pendingUrls.length);

        for (const worker of workers) {
          if (controller.signal.aborted) break;
          if (worker.error) {
            failed += 1;
            renderSummary({ published, skipped, failed });
            log(`Falha ao preparar ${worker.index + 1}/${pendingUrls.length}: ${runtime.errorMessage(worker.error)}`, "error");
            if (worker.tabId) await closeWorker(worker.tabId, worker.owned);
            continue;
          }
          try {
            const product = await readWorker(worker, sourceTab, controller.signal, pendingUrls.length);
            await waitForCadence(cadence, controller.signal, worker.index + 1, pendingUrls.length);
            registerPostAttempt();
            const result = await processProduct(product, worker.url, controller);
            if (result.status === "published") published += 1;
            else if (result.status === "failed") failed += 1;
            else skipped += 1;
            renderSummary({ published, skipped, failed });
            log(result.message, result.tone);
            if (result.telegramError) log(`Telegram: ${result.telegramError}`, "error");
            if (result.whatsappError) log(`WhatsApp: ${result.whatsappError}`, "error");
          } catch (error) {
            if (controller.signal.aborted) break;
            failed += 1;
            renderSummary({ published, skipped, failed });
            log(runtime.errorMessage(error), "error");
          } finally {
            await closeWorker(worker.tabId, worker.owned);
          }
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
      await closeAllWorkers();
      if (sourceTab?.id) await chrome.tabs.update(sourceTab.id, { active: true }).catch(() => {});
      state.activeProduct = productBeforeBatch;
      panel.product.invalidateShareImage();
      elements.duplicateWarning.textContent = warningBeforeBatch.text;
      elements.duplicateWarning.classList.toggle("hidden", warningBeforeBatch.hidden);
      if (state.batchHeartbeatTimer) globalThis.clearInterval?.(state.batchHeartbeatTimer);
      state.batchHeartbeatTimer = null;
      if (state.batchController === controller) state.batchController = null;
      state.batchPaused = false;
      resumePauseWaiters();
      if (elements.batchPauseButton) {
        elements.batchPauseButton.disabled = true;
        elements.batchPauseButton.textContent = "Pausar";
      }
      if (elements.batchStopButton) elements.batchStopButton.disabled = true;
      if (elements.batchNextTime) elements.batchNextTime.textContent = controller.signal.aborted ? "Lote interrompido." : "Lote finalizado.";
      setCadenceControlsDisabled(false);
      unlockActions("batch", elements.batchStartButton);
    }
  }

  globalThis.addEventListener?.("pagehide", () => {
    if (!state.batchController && !ownedWorkerIds().length) return;
    state.batchPaused = false;
    resumePauseWaiters();
    state.batchController?.abort();
    chrome.runtime.sendMessage({ type: "TABARATO_STOP_BATCH_WORKERS" }).catch(() => {});
    chrome.runtime.sendMessage({ type: "TABARATO_STOP_WHATSAPP" }).catch(() => {});
  });

  panel.batch = { log, pause, renderSummary, start, stop };
})();
