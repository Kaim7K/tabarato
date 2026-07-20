(() => {
  if (globalThis.__TABARATO_WHATSAPP_AUTOMATION__) return;
  globalThis.__TABARATO_WHATSAPP_AUTOMATION__ = true;
  const runtime = globalThis.TaBaratoRuntime;
  let activeSend = null;
  let activeController = null;

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

  const waitFor = (read, timeout = 30000, signal) => runtime.poll(read, {
    timeout,
    signal,
    interval: 100,
    maxInterval: 480,
    factor: 1.2,
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

    await new Promise((resolve) => window.setTimeout(resolve, 70));

    const needsFallback = !clean(element.textContent)
      || (text.includes("\n") && !String(element.innerText || "").includes("\n"));
    if (!needsFallback) return;

    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    text.split("\n").forEach((line, index, lines) => {
      if (line) document.execCommand("insertText", false, line);
      if (index < lines.length - 1) document.execCommand("insertParagraph", false, null);
    });

    await new Promise((resolve) => window.setTimeout(resolve, 60));
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

    // Caminho rapido: o grupo ja esta visivel na lista lateral.
    let group = exactGroup(groupName);
    if (group) {
      const row = clickableGroupRow(group);
      activateGroupRow(row);
      const selected = await waitFor(() => currentGroupIs(groupName), 3200, signal);
      if (selected) return;
    }

    const search = await waitFor(searchBox, 8000, signal);
    if (!search) throw new Error("Entre no WhatsApp Web antes de enviar a oferta.");

    // Evita pesquisar novamente quando o campo ja contem o mesmo grupo.
    const currentSearch = clean(search.innerText || search.textContent || "");
    if (!sameGroupName(currentSearch, groupName)) {
      await setEditableText(search, groupName);
    }

    group = await waitFor(() => exactGroup(groupName), 8500, signal);
    if (!group) throw new Error(`Grupo "${groupName}" nao encontrado no WhatsApp.`);

    const groupRow = clickableGroupRow(group);
    aborted(signal);
    activateGroupRow(groupRow);
    let selected = await waitFor(() => currentGroupIs(groupName), 3200, signal);
    if (!selected && groupRow !== group) {
      activateGroupRow(group);
      selected = await waitFor(() => currentGroupIs(groupName), 2500, signal);
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

  async function imageFileFromDataUrl(dataUrl, mimeType, fileName, signal) {
    aborted(signal);
    if (!String(dataUrl || "").startsWith("data:image/")) {
      throw new Error("A extensao nao recebeu uma imagem valida. O envio foi cancelado.");
    }
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error("A imagem nao pôde ser preparada para o WhatsApp.");
    const blob = await response.blob();
    if (!blob.size) throw new Error("A imagem recebida esta vazia.");
    const type = mimeType || blob.type || "image/png";
    const extension = type.split("/")[1]?.replace("jpeg", "jpg") || "png";
    const safeName = clean(fileName) || `oferta.${extension}`;
    return new File([blob], safeName, { type });
  }


  async function pasteOffer(caption, signal, fileName = "oferta.png", imageDataUrl = "", imageMimeType = "image/png") {
    const composer = await waitFor(messageComposer, 10000, signal);
    if (!composer) throw new Error("O campo de mensagem do WhatsApp nao foi encontrado.");
    const messageCountBefore = outgoingMessages().length;

    aborted(signal);
    composer.scrollIntoView({ block: "center" });
    composer.click();
    composer.focus({ preventScroll: true });
    await runtime.delay(90, signal);

    const sourceImage = await imageFileFromDataUrl(
      imageDataUrl,
      imageMimeType,
      fileName,
      signal,
    );
    // A imagem e anexada a um unico evento de colagem, sem depender da API global de clipboard.
    const transfer = new DataTransfer();
    transfer.items.add(sourceImage);
    composer.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clipboardData: transfer,
    }));

    const captionBox = await waitFor(() => captionEditor(composer), 7000, signal);
    if (!captionBox) {
      throw new Error("O WhatsApp nao aceitou a imagem preparada. Nenhum upload ou envio alternativo foi tentado.");
    }

    await runtime.delay(260, signal);
    await setEditableText(captionBox, caption);
    await runtime.delay(110, signal);

    const send = await waitFor(() => actionByLabel(["enviar", "send"])
      || [...document.querySelectorAll('[data-icon="send"]')].map((element) => element.closest("button, [role='button']")).find(visible), 10000, signal);
    if (!send) throw new Error("O botao Enviar do WhatsApp nao foi encontrado.");
    aborted(signal);
    send.click();
    const sent = await waitFor(() => sentMessageAppeared(messageCountBefore, caption) || !visible(captionBox), 9000, signal);
    if (!sent) throw new Error("O WhatsApp nao confirmou o envio da imagem.");
    return { partial: false };
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
    if (message.imageDataUrl) {
      const result = await pasteOffer(
        message.text,
        signal,
        message.fileName,
        message.imageDataUrl,
        message.imageMimeType,
      );
      return { ok: true, partial: Boolean(result?.partial), warning: result?.warning || "" };
    }
    await sendTextMessage(message.text, signal);
    return { ok: true, partial: false };
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
    activeSend = runtime.runWithTimeout(
      (signal) => performSend(message, signal),
      {
        milliseconds: 78000,
        message: "O envio para o WhatsApp demorou demais. Tente novamente.",
        signal: controller.signal,
      },
    ).finally(() => {
      if (!controller.signal.aborted) controller.abort();
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
