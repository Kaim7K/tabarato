import { randomInt } from "node:crypto";
import { query } from "./db.js";

export const STATUSES = ["RASCUNHO", "APROVADO", "AGENDADO", "PUBLICANDO", "PUBLICADO", "ERRO", "EXPIRADO"];

const URL_FIELDS = ["imageUrl", "affiliateLink"];

function parsePrice(value) {
  const raw = String(value || "").replace(/[^\d.,]/g, "");
  if (!raw) return NaN;
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);
  if (decimalIndex === -1) return Number(raw);
  const decimals = raw.slice(decimalIndex + 1);
  const integer = raw.slice(0, decimalIndex).replace(/[.,]/g, "");
  const normalized = decimals.length === 2 ? `${integer}.${decimals}` : `${integer}${decimals}`;
  return Number(normalized);
}

export function mapOffer(row) {
  if (!row) return null;
  return {
    id: row.id,
    productName: row.product_name,
    shortDescription: row.short_description,
    currentPrice: row.current_price == null ? "" : String(row.current_price),
    previousPrice: row.previous_price == null ? "" : String(row.previous_price),
    coupon: row.coupon || "",
    category: row.category,
    imageUrl: row.image_url || "",
    affiliateLink: row.affiliate_link,
    platform: row.platform,
    extraText: row.extra_text || "",
    status: row.status,
    scheduledAt: row.scheduled_at,
    publishedAt: row.published_at,
    telegramMessageId: row.telegram_message_id || "",
    telegramResponse: row.telegram_response || null,
    errorMessage: row.error_message || "",
    clicks: row.clicks || 0,
    shares: row.shares || 0,
    favorites: row.favorites || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validateHttpsUrl(value, field, required = false) {
  if (!value) {
    if (required) return `${field} é obrigatório.`;
    return "";
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return `${field} deve usar HTTPS.`;
    return "";
  } catch {
    return `${field} inválido.`;
  }
}

export function validateOffer(input, { requireSchedule = false } = {}) {
  const errors = [];
  const required = [
    ["productName", "Nome do produto"],
    ["currentPrice", "Preço atual"],
    ["category", "Categoria"],
    ["affiliateLink", "Link oficial de afiliado"],
    ["platform", "Plataforma"],
  ];

  required.forEach(([key, label]) => {
    if (!String(input[key] || "").trim()) errors.push(`${label} é obrigatório.`);
  });

  const limits = [
    ["productName", "Nome do produto", 200],
    ["shortDescription", "Descricao curta", 1000],
    ["coupon", "Cupom", 100],
    ["category", "Categoria", 100],
    ["platform", "Plataforma", 100],
    ["extraText", "Texto complementar", 600],
    ["imageUrl", "URL da imagem", 2048],
    ["affiliateLink", "Link oficial de afiliado", 2048],
  ];
  limits.forEach(([key, label, max]) => {
    if (String(input[key] || "").length > max) errors.push(`${label} deve ter no maximo ${max} caracteres.`);
  });

  const currentPrice = parsePrice(input.currentPrice);
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) errors.push("Preço atual deve ser maior que zero.");

  if (input.previousPrice) {
    const previousPrice = parsePrice(input.previousPrice);
    if (!Number.isFinite(previousPrice) || previousPrice <= 0) errors.push("Preço anterior inválido.");
  }

  URL_FIELDS.forEach((key) => {
    const error = validateHttpsUrl(input[key], key === "imageUrl" ? "URL da imagem" : "Link oficial de afiliado", key === "affiliateLink");
    if (error) errors.push(error);
  });

  if (input.status && !STATUSES.includes(input.status)) errors.push("Status inválido.");
  if (requireSchedule && !input.scheduledAt) errors.push("Data e horário do agendamento são obrigatórios.");
  if (input.scheduledAt && Number.isNaN(new Date(input.scheduledAt).getTime())) errors.push("Data de agendamento inválida.");

  return errors;
}

export function toDbParams(input) {
  return {
    product_name: String(input.productName || "").trim(),
    short_description: String(input.shortDescription || "").trim(),
    current_price: parsePrice(input.currentPrice),
    previous_price: input.previousPrice ? parsePrice(input.previousPrice) : null,
    coupon: input.coupon ? String(input.coupon).trim() : null,
    category: String(input.category || "").trim(),
    image_url: input.imageUrl ? String(input.imageUrl).trim() : null,
    affiliate_link: String(input.affiliateLink || "").trim(),
    platform: String(input.platform || "").trim(),
    extra_text: input.extraText ? String(input.extraText).trim() : null,
    status: input.status || "RASCUNHO",
    scheduled_at: input.scheduledAt || null,
  };
}

export function createInitialClickCount() {
  return randomInt(0, 21);
}

export async function listOffers({ search = "", status = "", category = "" } = {}) {
  const filters = [];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    filters.push(`product_name ILIKE $${params.length}`);
  }
  if (status) {
    params.push(status);
    filters.push(`status = $${params.length}`);
  }
  if (category) {
    params.push(category);
    filters.push(`category = $${params.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const result = await query(`SELECT * FROM telegram_offers ${where} ORDER BY created_at DESC LIMIT 500`, params);
  return result.rows.map(mapOffer);
}

export async function getOffer(id) {
  const result = await query("SELECT * FROM telegram_offers WHERE id = $1", [id]);
  return mapOffer(result.rows[0]);
}

export async function createOffer(input) {
  const data = toDbParams(input);
  const initialClicks = createInitialClickCount();
  const result = await query(
    `INSERT INTO telegram_offers (
      product_name, short_description, current_price, previous_price, coupon, category, image_url,
      affiliate_link, platform, extra_text, status, scheduled_at, clicks
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    RETURNING *`,
    [
      data.product_name, data.short_description, data.current_price, data.previous_price, data.coupon, data.category,
      data.image_url, data.affiliate_link, data.platform, data.extra_text, data.status, data.scheduled_at, initialClicks,
    ]
  );
  return mapOffer(result.rows[0]);
}

export async function updateOffer(id, input) {
  const data = toDbParams(input);
  const result = await query(
    `UPDATE telegram_offers SET
      product_name=$1, short_description=$2, current_price=$3, previous_price=$4, coupon=$5,
      category=$6, image_url=$7, affiliate_link=$8, platform=$9, extra_text=$10, status=$11,
      scheduled_at=$12, error_message=NULL
    WHERE id=$13
    RETURNING *`,
    [
      data.product_name, data.short_description, data.current_price, data.previous_price, data.coupon, data.category,
      data.image_url, data.affiliate_link, data.platform, data.extra_text, data.status, data.scheduled_at, id,
    ]
  );
  return mapOffer(result.rows[0]);
}
