function clean(value = "") {
  return decodeEntities(String(value).replace(/\s+/g, " ").trim());
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function meta(html, key) {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  const reverse = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`, "i");
  return clean(html.match(pattern)?.[1] || html.match(reverse)?.[1] || "");
}

function title(html) {
  return clean(meta(html, "og:title") || meta(html, "twitter:title") || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function description(html) {
  return clean(meta(html, "og:description") || meta(html, "twitter:description") || meta(html, "description") || "");
}

function image(html, baseUrl) {
  const raw = clean(meta(html, "og:image") || meta(html, "twitter:image") || meta(html, "image"));
  if (!raw) return "";
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return raw;
  }
}

function jsonLdProducts(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  return scripts.flatMap((script) => {
    try {
      const parsed = JSON.parse(script[1].trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      return items.flatMap((item) => item["@graph"] || item);
    } catch {
      return [];
    }
  }).filter((item) => {
    const type = item?.["@type"];
    return type === "Product" || (Array.isArray(type) && type.includes("Product"));
  });
}

function deepFindProducts(value, found = []) {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    value.forEach((item) => deepFindProducts(item, found));
    return found;
  }

  const type = value["@type"];
  if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) found.push(value);
  Object.values(value).forEach((item) => deepFindProducts(item, found));
  return found;
}

function allJsonLdProducts(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  return scripts.flatMap((script) => {
    try {
      return deepFindProducts(JSON.parse(script[1].trim()));
    } catch {
      return [];
    }
  });
}

function priceFromProduct(product) {
  const offers = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const priceSpecification = Array.isArray(offers?.priceSpecification) ? offers.priceSpecification[0] : offers?.priceSpecification;
  return offers?.price || offers?.lowPrice || priceSpecification?.price || product?.price || "";
}

function priceFromHtml(html) {
  const candidates = [
    meta(html, "product:price:amount"),
    meta(html, "og:price:amount"),
    html.match(/"price"\s*:\s*"?([0-9]+(?:[.,][0-9]{1,2})?)"?/i)?.[1],
    html.match(/"price"\s*:\s*\{\s*"amount"\s*:\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1],
    html.match(/"amount"\s*:\s*([0-9]+(?:\.[0-9]+)?)[,\}][\s\S]{0,120}"currency_id"\s*:\s*"BRL"/i)?.[1],
    html.match(/R\$\s*([0-9.]+,[0-9]{2})/i)?.[1],
  ].filter(Boolean);
  return normalizePrice(candidates[0] || "");
}

function normalizePrice(value) {
  if (!value) return "";
  const text = String(value).replace(/[^\d.,]/g, "");
  if (!text) return "";
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);
  if (decimalIndex === -1) return text;
  const decimals = text.slice(decimalIndex + 1);
  const integer = text.slice(0, decimalIndex).replace(/[.,]/g, "");
  if (decimals.length === 2) return `${integer}.${decimals}`;
  return `${integer}${decimals}`;
}

function platformFromUrl(url) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host.includes("mercadolivre") || host.includes("mercadolibre")) return "Mercado Livre";
  if (host.includes("shopee")) return "Shopee";
  if (host.includes("amazon")) return "Amazon";
  return "Outra";
}

function isMercadoLivre(url) {
  const host = new URL(url).hostname;
  return host.includes("mercadolivre.com") || host.includes("mercadolibre.com");
}

function isProbablyHomeOrSearch(url, html) {
  const current = new URL(url);
  const path = current.pathname.replace(/\/+$/, "");
  const hasQuerySearch = current.searchParams.has("q") || current.searchParams.has("_q") || current.searchParams.has("s");
  const homePath = path === "" || path === "/";
  const listingSignals = /search-results|ui-search|vtex-search-result|product-list|collection|categoria|category|busca/i.test(html);
  return homePath || hasQuerySearch || listingSignals;
}

function isLikelyMercadoLivreProduct(url) {
  const current = new URL(url);
  return /\/(MLB-|p\/MLB|produto\/)/i.test(current.pathname);
}

function isGenericMercadoLivreResult(product, html, finalUrl) {
  if (!isMercadoLivre(finalUrl)) return false;
  const name = clean(product.productName || "");
  const desc = clean(product.shortDescription || "");
  const genericTitle = /mercado livre brasil|frete gr[aá]tis|compre produtos/i.test(name);
  const hasProductSignal = isLikelyMercadoLivreProduct(finalUrl) || /ui-pdp-title|andes-money-amount|price-tag|productInfo|initialState/i.test(html);
  return genericTitle || (!hasProductSignal && (!name || !desc || !product.currentPrice));
}

function isWeakGenericResult(product, html, finalUrl) {
  const name = clean(product.productName || "");
  const hasProductSignals = /"@type"\s*:\s*"Product"|ui-pdp-title|productTitle|product-title|pdp|sku|offers/i.test(html);
  if (!name) return true;
  if (/^mercado livre$/i.test(name)) return true;
  if (/mercado livre brasil|frete gr[aá]tis no mesmo dia|compre produtos/i.test(name)) return true;
  if (isProbablyHomeOrSearch(finalUrl, html) && !hasProductSignals && !product.currentPrice) return true;
  return false;
}

function firstMercadoLivreProductUrl(html, baseUrl) {
  const links = [...html.matchAll(/href=["']([^"']+)["']/gi)]
    .map((match) => decodeEntities(match[1]))
    .filter((href) => /(produto\.mercadolivre\.com\.br\/MLB-|mercadolivre\.com\.br\/p\/MLB|\/MLB-\d+)/i.test(href));

  for (const href of links) {
    try {
      const url = new URL(href, baseUrl);
      url.hash = "";
      ["matt_tool", "matt_word", "matt_source"].forEach((param) => url.searchParams.delete(param));
      return url.toString();
    } catch {
      // ignore invalid link
    }
  }
  return "";
}

function descriptionFromTitle(name, descriptionText) {
  const descriptionValue = clean(descriptionText);
  if (descriptionValue && !/mercado livre brasil|compre produtos/i.test(descriptionValue)) return descriptionValue;
  return name ? `Oferta encontrada no Mercado Livre: ${name}` : "";
}

async function loadHtml(link) {
  let url = await assertSafeProductUrl(link);

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.7",
      },
    }).finally(() => clearTimeout(timeout));

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("A loja respondeu com um redirecionamento invalido.");
      url = await assertSafeProductUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`A loja respondeu com status ${response.status}.`);

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_HTML_BYTES) throw new Error("A pagina do produto e grande demais para processar.");
    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) throw new Error("A pagina do produto e grande demais para processar.");
    return { html, finalUrl: url.toString() };
  }

  throw new Error("A loja redirecionou o link muitas vezes.");
}

function mercadoLivreSearchUrlFromBrokenLink(link) {
  const url = new URL(link);
  const slug = url.pathname.split("/").filter(Boolean).pop() || "";
  if (!slug) return "";
  const query = slug.replace(/[-_]+/g, " ");
  return `https://lista.mercadolivre.com.br/${encodeURIComponent(query).replace(/%20/g, "-")}`;
}

function extractProduct(html, finalUrl, originalLink) {
  const products = [...jsonLdProducts(html), ...allJsonLdProducts(html)];
  const product = products.find((item) => clean(item.name) && priceFromProduct(item)) || products[0] || {};
  const productImage = Array.isArray(product.image) ? product.image[0] : product.image;
  const productName = clean(product.name || title(html)).replace(/\s*\|\s*MercadoLivre.*$/i, "");
  const shortDescription = descriptionFromTitle(productName, product.description || description(html));

  return {
    productName,
    shortDescription,
    currentPrice: normalizePrice(priceFromProduct(product)) || priceFromHtml(html),
    imageUrl: productImage ? new URL(productImage, finalUrl).toString() : image(html, finalUrl),
    affiliateLink: originalLink,
    sourceProductId: sourceProductIdFromLink(finalUrl || originalLink),
    platform: platformFromUrl(finalUrl || originalLink),
  };
}

function sourceProductIdFromLink(link) {
  const value = String(link || "");
  const mercadoLivre = value.match(/\b(MLB-?\d{6,})\b/i)?.[1]?.replace("-", "").toUpperCase();
  if (mercadoLivre) return mercadoLivre;
  const amazon = value.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase();
  if (amazon) return amazon;
  const shopee = value.match(/-i\.(\d+)\.(\d+)/i);
  return shopee ? `${shopee[1]}.${shopee[2]}` : "";
}

function mercadoLivreQueryFromLink(link) {
  const url = new URL(link);
  const slug = url.pathname.split("/").filter(Boolean).pop() || "";
  return decodeURIComponent(slug.replace(/[-_]+/g, " ")).trim();
}

function mercadoLivreItemIdFromLink(link) {
  const match = String(link).match(/\b(MLB-?\d{6,})\b/i);
  return match ? match[1].replace("-", "").toUpperCase() : "";
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const headers = {
    "user-agent": "TaBarato/1.0",
    "accept": "application/json",
  };
  if (process.env.MERCADOLIVRE_ACCESS_TOKEN && url.includes("mercadolibre.com")) {
    headers.authorization = `Bearer ${process.env.MERCADOLIVRE_ACCESS_TOKEN}`;
  }

  const response = await fetch(url, {
    signal: controller.signal,
    headers,
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) throw new Error(`API da loja respondeu com status ${response.status}.`);
  return response.json();
}

async function mercadoLivreDescription(itemId) {
  try {
    const data = await fetchJson(`https://api.mercadolibre.com/items/${itemId}/description`);
    return clean(data.plain_text || "");
  } catch {
    return "";
  }
}

async function mercadoLivreItemPreview(itemId, originalLink) {
  const item = await fetchJson(`https://api.mercadolibre.com/items/${itemId}`);
  const descriptionText = await mercadoLivreDescription(item.id);
  const picture = item.pictures?.[0]?.secure_url || item.pictures?.[0]?.url || item.thumbnail || "";
  return {
    productName: clean(item.title || ""),
    shortDescription: descriptionText || `Oferta encontrada no Mercado Livre: ${clean(item.title || "")}`,
    currentPrice: normalizePrice(item.price),
    previousPrice: normalizePrice(item.original_price || ""),
    imageUrl: picture ? String(picture).replace(/^http:/, "https:") : "",
    affiliateLink: originalLink,
    sourceProductId: item.id,
    platform: "Mercado Livre",
  };
}

async function mercadoLivrePreviewFromLink(link) {
  if (!process.env.MERCADOLIVRE_ACCESS_TOKEN) return null;

  const itemId = mercadoLivreItemIdFromLink(link);
  if (itemId) return mercadoLivreItemPreview(itemId, link);

  const query = mercadoLivreQueryFromLink(link);
  if (!query) return null;
  const search = await fetchJson(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=1`);
  const first = search.results?.[0];
  if (!first?.id) return null;
  return mercadoLivreItemPreview(first.id, link);
}

export async function fetchProductPreview(link) {
  await assertSafeProductUrl(link);

  if (isMercadoLivre(link)) {
    try {
      const product = await mercadoLivrePreviewFromLink(link);
      if (product?.productName && product?.currentPrice) return product;
    } catch {
      // Fall back to HTML extraction below.
    }
  }

  let html;
  let finalUrl;

  try {
    const page = await loadHtml(link);
    html = page.html;
    finalUrl = page.finalUrl;
  } catch (error) {
    if (!isMercadoLivre(link) || !String(error.message).includes("status 404")) throw error;
    const searchUrl = mercadoLivreSearchUrlFromBrokenLink(link);
    if (!searchUrl) throw error;
    const page = await loadHtml(searchUrl);
    html = page.html;
    finalUrl = page.finalUrl;
  }

  if (isMercadoLivre(finalUrl) && !isLikelyMercadoLivreProduct(finalUrl)) {
    const productUrl = firstMercadoLivreProductUrl(html, finalUrl);
    if (productUrl) {
      const productPage = await loadHtml(productUrl);
      html = productPage.html;
      finalUrl = productPage.finalUrl;
    }
  }

  const product = extractProduct(html, finalUrl, link);
  if (isGenericMercadoLivreResult(product, html, finalUrl)) {
    throw new Error("O Mercado Livre bloqueou a coleta automatica desse link. Para links de busca ou afiliados do Mercado Livre, configure MERCADOLIVRE_ACCESS_TOKEN na Vercel.");
  }
  if (isWeakGenericResult(product, html, finalUrl)) {
    throw new Error("Nao encontrei dados confiaveis de produto nesse link. Cole o link da pagina exata do produto.");
  }
  return product;
}
import { lookup } from "node:dns/promises";

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export function isPrivateAddress(address = "") {
  const value = String(address).toLowerCase().replace(/^\[|\]$/g, "");
  if (value.includes(":")) {
    if (value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(value)) return true;
    if (value.startsWith("::ffff:")) return isPrivateAddress(value.slice(7));
    return false;
  }

  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19));
}

export async function assertSafeProductUrl(link) {
  const url = new URL(link);
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:") throw new Error("O link do produto deve usar HTTPS.");
  if (url.username || url.password) throw new Error("O link do produto nao pode conter credenciais.");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || isPrivateAddress(hostname)) {
    throw new Error("O link do produto deve apontar para um endereco publico.");
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("O link do produto deve apontar para um endereco publico.");
  }
  return url;
}
