(() => {
  if (globalThis.TaBaratoBatchUtils) return;

  const trackingParameter = /^(?:utm_.+|matt_.+|polycard_.+|reco_.+|searchvariation|position|tracking_id|source|source_page|ref|referrer|campaign|ad_id)$/i;

  const routeDetails = (value, storeId = "generic") => {
    try {
      const url = new URL(String(value || "").trim());
      if (!/^https?:$/.test(url.protocol)) return null;
      url.hash = "";

      if (storeId === "mercado-livre") {
        if (!/mercadolivre|mercadolibre/i.test(url.hostname)) return null;
        const itemId = url.href.match(/(?:^|[/?-])(MLB-?\d{6,})(?:$|[/?#-])/i)?.[1]?.replace("-", "").toUpperCase();
        if (!itemId) return null;
        url.search = "";
        return {
          key: `mercado-livre:${itemId}`,
          url: url.href,
          platform: "Mercado Livre",
          sourceProductId: itemId,
        };
      }

      if (storeId === "shopee") {
        if (!/(?:^|\.)shopee\.com\.br$/i.test(url.hostname)) return null;
        const ids = url.pathname.match(/-i\.(\d+)\.(\d+)/i)
          || url.pathname.match(/\/product\/(\d+)\/(\d+)/i);
        if (!ids) return null;
        url.search = "";
        return {
          key: `shopee:${ids[1]}.${ids[2]}`,
          url: url.href,
          platform: "Shopee",
          sourceProductId: `${ids[1]}.${ids[2]}`,
        };
      }

      [...url.searchParams.keys()].forEach((key) => {
        if (trackingParameter.test(key)) url.searchParams.delete(key);
      });
      return {
        key: `${url.hostname}${url.pathname}${url.search}`,
        url: url.href,
        platform: "",
        sourceProductId: "",
      };
    } catch {
      return null;
    }
  };

  const productIdentityFromUrl = (value, storeId = "") => {
    const inferredStoreId = storeId || (/mercadolivre|mercadolibre/i.test(String(value || ""))
      ? "mercado-livre"
      : /shopee/i.test(String(value || ""))
        ? "shopee"
        : "generic");
    return routeDetails(value, inferredStoreId);
  };

  const normalizeProductUrls = (values, storeId, limit = 20) => {
    const routes = new Map();
    for (const value of Array.isArray(values) ? values : []) {
      const route = routeDetails(value, storeId);
      if (route && !routes.has(route.key)) routes.set(route.key, route.url);
      if (routes.size >= limit) break;
    }
    return [...routes.values()];
  };


  const chunkValues = (values, size = 5) => {
    const normalizedSize = Math.max(1, Math.min(10, Number(size) || 5));
    const source = Array.isArray(values) ? values : [];
    const chunks = [];
    for (let index = 0; index < source.length; index += normalizedSize) {
      chunks.push(source.slice(index, index + normalizedSize));
    }
    return chunks;
  };

  const reviewProduct = (product, minimumConfidence, parsePrice) => {
    const reasons = [];
    const validHttpsUrl = (value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    };
    if (String(product?.productName || "").trim().length < 4) reasons.push("nome");
    if (!(parsePrice(product?.currentPrice) > 0)) reasons.push("preco");
    if (!validHttpsUrl(product?.imageUrl || product?.imageCandidates?.[0]?.url)) reasons.push("imagem");
    if (product?.platform === "Mercado Livre") {
      if (!/^https:\/\/(?:www\.)?meli\.la\/[A-Za-z0-9_-]+/i.test(product?.affiliateLink || "")) reasons.push("link afiliado meli.la");
    } else if (!validHttpsUrl(product?.affiliateLink)) reasons.push("link de afiliado");
    if (Number(product?.confidence || 0) < minimumConfidence) reasons.push("confianca");
    return [...new Set(reasons)];
  };

  globalThis.TaBaratoBatchUtils = {
    chunkValues,
    normalizeProductUrls,
    productIdentityFromUrl,
    reviewProduct,
  };
})();
