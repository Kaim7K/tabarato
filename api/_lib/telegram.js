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
    lines.push(`Cupom: <b>${escapeHtml(offer.coupon)}</b>`);
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

export async function sendTelegramText(message) {
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (!chatId) throw new Error("Telegram não configurado.");

  const text = String(message || "").trim();
  if (!text) throw new Error("Mensagem vazia.");

  const payload = await telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
  });
  const messageId = payload.result?.message_id;
  if (!messageId) throw new Error("Resposta inválida do Telegram.");
  return { messageId: String(messageId), response: payload };
}
