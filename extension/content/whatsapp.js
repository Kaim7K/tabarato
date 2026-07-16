(() => {
  if (globalThis.__TABARATO_WHATSAPP_AUTOMATION__) return;
  globalThis.__TABARATO_WHATSAPP_AUTOMATION__ = true;

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
      || candidateName.includes(expectedName)
      || (plainExpected && plainCandidate.includes(plainExpected));
  };

  const waitFor = async (read, timeout = 30000) => {
    const startedAt = Date.now();
    let value = read();
    while (!value && Date.now() - startedAt < timeout) {
      await new Promise((resolve) => window.setTimeout(resolve, 200));
      value = read();
    }
    return value || null;
  };

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

    await new Promise((resolve) => window.setTimeout(resolve, 120));

    const needsFallback = !clean(element.textContent)
      || (text.includes("\n") && !String(element.innerText || "").includes("\n"));
    if (!needsFallback) return;

    document.execCommand("selectAll", false, null);
    document.execCommand("delete", false, null);
    text.split("\n").forEach((line, index, lines) => {
      if (line) document.execCommand("insertText", false, line);
      if (index < lines.length - 1) document.execCommand("insertParagraph", false, null);
    });

    await new Promise((resolve) => window.setTimeout(resolve, 80));
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
    .some((header) => visible(header) && sameGroupName(header.textContent, groupName));

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
    const response = await fetch(dataUrl);
    return new File([await response.blob()], fileName || "oferta.png", { type: "image/png" });
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

  async function selectGroup(groupName) {
    if (currentGroupIs(groupName)) return;

    const search = await waitFor(searchBox, 12000);
    if (!search) throw new Error("Entre no WhatsApp Web antes de enviar a oferta.");
    await setEditableText(search, groupName);
    const group = await waitFor(() => exactGroup(groupName), 15000);
    if (!group) throw new Error(`Grupo "${groupName}" nao encontrado no WhatsApp.`);
    const groupRow = clickableGroupRow(group);
    activateGroupRow(groupRow);
    let selected = await waitFor(() => currentGroupIs(groupName), 5000);
    if (!selected && groupRow !== group) {
      activateGroupRow(group);
      selected = await waitFor(() => currentGroupIs(groupName), 5000);
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
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      throw new Error("O navegador nao permitiu copiar a imagem para o clipboard.");
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": file })]);
  }

  function pasteImageFromClipboard(composer, file) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    composer.focus();
    const pasted = composer.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clipboardData: transfer,
    }));
    if (pasted) document.execCommand("paste");
  }

  async function pasteOffer(file, caption) {
    const composer = await waitFor(messageComposer, 10000);
    if (!composer) throw new Error("O campo de mensagem do WhatsApp nao foi encontrado.");
    const messageCountBefore = outgoingMessages().length;

    await setEditableText(composer, caption);
    await copyImageToClipboard(file);
    pasteImageFromClipboard(composer, file);

    const captionBox = await waitFor(() => captionEditor(composer), 15000);
    if (!captionBox) {
      const sent = await waitFor(() => sentMessageAppeared(messageCountBefore, caption), 3000);
      if (sent) return;
      throw new Error("A imagem foi copiada, mas o WhatsApp nao abriu a previa de envio.");
    }
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    await setEditableText(captionBox, caption);
    await new Promise((resolve) => window.setTimeout(resolve, 250));

    const send = await waitFor(() => actionByLabel(["enviar", "send"])
      || [...document.querySelectorAll('[data-icon="send"]')].map((element) => element.closest("button, [role='button']")).find(visible), 10000);
    if (!send) throw new Error("O botao Enviar do WhatsApp nao foi encontrado.");
    send.click();
    await waitFor(() => sentMessageAppeared(messageCountBefore, caption) || !visible(captionBox), 5000);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "TABARATO_WHATSAPP_SEND") return;
    Promise.resolve()
      .then(async () => {
        await selectGroup(message.groupName);
        await pasteOffer(await dataUrlFile(message.imageDataUrl, message.fileName), message.text);
        return { ok: true };
      })
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || "Falha ao enviar para o WhatsApp." }));
    return true;
  });
})();
