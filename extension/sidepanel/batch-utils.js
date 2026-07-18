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
        return { key: `mercado-livre:${itemId}`, url: url.href };
      }

      if (storeId === "shopee") {
        if (!/(?:^|\.)shopee\.com\.br$/i.test(url.hostname)) return null;
        const ids = url.pathname.match(/-i\.(\d+)\.(\d+)/i)
          || url.pathname.match(/\/product\/(\d+)\/(\d+)/i);
        if (!ids) return null;
        url.search = "";
        return { key: `shopee:${ids[1]}.${ids[2]}`, url: url.href };
      }

      [...url.searchParams.keys()].forEach((key) => {
        if (trackingParameter.test(key)) url.searchParams.delete(key);
      });
      return { key: `${url.hostname}${url.pathname}${url.search}`, url: url.href };
    } catch {
      return null;
    }
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
    normalizeProductUrls,
    reviewProduct,
  };
})();
