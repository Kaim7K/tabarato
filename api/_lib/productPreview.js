function clean(value = "") {
  return decodeEntities(String(value).replace(/\s+/g, " ").trim());
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, " ")
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

function priceFromProduct(product) {
  const offers = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  return offers?.price || offers?.lowPrice || product?.price || "";
}

function priceFromHtml(html) {
  const candidates = [
    meta(html, "product:price:amount"),
    meta(html, "og:price:amount"),
    html.match(/"price"\s*:\s*"?([0-9]+(?:[.,][0-9]{1,2})?)"?/i)?.[1],
    html.match(/R\$\s*([0-9.]+,[0-9]{2})/i)?.[1],
  ].filter(Boolean);
  return normalizePrice(candidates[0] || "");
}

function normalizePrice(value) {
  if (!value) return "";
  const text = String(value).replace(/[^\d.,]/g, "");
  if (!text) return "";
  if (text.includes(",")) return text.replace(/\./g, "").replace(",", ".");
  return text;
}

function platformFromUrl(url) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (host.includes("mercadolivre") || host.includes("mercadolibre")) return "Mercado Livre";
  if (host.includes("shopee")) return "Shopee";
  if (host.includes("amazon")) return "Amazon";
  return "Outra";
}

export async function fetchProductPreview(link) {
  const url = new URL(link);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Link invalido.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const response = await fetch(url, {
    redirect: "follow",
    signal: controller.signal,
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; TaBaratoBot/1.0; +https://tabaratoofertas.vercel.app)",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "pt-BR,pt;q=0.9,en;q=0.7",
    },
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) throw new Error(`A loja respondeu com status ${response.status}.`);

  const html = await response.text();
  const products = jsonLdProducts(html);
  const product = products[0] || {};
  const productImage = Array.isArray(product.image) ? product.image[0] : product.image;

  return {
    productName: clean(product.name || title(html)),
    shortDescription: clean(product.description || description(html)),
    currentPrice: normalizePrice(priceFromProduct(product)) || priceFromHtml(html),
    imageUrl: productImage ? new URL(productImage, response.url).toString() : image(html, response.url),
    affiliateLink: link,
    platform: platformFromUrl(response.url || link),
  };
}
