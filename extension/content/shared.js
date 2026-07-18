(() => {
  if (globalThis.TaBaratoCapture && Array.isArray(globalThis.TaBaratoStores)) return;

  const clean = (value = "") => String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const normalized = (value = "") => clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const visible = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };

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

  const words = (value = "") => clean(value).split(/\s+/).filter(Boolean);

  const firstUsefulParagraph = (value = "") => {
    const paragraphs = String(value || "")
      .split(/\r?\n+/)
      .map(clean)
      .filter(Boolean);
    if (!paragraphs.length) return "";
    if (words(paragraphs[0]).length >= 10 || !paragraphs[1]) return paragraphs[0];
    return paragraphs[1];
  };

  const description = (...selectors) => {
    for (const selector of selectors) {
      const container = document.querySelector(selector);
      if (!container) continue;
      const blocks = [...container.querySelectorAll("p, li, [class*='description']")]
        .map((element) => clean(element.textContent))
        .filter(Boolean);
      const value = firstUsefulParagraph(blocks.length ? blocks.join("\n") : container.textContent);
      if (value) return value;
    }
    return "";
  };

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

  const priceTextFrom = (element) => {
    if (!element) return "";
    const fraction = clean(element.querySelector(".andes-money-amount__fraction")?.textContent);
    const cents = clean(element.querySelector(".andes-money-amount__cents")?.textContent);
    return fraction ? `${fraction}${cents ? `,${cents}` : ""}` : element.textContent;
  };

  const price = (...selectors) => {
    for (const selector of selectors) {
      const normalizedPrice = normalizePrice(priceTextFrom(document.querySelector(selector)));
      if (normalizedPrice) return normalizedPrice;
    }
    return "";
  };

  const priceDetails = (...selectors) => {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      const normalizedPrice = normalizePrice(priceTextFrom(element));
      if (!normalizedPrice) continue;
      const context = clean(`${element.textContent} ${element.parentElement?.textContent || ""}`);
      return {
        value: normalizedPrice,
        method: /\bpix\b/i.test(context) ? "Pix" : "",
        context,
      };
    }
    return { value: "", method: "", context: "" };
  };

  const couponPriceDetails = (referencePrice = "") => {
    const reference = Number(referencePrice);
    const candidates = [];
    const push = (rawValue, context, score) => {
      const value = normalizePrice(rawValue);
      const amount = Number(value);
      if (!value || !Number.isFinite(amount) || amount <= 0) return;
      if (Number.isFinite(reference) && reference > 0 && amount >= reference) return;
      if (candidates.some((item) => item.value === value)) return;
      candidates.push({ value, method: "Cupom", context: clean(context), score });
    };

    [...document.querySelectorAll("span, p, div, a, button")].forEach((element) => {
      if (!visible(element)) return;
      const context = clean(element.textContent);
      if (!context || context.length > 120 || !/cupom/i.test(context)) return;
      const before = context.match(/R\$\s*([\d.]+(?:,\d{2})?)\s+com\s+(?:o\s+)?cupom\b/i);
      const after = context.match(/\bcom\s+(?:o\s+)?cupom\s*(?:por|de|a)?\s*R\$\s*([\d.]+(?:,\d{2})?)/i);
      const match = before || after;
      if (match) push(match[1], context, 160 - context.length);
    });

    [...document.querySelectorAll("[class*='coupon' i] .andes-money-amount, [class*='coupon' i] [class*='price' i], .andes-money-amount")]
      .forEach((element) => {
        if (!visible(element)) return;
        let current = element;
        for (let depth = 0; current && depth < 3; depth += 1, current = current.parentElement) {
          const context = clean(current.textContent);
          if (context.length <= 140 && /\bcom\s+(?:o\s+)?cupom\b/i.test(context)) {
            push(priceTextFrom(element), context, 120 - depth * 20 - context.length / 10);
            break;
          }
        }
      });

    return candidates.sort((left, right) => right.score - left.score)[0]
      || { value: "", method: "", context: "" };
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
      try { visit(JSON.parse(script.textContent)); } catch { /* Invalid store metadata is ignored. */ }
    });
    return products.find((item) => item.name) || {};
  };

  const productPrice = (product) => {
    const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
    return normalizePrice(offer?.price || offer?.lowPrice || product?.price || "");
  };

  const productImages = (product) => {
    const source = Array.isArray(product?.image) ? product.image : [product?.image];
    return source.map((value) => (typeof value === "string" ? value : value?.url || value?.contentUrl)).filter(Boolean);
  };

  const absoluteUrl = (value = "") => {
    try {
      return new URL(value, location.href).href;
    } catch {
      return "";
    }
  };

  const imageCandidates = (...selectors) => {
    const candidates = [];
    const push = (url, score = 0, reason = "") => {
      const href = absoluteUrl(url);
      if (!/^https?:\/\//i.test(href)) return;
      if (candidates.some((item) => item.url === href)) return;
      candidates.push({ url: href, score, reason });
    };

    push(meta("og:image") || meta("twitter:image"), 30, "metadata");
    selectors.forEach((selector, selectorIndex) => {
      document.querySelectorAll(selector).forEach((image) => {
        const rect = image.getBoundingClientRect();
        const src = image.currentSrc || image.src || image.getAttribute("data-src") || image.getAttribute("srcset")?.split(/\s+/)[0] || "";
        const alt = normalized(`${image.alt || ""} ${image.getAttribute("aria-label") || ""}`);
        const areaScore = Math.min(40, Math.round((rect.width * rect.height) / 7000));
        const usageScore = /(uso|ambiente|modelo|review|cliente|real)/i.test(alt) ? 30 : 0;
        const whitePenalty = /(thumb|sprite|logo|avatar|icon)/i.test(src) ? -30 : 0;
        push(src, 90 - selectorIndex * 8 + areaScore + usageScore + whitePenalty, alt || selector);
      });
    });

    return candidates.sort((left, right) => right.score - left.score);
  };

  const bestImage = (...selectors) => imageCandidates(...selectors)[0]?.url || "";

  const commerceBenefits = (value = "") => {
    const source = clean(value);
    const benefits = [];
    if (/frete gr[aá]tis/i.test(source)) benefits.push("Frete gratis.");
    const installments = [...source.matchAll(/(?:at[eé]\s+)?\d{1,2}x(?:\s+de\s+R\$\s*[\d.,]+)?\s+sem\s+juros/gi)]
      .map((match) => clean(match[0]));
    if (installments.length) {
      const best = installments.sort((first, second) => Number(second.match(/\d+/)?.[0]) - Number(first.match(/\d+/)?.[0]))[0];
      benefits.push(`${best.charAt(0).toUpperCase()}${best.slice(1)}.`);
    }
    return [...new Set(benefits)].join(" ");
  };

  const couponCandidates = () => {
    const pageText = document.body.innerText || "";
    const candidates = [];
    const push = (value, confidence = 0.7) => {
      const coupon = clean(value).replace(/^cupom[:\s-]*/i, "").replace(/["']/g, "");
      if (!coupon || coupon.length > 40) return;
      if (candidates.some((item) => item.value === coupon)) return;
      candidates.push({ value: coupon, confidence });
    };

    [...pageText.matchAll(/cupom(?:\s+de\s+desconto)?[:\s-]+([A-Z0-9][A-Z0-9_-]{3,24})/gi)]
      .forEach((match) => push(match[1], 0.95));
    [...document.querySelectorAll("button, [role='button'], input, textarea, [class*='coupon'], [class*='cupom']")]
      .filter(visible)
      .forEach((element) => {
        const value = element.value || element.textContent || element.getAttribute("aria-label") || "";
        if (/R\$\s*[\d.,]+\s+com\s+(?:o\s+)?cupom\b/i.test(clean(value))) return;
        const code = clean(value).match(/\b[A-Z0-9][A-Z0-9_-]{3,24}\b/)?.[0];
        if (/cupom|coupon|voucher|aplicar|ativar/i.test(value) && code && !/^\d+$/.test(code)) push(code, 0.9);
      });
    if (/cupom|coupon|voucher/i.test(pageText) && !candidates.length) {
      push("Cupom disponivel no anuncio. Ative antes de comprar.", 0.55);
    }
    return candidates.sort((left, right) => right.confidence - left.confidence);
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
    const affiliatePattern = /(?:meli\.la|amzn\.to|shopee\.ee|s\.shopee\.|[?&](?:tag|ascsubtag|matt_tool|matt_word|matt_source|affiliate_id|aff_id|utm_source)=)/i;
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

  const closeTransientDialogs = async () => {
    for (let round = 0; round < 3; round += 1) {
      const controls = [...document.querySelectorAll("button, [role='button'], a")]
        .filter(visible)
        .filter((element) => /^(fechar|close|x|×|agora nao|agora n[aã]o|continuar navegando)$/i.test(clean(`${element.textContent} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`)));
      controls.slice(0, 6).forEach((element) => element.click());
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", code: "Escape", bubbles: true }));
      await new Promise((resolve) => window.setTimeout(resolve, 220));
      if (![...document.querySelectorAll("[role='dialog'], [aria-modal='true'], .andes-modal")].some(visible)) break;
    }
  };

  const productLinks = (patterns = []) => {
    const links = [...document.querySelectorAll("a[href]")]
      .map((link) => absoluteUrl(link.href))
      .filter((href) => /^https?:\/\//i.test(href))
      .filter((href) => !patterns.length || patterns.some((pattern) => pattern.test(href)))
      .map((href) => {
        const url = new URL(href);
        url.hash = "";
        return url.href;
      });
    return [...new Set(links)];
  };

  globalThis.TaBaratoCapture = {
    absoluteUrl,
    affiliateLink,
    attribute,
    bestImage,
    canonicalUrl,
    clean,
    closeTransientDialogs,
    commerceBenefits,
    couponCandidates,
    couponPriceDetails,
    description,
    findAffiliateLink,
    firstUsefulParagraph,
    imageCandidates,
    jsonProduct,
    meta,
    normalizePrice,
    normalized,
    price,
    priceDetails,
    productImages,
    productLinks,
    productPrice,
    text,
    visible,
    waitFor,
    words,
  };
  globalThis.TaBaratoStores = [];
})();
