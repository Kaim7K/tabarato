(() => {
  const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();

  const text = (...selectors) => {
    for (const selector of selectors) {
      const value = clean(document.querySelector(selector)?.textContent);
      if (value) return value;
    }
    return "";
  };

  const attribute = (name, ...selectors) => {
    for (const selector of selectors) {
      const value = clean(document.querySelector(selector)?.getAttribute(name));
      if (value) return value;
    }
    return "";
  };

  const meta = (name) => clean(
    document.querySelector(`meta[property="${name}"]`)?.content
      || document.querySelector(`meta[name="${name}"]`)?.content
  );

  const normalizePrice = (value = "") => {
    const raw = clean(value).replace(/[^\d,.]/g, "");
    if (!raw) return "";
    const comma = raw.lastIndexOf(",");
    const dot = raw.lastIndexOf(".");
    const separator = Math.max(comma, dot);
    if (separator < 0) return raw;
    const decimals = raw.slice(separator + 1);
    const integer = raw.slice(0, separator).replace(/[.,]/g, "");
    return decimals.length === 2 ? `${integer}.${decimals}` : `${integer}${decimals}`;
  };

  const price = (...selectors) => {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const fraction = clean(element.querySelector(".andes-money-amount__fraction")?.textContent);
      const cents = clean(element.querySelector(".andes-money-amount__cents")?.textContent);
      const value = fraction ? `${fraction}${cents ? `,${cents}` : ""}` : element.textContent;
      const normalized = normalizePrice(value);
      if (normalized) return normalized;
    }
    return "";
  };

  const jsonProduct = () => {
    const products = [];
    const visit = (value) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) return value.forEach(visit);
      const type = value["@type"];
      if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) products.push(value);
      Object.values(value).forEach(visit);
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try { visit(JSON.parse(script.textContent)); } catch { /* Ignore invalid store metadata. */ }
    });
    return products.find((item) => item.name) || {};
  };

  const productPrice = (product) => {
    const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
    return normalizePrice(offer?.price || offer?.lowPrice || product?.price || "");
  };

  const productImage = (product) => {
    const value = Array.isArray(product?.image) ? product.image[0] : product?.image;
    if (typeof value === "string") return value;
    return value?.url || value?.contentUrl || "";
  };

  const bestImage = (...selectors) => {
    const metadata = meta("og:image") || meta("twitter:image");
    if (metadata) return metadata;
    for (const selector of selectors) {
      const image = [...document.querySelectorAll(selector)].find((item) => item.currentSrc || item.src);
      if (image) return image.currentSrc || image.src;
    }
    return "";
  };

  const coupon = (...selectors) => {
    for (const selector of selectors) {
      const candidates = [...document.querySelectorAll(selector)];
      for (const candidate of candidates) {
        const value = clean(candidate.value || candidate.textContent);
        const match = value.match(/(?:cupom|coupon|c[oó]digo)\s*[:\-]?\s*([A-Z0-9_-]{4,30})/i);
        if (match) return match[1].toUpperCase();
      }
    }
    return "";
  };

  const candidateUrls = () => {
    const candidates = [location.href];
    document.querySelectorAll("input, textarea, a[href]").forEach((element) => {
      candidates.push(element.value || element.href || "");
    });
    return candidates.flatMap((value) => clean(value).match(/https:\/\/[^\s"'<>]+/gi) || []);
  };

  const findAffiliateLink = (pattern) => candidateUrls().find((value) => pattern.test(value)) || "";

  const affiliateLink = () => {
    const affiliatePattern = /(?:meli\.la|amzn\.to|shope\.ee|s\.shopee\.|[?&](?:tag|ascsubtag|matt_tool|matt_word|matt_source|affiliate_id|aff_id|utm_source)=)/i;
    return findAffiliateLink(affiliatePattern) || location.href;
  };

  const waitFor = async (read, timeout = 7000) => {
    const startedAt = Date.now();
    let value = read();
    while (!value && Date.now() - startedAt < timeout) {
      await new Promise((resolve) => window.setTimeout(resolve, 150));
      value = read();
    }
    return value || "";
  };

  const canonicalUrl = () => attribute("href", 'link[rel="canonical"]') || location.href;

  globalThis.TaBaratoCapture = {
    attribute,
    affiliateLink,
    bestImage,
    canonicalUrl,
    clean,
    coupon,
    findAffiliateLink,
    jsonProduct,
    meta,
    normalizePrice,
    price,
    productImage,
    productPrice,
    text,
    waitFor,
  };
  globalThis.TaBaratoStores = [];
})();
