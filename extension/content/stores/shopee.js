(() => {
  const tools = globalThis.TaBaratoCapture;
  if (!tools || globalThis.TaBaratoStores?.some((store) => store.id === "shopee")) return;

  const listProducts = (limit = 20) => {
    const products = new Map();
    tools.productLinks([/-i\.\d+\.\d+/i, /\/product\/\d+\/\d+/i]).forEach((url) => {
      const ids = new URL(url).pathname.match(/-i\.(\d+)\.(\d+)/i)
        || new URL(url).pathname.match(/\/product\/(\d+)\/(\d+)/i);
      if (ids && !products.has(`${ids[1]}.${ids[2]}`)) products.set(`${ids[1]}.${ids[2]}`, url);
    });
    return [...products.values()].slice(0, limit);
  };

  const parseAmount = (value) => {
    const numeric = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(numeric) || numeric <= 0) return "";
    const normalized = numeric >= 100000 ? numeric / 100000 : numeric;
    return normalized > 0 && normalized < 10000000 ? normalized.toFixed(2).replace(/\.00$/, "") : "";
  };

  const scriptPriceValues = () => {
    const result = { current: [], previous: [] };
    const patterns = [
      [/(?:"|')?(?:price_before_discount|price_min_before_discount|price_max_before_discount)(?:"|')?\s*:\s*(\d+(?:\.\d+)?)/gi, "previous"],
      [/(?:"|')?(?:price_min|price_max|price)(?:"|')?\s*:\s*(\d+(?:\.\d+)?)/gi, "current"],
    ];
    [...document.scripts].forEach((script) => {
      const text = script.textContent || "";
      if (!/price_before_discount|price_min|price_max/i.test(text)) return;
      patterns.forEach(([pattern, bucket]) => {
        let match;
        let count = 0;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(text)) && count < 20) {
          const amount = parseAmount(match[1]);
          if (amount) result[bucket].push(amount);
          count += 1;
        }
      });
    });
    return result;
  };

  const visiblePriceCandidates = () => [...document.querySelectorAll("main span, main div")]
    .filter((element) => tools.visible(element))
    .map((element) => {
      const text = tools.clean(element.textContent);
      if (!text || text.length > 70 || !/R\$\s*[\d.]+(?:,\d{1,2})?/.test(text)) return null;
      const style = getComputedStyle(element);
      const className = String(element.className || "");
      const context = tools.clean(`${className} ${element.parentElement?.textContent || ""}`);
      const value = tools.priceText ? tools.priceText(element) : text;
      const amount = tools.price(...[]) || "";
      const match = text.match(/R\$\s*([\d.]+(?:,\d{1,2})?)/);
      return {
        value: match ? match[1].replace(/\./g, "").replace(",", ".") : amount || value,
        previous: /line-through/i.test(style.textDecorationLine) || /original|before|old|discount/i.test(context),
        context,
      };
    })
    .filter((item) => item?.value);

  const visibleDiscountPercent = () => {
    const values = [...document.querySelectorAll("main span, main div")]
      .filter((element) => tools.visible(element))
      .map((element) => tools.clean(element.textContent).match(/-\s*(\d{1,2})%/))
      .filter(Boolean)
      .map((match) => Number(match[1]))
      .filter((value) => value > 0 && value < 95);
    return values.length ? Math.max(...values) : 0;
  };

  const explicitOldPriceValues = () => [...document.querySelectorAll("main del, main s, main [style*='line-through'], main [class*='price-before' i], main [class*='price-original' i], main [class*='original-price' i]")]
    .filter((element) => tools.visible(element))
    .map((element) => tools.clean(element.textContent).match(/R\$\s*([\d.]+(?:,\d{1,2})?)/))
    .filter(Boolean)
    .map((match) => Number(match[1].replace(/\./g, "").replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);

  const previousPrice = (currentPrice) => {
    const current = Number(currentPrice);
    if (!Number.isFinite(current) || current <= 0) return "";
    const explicit = explicitOldPriceValues().filter((value) => value > current);
    const dom = visiblePriceCandidates()
      .filter((item) => item.previous && Number(item.value) > current)
      .map((item) => Number(item.value));
    const scripts = scriptPriceValues().previous.map(Number).filter((value) => value > current && value < current * 10);
    const values = [...explicit, ...dom, ...scripts].filter((value) => Number.isFinite(value));
    if (values.length) return String(Math.min(...values));
    const discount = visibleDiscountPercent();
    if (discount) {
      const inferred = current / (1 - discount / 100);
      if (inferred > current && inferred < current * 10) return inferred.toFixed(2);
    }
    return "";
  };

  const breadcrumb = () => {
    const roots = document.querySelectorAll("nav[aria-label*='breadcrumb' i], [data-testid*='breadcrumb' i], main [class*='breadcrumb' i]");
    for (const root of roots) {
      const parts = [...root.querySelectorAll("a, span")]
        .map((item) => tools.clean(item.textContent))
        .filter((item) => item && !/^voltar$/i.test(item));
      if (parts.length) return [...new Set(parts)].join(" > ");
    }
    return "";
  };

  const validAffiliateLink = (value = "") => {
    try {
      const url = new URL(value);
      if (/careers|about/i.test(`${url.hostname}${url.pathname}`)) return false;
      return /^(?:s\.)?shopee\.(?:com\.br|ee)$/i.test(url.hostname)
        && (/^s\.shopee\./i.test(url.hostname) || /shopee\.ee$/i.test(url.hostname) || /(?:af_siteid|affiliate_id|aff_id|utm_source)/i.test(url.search));
    } catch { return false; }
  };

  const hasVideoContext = (image) => {
    const container = image?.closest?.("[class*='video' i], [data-testid*='video' i], [aria-label*='video' i], [aria-label*='vídeo' i], video") || image?.parentElement;
    if (!container) return false;
    const context = tools.clean(`${container.className || ""} ${container.getAttribute?.("aria-label") || ""} ${container.textContent || ""}`);
    return /video|vídeo|play|reproduzir|assistir/i.test(context)
      || Boolean(container.querySelector?.("video, [class*='play' i], [data-testid*='play' i], svg[aria-label*='play' i]"));
  };

  const galleryImageCandidates = () => {
    const result = [];
    const selectors = [
      "main img[src*='susercontent.com']",
      "main img[src*='shopeeusercontent.com']",
      "main [class*='thumbnail' i] img",
      "main [class*='product'] [class*='image'] img",
    ];
    selectors.forEach((selector, selectorIndex) => {
      document.querySelectorAll(selector).forEach((image, index) => {
        if (hasVideoContext(image)) return;
        const url = image.currentSrc || image.src || image.getAttribute("data-src") || "";
        if (!tools.isSafeProductImageUrl(url)) return;
        const rect = image.getBoundingClientRect();
        const score = 150 - selectorIndex * 12 - index + Math.min(30, Math.round((rect.width * rect.height) / 10000));
        if (!result.some((item) => item.url === url)) result.push({ url, score, reason: `shopee-gallery:${selector}` });
      });
    });
    return result;
  };

  const imageCandidates = (structured) => {
    const structuredCandidates = tools.productImages(structured)
      .filter((url) => tools.isSafeProductImageUrl(url))
      .map((url, index) => ({ url, score: 120 - index, reason: "structured-product-image" }));
    const candidates = [
      ...galleryImageCandidates(),
      ...structuredCandidates,
      ...tools.imageCandidates(
        "main [data-testid*='product-image' i] img",
        "main [class*='product'] [class*='image'] img"
      ),
    ];
    return candidates
      .filter((item) => tools.isSafeProductImageUrl(item.url))
      .filter((item) => !/(?:video|play|stream|reel|poster)/i.test(`${item.url} ${item.reason || ""}`))
      .filter((item, index, list) => list.findIndex((candidate) => candidate.url === item.url) === index)
      .sort((left, right) => right.score - left.score);
  };

  globalThis.TaBaratoStores.push({
    id: "shopee",
    platform: "Shopee",
    matches: () => /shopee\.com\.br$/i.test(location.hostname),
    isProduct: () => /-i\.\d+\.\d+/i.test(location.pathname)
      || /\/product\/\d+\/\d+/i.test(location.pathname)
      || Boolean(document.querySelector("[data-testid='pdp-product-title'], main h1")),
    listProducts,
    extract: async () => {
      const structured = tools.jsonProduct();
      const ids = location.pathname.match(/-i\.(\d+)\.(\d+)/i)
        || location.pathname.match(/\/product\/(\d+)\/(\d+)/i);
      const priceInfo = tools.priceDetails(
        "[data-testid='pdp-product-price']",
        "main [class*='price']",
        "main [aria-label*='preço' i]"
      );
      const structuredPrice = tools.productPrice(structured);
      const scriptPrices = scriptPriceValues().current.map(Number).filter((value) => value > 0);
      const basePrice = priceInfo.value || structuredPrice || (scriptPrices.length ? String(Math.min(...scriptPrices)) : "");
      // Cupons da Shopee variam por conta, loja, variante e resgate. Para evitar
      // códigos falsos ou textos cortados, a captura automática não os anuncia.
      const coupon = "";
      const candidates = imageCandidates(structured);
      const foundAffiliate = tools.affiliateLink();
      const affiliateLink = validAffiliateLink(foundAffiliate) ? foundAffiliate : "";
      const product = {
        productName: tools.text("[data-testid='pdp-product-title']", "main h1", "h1") || tools.clean(structured.name) || tools.meta("og:title"),
        shortDescription: tools.description("[data-testid='pdp-product-description']", "[class*='product-detail']") || tools.firstUsefulParagraph(structured.description) || tools.firstUsefulParagraph(tools.meta("og:description")),
        sourceCategory: breadcrumb(),
        currentPrice: basePrice,
        previousPrice: previousPrice(basePrice),
        regularPrice: basePrice,
        coupon,
        couponStatus: coupon ? "code" : "none",
        extraText: tools.commerceBenefits(document.body.innerText),
        imageUrl: candidates[0]?.url || "",
        imageCandidates: candidates,
        affiliateLink,
        affiliateLinkType: affiliateLink ? "shopee-generated" : "pending-panel",
        sourceUrl: tools.canonicalUrl(),
        externalProductId: ids ? `${ids[1]}.${ids[2]}` : "",
        platform: "Shopee",
        pricePaymentMethod: priceInfo.method,
        captureStage: affiliateLink ? "complete" : "awaiting-affiliate-link",
        confidence: 0,
      };
      const required = [product.productName, product.currentPrice, product.imageUrl, product.externalProductId];
      product.confidence = required.filter(Boolean).length / required.length;
      await tools.closeTransientDialogs();
      return product;
    },
  });
})();
