(() => {
  if (globalThis.__TABARATO_WHATSAPP_AUTOMATION__) return;
  globalThis.__TABARATO_WHATSAPP_AUTOMATION__ = true;

  const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
  const normalized = (value = "") => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

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
    || [...document.querySelectorAll('#side [contenteditable="true"], #pane-side [contenteditable="true"]')].find(visible);

  const exactGroup = (groupName) => [...document.querySelectorAll("#pane-side span[title]")]
    .find((element) => visible(element) && normalized(element.getAttribute("title")) === normalized(groupName));

  const actionByLabel = (patterns) => [...document.querySelectorAll("button, [role='button']")]
    .find((element) => {
      const label = normalized(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`);
      return visible(element) && patterns.some((pattern) => label.includes(pattern));
    });

  const dataUrlFile = async (dataUrl, fileName) => {
    const response = await fetch(dataUrl);
    return new File([await response.blob()], fileName || "oferta.png", { type: "image/png" });
  };

  async function selectGroup(groupName) {
    const search = await waitFor(searchBox, 45000);
    if (!search) throw new Error("Entre no WhatsApp Web antes de enviar a oferta.");
    setEditableText(search, groupName);
    const group = await waitFor(() => exactGroup(groupName), 15000);
    if (!group) throw new Error(`Grupo "${groupName}" nao encontrado no WhatsApp.`);
    (group.closest("[role='listitem'], [role='row']") || group).click();
  }

  async function attachImage(file, caption) {
    let input = [...document.querySelectorAll('input[type="file"]')]
      .find((element) => /image/i.test(element.accept || ""));
    if (!input) {
      actionByLabel(["anexar", "attach"])?.click();
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
