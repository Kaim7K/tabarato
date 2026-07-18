(() => {
  if (globalThis.TaBaratoBackgroundClipboard) return;

  const api = globalThis.TaBaratoExtensionApi;
  const OFFSCREEN_URL = "offscreen/clipboard.html";
  let creationPromise = null;

  async function ensureDocument() {
    if (!api.offscreen?.hasDocument || !api.offscreen?.createDocument) return false;
    const exists = await api.offscreen.hasDocument();
    if (exists) return true;
    if (!creationPromise) {
      creationPromise = api.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ["CLIPBOARD"],
        justification: "Copiar a arte da oferta para colar no WhatsApp Web.",
      }).then(() => true).finally(() => { creationPromise = null; });
    }
    return creationPromise;
  }

  async function writeImage(imageDataUrl) {
    if (!String(imageDataUrl || "").startsWith("data:image/")) {
      throw new Error("A arte da oferta nao esta em um formato de imagem valido.");
    }
    const available = await ensureDocument();
    if (!available) return false;
    const response = await api.runtime.sendMessage({
      type: "TABARATO_OFFSCREEN_WRITE_IMAGE",
      imageDataUrl,
    });
    if (!response?.ok) throw new Error(response?.error || "Nao foi possivel copiar a imagem para o clipboard.");
    return true;
  }

  globalThis.TaBaratoBackgroundClipboard = { ensureDocument, writeImage };
})();
