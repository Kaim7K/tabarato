import { visitorId } from "@/lib/visitorAnalytics";

const CACHE_TTL = 30_000;
const MAX_CACHE_ENTRIES = 80;
const responseCache = new Map();

function remember(path, entry) {
  responseCache.delete(path);
  responseCache.set(path, entry);
  while (responseCache.size > MAX_CACHE_ENTRIES) {
    responseCache.delete(responseCache.keys().next().value);
  }
}

async function cachedJson(path, fallbackMessage, options = {}) {
  const now = Date.now();
  const cached = responseCache.get(path);
  if (cached?.value && cached.expiresAt > now) {
    remember(path, cached);
    return cached.value;
  }
  if (cached?.promise && !options.signal) return cached.promise;

  const promise = fetch(path, {
    signal: options.signal,
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || fallbackMessage);
      remember(path, { value: payload, expiresAt: Date.now() + (options.ttl || CACHE_TTL) });
      return payload;
    })
    .catch((error) => {
      if (responseCache.get(path)?.promise === promise) responseCache.delete(path);
      throw error;
    });

  if (!options.signal) remember(path, { promise, expiresAt: 0 });
  return promise;
}

function queryPath(params = {}, { includeTotal = false } = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== "" && value != null && value !== false) search.set(key, String(value));
  });
  if (!includeTotal) search.set("includeTotal", "0");
  return `/api/ofertas${search.toString() ? `?${search}` : ""}`;
}

export async function listPublicOffers(params = {}, options = {}) {
  const payload = await cachedJson(
    queryPath(params),
    "Nao foi possivel carregar ofertas.",
    options,
  );
  return payload.offers || [];
}

export async function listPublicOffersPage(params = {}, options = {}) {
  return cachedJson(
    queryPath(params, { includeTotal: true }),
    "Nao foi possivel carregar ofertas.",
    options,
  );
}

export async function listPublicOffersByIds(ids, options = {}) {
  const normalized = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))].slice(0, 100);
  if (!normalized.length) return [];
  return listPublicOffers({ ids: normalized.join(","), limit: normalized.length }, options);
}

export async function searchPublicOffers(query, options = {}) {
  const value = String(query || "").trim();
  if (value.length < 2) return [];
  return listPublicOffers({ search: value, limit: 6 }, options);
}

export async function listPublicCategories() {
  const payload = await cachedJson("/api/ofertas?resource=categories", "Nao foi possivel carregar categorias.", { ttl: 5 * 60_000 });
  return payload.categories || [];
}

export async function listPublicCategoryHighlights() {
  const payload = await cachedJson("/api/ofertas?resource=category-highlights", "Nao foi possivel carregar categorias.");
  return { categories: payload.categories || [], offers: payload.offers || [] };
}

export async function getPublicOffer(id, options = {}) {
  const payload = await cachedJson(`/api/ofertas/${encodeURIComponent(id)}`, "Oferta nao encontrada.", options);
  return payload.offer;
}

export function trackOfferClick(id) {
  trackOfferMetric(id, "click");
}

export function trackOfferMetric(id, action) {
  fetch(`/api/ofertas/${encodeURIComponent(id)}`, {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, visitorId: visitorId() }),
  }).catch(() => {});
}
