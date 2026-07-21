(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.media) return;

  const { groupNames, state } = panel;
  const runtime = globalThis.TaBaratoRuntime;
  const artwork = globalThis.TaBaratoArtwork;
  const { formatPrice, messageBenefits, normalizeText, previousPriceFor } = globalThis.TaBaratoProductUtils;

  function safeImageSource(source) {
    try {
      const url = new URL(source);
      const combined = `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
      if (!/^https:$/.test(url.protocol)) return false;
      if (/\.(?:mp4|webm|m3u8|mov|avi|mkv)(?:$|[?#])/i.test(url.href)) return false;
      if (/(?:^|[\/_-])(?:video|videos|videoplayback|stream|reel)(?:[\/_-]|$)/i.test(combined)) return false;
      return true;
    } catch { return false; }
  }

  async function evaluateImageCandidate(source) {
    if (!safeImageSource(source)) return null;
    const response = await runtime.fetchWithTimeout(source, {}, 8000, "A imagem demorou para carregar.");
    if (!response.ok) return null;
    const blob = await response.blob();
    if (blob.size <= 0 || blob.size > 12 * 1024 * 1024) return null;
    if (blob.type && !/^image\//i.test(blob.type) && !/^(?:application\/octet-stream|binary\/octet-stream)$/i.test(blob.type)) return null;
    async function decodeWithImage(candidateBlob) {
      const objectUrl = URL.createObjectURL(candidateBlob);
      try {
        const image = new Image();
        image.decoding = "async";
        image.src = objectUrl;
        await runtime.withTimeout(image.decode(), 10000, "A imagem da loja nao pôde ser decodificada.");
        return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => {} };
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }

    async function decodeCandidate(candidateBlob) {
      const variants = [candidateBlob];
      if (!candidateBlob.type || /octet-stream/i.test(candidateBlob.type)) {
        ["image/webp", "image/avif", "image/jpeg", "image/png"].forEach((type) => {
          variants.push(new Blob([candidateBlob], { type }));
        });
      }
      for (const variant of variants) {
        try {
          const decoded = await decodeWithImage(variant);
          if (decoded.width && decoded.height) return decoded;
        } catch {
          try {
            const bitmap = await createImageBitmap(variant);
            return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
          } catch { /* tenta a proxima indicação de formato */ }
        }
      }
      return null;
    }

    const decoded = await decodeCandidate(blob);
    if (!decoded) return null;
    try {
      const ratio = decoded.width / Math.max(1, decoded.height);
      if (ratio > 3.2 || ratio < 0.32 || Math.min(decoded.width, decoded.height) < 180) return null;
      const canvas = document.createElement("canvas");
      canvas.width = decoded.width;
      canvas.height = decoded.height;
      const context = canvas.getContext("2d", { alpha: true });
      context.drawImage(decoded.source, 0, 0);
      return await new Promise((resolve) => canvas.toBlob(resolve, "image/png", 0.94));
    } finally {
      decoded.close?.();
    }
  }

  async function productImageBlob(payload) {
    const imageCandidates = state.activeProduct?.imageCandidates || [];
    const candidates = [
      payload.imageUrl,
      ...imageCandidates.map((item) => item.url),
    ].filter(Boolean);
    const sources = [...new Set(candidates)].slice(0, 6);
    for (const source of sources) {
      try {
        const blob = await evaluateImageCandidate(source);
        if (blob) return blob;
      } catch {
        /* The next gallery image is tried when the current one cannot be used. */
      }
    }
    throw new Error("Nao foi possivel preparar a imagem do produto.");
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

  function whatsappMessage(payload) {
    const benefits = messageBenefits(payload.extraText);
    const headline = String(payload.messageHeadline || "").trim().replace(/^\s*\u{1F525}\s*/u, "") || "TA BARATO!";
    const previousPrice = previousPriceFor(payload.currentPrice, payload.previousPrice, payload.currentPrice);
    const pixLabel = benefits.pix ? " (no Pix)" : "";
    const priceLine = previousPrice
      ? `\u{1F4B0} *${formatPrice(payload.currentPrice)}*${pixLabel}   |   \u{274C} ~${formatPrice(previousPrice)}~`
      : `\u{1F4B0} *${formatPrice(payload.currentPrice)}*${pixLabel}`;
    const lines = [
      `\u{1F525} *${headline}*`,
      "",
      `*${payload.productName}*`,
      "",
      priceLine,
    ];
    if (payload.coupon) lines.push("", `\u{1F39F}\u{FE0F} Cupom: *${payload.coupon}*`);
    if (benefits.lines.length) lines.push("", ...benefits.lines.map((line) => line.replace(/\.$/, "")));
    lines.push("", "\u{1F447} *Compre aqui:*", payload.affiliateLink);
    return lines.join("\n");
  }

  async function sendOfferToWhatsApp(payload, onProgress = () => {}) {
    const groups = groupNames();
    if (!groups.length) throw new Error("Registre pelo menos um grupo do WhatsApp.");
    onProgress("Gerando arte...");
    const file = await shareImage(payload);
    const imageDataUrl = await fileToDataUrl(file);
    onProgress("Abrindo WhatsApp...");
    const result = await runtime.runWithTimeout(
      () => chrome.runtime.sendMessage({
        type: "TABARATO_SHARE_WHATSAPP",
        groupNames: groups,
        text: whatsappMessage(payload),
        imageDataUrl,
        fileName: file.name,
      }),
      {
        milliseconds: 55000 + groups.length * 95000,
        message: "O WhatsApp excedeu o tempo limite geral.",
      },
    );
    if (!result?.ok && !result?.partial) {
      const details = (result?.results || []).filter((item) => !item.ok)
        .map((item) => `${item.groupName}: ${item.error || "nao confirmado"}`)
        .join(" | ");
      throw new Error(details || result?.error || "Nao foi possivel enviar para o WhatsApp.");
    }
    return result;
  }

  panel.media = {
    fileToDataUrl,
    sendOfferToWhatsApp,
    shareImage,
    whatsappMessage,
  };
})();
