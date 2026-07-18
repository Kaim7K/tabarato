(() => {
  if (globalThis.__TABARATO_OFFSCREEN_CLIPBOARD__) return;
  globalThis.__TABARATO_OFFSCREEN_CLIPBOARD__ = true;

  async function pngBlobFromDataUrl(dataUrl) {
    const response = await fetch(dataUrl);
    if (!response.ok) throw new Error("Nao foi possivel ler a arte da oferta.");
    const source = await response.blob();
    if (source.type === "image/png") return source;

    const bitmap = await createImageBitmap(source);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Nao foi possivel converter a arte para PNG.");
      context.drawImage(bitmap, 0, 0);
      return await new Promise((resolve, reject) => canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("A conversao da arte falhou.")),
        "image/png",
      ));
    } finally {
      bitmap.close();
    }
  }

  globalThis.TaBaratoExtensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "TABARATO_OFFSCREEN_WRITE_IMAGE") return false;
    pngBlobFromDataUrl(message.imageDataUrl)
      .then((blob) => navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || "Falha ao copiar a imagem." }));
    return true;
  });
})();
