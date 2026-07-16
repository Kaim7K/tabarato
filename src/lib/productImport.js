export async function importProductFromAffiliateLink(url) {
  const trimmed = url?.trim();
  if (!trimmed) throw new Error("Informe um link de afiliado.");

  try {
    new URL(trimmed);
  } catch {
    throw new Error("Informe uma URL válida.");
  }

  const response = await fetch(`/api/import-product?url=${encodeURIComponent(trimmed)}`);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Não foi possível ler os dados da loja.");
  }

  return {
    name: payload.name || "",
    description: payload.description || "",
    image: payload.image || "",
    price: payload.price || "",
    platform: payload.platform || new URL(trimmed).hostname.replace(/^www\./, ""),
  };
}
