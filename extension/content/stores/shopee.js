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

  const productIdentity = () => {
    const match = location.pathname.match(/-i\.(\d+)\.(\d+)/i)
      || location.pathname.match(/\/product\/(\d+)\/(\d+)/i);
    return match ? { shopId: match[1], itemId: match[2] } : null;
  };

  const productRoot = () => {
    const title = document.querySelector("[data-testid='pdp-product-title'], main h1, h1");
    return title?.closest(".product-briefing, [data-testid*='pdp' i], main, [role='main']")
      || document.querySelector(".product-briefing, [data-testid*='pdp' i], main, [role='main']")
      || document.body;
  };

  const inProductRoot = (element) => Boolean(element && productRoot()?.contains(element));

  const scriptPriceValues = () => {
    const result = { current: [], previous: [] };
    const identity = productIdentity();
    const patterns = [
      [/(?:"|')?(?:price_before_discount|price_min_before_discount|price_max_before_discount)(?:"|')?\s*:\s*(\d+(?:\.\d+)?)/gi, "previous"],
      [/(?:"|')?(?:price_min|price_max|price)(?:"|')?\s*:\s*(\d+(?:\.\d+)?)/gi, "current"],
    ];
    [...document.scripts].forEach((script) => {
      const text = script.textContent || "";
      if (!/price_before_discount|price_min|price_max/i.test(text)) return;
      if (identity && !text.includes(identity.itemId) && !text.includes(identity.shopId)) return;
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

  const visiblePriceCandidates = () => [...productRoot().querySelectorAll("span, div")]
    .filter(inProductRoot)
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
    const values = [...productRoot().querySelectorAll("span, div")]
      .filter(inProductRoot)
      .filter((element) => tools.visible(element))
      .map((element) => tools.clean(element.textContent).match(/-\s*(\d{1,2})%/))
      .filter(Boolean)
      .map((match) => Number(match[1]))
      .filter((value) => value > 0 && value < 95);
    return values.length ? Math.max(...values) : 0;
  };

  const explicitOldPriceValues = () => [...productRoot().querySelectorAll("del, s, [style*='line-through'], [class*='price-before' i], [class*='price-original' i], [class*='original-price' i], [class*='price--original' i]")]
    .filter(inProductRoot)
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
    // Shopee frequently renders the old price beside the current value without a stable class.
    // Read all visible BRL amounts in the main product area and only accept a plausible larger price.
    const nearby = visiblePriceCandidates()
      .map((item) => Number(item.value))
      .filter((value) => Number.isFinite(value) && value > current && value < current * 4)
      .sort((a, b) => a - b);
    if (nearby.length) return String(nearby[0]);
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


  const ratingValue = () => {
    const selectors = [
      "[data-testid*='rating' i]",
      "[class*='rating' i]",
      "[aria-label*='avalia' i]",
      "[aria-label*='rating' i]",
      "main a[href*='ratingFilter']",
    ];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (!tools.visible(element)) continue;
        const text = tools.clean(`${element.getAttribute?.("aria-label") || ""} ${element.textContent || ""}`);
        const match = text.match(/(?:nota|avaliacao|avaliação|rating)?\s*([0-5](?:[.,]\d{1,2})?)(?:\s*de\s*5)?/i);
        const value = match ? Number(match[1].replace(",", ".")) : 0;
        if (value >= 1 && value <= 5) return value;
      }
    }
    const topText = tools.clean(document.querySelector("main")?.innerText || document.body?.innerText || "").slice(0, 5000);
    const fallback = topText.match(/\b([4-5](?:[.,]\d{1,2})?)\s*(?:avaliacoes|avaliações|estrelas|\()/i);
    const value = fallback ? Number(fallback[1].replace(",", ".")) : 0;
    return value >= 1 && value <= 5 ? value : 0;
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


  const bestInstallment = (root = document) => {
    const text = tools.clean(root?.innerText || root?.textContent || "");
    const matches = [...text.matchAll(/\b(\d{1,2})x\s*(?:de\s*)?R\$\s*([\d.]+(?:,\d{1,2})?)\s*sem\s+juros\b/gi)]
      .map((match) => ({ count: Number(match[1]), text: `${match[1]}x de R$ ${match[2]} sem juros.` }))
      .sort((a, b) => b.count - a.count);
    return matches[0]?.text || "";
  };

  const installmentBenefits = async () => {
    let installment = bestInstallment(productRoot());
    if (!installment) {
      const controls = [...document.querySelectorAll("button, a, [role='button']")]
        .filter((element) => tools.visible(element))
        .filter((element) => /op[cç][oõ]es de parcelamento|parcelamento|formas de pagamento/i.test(tools.clean(element.textContent)));
      const control = controls[0];
      if (control) {
        control.click();
        const dialog = await tools.waitFor(() => [...document.querySelectorAll("[role='dialog'], [class*='modal' i]")]
          .find((element) => tools.visible(element) && /parcelamento|sem juros/i.test(tools.clean(element.textContent))) || "", 3000);
        if (dialog) installment = bestInstallment(dialog);
        const close = dialog && [...dialog.querySelectorAll("button, [role='button']")]
          .find((element) => /fechar|close|×/i.test(`${element.getAttribute("aria-label") || ""} ${element.textContent || ""}`));
        close?.click?.();
      }
    }
    const base = tools.commerceBenefits(productRoot().innerText || "");
    return [...new Set([installment, base].filter(Boolean))].join(" ");
  };

  globalThis.TaBaratoStores.push({
    id: "shopee",
    platform: "Shopee",
    matches: () => /shopee\.com\.br$/i.test(location.hostname) && location.hostname !== "affiliate.shopee.com.br",
    isProduct: () => globalThis.TaBaratoPageContext?.routeFor?.() === "product"
      || /-i\.\d+\.\d+/i.test(location.pathname)
      || /\/product\/\d+\/\d+/i.test(location.pathname),
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
      const oldPrice = previousPrice(basePrice);
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
        previousPrice: oldPrice,
        regularPrice: oldPrice || basePrice,
        coupon,
        couponStatus: coupon ? "code" : "none",
        extraText: await installmentBenefits(),
        imageUrl: candidates[0]?.url || "",
        imageCandidates: candidates,
        affiliateLink,
        affiliateLinkType: affiliateLink ? "shopee-generated" : "pending-panel",
        sourceUrl: tools.canonicalUrl(),
        externalProductId: ids ? `${ids[1]}.${ids[2]}` : "",
        platform: "Shopee",
        pricePaymentMethod: priceInfo.method,
        captureStage: affiliateLink ? "complete" : "awaiting-affiliate-link",
        rating: ratingValue(),
        confidence: 0,
      };
      const required = [product.productName, product.currentPrice, product.imageUrl, product.externalProductId];
      product.confidence = required.filter(Boolean).length / required.length;
      await tools.closeTransientDialogs();
      return product;
    },
  });
})();
