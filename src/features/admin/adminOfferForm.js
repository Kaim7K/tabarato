import { normalizeText } from "@/lib/catalog";

export const CUSTOM_CATEGORIES_KEY = "tb_admin_custom_categories";
export const OFFER_FILTERS_KEY = "tb_admin_offer_filters";

export const emptyOffer = {
  productName: "",
  shortDescription: "",
  currentPrice: "",
  previousPrice: "",
  coupon: "",
  couponDiscountPercent: 0,
  category: "Tecnologia",
  imageUrl: "",
  affiliateLink: "",
  sourceProductId: "",
  platform: "Mercado Livre",
  campaignName: "",
  priority: 0,
  extraText: "",
  status: "RASCUNHO",
  scheduledAt: "",
};

export const emptyAutoMessage = {
  title: "",
  message: "",
  channel: "TELEGRAM",
  imageUrl: "",
  whatsappGroup: "",
  isActive: true,
  intervalMinutes: 1440,
  sortOrder: 0,
  nextSendAt: "",
};

export function readStoredJson(key, storage) {
  try {
    return JSON.parse(storage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

export const loadOfferFilters = () => readStoredJson(OFFER_FILTERS_KEY, sessionStorage);
export const loadCustomCategories = () => readStoredJson(CUSTOM_CATEGORIES_KEY, localStorage);

export function toDatetimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export const fromDatetimeLocal = (value) => (value ? new Date(value).toISOString() : "");

export function normalizeFormPrice(value = "") {
  const raw = String(value).replace(/[^\d.,]/g, "");
  if (!raw) return "";
  const decimalIndex = Math.max(raw.lastIndexOf(","), raw.lastIndexOf("."));
  if (decimalIndex === -1) return raw;
  const decimals = raw.slice(decimalIndex + 1);
  const integer = raw.slice(0, decimalIndex).replace(/[.,]/g, "");
  return decimals.length === 2 ? `${integer}.${decimals}` : `${integer}${decimals}`;
}

export function mergeProductIntoForm(current, product = {}, category = "") {
  return {
    ...current,
    productName: product.productName || current.productName,
    shortDescription: product.shortDescription || current.shortDescription,
    currentPrice: product.currentPrice ? normalizeFormPrice(product.currentPrice) : current.currentPrice,
    previousPrice: product.previousPrice ? normalizeFormPrice(product.previousPrice) : current.previousPrice,
    couponDiscountPercent: product.couponDiscountPercent || current.couponDiscountPercent,
    imageUrl: product.imageUrl || current.imageUrl,
    affiliateLink: product.affiliateLink || current.affiliateLink,
    sourceProductId: product.sourceProductId || product.externalProductId || current.sourceProductId,
    platform: product.platform || current.platform,
    category: category || current.category,
  };
}

const CATEGORY_RULES = [
  { category: "Tecnologia", words: ["fone", "celular", "smartphone", "notebook", "computador", "mouse", "teclado", "monitor"] },
  { category: "Cozinha", words: ["panela", "air fryer", "cafeteira", "liquidificador", "cozinha"] },
  { category: "Ferramentas", words: ["furadeira", "parafusadeira", "ferramenta", "serra", "chave"] },
  { category: "Casa e organizacao", words: ["organizador", "casa", "armario", "prateleira", "limpeza"] },
  { category: "Beleza e cuidados", words: ["beleza", "perfume", "cabelo", "barbeador", "maquiagem"] },
  { category: "Escritorio", words: ["escritorio", "cadeira", "mesa", "papel", "caneta"] },
];

export function suggestCategory(product = {}, available = []) {
  const text = normalizeText(`${product.productName || ""} ${product.shortDescription || ""}`);
  const rule = CATEGORY_RULES.find((item) => item.words.some((word) => text.includes(word)));
  return rule ? available.find((category) => normalizeText(category) === rule.category) || "" : "";
}
