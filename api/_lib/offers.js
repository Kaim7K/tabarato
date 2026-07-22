import { query } from "./db.js";
import { evaluateOffer, evaluateRepublish, queuePriority } from "./offerIntelligence.js";

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
  const normalized = decimals.length >= 1 && decimals.length <= 2
    ? `${integer}.${decimals}`
    : `${integer}${decimals}`;
  return Number(normalized);
}

export function mapOffer(row) {
  if (!row) return null;
  const evidence = row.intelligence_evidence || {};
  const lastPublishedPrice = row.last_published_price ?? row.current_price;
  const lastPublishedCoupon = row.last_published_coupon || "";
  const lastPublishedFreeShipping = Boolean(row.last_published_free_shipping);
  const quality = evaluateOffer({
    currentPrice: row.current_price,
    previousPrice: row.previous_price,
    coupon: row.coupon,
    imageUrl: row.image_url,
    affiliateLink: row.affiliate_link,
    category: row.category,
    extraText: row.extra_text,
    evidence,
  });
  const republish = evaluateRepublish({
    currentPrice: row.current_price,
    previousPrice: row.previous_price,
    coupon: row.coupon,
    lastPublishedAt: row.last_published_at || row.published_at || row.site_published_at,
    lastPublishedPrice,
    lastPublishedCoupon,
    lastPublishedFreeShipping,
    extraText: row.extra_text,
    availabilityStatus: row.availability_status,
    evidence,
  });
  const priority = queuePriority({
    currentPrice: row.current_price,
    previousPrice: row.previous_price,
    coupon: row.coupon,
    imageUrl: row.image_url,
    affiliateLink: row.affiliate_link,
    category: row.category,
    extraText: row.extra_text,
    priority: row.priority,
    lastPublishedAt: row.last_published_at || row.published_at || row.site_published_at,
    lastPublishedPrice,
    lastPublishedCoupon,
    lastPublishedFreeShipping,
    evidence,
  });
  return {
    id: row.id,
    productName: row.product_name,
    shortDescription: row.short_description,
    currentPrice: row.current_price == null ? "" : String(row.current_price),
    previousPrice: row.previous_price == null ? "" : String(row.previous_price),
    coupon: row.coupon || "",
    couponDiscountPercent: Number(row.coupon_discount_percent || 0),
    category: row.category,
    imageUrl: row.image_url || "",
    affiliateLink: row.affiliate_link,
    sourceProductId: row.source_product_id || "",
    availabilityStatus: row.availability_status || "DESCONHECIDO",
    lastCheckedAt: row.last_checked_at || null,
    lastCheckError: row.last_check_error || "",
    publicationCount: Number(row.publication_count || 0),
    lastPublishedAt: row.last_published_at || null,
    lastPublishedPrice: lastPublishedPrice == null ? "" : String(lastPublishedPrice),
    republishEligible: republish.eligible,
    republishHiddenByCooldown: republish.hiddenByCooldown,
    republishReasons: republish.reasons,
    queueKind: priority.kind,
    queueScore: priority.score,
    queueReason: priority.reason,
    platform: row.platform,
    campaignName: row.campaign_name || "",
    priority: Number(row.priority || 0),
    qualityScore: quality.score,
    qualityReasons: quality.reasons,
    recommendedAction: quality.action,
    intelligenceEvidence: evidence,
    extraText: row.extra_text || "",
    status: row.status,
    scheduledAt: row.scheduled_at,
    publishedAt: row.published_at,
    sitePublishedAt: row.site_published_at || null,
    telegramMessageId: row.telegram_message_id || "",
    telegramRetryCount: Number(row.telegram_retry_count || 0),
    telegramNextRetryAt: row.telegram_next_retry_at || null,
    telegramLastErrorCode: row.telegram_last_error_code || "",
    telegramResponse: row.telegram_response || null,
    errorMessage: row.error_message || "",
    clicks: row.clicks || 0,
    shares: row.shares || 0,
    favorites: row.favorites || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function offerQuality(input = {}) {
  const result = evaluateOffer(input);
  return { score: result.score, reasons: result.reasons, action: result.action };
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

  if (input.couponDiscountPercent !== "" && input.couponDiscountPercent != null) {
    const couponDiscount = Number(input.couponDiscountPercent);
    if (!Number.isFinite(couponDiscount) || couponDiscount < 0 || couponDiscount > 100) errors.push("Desconto do cupom deve estar entre 0 e 100%.");
    if (couponDiscount > 0 && !String(input.coupon || "").trim()) errors.push("Informe o cupom antes de definir o desconto do cupom.");
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
  const currentPrice = parsePrice(input.currentPrice);
  const capturedPreviousPrice = parsePrice(input.previousPrice);
  const previousPrice = Number.isFinite(capturedPreviousPrice) && capturedPreviousPrice > currentPrice
    ? capturedPreviousPrice
    : currentPrice;
  return {
    product_name: String(input.productName || "").trim(),
    short_description: String(input.shortDescription || "").trim(),
    current_price: currentPrice,
    previous_price: previousPrice,
    coupon: input.coupon ? String(input.coupon).trim() : null,
    coupon_discount_percent: input.coupon ? Math.max(0, Math.min(100, Number(input.couponDiscountPercent) || 0)) || null : null,
    category: String(input.category || "").trim(),
    image_url: input.imageUrl ? String(input.imageUrl).trim() : null,
    affiliate_link: String(input.affiliateLink || "").trim(),
    source_product_id: input.sourceProductId ? String(input.sourceProductId).trim().slice(0, 120) : null,
    platform: String(input.platform || "").trim(),
    campaign_name: input.campaignName ? String(input.campaignName).trim().slice(0, 100) : null,
    priority: Math.max(-10, Math.min(10, Number(input.priority) || 0)),
    intelligence_evidence: input.intelligenceEvidence && typeof input.intelligenceEvidence === "object"
      ? input.intelligenceEvidence : {},
    extra_text: input.extraText ? String(input.extraText).trim() : null,
    status: input.status || "RASCUNHO",
    scheduled_at: input.scheduledAt || null,
  };
}

export function normalizeProductIdentity(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function productKey(data) {
  const platform = normalizeProductIdentity(data.platform);
  const sourceId = normalizeProductIdentity(data.source_product_id);
  const name = normalizeProductIdentity(data.product_name);
  return sourceId ? `${platform}:id:${sourceId}` : `${platform}:name:${name}`;
}

export async function findDuplicateOffer(input, excludeId = "", statuses = []) {
  const data = toDbParams(input);
  const result = await query(
    `SELECT id, product_name, source_product_id, status
     FROM telegram_offers
     WHERE LOWER(platform)=LOWER($1)
       AND current_price=$2
       AND ($3::text='' OR id::text<>$3)`,
    [data.platform, data.current_price, String(excludeId || "")]
  );
  const sourceId = normalizeProductIdentity(data.source_product_id);
  const name = normalizeProductIdentity(data.product_name);
  return result.rows.find((row) => {
    if (statuses.length && !statuses.includes(row.status)) return false;
    const existingSourceId = normalizeProductIdentity(row.source_product_id);
    if (sourceId && existingSourceId) return sourceId === existingSourceId;
    return name && name === normalizeProductIdentity(row.product_name);
  }) || null;
}

function duplicateError(duplicate) {
  return Object.assign(
    new Error(`Este produto já está cadastrado com o mesmo preço em "${duplicate.product_name}".`),
    { statusCode: 409 }
  );
}

function rethrowDuplicateConstraint(error, productName) {
  if (error?.code === "23505" && error?.constraint === "idx_telegram_offers_unique_product_price") {
    throw duplicateError({ product_name: productName });
  }
  throw error;
}

export async function listPostedProductIds(platform = "", sourceProductIds = [], { recentOnly = false, cooldownHours = 24 } = {}) {
  const normalizedPlatform = String(platform || "").trim();
  const normalizedIds = [...new Set((Array.isArray(sourceProductIds) ? sourceProductIds : [])
    .map((value) => String(value || "").replace(/-/g, "").trim().toUpperCase())
    .filter((value) => /^[A-Z0-9.]{4,120}$/.test(value)))]
    .slice(0, 100);
  if (!normalizedPlatform || !normalizedIds.length) return [];

  const result = await query(
    `SELECT DISTINCT UPPER(REPLACE(offer.source_product_id, '-', '')) AS source_product_id
     FROM telegram_offers offer
     WHERE LOWER(offer.platform)=LOWER($1)
       AND UPPER(REPLACE(offer.source_product_id, '-', '')) = ANY($2::text[])
       AND (
         offer.status='PUBLICADO'
         OR offer.published_at IS NOT NULL
         OR offer.telegram_message_id IS NOT NULL
         OR EXISTS (
           SELECT 1
           FROM offer_publication_history history
           WHERE history.offer_id=offer.id AND history.status='SUCESSO'
         )
       )
       AND (
         $3::boolean=FALSE
         OR (
           offer.published_at >= NOW() - ($4 || ' hours')::interval
           AND NOT EXISTS (
             SELECT 1 FROM offer_price_history price_history
             WHERE price_history.offer_id=offer.id AND price_history.recorded_at > offer.published_at
           )
         )
       )`,
    [normalizedPlatform, normalizedIds, recentOnly === true, Math.max(1, Math.min(720, Number(cooldownHours) || 24))],
  );
  return result.rows.map((row) => String(row.source_product_id || "").trim()).filter(Boolean);
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
  const result = await query(`SELECT telegram_offers.*,
    (SELECT COUNT(*) FROM site_analytics_events events WHERE events.offer_id=telegram_offers.id AND events.event_type='click') AS real_clicks,
    (SELECT COUNT(*) FROM offer_publication_history history WHERE history.offer_id=telegram_offers.id AND history.status='SUCESSO') AS publication_count,
    (SELECT MAX(published_at) FROM offer_publication_history history WHERE history.offer_id=telegram_offers.id AND history.status='SUCESSO') AS last_published_at,
    COALESCE(
      (SELECT price_snapshot FROM offer_publication_history history
       WHERE history.offer_id=telegram_offers.id
         AND history.status='SUCESSO'
         AND history.price_snapshot IS NOT NULL
       ORDER BY history.published_at DESC LIMIT 1),
      (SELECT price FROM offer_price_history price_history
       WHERE price_history.offer_id=telegram_offers.id
         AND price_history.recorded_at <= COALESCE(telegram_offers.published_at, telegram_offers.site_published_at, telegram_offers.created_at)
       ORDER BY price_history.recorded_at DESC LIMIT 1),
      telegram_offers.current_price
    ) AS last_published_price,
    COALESCE(
      (SELECT coupon_snapshot FROM offer_publication_history history
       WHERE history.offer_id=telegram_offers.id
         AND history.status='SUCESSO'
       ORDER BY history.published_at DESC LIMIT 1),
      ''
    ) AS last_published_coupon,
    COALESCE(
      (SELECT free_shipping_snapshot FROM offer_publication_history history
       WHERE history.offer_id=telegram_offers.id
         AND history.status='SUCESSO'
       ORDER BY history.published_at DESC LIMIT 1),
      FALSE
    ) AS last_published_free_shipping
    FROM telegram_offers ${where} ORDER BY created_at DESC LIMIT 500`, params);
  return result.rows.map((row) => mapOffer({ ...row, clicks: Number(row.real_clicks || 0) }));
}

export async function getOffer(id) {
  const result = await query("SELECT * FROM telegram_offers WHERE id = $1", [id]);
  return mapOffer(result.rows[0]);
}

export async function createOffer(input) {
  const data = toDbParams(input);
  const duplicate = await findDuplicateOffer(input);
  if (duplicate) throw duplicateError(duplicate);
  const result = await query(
    `INSERT INTO telegram_offers (
      product_name, short_description, current_price, previous_price, coupon, category, image_url,
      affiliate_link, platform, extra_text, status, scheduled_at, clicks, source_product_id, product_key,
      coupon_discount_percent, campaign_name, priority, intelligence_evidence
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
    RETURNING *`,
    [
      data.product_name, data.short_description, data.current_price, data.previous_price, data.coupon, data.category,
      data.image_url, data.affiliate_link, data.platform, data.extra_text, data.status, data.scheduled_at, 0,
      data.source_product_id, productKey(data), data.coupon_discount_percent, data.campaign_name, data.priority, JSON.stringify(data.intelligence_evidence),
    ]
  ).catch((error) => rethrowDuplicateConstraint(error, data.product_name));
  return mapOffer(result.rows[0]);
}

export async function updateOffer(id, input) {
  const data = toDbParams(input);
  const duplicate = await findDuplicateOffer(input, id);
  if (duplicate) throw duplicateError(duplicate);
  const result = await query(
    `UPDATE telegram_offers SET
      product_name=$1, short_description=$2, current_price=$3, previous_price=$4, coupon=$5,
      category=$6, image_url=$7, affiliate_link=$8, platform=$9, extra_text=$10, status=$11,
      scheduled_at=$12, source_product_id=$13, product_key=$14, coupon_discount_percent=$15,
      campaign_name=$16, priority=$17, intelligence_evidence=$18, error_message=NULL
    WHERE id=$19
    RETURNING *`,
    [
      data.product_name, data.short_description, data.current_price, data.previous_price, data.coupon, data.category,
      data.image_url, data.affiliate_link, data.platform, data.extra_text, data.status, data.scheduled_at,
      data.source_product_id, productKey(data), data.coupon_discount_percent, data.campaign_name, data.priority, JSON.stringify(data.intelligence_evidence), id,
    ]
  ).catch((error) => rethrowDuplicateConstraint(error, data.product_name));
  return mapOffer(result.rows[0]);
}
