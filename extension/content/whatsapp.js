(() => {
  if (globalThis.__TABARATO_WHATSAPP_AUTOMATION__) return;
  globalThis.__TABARATO_WHATSAPP_AUTOMATION__ = true;
  const runtime = globalThis.TaBaratoRuntime;
  let activeSend = null;
  let activeController = null;
  const imageFileCache = new Map();
  const IMAGE_CACHE_LIMIT = 3;

  const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
  const normalized = (value = "") => clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u200B-\u200D\uFE0F\uFEFF]/g, "")
    .toLowerCase();

  const plainGroupName = (value = "") => normalized(value).replace(/^[^a-z0-9]+/, "");
  const sameGroupName = (candidate, groupName) => {
    const candidateName = normalized(candidate);
    const expectedName = normalized(groupName);
    const plainCandidate = plainGroupName(candidate);
    const plainExpected = plainGroupName(groupName);
    return candidateName === expectedName
      || (plainExpected && plainCandidate === plainExpected);
  };

  const aborted = (signal) => {
    if (signal?.aborted) throw new Error("O envio anterior foi cancelado.");
  };

  const waitFor = (read, timeout = 30000, signal) => new Promise((resolve, reject) => {
    let settled = false;
    let inspectQueued = false;
    let observer = null;
    let fallback = null;
    let timer = null;

    const cleanup = () => {
      observer?.disconnect();
      if (fallback) window.clearInterval(fallback);
      if (timer) window.clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value || null);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const inspect = () => {
      inspectQueued = false;
      try {
        aborted(signal);
        const value = read();
        if (value) finish(value);
      } catch (error) {
        fail(error);
      }
    };
    const queueInspect = () => {
      if (settled || inspectQueued) return;
      inspectQueued = true;
      queueMicrotask(inspect);
    };
    const onAbort = () => fail(new Error("O envio anterior foi cancelado."));

    try {
      aborted(signal);
      observer = new MutationObserver(queueInspect);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
        attributeFilter: ["class", "style", "aria-label", "aria-placeholder", "title", "data-testid"],
      });
      // Fallback leve para estados que mudam sem mutacao observavel.
      fallback = window.setInterval(inspect, 500);
      timer = window.setTimeout(() => finish(null), timeout);
      signal?.addEventListener?.("abort", onAbort, { once: true });
      inspect();
    } catch (error) {
      fail(error);
    }
  });


  const visible = (element) => {
    if (!element) return false;
    const rectangle = element.getBoundingClientRect();
    return rectangle.width > 0 && rectangle.height > 0;
  };

  const editableByLabel = (patterns) => [...document.querySelectorAll('[contenteditable="true"]')]
    .find((element) => {
      const label = normalized([
        element.getAttribute("aria-label"),
        element.getAttribute("aria-placeholder"),
        element.getAttribute("data-placeholder"),
        element.getAttribute("placeholder"),
      ].filter(Boolean).join(" "));
      return visible(element) && patterns.some((pattern) => label.includes(pattern));
    });

  const setEditableText = async (element, value) => {
    element.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    const text = String(value);
    const transfer = new DataTransfer();
    transfer.setData("text/plain", text);
    element.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clipboardData: transfer,
    }));

    await waitFor(() => clean(element.textContent) || clean(element.innerText), 500).catch(() => null);

    const needsFallback = !clean(element.textContent)
      || (text.includes("\n") && !String(element.innerText || "").includes("\n"));
    if (!needsFallback) return;

    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    text.split("\n").forEach((line, index, lines) => {
      if (line) document.execCommand("insertText", false, line);
      if (index < lines.length - 1) document.execCommand("insertParagraph", false, null);
    });

    await waitFor(() => !text.includes("\n") || String(element.innerText || "").includes("\n"), 400).catch(() => null);
    if (!text.includes("\n") || String(element.innerText || "").includes("\n")) return;

    const content = document.createDocumentFragment();
    text.split("\n").forEach((line, index) => {
      if (index) content.appendChild(document.createElement("br"));
      if (line) content.appendChild(document.createTextNode(line));
    });
    element.replaceChildren(content);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: text }));
  };

  const searchBox = () => editableByLabel(["pesquisar", "search"])
    || [...document.querySelectorAll('#side [role="textbox"], #side [contenteditable="true"], #pane-side [contenteditable="true"]')]
      .find(visible);

  const currentGroupIs = (groupName) => [...document.querySelectorAll("#main header, header [data-testid*='conversation'], header")]
    .filter(visible)
    .some((header) => [...header.querySelectorAll("span[title], [dir='auto']")]
      .some((element) => visible(element) && sameGroupName(element.getAttribute("title") || element.textContent, groupName)));

  const exactGroup = (groupName) => [...document.querySelectorAll("#pane-side span[title], #pane-side [data-testid='cell-frame-title']")]
    .find((element) => {
      const title = element.getAttribute("title") || element.textContent;
      return visible(element) && sameGroupName(title, groupName);
    });

  const actionByLabel = (patterns) => [...document.querySelectorAll("button, [role='button']")]
    .find((element) => {
      const label = normalized(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`);
      return visible(element) && patterns.some((pattern) => label.includes(pattern));
    });

  const dataUrlFile = async (dataUrl, fileName) => {
    const response = await runtime.fetchWithTimeout(dataUrl, {}, 8000, "A imagem demorou para ser aberta no WhatsApp.");
    if (!response.ok) throw new Error("A imagem gerada nao pode ser aberta no WhatsApp.");
    const sourceBlob = await runtime.withTimeout(response.blob(), 8000, "A imagem demorou para ser lida no WhatsApp.");
    if (!sourceBlob.size) throw new Error("A imagem gerada esta vazia.");
    if (sourceBlob.type === "image/png") return new File([sourceBlob], fileName || "oferta.png", { type: "image/png" });

    const bitmap = await runtime.withTimeout(createImageBitmap(sourceBlob), 8000, "A imagem nao pode ser convertida para PNG.");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("O navegador nao conseguiu preparar a imagem.");
      context.drawImage(bitmap, 0, 0);
      const pngBlob = await runtime.withTimeout(new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error("A conversao da imagem falhou.")),
          "image/png",
        );
      }), 8000, "A conversao da imagem demorou demais.");
      return new File([pngBlob], fileName || "oferta.png", { type: "image/png" });
    } finally {
      bitmap.close();
    }
  };

  const imageCacheKey = (message) => clean(message.imageCacheKey)
    || (message.imageDataUrl ? `${message.imageDataUrl.length}:${message.fileName || "oferta.png"}` : "");

  const rememberImageFile = (key, file) => {
    if (!key || !file) return file;
    imageFileCache.delete(key);
    imageFileCache.set(key, file);
    while (imageFileCache.size > IMAGE_CACHE_LIMIT) {
      imageFileCache.delete(imageFileCache.keys().next().value);
    }
    return file;
  };

  const imageFileForMessage = async (message) => {
    const key = imageCacheKey(message);
    if (key && imageFileCache.has(key)) {
      const file = imageFileCache.get(key);
      imageFileCache.delete(key);
      imageFileCache.set(key, file);
      return file;
    }
    if (!message.imageDataUrl) throw new Error("A imagem preparada nao esta mais disponivel no WhatsApp.");
    const file = await dataUrlFile(message.imageDataUrl, message.fileName);
    return rememberImageFile(key, file);
  };

  const clickableGroupRow = (group) => {
    const semanticRow = group.closest("[role='listitem'], [role='row'], [data-testid='cell-frame-container']");
    if (semanticRow) return semanticRow;

    let candidate = group;
    for (let parent = group.parentElement; parent && parent.id !== "pane-side"; parent = parent.parentElement) {
      const rectangle = parent.getBoundingClientRect();
      if (rectangle.width >= 240 && rectangle.height >= 44 && rectangle.height <= 120) candidate = parent;
      if (parent.hasAttribute("tabindex")) return parent;
    }
    return candidate;
  };

  const activateGroupRow = (element) => {
    element.scrollIntoView({ block: "center" });
    element.focus({ preventScroll: true });
    const pointerOptions = { bubbles: true, cancelable: true, composed: true, button: 0, buttons: 1 };
    element.dispatchEvent(new PointerEvent("pointerdown", pointerOptions));
    element.dispatchEvent(new MouseEvent("mousedown", pointerOptions));
    element.dispatchEvent(new PointerEvent("pointerup", { ...pointerOptions, buttons: 0 }));
    element.dispatchEvent(new MouseEvent("mouseup", { ...pointerOptions, buttons: 0 }));
    element.click();
  };

  async function selectGroup(groupName, signal) {
    aborted(signal);
    if (currentGroupIs(groupName)) return;

    const search = await waitFor(searchBox, 12000, signal);
    if (!search) throw new Error("Entre no WhatsApp Web antes de enviar a oferta.");
    await setEditableText(search, groupName);
    const group = await waitFor(() => exactGroup(groupName), 15000, signal);
    if (!group) throw new Error(`Grupo "${groupName}" nao encontrado no WhatsApp.`);
    const groupRow = clickableGroupRow(group);
    aborted(signal);
    activateGroupRow(groupRow);
    let selected = await waitFor(() => currentGroupIs(groupName), 5000, signal);
    if (!selected && groupRow !== group) {
      aborted(signal);
      activateGroupRow(group);
      selected = await waitFor(() => currentGroupIs(groupName), 5000, signal);
    }
    if (!selected) throw new Error(`Nao foi possivel abrir o grupo "${groupName}".`);
  }

  const messageComposer = () => [...document.querySelectorAll('#main footer [contenteditable="true"], footer [data-testid="conversation-compose-box-input"], footer [role="textbox"]')]
    .find(visible);

  const outgoingMessages = () => [...document.querySelectorAll("#main [data-testid='msg-container'], #main .message-out, #main [class*='message-out']")];

  const captionEditor = (composer) => {
    const labeled = editableByLabel(["legenda", "caption", "adicione uma legenda", "add a caption"]);
    if (labeled && labeled !== composer) return labeled;

    return [...document.querySelectorAll('[contenteditable="true"]')].find((element) => {
      if (element === composer || !visible(element) || element.closest("#pane-side")) return false;
      if (element.closest("[role='dialog'], [data-animate-modal-popup], [data-testid*='media']")) return true;
      const rectangle = element.getBoundingClientRect();
      const composerRectangle = composer.getBoundingClientRect();
      return rectangle.left >= composerRectangle.left && rectangle.top > window.innerHeight / 2;
    });
  };

  const sentMessageAppeared = (countBefore, caption) => {
    const messages = outgoingMessages();
    if (messages.length <= countBefore) return false;
    const comparable = (value) => normalized(value).replace(/[*~_]/g, "");
    const signature = clean(caption.split("\n").find((line) => clean(line).length > 14) || caption).slice(0, 48);
    return messages.slice(countBefore).some((message) => comparable(message.textContent).includes(comparable(signature)));
  };

  async function copyImageToClipboard(file) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
    try {
      window.focus();
      const pngBlob = file.type === "image/png"
        ? file
        : new Blob([await file.arrayBuffer()], { type: "image/png" });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
      return true;
    } catch (error) {
      runtime.reportError("whatsapp-clipboard-fallback", error);
      return false;
    }
  }

  async function pasteOffer(file, caption, signal, clipboardPrepared = false) {
    const composer = await waitFor(messageComposer, 10000, signal);
    if (!composer) throw new Error("O campo de mensagem do WhatsApp nao foi encontrado.");
    const messageCountBefore = outgoingMessages().length;

    aborted(signal);
    const copied = clipboardPrepared || await copyImageToClipboard(file);
    if (!copied) throw new Error("Nao foi possivel copiar a imagem para o clipboard.");

    composer.focus();
    document.execCommand("paste");
    let captionBox = await waitFor(() => captionEditor(composer), 5000, signal);
    if (!captionBox && await copyImageToClipboard(file)) {
      composer.focus();
      document.execCommand("paste");
      captionBox = await waitFor(() => captionEditor(composer), 5000, signal);
    }
    if (!captionBox) {
      throw new Error("O WhatsApp bloqueou a colagem da imagem. Mantenha a aba aberta e tente novamente.");
    }
    await setEditableText(captionBox, caption);

    const send = await waitFor(() => actionByLabel(["enviar", "send"])
      || [...document.querySelectorAll('[data-icon="send"]')].map((element) => element.closest("button, [role='button']")).find(visible), 10000, signal);
    if (!send) throw new Error("O botao Enviar do WhatsApp nao foi encontrado.");
    aborted(signal);
    send.click();
    const sent = await waitFor(() => sentMessageAppeared(messageCountBefore, caption) || !visible(captionBox), 7000, signal);
    if (!sent) throw new Error("O WhatsApp nao confirmou o envio da imagem.");
  }

  async function sendTextMessage(text, signal) {
    const composer = await waitFor(() => messageComposer(), 10000, signal);
    if (!composer) throw new Error("O campo de mensagem do WhatsApp não foi encontrado.");
    const messageCountBefore = document.querySelectorAll('[data-testid="msg-container"], .message-out').length;
    await setEditableText(composer, text);
    const send = await waitFor(() => actionByLabel(["enviar", "send"])
      || [...document.querySelectorAll('[data-icon="send"]')].map((element) => element.closest("button, [role='button']")).find(visible), 10000, signal);
    if (!send) throw new Error("O botão Enviar do WhatsApp não foi encontrado.");
    aborted(signal);
    send.click();
    const sent = await waitFor(() => sentMessageAppeared(messageCountBefore, text), 7000, signal);
    if (!sent) throw new Error("O WhatsApp nao confirmou o envio da mensagem.");
  }

  const performSend = async (message, signal) => {
    if (!clean(message.groupName)) throw new Error("Informe o nome do grupo do WhatsApp.");
    if (!clean(message.text)) throw new Error("A mensagem do WhatsApp esta vazia.");
    await selectGroup(message.groupName, signal);
    if (message.hasImage || message.imageDataUrl || message.imageCacheKey) {
      const file = await imageFileForMessage(message);
      await pasteOffer(file, message.text, signal, Boolean(message.clipboardPrepared));
    } else await sendTextMessage(message.text, signal);
    return { ok: true };
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "TABARATO_WHATSAPP_CANCEL") {
      activeController?.abort();
      sendResponse({ ok: true });
      return;
    }
    if (message?.type !== "TABARATO_WHATSAPP_SEND") return;
    if (activeSend) {
      sendResponse({ ok: false, error: "Ja existe um envio para o WhatsApp em andamento." });
      return;
    }
    const controller = new AbortController();
    activeController = controller;
    activeSend = runtime.withTimeout(
      performSend(message, controller.signal),
      62000,
      "O envio para o WhatsApp demorou demais. Tente novamente.",
    ).finally(() => {
      controller.abort();
      activeSend = null;
      if (activeController === controller) activeController = null;
    });
    activeSend
      .then(sendResponse)
      .catch((error) => {
        runtime.reportError("whatsapp-content", error);
        sendResponse({ ok: false, error: runtime.errorMessage(error, "Falha ao enviar para o WhatsApp.") });
      });
    return true;
  });
})();
