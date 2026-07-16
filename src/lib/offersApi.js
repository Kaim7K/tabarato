export async function listPublicOffers(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const response = await fetch(`/api/ofertas${search.toString() ? `?${search}` : ""}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Não foi possível carregar ofertas.");
  return payload.offers || [];
}

export async function getPublicOffer(id) {
  const response = await fetch(`/api/ofertas/${id}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Oferta não encontrada.");
  return payload.offer;
}

export async function trackOfferClick(id) {
  fetch(`/api/ofertas/${id}`, { method: "POST" }).catch(() => {});
}

