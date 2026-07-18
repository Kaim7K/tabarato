(() => {
  const tools = globalThis.TaBaratoCapture;
  if (!tools || globalThis.TaBaratoStores?.some((store) => store.id === "mercado-livre")) return;

  const MELI_LINK_PATTERN = /^https:\/\/meli\.la\/[A-Za-z0-9_-]+/i;
  let affiliateRequestStartedAt = 0;
  let capturedAffiliateLink = "";
  let capturedAffiliatePage = "";

  const contextText = (element, depthLimit = 4) => {
    let current = element;
    let value = "";
    for (let depth = 0; current && depth < depthLimit; depth += 1) {
      value += ` ${tools.clean(current.textContent)}`;
      current = current.parentElement;
    }
    return value;
  };

  const visibleControl = (pattern) => [...document.querySelectorAll("button, a, [role='button']")]
    .find((element) => tools.visible(element) && pattern.test(tools.clean(`${element.textContent} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`)));

  const productRoot = () => document.querySelector(".ui-pdp--sticky-wrapper-right")
    || document.querySelector(".ui-pdp-container--column-right")
    || document.querySelector(".ui-pdp-container__col.col-2")
    || document.querySelector(".ui-pdp-container--pdp")
    || document;

  const productControl = (pattern) => [...productRoot().querySelectorAll("button, a, [role='button']")]
    .find((element) => tools.visible(element) && pattern.test(tools.clean(`${element.textContent} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`)));

  const visibleDialog = (pattern) => [...document.querySelectorAll("[role='dialog'], .andes-modal, [class*='modal']")]
    .find((element) => tools.visible(element) && pattern.test(tools.clean(element.textContent)));

  const affiliateDialog = () => visibleDialog(/gerar link\s*\/\s*id de produto|link do produto.*id do produto|texto sugerido|afiliad/i);

  const productLinkField = (dialog = affiliateDialog()) => {
    if (!dialog) return null;
    const candidates = [...dialog.querySelectorAll("input, textarea")]
      .filter((element) => MELI_LINK_PATTERN.test(tools.clean(element.value)))
      .map((element) => ({
        element,
        score: (element.matches("input") ? 30 : 0)
          + (/link do produto/i.test(contextText(element, 3)) ? 20 : 0)
          - (/texto sugerido/i.test(contextText(element, 3)) ? 10 : 0),
      }))
      .sort((left, right) => right.score - left.score);
    return candidates[0]?.element || null;
  };

  const readProductLink = (dialog = affiliateDialog()) => {
    const field = productLinkField(dialog);
    if (field) return tools.clean(field.value).match(MELI_LINK_PATTERN)?.[0] || "";
    const link = [...(dialog?.querySelectorAll("a[href]") || [])]
      .map((element) => tools.clean(element.href))
      .find((value) => MELI_LINK_PATTERN.test(value));
    return link?.match(MELI_LINK_PATTERN)?.[0] || "";
  };

  const copyProductLink = async (dialog, link) => {
    const field = productLinkField(dialog);
    const copyControl = [...(field?.parentElement?.querySelectorAll("button, [role='button']") || [])]
      .filter(tools.visible)
      .find((element) => /copiar|copy/i.test(tools.clean(`${element.textContent} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`)));
    if (copyControl) {
      copyControl.click();
      return;
    }
    if (document.hasFocus() && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link).catch(() => {});
    }
  };

  const closeDialog = (dialog) => {
    const close = [...dialog.querySelectorAll("button, [role='button'], a")].find((element) => {
      const label = tools.clean(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""} ${element.textContent || ""}`);
      return tools.visible(element) && /^(?:(?:fechar|close)(?: modal| janela| dialogo)?|x|×)$/i.test(label);
    });
    close?.click();
  };

  const closeAffiliateDialog = async () => {
    const dialog = affiliateDialog();
    if (dialog) closeDialog(dialog);
    await tools.closeTransientDialogs();
  };

  const affiliateShareContext = (element) => {
    let current = element;
    for (let depth = 0; current && depth < 5; depth += 1) {
      const text = tools.clean(current.textContent);
      if (/ganhos?\s*(?:extras?)?\s*\d+(?:[.,]\d+)?\s*%/i.test(text)
        || /programa\s+de\s+afiliados?|link\s+de\s+afiliado/i.test(text)) return true;
      const rectangle = current.getBoundingClientRect();
      if (depth > 0 && rectangle.height > 180) break;
      current = current.parentElement;
    }
    return false;
  };

  const shareControl = () => [...document.querySelectorAll("button, a, [role='button']")]
    .filter((element) => element.id !== "tabarato-launcher")
    .filter((element) => /^compartilhar$/i.test(tools.clean(element.textContent)))
    .filter(tools.visible)
    .filter(affiliateShareContext)
    .sort((left, right) => (right.getBoundingClientRect().top < 180 ? 20 : 0) - (left.getBoundingClientRect().top < 180 ? 20 : 0))[0];

  const prepareAffiliateLink = (force = false) => {
    if (affiliateDialog()) return true;
    if (!force && Date.now() - affiliateRequestStartedAt < 8000) return true;
    const control = shareControl();
    if (!control) return false;
    affiliateRequestStartedAt = Date.now();
    control.click();
    return true;
  };

  const captureAffiliateLink = async () => {
    if (capturedAffiliatePage === location.href && MELI_LINK_PATTERN.test(capturedAffiliateLink)) {
      return capturedAffiliateLink;
    }
    if (capturedAffiliatePage !== location.href) affiliateRequestStartedAt = 0;
    capturedAffiliatePage = location.href;
    capturedAffiliateLink = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const prepared = prepareAffiliateLink(attempt > 0);
      if (!prepared && !affiliateDialog()) return "";
      const dialog = await tools.waitFor(affiliateDialog, attempt === 0 ? 5000 : 3000);
      if (!dialog) return "";
      const link = await tools.waitFor(() => readProductLink(dialog), attempt === 0 ? 4500 : 2500);
      if (MELI_LINK_PATTERN.test(link)) {
        await copyProductLink(dialog, link);
        capturedAffiliateLink = link;
        return link;
      }
      closeDialog(dialog);
      await tools.closeTransientDialogs();
      affiliateRequestStartedAt = 0;
    }
    return "";
  };

  const couponDialog = () => visibleDialog(/cupons? do mercado livre|cupom|conferir produtos|com\s*(?:\.{2,}|:|-)?\s*[A-Z][A-Z0-9_-]{3,24}/i);

  const usefulCoupon = (root = productRoot()) => tools.couponCandidates(root)[0]?.value || "";

  const captureCoupon = async (hasCouponPrice = false) => {
    const existing = usefulCoupon(productRoot());
    if (existing) return { code: existing, status: "code" };
    const control = productControl(/ver cupons dispon[ií]veis|ver.*cupons?|cupons? dispon[ií]veis/i);
    let dialog = couponDialog();
    if (!dialog && control) {
      control.click();
      dialog = await tools.waitFor(couponDialog, 3200);
    }
    try {
      if (!dialog) {
        return {
          code: "",
          status: hasCouponPrice && control ? "activation-required" : "none",
        };
      }
      const code = await tools.waitFor(() => usefulCoupon(couponDialog() || dialog), 1400) || "";
      if (code) return { code, status: "code" };
      return globalThis.TaBaratoCouponCode.classify(dialog.innerText, { hasCouponPrice });
    } finally {
      if (dialog && tools.visible(dialog)) closeDialog(dialog);
      await tools.closeTransientDialogs();
    }
  };

  const paymentBenefits = async () => {
    const root = productRoot();
    const pagePaymentText = [...root.querySelectorAll(".ui-pdp-price__subtitles, .ui-pdp-payment, [class*='installment' i], [class*='payment' i]")]
      .filter(tools.visible)
      .map((element) => tools.clean(element.textContent))
      .join(" ");
    const benefits = [];
    let installment = tools.installmentSummary(pagePaymentText);
    const control = !installment && productControl(/meios de pagamento|formas de pagamento|ver.*pagamento/i);
    if (!installment && control) {
      control.click();
      await tools.waitFor(() => (/meios de pagamento|cart[oõ]es de cr[eé]dito|aproveite estas promo[cç][oõ]es/i.test(document.body.innerText) ? true : ""), 3500);
      const dialog = visibleDialog(/meios de pagamento|cart[oõ]es de cr[eé]dito|aproveite estas promo[cç][oõ]es/i);
      installment = tools.installmentSummary(`${pagePaymentText} ${dialog?.innerText || ""}`);
      if (dialog && tools.visible(dialog)) closeDialog(dialog);
    }
    if (installment) benefits.push(installment);
    if (tools.hasExplicitFreeShipping(root)) benefits.push("Frete gratis.");
    return benefits.join(" ");
  };

  const listProducts = (limit = 20) => {
    const products = new Map();
    tools.productLinks([/\/MLB-?\d{6,}/i, /\bMLB\d{6,}/i]).forEach((url) => {
      const itemId = url.match(/(?:^|[/?-])(MLB-?\d{6,})(?:$|[/?#-])/i)?.[1]?.replace("-", "").toUpperCase();
      if (itemId && !products.has(itemId)) products.set(itemId, url);
    });
    return [...products.values()].slice(0, limit);
  };

  const absoluteImageUrl = (value = "") => {
    try {
      return new URL(value, location.href).href;
    } catch {
      return "";
    }
  };

  const mainGalleryImageCandidates = () => {
    const selectors = [
      ".ui-pdp-gallery__figure .ui-pdp-image",
      ".ui-pdp-gallery__figure img",
      ".ui-pdp-gallery img",
      "[data-testid*='gallery' i] img",
      ".ui-pdp-container__row--gallery img",
    ];
    const candidates = [];
    const push = (image, selector) => {
      if (!image || !tools.visible(image)) return;
      const source = image.currentSrc
        || image.src
        || image.getAttribute("data-src")
        || image.getAttribute("srcset")?.split(/\s+/)[0]
        || "";
      const url = absoluteImageUrl(source);
      if (!/^https?:\/\/[^?#]*mlstatic\.com\//i.test(url)) return;
      if (/sprite|logo|avatar|icon/i.test(url)) return;
      if (candidates.some((item) => item.url === url)) return;
      candidates.push({ url, score: Math.max(20, 120 - candidates.length), reason: `main-gallery:${selector}` });
    };
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((image) => push(image, selector));
    });
    return candidates;
  };

  globalThis.TaBaratoStores.push({
    id: "mercado-livre",
    platform: "Mercado Livre",
    matches: () => /mercadolivre|mercadolibre/i.test(location.hostname),
    isProduct: () => /(?:^|[/?-])MLB-?\d{6,}(?:$|[/?#-])/i.test(location.href)
      || Boolean(document.querySelector(".ui-pdp-title, .ui-pdp-price__second-line")),
    prepareAffiliateLink,
    listProducts,
    extract: async () => {
      try {
      let affiliateLink = "";
      try {
        affiliateLink = await captureAffiliateLink();
      } finally {
        await closeAffiliateDialog();
      }
      const structured = tools.jsonProduct();
      const productId = location.href.match(/\b(MLB-?\d{6,})\b/i)?.[1]?.replace("-", "").toUpperCase() || "";
      const priceInfo = tools.priceDetails(
        ".ui-pdp-price__main-container .ui-pdp-price__second-line > .ui-pdp-price__part__container > .andes-money-amount",
        ".ui-pdp-price__main-container .ui-pdp-price__second-line .andes-money-amount",
        ".ui-pdp-price__second-line .andes-money-amount"
      );
      const basePrice = priceInfo.value || tools.productPrice(structured);
      const couponPrice = tools.couponPriceDetails(basePrice);
      const couponState = await captureCoupon(Boolean(couponPrice.value));
      const currentPrice = couponPrice.value || basePrice;
      const capturedPreviousPrice = tools.price(
        ".ui-pdp-price__main-container .ui-pdp-price__original-value.andes-money-amount",
        ".ui-pdp-price__main-container .ui-pdp-price__original-value .andes-money-amount",
        ".ui-pdp-price__main-container .andes-money-amount--previous"
      );
      const previousPrice = Number(capturedPreviousPrice) > Number(currentPrice)
        ? capturedPreviousPrice
        : Number(basePrice) >= Number(currentPrice)
          ? basePrice
          : currentPrice;
      const product = {
        productName: tools.text(".ui-pdp-title", "h1") || tools.clean(structured.name) || tools.meta("og:title"),
        shortDescription: tools.description(".ui-pdp-description__content", ".ui-pdp-description") || tools.firstUsefulParagraph(structured.description) || tools.firstUsefulParagraph(tools.meta("og:description")),
        sourceCategory: tools.text(".andes-breadcrumb__container", ".ui-pdp-breadcrumb"),
        currentPrice,
        previousPrice,
        regularPrice: basePrice,
        coupon: couponState.code,
        couponStatus: couponState.status,
        imageUrl: "",
        imageCandidates: mainGalleryImageCandidates(),
        affiliateLink,
        affiliateLinkType: affiliateLink ? "mercado-livre-generated" : "missing",
        sourceUrl: tools.canonicalUrl(),
        externalProductId: productId,
        platform: "Mercado Livre",
        pricePaymentMethod: priceInfo.method === "Pix" ? "Pix" : couponPrice.value ? "Cupom" : "",
        confidence: 0,
      };
      product.imageUrl = product.imageCandidates[0]?.url || "";
      product.extraText = await paymentBenefits();
      const required = [product.productName, product.currentPrice, product.imageUrl, product.externalProductId, MELI_LINK_PATTERN.test(product.affiliateLink)];
      product.confidence = required.filter(Boolean).length / required.length;
      return product;
      } finally {
        await closeAffiliateDialog().catch(() => {});
        await tools.closeTransientDialogs();
      }
    },
  });
})();
