(() => {
  const MAX_DATA_URL_SIZE = 17 * 1024 * 1024;
  const MAX_IMAGE_EDGE = 4096;
  const MAX_IMAGE_PIXELS = 16_000_000;

  const pngBlobFromDataUrl = async (dataUrl) => {
    const source = String(dataUrl || "");
    if (!source.startsWith("data:image/") || source.length > MAX_DATA_URL_SIZE) {
      throw new Error("A imagem recebida para o clipboard e invalida ou muito grande.");
    }

    const response = await fetch(source);
    if (!response.ok) throw new Error("Nao foi possivel ler a imagem gerada.");
    const sourceBlob = await response.blob();
    const bitmap = await createImageBitmap(sourceBlob);
    try {
      const scale = Math.min(
        1,
        MAX_IMAGE_EDGE / bitmap.width,
        MAX_IMAGE_EDGE / bitmap.height,
        Math.sqrt(MAX_IMAGE_PIXELS / (bitmap.width * bitmap.height)),
      );
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("O navegador nao conseguiu preparar a imagem.");
      context.drawImage(bitmap, 0, 0, width, height);
      return await new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error("Nao foi possivel converter a imagem para PNG.")),
          "image/png",
        );
      });
    } finally {
      bitmap.close();
    }
  };

  const writeImage = async (dataUrl) => {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      throw new Error("O Chrome nao disponibilizou o clipboard para a extensao.");
    }
    const pngBlob = await pngBlobFromDataUrl(dataUrl);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target !== "tabarato-offscreen" || message?.type !== "TABARATO_COPY_IMAGE") return false;
    writeImage(message.imageDataUrl)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({
        ok: false,
        error: String(error?.message || error || "Falha ao copiar a imagem."),
      }));
    return true;
  });
})();
