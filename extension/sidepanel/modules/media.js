(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.media) return;

  const { groupNames, state } = panel;
  const runtime = globalThis.TaBaratoRuntime;
  const artwork = globalThis.TaBaratoArtwork;
  const { formatPrice, messageBenefits, normalizeText, previousPriceFor } = globalThis.TaBaratoProductUtils;

  async function evaluateImageCandidate(source) {
    const response = await runtime.fetchWithTimeout(source, {}, 15000, "A imagem demorou para carregar.");
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!/^image\/(?:png|jpe?g|webp)$/i.test(blob.type) || blob.size > 12 * 1024 * 1024) return null;
    const bitmap = await createImageBitmap(blob);
    try {
      const ratio = bitmap.width / Math.max(1, bitmap.height);
      if (ratio > 3.2 || ratio < 0.32 || Math.min(bitmap.width, bitmap.height) < 180) return null;
      return { blob, score: imageSceneScore(bitmap, source) };
    } finally {
      bitmap.close?.();
    }
  }

  function imageSceneScore(bitmap, source) {
    const canvas = document.createElement("canvas");
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(bitmap, 0, 0, 24, 24);
    const pixels = context.getImageData(0, 0, 24, 24).data;
    let white = 0;
    let colorful = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      if (red > 240 && green > 240 && blue > 240) white += 1;
      if (Math.max(red, green, blue) - Math.min(red, green, blue) > 36) colorful += 1;
    }
    const total = pixels.length / 4;
    const ratio = bitmap.width / Math.max(1, bitmap.height);
    const aspectScore = Math.max(0, 1 - Math.abs(Math.log(ratio)) / 1.25) * 22;
    const usageScore = /(uso|ambiente|review|cliente|lifestyle|scene|modelo)/i.test(source) ? 25 : 0;
    return colorful / total * 42
      - white / total * 22
      + aspectScore
      + usageScore
      + Math.min(20, bitmap.width * bitmap.height / 120000);
  }

  async function productImageBlob(payload) {
    const candidates = [
      payload.imageUrl,
      ...(state.activeProduct?.imageCandidates || []).map((item) => item.url),
    ].filter(Boolean);
    const sources = [...new Set(candidates)].slice(0, 8);
    const evaluated = [];
    for (let index = 0; index < sources.length; index += 4) {
      const group = await Promise.all(sources.slice(index, index + 4).map(async (source) => {
        try {
          return await evaluateImageCandidate(source);
        } catch {
          return null;
        }
      }));
      evaluated.push(...group);
    }
    const best = evaluated.filter(Boolean).sort((left, right) => right.score - left.score)[0]?.blob;
    if (!best) throw new Error("Nao foi possivel preparar a imagem do produto.");
    return best;
  }

  async function extensionAssetBlob(path) {
    const response = await runtime.fetchWithTimeout(chrome.runtime.getURL(path), {}, 8000, "Nao foi possivel carregar as logos.");
    if (!response.ok) throw new Error("Nao foi possivel carregar as logos.");
    return response.blob();
  }

  function storeLogoPath(platform) {
    const value = normalizeText(platform);
    if (value.includes("mercado livre")) return "assets/mercado-livre.png";
    if (value.includes("shopee")) return "assets/shopee.svg";
    return "";
  }

  function fileToDataUrl(file) {
    return runtime.withTimeout(new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Nao foi possivel preparar a imagem."));
      reader.readAsDataURL(file);
    }), 15000, "A imagem demorou para ser preparada.");
  }

  async function copyImageToClipboard(file) {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
    const sourceBlob = file.type === "image/png"
      ? new Blob([await file.arrayBuffer()], { type: "image/png" })
      : await (async () => {
        const bitmap = await createImageBitmap(file);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d");
          if (!context) throw new Error("O navegador nao conseguiu preparar a imagem.");
          context.drawImage(bitmap, 0, 0);
          return await new Promise((resolve, reject) => canvas.toBlob(
            (blob) => blob ? resolve(blob) : reject(new Error("Nao foi possivel converter a imagem para PNG.")),
            "image/png",
          ));
        } finally {
          bitmap.close();
        }
      })();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": sourceBlob })]);
    return true;
  }

  async function copyDataUrlToClipboard(dataUrl, fileName = "oferta.png") {
    if (!dataUrl) return false;
    const response = await runtime.fetchWithTimeout(dataUrl, {}, 12000, "A imagem demorou para ser preparada.");
    if (!response.ok) throw new Error("Nao foi possivel ler a imagem para o clipboard.");
    const blob = await response.blob();
    return copyImageToClipboard(new File([blob], fileName, { type: blob.type || "image/png" }));
  }

  async function shareImage(payload) {
    const candidateKey = (state.activeProduct?.imageCandidates || []).map((item) => item.url).join("|");
    const key = JSON.stringify([
      payload.imageUrl,
      payload.productName,
      payload.currentPrice,
      payload.previousPrice,
      payload.platform,
      candidateKey,
    ]);
    if (key === state.shareImageKey && state.shareImagePromise) return state.shareImagePromise;
    state.shareImageKey = key;
    state.shareImagePromise = productImageBlob(payload).then(async (productBlob) => {
      const storePath = storeLogoPath(payload.platform);
      const [siteLogoBlob, storeLogoBlob] = await Promise.all([
        extensionAssetBlob("assets/tabarato-logo.png"),
        storePath ? extensionAssetBlob(storePath) : Promise.resolve(null),
      ]);
      const imageBlob = await artwork.createOfferArtwork({
        productBlob,
        siteLogoBlob,
        storeLogoBlob,
        currentPrice: payload.currentPrice,
        previousPrice: payload.previousPrice,
      });
      const slug = payload.productName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "produto";
      return new File([imageBlob], `${slug}.png`, { type: "image/png" });
    });
    state.shareImagePromise.catch(() => panel.product.invalidateShareImage());
    return state.shareImagePromise;
  }

  function whatsappMessage(payload, product = state.activeProduct) {
    const benefits = messageBenefits(payload.extraText);
    const headline = String(payload.messageHeadline || "").trim().replace(/^\s*\u{1F525}\s*/u, "") || "TA BARATO!";
    const previousPrice = previousPriceFor(payload.currentPrice, payload.previousPrice, product?.regularPrice || payload.currentPrice);
    const pixLabel = product?.pricePaymentMethod === "Pix" || benefits.pix ? " (no Pix)" : "";
    const lines = [
      `\u{1F525} *${headline}*`,
      "",
      `*${payload.productName}*`,
      "",
      `\u{1F4B0} *${formatPrice(payload.currentPrice)}*${pixLabel}   |   \u{274C} ~${formatPrice(previousPrice)}~`,
    ];
    if (payload.coupon) lines.push("", `\u{1F39F}\u{FE0F} Cupom: *${payload.coupon}*`);
    if (benefits.lines.length) lines.push(...benefits.lines.map((line) => line.replace(/\.$/, "")));
    lines.push("", "\u{1F447} *Compre aqui:*", payload.affiliateLink);
    return lines.join("\n");
  }

  async function sendOfferToWhatsApp(payload, onProgress = () => {}) {
    const groups = groupNames();
    if (!groups.length) throw new Error("Registre pelo menos um grupo do WhatsApp.");
    onProgress("Gerando arte...");
    const file = await shareImage(payload);
    const imageDataUrl = await fileToDataUrl(file);
    const clipboardPrepared = await copyImageToClipboard(file).catch(() => false);
    onProgress("Abrindo WhatsApp...");
    const result = await runtime.withTimeout(
      chrome.runtime.sendMessage({
        type: "TABARATO_SHARE_WHATSAPP",
        groupNames: groups,
        text: whatsappMessage(payload),
        imageDataUrl,
        fileName: file.name,
        clipboardPrepared,
      }),
      panel.LIMITS.whatsappTimeout + groups.length * 70000,
      "O WhatsApp demorou para responder. Tente novamente.",
    );
    if (!result?.ok) throw new Error(result?.error || "Nao foi possivel enviar para o WhatsApp.");
    return result;
  }

  panel.media = {
    copyDataUrlToClipboard,
    copyImageToClipboard,
    fileToDataUrl,
    sendOfferToWhatsApp,
    shareImage,
    whatsappMessage,
  };
})();
