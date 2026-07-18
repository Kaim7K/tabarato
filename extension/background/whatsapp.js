(() => {
  if (globalThis.TaBaratoBackgroundWhatsApp) return;

  const api = globalThis.TaBaratoExtensionApi;
  const runtime = globalThis.TaBaratoRuntime;
  const clipboard = globalThis.TaBaratoBackgroundClipboard;
  let activeOperation = null;

  function normalizeGroups(message) {
    const raw = Array.isArray(message.groupNames) ? message.groupNames : [message.groupName];
    return [...new Set(raw.flatMap((value) => String(value || "").split(/\r?\n/))
      .map((value) => value.trim())
      .filter(Boolean))];
  }

  async function findOrCreateTab() {
    const tabs = await api.tabs.query({ url: "https://web.whatsapp.com/*" });
    if (tabs.length) return tabs.sort((left, right) => (right.lastAccessed || 0) - (left.lastAccessed || 0))[0];
    return api.tabs.create({ url: "https://web.whatsapp.com/" });
  }

  async function injectContent(tabId) {
    await api.scripting.executeScript({
      target: { tabId },
      files: ["shared/runtime.js", "content/whatsapp.js"],
    });
  }

  async function sendRaw(tabId, payload, timeout = 75000) {
    return runtime.withTimeout(
      api.tabs.sendMessage(tabId, payload),
      timeout,
      "O WhatsApp nao respondeu. Confirme se esta conectado e tente novamente.",
    );
  }

  async function sendToContent(tab, payload) {
    try {
      return await sendRaw(tab.id, payload);
    } catch (error) {
      const missingReceiver = /receiving end does not exist|could not establish connection|message port closed|extension context invalidated/i.test(error?.message || "");
      if (!missingReceiver) throw error;
      await injectContent(tab.id);
      return sendRaw(tab.id, payload);
    }
  }

  async function waitUntilReady(tab, operation) {
    await runtime.waitForTabComplete(tab.id, 45000, "O WhatsApp Web demorou para carregar.");
    const startedAt = Date.now();
    let injected = false;
    while (Date.now() - startedAt < 45000) {
      if (operation.cancelled) throw new Error("Envio interrompido.");
      try {
        const status = await sendRaw(tab.id, { type: "TABARATO_WHATSAPP_PING" }, 5000);
        if (status?.ok && status?.ready) return status;
        if (status?.ok && status?.loginRequired) {
          throw new Error("Entre no WhatsApp Web antes de enviar as ofertas.");
        }
      } catch (error) {
        const missingReceiver = /receiving end does not exist|could not establish connection|message port closed|extension context invalidated/i.test(error?.message || "");
        if (missingReceiver && !injected) {
          await injectContent(tab.id);
          injected = true;
        } else if (!missingReceiver && /entre no whatsapp/i.test(error?.message || "")) {
          throw error;
        }
      }
      await runtime.delay(600);
    }
    throw new Error("O WhatsApp Web abriu, mas nao ficou pronto para o envio.");
  }

  async function sendGroup(tab, payload, operation) {
    let result = await sendToContent(tab, payload);
    if (!result?.ok && result?.safeToRetry && result?.stage !== "prepare-clipboard" && !operation.cancelled) {
      await runtime.delay(700);
      result = await sendToContent(tab, payload);
    }
    return result || { ok: false, error: "O WhatsApp nao retornou o resultado do grupo." };
  }

  async function perform(message, operation) {
    const groups = normalizeGroups(message);
    if (!groups.length) throw new Error("Registre pelo menos um grupo do WhatsApp.");
    if (!String(message?.text || "").trim()) throw new Error("A mensagem do WhatsApp esta vazia.");
    if (String(message?.imageDataUrl || "").length > 17 * 1024 * 1024) {
      throw new Error("A imagem excede o limite permitido para envio.");
    }

    const tab = await findOrCreateTab();
    if (!tab?.id) throw new Error("Nao foi possivel abrir o WhatsApp Web.");
    if (api.windows?.update && tab.windowId) await api.windows.update(tab.windowId, { focused: true });
    await api.tabs.update(tab.id, { active: true });
    await waitUntilReady(tab, operation);

    let clipboardPrepared = Boolean(message.clipboardPrepared);
    if (!clipboardPrepared && message.imageDataUrl) {
      clipboardPrepared = await clipboard.writeImage(message.imageDataUrl).catch((error) => {
        runtime.reportError("prepare-whatsapp-clipboard", error);
        return false;
      });
    }

    const results = [];
    const hasImage = Boolean(message.imageDataUrl);
    const imageCacheKey = message.imageCacheKey
      || (hasImage ? `${Date.now()}:${message.imageDataUrl.length}:${message.fileName || "oferta.png"}` : "");

    for (let index = 0; index < groups.length; index += 1) {
      const groupName = groups[index];
      if (operation.cancelled) {
        results.push({ groupName, ok: false, stopped: true, error: "Envio interrompido." });
        break;
      }
      const payload = {
        type: "TABARATO_WHATSAPP_SEND",
        groupName,
        text: message.text,
        imageDataUrl: index === 0 ? message.imageDataUrl || "" : "",
        imageCacheKey,
        hasImage,
        fileName: message.fileName || "oferta.png",
        clipboardPrepared,
      };

      let result;
      try {
        result = await sendGroup(tab, payload, operation);
        if (!result?.ok && index > 0 && hasImage && /imagem preparada nao esta mais disponivel/i.test(result?.error || "")) {
          result = await sendGroup(tab, { ...payload, imageDataUrl: message.imageDataUrl }, operation);
        }
        if (!result?.ok && hasImage && result?.stage === "prepare-clipboard" && !operation.cancelled) {
          const textOnly = await sendGroup(tab, {
            ...payload,
            hasImage: false,
            imageDataUrl: "",
            imageCacheKey: "",
            clipboardPrepared: false,
          }, operation);
          if (textOnly?.ok) result = { ...textOnly, imageSkipped: true };
        }
      } catch (error) {
        result = { ok: false, error: runtime.errorMessage(error), safeToRetry: false };
      }

      if (result?.ok) results.push({ groupName, ok: true, imageSkipped: Boolean(result.imageSkipped) });
      else results.push({
        groupName,
        ok: false,
        error: result?.error || `Nao foi possivel enviar para ${groupName}.`,
        stage: result?.stage || "unknown",
      });
    }

    const successful = results.filter((item) => item.ok).length;
    const failed = results.filter((item) => !item.ok && !item.stopped).length;
    return {
      ok: successful > 0 || (!failed && operation.cancelled),
      partial: successful > 0 && failed > 0,
      results,
      successful,
      failed,
      stopped: operation.cancelled,
      error: successful ? "" : results.find((item) => item.error)?.error || "Nenhum grupo confirmou o envio.",
    };
  }

  function send(message) {
    if (activeOperation) return Promise.reject(new Error("Ja existe um envio para o WhatsApp em andamento."));
    const operation = { cancelled: false };
    activeOperation = operation;
    return runtime.withTimeout(
      perform(message, operation),
      Math.max(120000, normalizeGroups(message).length * 85000),
      "O envio para o WhatsApp excedeu o tempo limite.",
      () => { operation.cancelled = true; },
    ).catch(async (error) => {
      operation.cancelled = true;
      const tabs = await api.tabs.query({ url: "https://web.whatsapp.com/*" });
      await Promise.all(tabs.map((tab) => api.tabs.sendMessage(tab.id, { type: "TABARATO_WHATSAPP_CANCEL" }).catch(() => {})));
      throw error;
    }).finally(() => {
      if (activeOperation === operation) activeOperation = null;
    });
  }

  async function stop() {
    if (activeOperation) activeOperation.cancelled = true;
    const tabs = await api.tabs.query({ url: "https://web.whatsapp.com/*" });
    await Promise.all(tabs.map((tab) => api.tabs.sendMessage(tab.id, { type: "TABARATO_WHATSAPP_CANCEL" }).catch(() => {})));
    return { ok: true };
  }

  globalThis.TaBaratoBackgroundWhatsApp = { send, stop };
})();
