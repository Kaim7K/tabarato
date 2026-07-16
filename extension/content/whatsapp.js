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
      const label = normalized(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("data-placeholder") || ""}`);
      return visible(element) && patterns.some((pattern) => label.includes(pattern));
    });

  const setEditableText = (element, value) => {
    element.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
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
    setEditableText(search, groupName);
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

  async function attachImage(file, caption) {
    let input = [...document.querySelectorAll('input[type="file"]')]
      .find((element) => /image/i.test(element.accept || ""));
    if (!input) {
      const attach = actionByLabel(["anexar", "attach"])
        || [...document.querySelectorAll('[data-icon="plus-rounded"], [data-icon="clip"]')]
          .map((element) => element.closest("button, [role='button']"))
          .find(visible);
      attach?.click();
      input = await waitFor(() => [...document.querySelectorAll('input[type="file"]')]
        .find((element) => /image/i.test(element.accept || "")), 8000);
    }
    if (!input) throw new Error("O botao de anexar imagem do WhatsApp nao foi encontrado.");

    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));

    const captionBox = await waitFor(() => editableByLabel(["legenda", "caption"])
      || [...document.querySelectorAll('[role="dialog"] [contenteditable="true"], [data-animate-modal-popup] [contenteditable="true"]')].find(visible), 15000);
    if (!captionBox) throw new Error("O campo de legenda do WhatsApp nao foi encontrado.");
    setEditableText(captionBox, caption);

    const send = await waitFor(() => actionByLabel(["enviar", "send"])
      || [...document.querySelectorAll('[data-icon="send"]')].map((element) => element.closest("button, [role='button']")).find(visible), 10000);
    if (!send) throw new Error("O botao Enviar do WhatsApp nao foi encontrado.");
    send.click();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "TABARATO_WHATSAPP_SEND") return;
    Promise.resolve()
      .then(async () => {
        await selectGroup(message.groupName);
        await attachImage(await dataUrlFile(message.imageDataUrl, message.fileName), message.text);
        return { ok: true };
      })
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || "Falha ao enviar para o WhatsApp." }));
    return true;
  });
})();
