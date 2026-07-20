(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.media) return;

  const { groupNames, state } = panel;
  const runtime = globalThis.TaBaratoRuntime;
  const artwork = globalThis.TaBaratoArtwork;
  const { formatPrice, messageBenefits, normalizeText, previousPriceFor } = globalThis.TaBaratoProductUtils;

  async function evaluateImageCandidate(source) {
    const response = await runtime.fetchWithTimeout(source, {}, 8000, "A imagem demorou para carregar.");
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!/^image\/(?:png|jpe?g|webp)$/i.test(blob.type) || blob.size > 12 * 1024 * 1024) return null;
    const bitmap = await createImageBitmap(blob);
    try {
      const ratio = bitmap.width / Math.max(1, bitmap.height);
      if (ratio > 3.2 || ratio < 0.32 || Math.min(bitmap.width, bitmap.height) < 180) return null;
      return blob;
    } finally {
      bitmap.close?.();
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

  function whatsappMessage(payload, product = null) {
    const benefits = messageBenefits(payload.extraText);
    const headline = String(payload.messageHeadline || "").trim().replace(/^\s*\u{1F525}\s*/u, "") || "TA BARATO!";
    const previousPrice = previousPriceFor(payload.currentPrice, payload.previousPrice, payload.currentPrice);
    const pixLabel = benefits.pix ? " (no Pix)" : "";
    const lines = [
      `\u{1F525} *${headline}*`,
      "",
      `*${payload.productName}*`,
      "",
      `\u{1F4B0} *${formatPrice(payload.currentPrice)}*${pixLabel}   |   \u{274C} ~${formatPrice(previousPrice)}~`,
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
