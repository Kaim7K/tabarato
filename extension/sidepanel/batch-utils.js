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
      const sortedParameters = [...url.searchParams.entries()].sort(([leftKey, leftValue], [rightKey, rightValue]) => (
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
      ));
      url.search = "";
      for (const [key, value] of sortedParameters) url.searchParams.append(key, value);
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

  const validShopeeAffiliateLink = (value, sourceProductId = "") => {
    try {
      const url = new URL(value);
      if (!/^(?:s\.)?shopee\.(?:com\.br|ee)$/i.test(url.hostname)) return false;
      if (/careers|about|seller|m\/web|buyer\/login/i.test(`${url.hostname}${url.pathname}`)) return false;
      const hasAffiliateMarker = /(?:af_siteid|af_sub_siteid|affiliate_id|aff_id|utm_source)/i.test(url.search)
        || /^s\.shopee\./i.test(url.hostname)
        || /shopee\.ee$/i.test(url.hostname);
      if (!hasAffiliateMarker) return false;
      if (sourceProductId && /shopee\.com\.br$/i.test(url.hostname)) {
        const [shopId, itemId] = String(sourceProductId).split(".");
        if (shopId && itemId && !url.href.includes(shopId) && !url.href.includes(itemId)) return false;
      }
      return true;
    } catch { return false; }
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
    } else if (product?.platform === "Shopee") {
      if (!validShopeeAffiliateLink(product?.affiliateLink, product?.externalProductId || product?.sourceProductId)) reasons.push("link afiliado Shopee");
    } else if (!validHttpsUrl(product?.affiliateLink)) reasons.push("link de afiliado");
    if (Number(product?.confidence || 0) < minimumConfidence) reasons.push("confianca");
    return [...new Set(reasons)];
  };

  const intelligenceScore = (product, parsePrice, now = Date.now()) => {
    const evidence = product?.intelligenceEvidence || {};
    const current = parsePrice(product?.currentPrice);
    const previous = parsePrice(product?.previousPrice || product?.regularPrice);
    const discount = previous > current && current > 0 ? ((previous - current) / previous) * 100 : 0;
    const urgency = evidence.endsAt && new Date(evidence.endsAt).getTime() - now < 6 * 3600000 ? 20 : 0;
    return Math.round(discount * 2 + (Number(evidence.rating || 0) >= 4.5 ? 12 : 0) + (Number(evidence.soldCount || 0) >= 1000 ? 10 : 0) + urgency);
  };

  globalThis.TaBaratoBatchUtils = {
    chunkValues,
    intelligenceScore,
    normalizeProductUrls,
    productIdentityFromUrl,
    reviewProduct,
    validShopeeAffiliateLink,
  };
})();
