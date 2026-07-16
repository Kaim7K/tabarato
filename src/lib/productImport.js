const metadataService = (url) => `https://api.microlink.io/?url=${encodeURIComponent(url)}`;

const pricePatterns = [
  /"price"\s*:\s*"?([0-9]+(?:[.,][0-9]{1,2})?)"?/i,
  /property=["']product:price:amount["'][^>]*content=["']([0-9]+(?:[.,][0-9]{1,2})?)["']/i,
  /R\$\s*([0-9.]+,[0-9]{2})/i,
];

const pickImage = (data) =>
  data?.image?.url ||
  data?.logo?.url ||
  data?.publisher?.logo?.url ||
  "";

const cleanTitle = (title = "") =>
  title
    .replace(/\s+[|-]\s+(Amazon|Mercado Livre|Shopee|Magalu|Magazine Luiza|AliExpress).*$/i, "")
    .trim();

const parsePrice = (value) => {
  if (value == null || value === "") return "";
  const normalized = String(value).replace(/\./g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? String(parsed.toFixed(2)) : "";
};

export async function importProductFromAffiliateLink(url) {
  const trimmed = url?.trim();
  if (!trimmed) throw new Error("Informe um link de afiliado.");

  try {
    new URL(trimmed);
  } catch {
    throw new Error("Informe uma URL válida.");
  }

  const microlinkUrl = metadataService(trimmed);
  const response = await fetch(microlinkUrl);
  if (!response.ok) throw new Error("Não foi possível ler os dados da loja.");

  const payload = await response.json();
  const data = payload?.data || {};
  const sourceText = JSON.stringify(data);
  const priceMatch = pricePatterns.map((pattern) => sourceText.match(pattern)?.[1]).find(Boolean);

  return {
    name: cleanTitle(data.title || ""),
    description: data.description || "",
    image: pickImage(data),
    price: parsePrice(data.price || data.amount || priceMatch),
    platform: data.publisher || new URL(trimmed).hostname.replace(/^www\./, ""),
  };
}
