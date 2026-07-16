// @ts-nocheck
const ADMIN_KEY = "tb_admin_api_key";

export const telegramStatuses = ["RASCUNHO", "APROVADO", "AGENDADO", "PUBLICANDO", "PUBLICADO", "ERRO", "EXPIRADO"];

export function getAdminKey() {
  return localStorage.getItem(ADMIN_KEY) || "";
}

export function setAdminKey(value) {
  if (value) localStorage.setItem(ADMIN_KEY, value);
  else localStorage.removeItem(ADMIN_KEY);
}

async function request(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-admin-api-key": getAdminKey(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Erro na requisição.");
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
  update: (id, offer) => request(`/api/admin/ofertas/${id}`, { method: "PATCH", body: offer }),
  remove: (id) => request(`/api/admin/ofertas/${id}`, { method: "DELETE" }),
  publish: (id) => request(`/api/admin/ofertas/${id}/publicar`, { method: "POST" }),
  schedule: (id, scheduledAt) => request(`/api/admin/ofertas/${id}/agendar`, { method: "POST", body: { scheduledAt } }),
  testTelegram: () => request("/api/admin/telegram/test", { method: "POST" }),
};

export function formatTelegramPreview(offer) {
  const lines = [
    "🔥 TÁ BARATO!",
    "",
    offer.productName || "[NOME DO PRODUTO]",
    "",
    offer.shortDescription || "[DESCRIÇÃO CURTA]",
    "",
    `💰 Agora: ${offer.currentPrice ? `R$ ${Number(offer.currentPrice).toFixed(2).replace(".", ",")}` : "[PREÇO ATUAL]"}`,
  ];
  if (offer.previousPrice) lines.push(`Antes: R$ ${Number(offer.previousPrice).toFixed(2).replace(".", ",")}`);
  if (offer.coupon) lines.push(`Cupom: ${offer.coupon}`);
  lines.push("", `📦 ${offer.category || "[CATEGORIA]"}`, "", "Publicidade | Link de afiliado", "Preço e disponibilidade podem mudar.", "", "🛒 Ver oferta");
  return lines.join("\n");
}
