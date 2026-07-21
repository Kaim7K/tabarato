// @ts-nocheck
export const telegramStatuses = ["RASCUNHO", "APROVADO", "AGENDADO", "PUBLICANDO", "PUBLICADO", "ERRO", "EXPIRADO"];

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) localStorage.removeItem("tb_admin_logged_in");
  if (!response.ok) throw new Error(payload.error || "Erro na requisicao.");
  return payload;
}

export const telegramOffersApi = {
  list: (params = {}) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) search.set(key, value);
    });
    return request(`/api/admin/ofertas${search.toString() ? `?${search}` : ""}`);
  },
  create: (offer) => request("/api/admin/ofertas", { method: "POST", body: offer }),
  createCategory: (name) => request("/api/admin/ofertas", { method: "POST", body: { resource: "category", name } }),
  removeCategory: (slug, targetCategory = "") => request(`/api/admin/ofertas?resource=category&slug=${encodeURIComponent(slug)}${targetCategory ? `&targetCategory=${encodeURIComponent(targetCategory)}` : ""}`, { method: "DELETE" }),
  update: (id, offer) => request(`/api/admin/ofertas/${id}`, { method: "PATCH", body: offer }),
  remove: (id) => request(`/api/admin/ofertas/${id}`, { method: "DELETE" }),
  publish: (id) => request(`/api/admin/ofertas/${id}/publicar`, { method: "POST" }),
  schedule: (id, scheduledAt) => request(`/api/admin/ofertas/${id}/agendar`, { method: "POST", body: { scheduledAt } }),
  testTelegram: () => request("/api/admin/telegram/test", { method: "POST" }),
  previewProduct: (link) => request("/api/admin/product-preview", { method: "POST", body: { link } }),
  listMessages: () => request("/api/admin/mensagens"),
  createMessage: (message) => request("/api/admin/mensagens", { method: "POST", body: message }),
  updateMessage: (id, message) => request(`/api/admin/mensagens?id=${encodeURIComponent(id)}`, { method: "PATCH", body: message }),
  removeMessage: (id) => request(`/api/admin/mensagens?id=${encodeURIComponent(id)}`, { method: "DELETE" }),
  sendMessageNow: (id) => request(`/api/admin/mensagens?action=send&id=${encodeURIComponent(id)}`, { method: "POST" }),
};

const compactLines = (lines) =>
  lines.filter((line, index, array) => String(line || "").trim() || String(array[index - 1] || "").trim()).join("\n").trim();

const previewBenefits = (value = "") => {
  const source = String(value || "").replace(/\s+/g, " ").trim();
  const pix = /\b(?:no|via|pelo|preco principal no)\s+pix\b/i.test(source.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const lines = [];
  let hasInstallments = false;
  let hasShipping = false;
  source.split(/(?<=[.!?])\s+/).forEach((sentence) => {
    const containedDiscount = /\b\d{1,3}(?:[.,]\d+)?%\s*(?:off|de desconto)\b/i.test(sentence);
    const clean = sentence.replace(/promo[cç][aã]o\s*:[^.!?]*/gi, "").replace(/\b\d{1,3}(?:[.,]\d+)?%\s*(?:off|de desconto)\b/gi, "").replace(/\s+/g, " ").trim();
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
};

export function formatTelegramPreview(offer) {
  const benefits = previewBenefits(offer.extraText);
  const currentPrice = Number(offer.currentPrice);
  const previousPrice = Number(offer.previousPrice) > currentPrice ? Number(offer.previousPrice) : currentPrice;
  const lines = [
    "🔥 TÁ BARATO!",
    "",
    offer.productName || "[NOME DO PRODUTO]",
    "",
    `💰 Agora: ${offer.currentPrice ? `R$ ${Number(offer.currentPrice).toFixed(2).replace(".", ",")}` : "[PRECO ATUAL]"}${benefits.pix ? " (no Pix)" : ""}`,
  ];
  if (currentPrice > 0) lines.push(`Antes: R$ ${previousPrice.toFixed(2).replace(".", ",")}`);
  if (offer.coupon) lines.push(`Cupom: ${offer.coupon}`);
  if (offer.category) lines.push("", `📦 ${offer.category}`);
  if (benefits.lines.length) lines.push("", ...benefits.lines);
  lines.push("", "Preco e disponibilidade podem mudar.", "", "🛒 Ver oferta");
  return compactLines(lines);
}

export function formatWhatsAppPreview(offer) {
  const benefits = previewBenefits(offer.extraText);
  const currentPrice = Number(offer.currentPrice);
  const previousPrice = Number(offer.previousPrice) > currentPrice ? Number(offer.previousPrice) : currentPrice;
  const price = offer.currentPrice ? `R$ ${currentPrice.toFixed(2).replace(".", ",")}` : "[PREÇO ATUAL]";
  const lines = ["🔥 *TÁ BARATO!*", "", `*${offer.productName || "[NOME DO PRODUTO]"}*`, "", `💰 Agora: *${price}*${benefits.pix ? " *(no Pix)*" : ""}`];
  if (currentPrice > 0) lines.push(`Antes: ~R$ ${previousPrice.toFixed(2).replace(".", ",")}~`);
  if (offer.coupon) lines.push("", `🎟️ Cupom: *${offer.coupon}*`);
  if (benefits.lines.length) lines.push("", ...benefits.lines);
  lines.push("", "🛒 *Comprar:*", offer.affiliateLink || "[LINK DA OFERTA]");
  return compactLines(lines);
}
