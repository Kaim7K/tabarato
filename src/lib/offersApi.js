const CACHE_TTL = 30_000;
const responseCache = new Map();

async function cachedJson(path, fallbackMessage) {
  const cached = responseCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached?.promise) return cached.promise;

  const promise = fetch(path)
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || fallbackMessage);
      responseCache.set(path, { value: payload, expiresAt: Date.now() + CACHE_TTL });
      return payload;
    })
    .catch((error) => {
      responseCache.delete(path);
      throw error;
    });

  responseCache.set(path, { promise, expiresAt: 0 });
  return promise;
}

export async function listPublicOffers(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const path = `/api/ofertas${search.toString() ? `?${search}` : ""}`;
  const payload = await cachedJson(path, "Nao foi possivel carregar ofertas.");
  return payload.offers || [];
}

export async function listPublicOffersPage(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== "" && value != null) search.set(key, value);
  });
  return cachedJson(`/api/ofertas${search.toString() ? `?${search}` : ""}`, "Nao foi possivel carregar ofertas.");
}

export async function getPublicOffer(id) {
  const payload = await cachedJson(`/api/ofertas/${encodeURIComponent(id)}`, "Oferta nao encontrada.");
  return payload.offer;
}

export async function trackOfferClick(id) {
  trackOfferMetric(id, "click");
}

export async function trackOfferMetric(id, action) {
  fetch(`/api/ofertas/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  }).catch(() => {});
}
