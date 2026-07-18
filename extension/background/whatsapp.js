(() => {
  if (globalThis.TaBaratoBackgroundWhatsApp) return;

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
    const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
    if (tabs.length) return tabs.sort((left, right) => (right.lastAccessed || 0) - (left.lastAccessed || 0))[0];
    return chrome.tabs.create({ url: "https://web.whatsapp.com/" });
  }

  async function sendToContent(tab, payload) {
    const send = () => runtime.withTimeout(
      chrome.tabs.sendMessage(tab.id, payload),
      70000,
      "O WhatsApp nao respondeu. Confirme se esta conectado e tente novamente.",
    );
    try {
      return await send();
    } catch (error) {
      const missingReceiver = /receiving end does not exist|could not establish connection|message port closed|extension context invalidated/i.test(error?.message || "");
      if (!missingReceiver) throw error;
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["shared/runtime.js", "content/whatsapp.js"],
      });
      return send();
    }
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
    await chrome.windows.update(tab.windowId, { focused: true });
    await chrome.tabs.update(tab.id, { active: true });
    await runtime.waitForTabComplete(tab.id, 30000, "O WhatsApp Web demorou para carregar.");
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
        // Transfere a string Base64 pesada apenas uma vez. O content script
        // reutiliza o arquivo em memoria nos demais grupos do mesmo lote.
        imageDataUrl: index === 0 ? message.imageDataUrl || "" : "",
        imageCacheKey,
        hasImage,
        fileName: message.fileName || "oferta.png",
        clipboardPrepared,
      };
      let result = await sendToContent(tab, payload);
      if (!result?.ok && index > 0 && hasImage && /imagem preparada nao esta mais disponivel/i.test(result?.error || "")) {
        // Se o WhatsApp recarregou entre grupos, restaura o cache sem repetir
        // tentativas incertas de mensagens que talvez ja tenham sido enviadas.
        result = await sendToContent(tab, { ...payload, imageDataUrl: message.imageDataUrl });
      }
      if (!result?.ok) throw new Error(result?.error || `Nao foi possivel enviar para ${groupName}.`);
      results.push({ groupName, ok: true });
    }
    return { ok: true, results, stopped: operation.cancelled };
  }

  function send(message) {
    if (activeOperation) return Promise.reject(new Error("Ja existe um envio para o WhatsApp em andamento."));
    const operation = { cancelled: false };
    activeOperation = operation;
    return runtime.withTimeout(
      perform(message, operation),
      Math.max(95000, normalizeGroups(message).length * 90000),
      "O envio para o WhatsApp excedeu o tempo limite. Tente novamente.",
    ).catch(async (error) => {
      operation.cancelled = true;
      const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
      await Promise.all(tabs.map((tab) => chrome.tabs.sendMessage(tab.id, { type: "TABARATO_WHATSAPP_CANCEL" }).catch(() => {})));
      throw error;
    }).finally(() => {
      if (activeOperation === operation) activeOperation = null;
    });
  }

  async function stop() {
    if (activeOperation) activeOperation.cancelled = true;
    const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
    await Promise.all(tabs.map((tab) => chrome.tabs.sendMessage(tab.id, { type: "TABARATO_WHATSAPP_CANCEL" }).catch(() => {})));
    return { ok: true };
  }

  globalThis.TaBaratoBackgroundWhatsApp = { send, stop };
})();
