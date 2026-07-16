const escapeHtml = (value = "") =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export function formatTelegramMessage(offer) {
  const lines = [
    "<b>🔥 TÁ BARATO!</b>",
    "",
    `<b>${escapeHtml(offer.productName)}</b>`,
    "",
    escapeHtml(offer.shortDescription),
    "",
    `💰 Agora: <b>R$ ${Number(offer.currentPrice).toFixed(2).replace(".", ",")}</b>`,
  ];

  if (offer.previousPrice) {
    lines.push(`Antes: R$ ${Number(offer.previousPrice).toFixed(2).replace(".", ",")}`);
  }
  if (offer.coupon) {
    lines.push(`Cupom: <b>${escapeHtml(offer.coupon)}</b>`);
  }
  lines.push("", `📦 ${escapeHtml(offer.category)}`);
  if (offer.extraText) lines.push("", escapeHtml(offer.extraText));
  lines.push("", "Publicidade | Link de afiliado", "Preço e disponibilidade podem mudar.");

  return lines.join("\n");
}

export async function sendTelegramOffer(offer) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHANNEL_ID;
  if (!token || !chatId) throw new Error("Telegram não configurado.");

  const caption = formatTelegramMessage(offer);
  const reply_markup = {
    inline_keyboard: [[{ text: "🛒 Ver oferta", url: offer.affiliateLink }]],
  };

  const hasImage = offer.imageUrl && /^https:\/\//i.test(offer.imageUrl);
  const method = hasImage ? "sendPhoto" : "sendMessage";
  const body = hasImage
    ? { chat_id: chatId, photo: offer.imageUrl, caption, parse_mode: "HTML", reply_markup }
    : { chat_id: chatId, text: caption, parse_mode: "HTML", reply_markup };

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
    const messageId = payload.result?.message_id || payload.result?.[0]?.message_id;
    if (!messageId) throw new Error("Resposta inválida do Telegram.");
    return { messageId: String(messageId), response: payload };
  } finally {
    clearTimeout(timeout);
  }
}
