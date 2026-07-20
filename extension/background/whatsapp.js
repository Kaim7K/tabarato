(() => {
  if (globalThis.TaBaratoBackgroundWhatsApp) return;

  const runtime = globalThis.TaBaratoRuntime;
  const OPERATION_KEY = "tabarato_whatsapp_operation";
  const CONTENT_TIMEOUT = 88000;
  let activeOperation = null;

  function normalizeGroups(message) {
    const raw = Array.isArray(message.groupNames) ? message.groupNames : [message.groupName];
    return [...new Set(raw.flatMap((value) => String(value || "").split(/\r?\n/))
      .map((value) => value.trim())
      .filter(Boolean))];
  }

  async function saveOperation(operation, patch = {}) {
    const state = {
      id: operation.id,
      status: operation.cancelled ? "cancelled" : "running",
      groups: operation.groups,
      currentGroup: operation.currentGroup || "",
      results: operation.results || [],
      startedAt: operation.startedAt,
      updatedAt: new Date().toISOString(),
      ...patch,
    };
    await chrome.storage.session.set({ [OPERATION_KEY]: state }).catch(() => {});
  }

  async function findOrCreateTab() {
    const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
    if (tabs.length) return tabs.sort((left, right) => (right.lastAccessed || 0) - (left.lastAccessed || 0))[0];
    return chrome.tabs.create({ url: "https://web.whatsapp.com/" });
  }

  async function injectContent(tabId) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["shared/runtime.js", "content/whatsapp.js"],
    });
  }

  async function sendToContent(tab, payload, signal) {
    const send = () => runtime.runWithTimeout(
      () => chrome.tabs.sendMessage(tab.id, payload),
      {
        milliseconds: CONTENT_TIMEOUT,
        message: "O WhatsApp nao confirmou esta etapa dentro do tempo esperado.",
        signal,
      },
    );

    try {
      return await send();
    } catch (error) {
      if (!runtime.isMissingReceiverError(error)) throw error;
      await injectContent(tab.id);
      await runtime.delay(180, signal);
      return send();
    }
  }

  async function cancelContent(tabId) {
    if (!tabId) return;
    await chrome.tabs.sendMessage(tabId, { type: "TABARATO_WHATSAPP_CANCEL" }).catch(() => {});
  }

  async function perform(message, operation, signal) {
    const groups = operation.groups;
    if (!groups.length) throw new Error("Registre pelo menos um grupo do WhatsApp.");
    if (!String(message?.text || "").trim()) throw new Error("A mensagem do WhatsApp esta vazia.");
    if (String(message?.imageDataUrl || "").length > 17 * 1024 * 1024) {
      throw new Error("A imagem excede o limite permitido para envio.");
    }

    const tab = await findOrCreateTab();
    if (!tab?.id) throw new Error("Nao foi possivel abrir o WhatsApp Web.");
    operation.tabId = tab.id;
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
    await runtime.waitForTabComplete(tab.id, 35000, "O WhatsApp Web demorou para carregar.", signal);
    await runtime.delay(250, signal);

    // A imagem segue como data URL ate o content script. O envio nao depende
    // da API global de clipboard, que exige gesto manual e foco imprevisivel.
    const preparedImageDataUrl = message.imageDataUrl || "";
    const preparedImageMimeType = String(message.imageDataUrl || "").match(/^data:([^;,]+)/i)?.[1] || "image/png";

    for (const groupName of groups) {
      runtime.throwIfAborted(signal);
      if (operation.cancelled) break;
      operation.currentGroup = groupName;
      await saveOperation(operation);
      try {
        const result = await sendToContent(tab, {
          type: "TABARATO_WHATSAPP_SEND",
          groupName,
          text: message.text,
          fileName: message.fileName || "oferta.png",
          imageDataUrl: preparedImageDataUrl,
          imageMimeType: preparedImageMimeType,
        }, signal);
        if (!result?.ok) throw new Error(result?.error || `Nao foi possivel enviar para ${groupName}.`);
        operation.results.push({
          groupName,
          ok: true,
          partial: Boolean(result?.partial),
          warning: String(result?.warning || ""),
        });
      } catch (error) {
        if (signal.aborted || operation.cancelled) break;
        operation.results.push({
          groupName,
          ok: false,
          uncertain: /nao confirmou|tempo|timeout/i.test(runtime.errorMessage(error, "")),
          error: runtime.errorMessage(error, `Nao foi possivel enviar para ${groupName}.`),
        });
        await cancelContent(tab.id);
      }
      await saveOperation(operation);
      await runtime.delay(350, signal).catch(() => {});
    }

    if (operation.cancelled || signal.aborted) {
      const processed = new Set(operation.results.map((item) => item.groupName));
      groups.filter((groupName) => !processed.has(groupName)).forEach((groupName) => {
        operation.results.push({ groupName, ok: false, stopped: true, error: "Envio interrompido." });
      });
    }

    const succeeded = operation.results.filter((item) => item.ok);
    const failed = operation.results.filter((item) => !item.ok);
    const degraded = succeeded.filter((item) => item.partial);
    return {
      ok: failed.length === 0 && succeeded.length === groups.length,
      partial: succeeded.length > 0 && failed.length > 0 || degraded.length > 0,
      stopped: operation.cancelled || signal.aborted,
      results: operation.results,
      sent: succeeded.length,
      failed: failed.length,
    };
  }

  function send(message) {
    if (activeOperation) return Promise.reject(new Error("Ja existe um envio para o WhatsApp em andamento."));
    const groups = normalizeGroups(message);
    const controller = new AbortController();
    const operation = {
      id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      cancelled: false,
      controller,
      groups,
      results: [],
      currentGroup: "",
      startedAt: new Date().toISOString(),
      tabId: null,
    };
    activeOperation = operation;
    const totalTimeout = 45000 + Math.max(1, groups.length) * (CONTENT_TIMEOUT + 5000);

    return saveOperation(operation)
      .then(() => runtime.runWithTimeout(
        (signal) => perform(message, operation, signal),
        {
          milliseconds: totalTimeout,
          message: "O envio para o WhatsApp excedeu o tempo limite geral.",
          signal: controller.signal,
        },
      ))
      .catch(async (error) => {
        operation.cancelled = true;
        await cancelContent(operation.tabId);
        await saveOperation(operation, {
          status: controller.signal.aborted ? "cancelled" : "failed",
          error: runtime.errorMessage(error),
          finishedAt: new Date().toISOString(),
        });
        throw error;
      })
      .then(async (result) => {
        await saveOperation(operation, { status: result.stopped ? "cancelled" : "finished", finishedAt: new Date().toISOString() });
        return result;
      })
      .finally(() => {
        if (activeOperation === operation) activeOperation = null;
      });
  }

  async function stop() {
    if (activeOperation) {
      activeOperation.cancelled = true;
      activeOperation.controller.abort(new Error("Envio interrompido."));
      await cancelContent(activeOperation.tabId);
      await saveOperation(activeOperation, { status: "cancelled", finishedAt: new Date().toISOString() });
    } else {
      const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
      await Promise.all(tabs.map((tab) => cancelContent(tab.id)));
    }
    return { ok: true };
  }

  async function initialize() {
    const stored = await chrome.storage.session.get(OPERATION_KEY).catch(() => ({}));
    const previous = stored?.[OPERATION_KEY];
    if (previous?.status === "running") {
      await chrome.storage.session.set({
        [OPERATION_KEY]: {
          ...previous,
          status: "interrupted",
          error: "O navegador encerrou a operacao anterior antes da conclusao.",
          updatedAt: new Date().toISOString(),
        },
      }).catch(() => {});
      const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" }).catch(() => []);
      await Promise.all(tabs.map((tab) => cancelContent(tab.id)));
    }
  }

  globalThis.TaBaratoBackgroundWhatsApp = { initialize, send, stop };
})();
