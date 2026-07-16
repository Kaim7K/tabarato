const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

const decodeHtml = (value = "") =>
  String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const stripHtml = (value = "") => decodeHtml(String(value).replace(/<[^>]+>/g, " "));

const getMeta = (html, names) => {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeHtml(match[1]);
    }
  }
  return "";
};

const getTitle = (html) => {
  const metaTitle = getMeta(html, ["og:title", "twitter:title", "title"]);
  if (metaTitle) return metaTitle;
  return decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
};

const getJsonLdObjects = (html) => {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  return scripts.flatMap((match) => {
    try {
      const parsed = JSON.parse(stripHtml(match[1]));
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  });
};

const flattenJsonLd = (items) => {
  const out = [];
  const visit = (item) => {
    if (!item || typeof item !== "object") return;
    out.push(item);
    if (Array.isArray(item["@graph"])) item["@graph"].forEach(visit);
    if (Array.isArray(item.itemListElement)) item.itemListElement.forEach((entry) => visit(entry.item || entry));
  };
  items.forEach(visit);
  return out;
};

const isProduct = (item) => {
  const type = item?.["@type"];
  return Array.isArray(type) ? type.some((t) => String(t).toLowerCase() === "product") : String(type || "").toLowerCase() === "product";
};

const pickImage = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return pickImage(value[0]);
  return value.url || value.contentUrl || "";
};

const pickOffer = (offers) => {
  if (!offers) return {};
  if (Array.isArray(offers)) return offers[0] || {};
  return offers;
};

const parsePrice = (value) => {
  if (value == null || value === "") return "";
  const text = String(value).trim();
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "";
};

const findPrice = (html, product) => {
  const offer = pickOffer(product?.offers);
  const candidates = [
    offer.price,
    offer.lowPrice,
    product?.price,
    getMeta(html, ["product:price:amount", "og:price:amount", "twitter:data1"]),
    html.match(/"price"\s*:\s*"?([0-9]+(?:[.,][0-9]{1,2})?)"?/i)?.[1],
    html.match(/R\$\s*([0-9.]+,[0-9]{2})/i)?.[1],
  ];
  return parsePrice(candidates.find(Boolean));
};

const cleanTitle = (title = "") =>
  decodeHtml(title)
    .replace(/\s+[|-]\s+(Amazon|Mercado Livre|Shopee|Magalu|Magazine Luiza|AliExpress|Americanas).*$/i, "")
    .trim();

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método não permitido." });
  }

  const rawUrl = req.query.url;
  let target;

  try {
    target = new URL(Array.isArray(rawUrl) ? rawUrl[0] : rawUrl);
  } catch {
    return res.status(400).json({ error: "Informe uma URL válida." });
  }

  if (!["http:", "https:"].includes(target.protocol) || BLOCKED_HOSTS.has(target.hostname)) {
    return res.status(400).json({ error: "URL não permitida." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(target.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "pt-BR,pt;q=0.9,en;q=0.7",
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: `A loja respondeu com status ${response.status}.` });
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return res.status(415).json({ error: "O link não retornou uma página HTML de produto." });
    }

    const html = await response.text();
    const jsonLd = flattenJsonLd(getJsonLdObjects(html));
    const product = jsonLd.find(isProduct) || {};
    const description = product.description || getMeta(html, ["og:description", "twitter:description", "description"]);
    const image = pickImage(product.image) || getMeta(html, ["og:image", "twitter:image", "image"]);

    return res.status(200).json({
      name: cleanTitle(product.name || getTitle(html)),
      description: stripHtml(description),
      image,
      price: findPrice(html, product),
      platform: cleanTitle(getMeta(html, ["og:site_name", "application-name"]) || target.hostname.replace(/^www\./, "")),
      sourceUrl: response.url || target.toString(),
    });
  } catch (error) {
    const aborted = error?.name === "AbortError";
    return res.status(aborted ? 504 : 500).json({
      error: aborted ? "A loja demorou para responder. Tente novamente ou preencha manualmente." : "Não foi possível importar os dados desse link.",
    });
  } finally {
    clearTimeout(timeout);
  }
}
