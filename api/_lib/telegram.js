const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const compactLines = (lines) =>
  lines
    .map((line) => String(line ?? "").trimEnd())
    .filter((line, index, array) => line.trim() || array[index - 1]?.trim())
    .join("\n")
    .trim();

export function formatOfferBenefits(value = "") {
  const source = String(value || "").replace(/\s+/g, " ").trim();
  const normalizedSource = source.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const pix = /\b(?:no|via|pelo|preco principal no)\s+pix\b/i.test(normalizedSource);
  const lines = [];
  let hasInstallments = false;
  let hasShipping = false;
  source.split(/(?<=[.!?])\s+/).forEach((sentence) => {
    const containedDiscount = /\b\d{1,3}(?:[.,]\d+)?%\s*(?:off|de desconto)\b/i.test(sentence);
    const clean = sentence
      .replace(/promo[cç][aã]o\s*:[^.!?]*/gi, "")
      .replace(/\b\d{1,3}(?:[.,]\d+)?%\s*(?:off|de desconto)\b/gi, "")
      .replace(/\s+/g, " ")
      .replace(/^[,;:\s-]+|[,;:\s-]+$/g, "")
      .trim();
    if (!clean || !/[\p{L}\p{N}]/u.test(clean) || /pre[cç]o principal no pix/i.test(clean)) return;
    if (containedDiscount && /^(?:com|no|via|pelo)?\s*pix\.?$/i.test(clean)) return;
    if (/frete gr[aá]tis/i.test(clean)) {
      if (!hasShipping) lines.push("🚚 Frete grátis.");
      hasShipping = true;
      return;
    }
    if (/sem juros|parcel(?:a|e|amento)|\b\d{1,2}x\b/i.test(clean)) {
      if (!hasInstallments) lines.push(`💳 ${clean.replace(/^no cart[aã]o\s*:?\s*/i, "")}`);
      hasInstallments = true;
      return;
    }
    if (!/promo[cç][aã]o|\boff\b/i.test(clean)) lines.push(clean);
  });
  return { pix, lines: [...new Set(lines)] };
}

export function formatTelegramMessage(offer) {
  const benefits = formatOfferBenefits(offer.extraText);
  const headline = String(offer.messageHeadline || "").trim().replace(/^\s*\u{1F525}\s*/u, "") || "T\u00C1 BARATO!";
  const currentPrice = Number(offer.currentPrice);
  const capturedPreviousPrice = Number(offer.previousPrice);
  const previousPrice = Number.isFinite(capturedPreviousPrice) && capturedPreviousPrice > currentPrice
    ? capturedPreviousPrice
    : currentPrice;
  const money = (value) => `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
  const lines = [
    `<b>\u{1F525} ${escapeHtml(headline)}</b>`,
    "",
    `<b>${escapeHtml(offer.productName)}</b>`,
    "",
    `\u{1F4B0} <b>${money(currentPrice)}</b>${benefits.pix ? " (no Pix)" : ""}   |   \u{274C} <s>${money(previousPrice)}</s>`,
  ];
  if (offer.coupon) lines.push("", `\u{1F39F}\u{FE0F} Cupom: <b>${escapeHtml(offer.coupon)}</b>`);
  if (benefits.lines.length) lines.push("", ...benefits.lines.map((line) => escapeHtml(line.replace(/\.$/, ""))));
  lines.push("", "\u{1F447} <b>Compre aqui:</b>", escapeHtml(offer.affiliateLink || ""));

  return compactLines(lines);
}

async function telegramRequest(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram não configurado.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.description || `Telegram respondeu com status ${response.status}.`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendTelegramOffer(offer) {
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (!chatId) throw new Error("Telegram não configurado.");

  const caption = formatTelegramMessage(offer);
  const reply_markup = {
    inline_keyboard: [[{ text: "🛒 Ver oferta", url: offer.affiliateLink }]],
  };

  const embedded = imageDataUrl(offer.shareImageDataUrl);
  const hasRemoteImage = offer.imageUrl && /^https:\/\//i.test(offer.imageUrl);
  const hasImage = Boolean(embedded || hasRemoteImage);
  const method = hasImage ? "sendPhoto" : "sendMessage";
  let body = { chat_id: chatId, text: caption, parse_mode: "HTML", reply_markup };
  if (embedded) {
    if (embedded.bytes.length > 3 * 1024 * 1024) throw new Error("Arte da oferta muito grande para o Telegram.");
    body = new FormData();
    body.set("chat_id", chatId);
    body.set("photo", new Blob([embedded.bytes], { type: embedded.mimeType }), "oferta.png");
    body.set("caption", caption);
    body.set("parse_mode", "HTML");
    body.set("reply_markup", JSON.stringify(reply_markup));
  } else if (hasRemoteImage) {
    body = { chat_id: chatId, photo: offer.imageUrl, caption, parse_mode: "HTML", reply_markup };
  }

  const payload = await telegramRequest(method, body);
  const messageId = payload.result?.message_id || payload.result?.[0]?.message_id;
  if (!messageId) throw new Error("Resposta inválida do Telegram.");
  return { messageId: String(messageId), response: payload };
}

function imageDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  return { mimeType: match[1], bytes: Buffer.from(match[2], "base64") };
}

export async function sendTelegramText(message, imageUrl = "") {
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (!chatId) throw new Error("Telegram não configurado.");

  const text = String(message || "").trim();
  if (!text) throw new Error("Mensagem vazia.");

  const image = String(imageUrl || "").trim();
  if (image) {
    const caption = text.length <= 1024 ? text : "";
    const embedded = imageDataUrl(image);
    let photoPayload;
    if (embedded) {
      photoPayload = new FormData();
      photoPayload.set("chat_id", chatId);
      photoPayload.set("photo", new Blob([embedded.bytes], { type: embedded.mimeType }), `mensagem.${embedded.mimeType.split("/")[1].replace("jpeg", "jpg")}`);
      if (caption) {
        photoPayload.set("caption", caption);
        photoPayload.set("parse_mode", "HTML");
      }
    } else if (/^https:\/\//i.test(image)) {
      photoPayload = { chat_id: chatId, photo: image, ...(caption ? { caption, parse_mode: "HTML" } : {}) };
    } else {
      throw new Error("Imagem invalida. Use HTTPS ou selecione um arquivo de imagem.");
    }
    const photoResponse = await telegramRequest("sendPhoto", photoPayload);
    if (caption) {
      const photoMessageId = photoResponse.result?.message_id;
      if (!photoMessageId) throw new Error("Resposta inválida do Telegram.");
      return { messageId: String(photoMessageId), response: photoResponse };
    }
  }

  const payload = await telegramRequest("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
  const messageId = payload.result?.message_id;
  if (!messageId) throw new Error("Resposta inválida do Telegram.");
  return { messageId: String(messageId), response: payload };
}
