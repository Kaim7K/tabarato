(() => {
  if (globalThis.TaBaratoBackgroundClipboard) return;

  const OFFSCREEN_URL = "offscreen/clipboard.html";
  let creationPromise = null;

  async function ensureDocument() {
    const exists = await chrome.offscreen.hasDocument();
    if (exists) return;
    if (!creationPromise) {
      creationPromise = chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ["CLIPBOARD"],
        justification: "Copiar a arte da oferta para colar no WhatsApp Web.",
      }).finally(() => { creationPromise = null; });
    }
    await creationPromise;
  }

  async function writeImage(imageDataUrl) {
    if (!String(imageDataUrl || "").startsWith("data:image/")) {
      throw new Error("A arte da oferta nao esta em um formato de imagem valido.");
    }
    await ensureDocument();
    const response = await chrome.runtime.sendMessage({
      type: "TABARATO_OFFSCREEN_WRITE_IMAGE",
      imageDataUrl,
    });
    if (!response?.ok) throw new Error(response?.error || "Nao foi possivel copiar a imagem para o clipboard.");
    return true;
  }

  globalThis.TaBaratoBackgroundClipboard = { ensureDocument, writeImage };
})();
