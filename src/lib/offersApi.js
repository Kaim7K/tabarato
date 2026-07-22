import { visitorId } from "@/lib/visitorAnalytics";
import { queryPath, requestJson } from "@/lib/httpClient";

const CACHE_TTL = 30_000;
const MAX_CACHE_ENTRIES = 80;
const responseCache = new Map();

function pruneResponseCache() {
  const now = Date.now();
  responseCache.forEach((entry, key) => {
    if (!entry.promise && entry.expiresAt <= now) responseCache.delete(key);
  });
  while (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey === undefined) break;
    responseCache.delete(oldestKey);
  }
}

async function cachedJson(path, fallbackMessage) {
  const cached = responseCache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached?.promise) return cached.promise;

  const promise = requestJson(path, { fallbackMessage })
    .then((payload) => {
      pruneResponseCache();
      responseCache.set(path, { value: payload, expiresAt: Date.now() + CACHE_TTL });
      return payload;
    })
    .catch((error) => {
      responseCache.delete(path);
      throw error;
    });

  pruneResponseCache();
  responseCache.set(path, { promise, expiresAt: 0 });
  return promise;
}

export async function listPublicOffers(params = {}) {
  const path = queryPath("/api/ofertas", params);
  const payload = await cachedJson(path, "Nao foi possivel carregar ofertas.");
  return payload.offers || [];
}

export async function listPublicOffersPage(params = {}) {
  return cachedJson(queryPath("/api/ofertas", params), "Nao foi possivel carregar ofertas.");
}

export async function listPublicCategories() {
  const payload = await cachedJson("/api/ofertas?resource=categories", "Nao foi possivel carregar categorias.");
  return payload.categories || [];
}

export async function listPublicCategoryHighlights() {
  const payload = await cachedJson("/api/ofertas?resource=category-highlights", "Nao foi possivel carregar categorias.");
  return { categories: payload.categories || [], offers: payload.offers || [] };
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
    credentials: "include",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, visitorId: visitorId() }),
  }).catch(() => {});
}
