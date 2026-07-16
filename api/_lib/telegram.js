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

export function formatTelegramMessage(offer) {
  const lines = [
    "<b>🔥 TÁ BARATO!</b>",
    "",
    `<b>${escapeHtml(offer.productName)}</b>`,
    "",
    `💰 Agora: <b>R$ ${Number(offer.currentPrice).toFixed(2).replace(".", ",")}</b>`,
  ];

  if (offer.previousPrice) {
    lines.push(`Antes: <s>R$ ${Number(offer.previousPrice).toFixed(2).replace(".", ",")}</s>`);
  }
  if (offer.coupon) {
    lines.push(/^use o cupom da loja$/i.test(offer.coupon)
      ? `<b>${escapeHtml(offer.coupon)}</b>`
      : `Cupom: <b>${escapeHtml(offer.coupon)}</b>`);
  }
  if (offer.category) lines.push("", `📦 ${escapeHtml(offer.category)}`);
  if (offer.extraText) lines.push("", escapeHtml(offer.extraText));
  lines.push("", "Preço e disponibilidade podem mudar.");

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

  const hasImage = offer.imageUrl && /^https:\/\//i.test(offer.imageUrl);
  const method = hasImage ? "sendPhoto" : "sendMessage";
  const body = hasImage
    ? { chat_id: chatId, photo: offer.imageUrl, caption, parse_mode: "HTML", reply_markup }
    : { chat_id: chatId, text: caption, parse_mode: "HTML", reply_markup };

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
