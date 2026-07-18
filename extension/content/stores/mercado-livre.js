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
      return tools.visible(element) && /^(fechar|close|x|×)$/i.test(label);
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

  const prepareAffiliateLink = () => {
    if (affiliateDialog()) return true;
    if (Date.now() - affiliateRequestStartedAt < 8000) return true;
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
    prepareAffiliateLink();
    const dialog = await tools.waitFor(affiliateDialog, 10000);
    if (!dialog) return "";
    const link = await tools.waitFor(() => readProductLink(dialog), 10000);
    if (!MELI_LINK_PATTERN.test(link)) return "";
    await copyProductLink(dialog, link);
    capturedAffiliateLink = link;
    return link;
  };

  const promotionSummary = (value) => {
    const source = tools.clean(value);
    const discount = source.match(/\b\d{1,2}(?:[.,]\d+)?%\s*OFF\b/i)?.[0];
    if (!discount) return "";
    const method = source.match(/saldo no Mercado Pago|Pix|Mercado Pago/i)?.[0];
    const minimum = source.match(/pagamento m[ií]nimo:\s*R\$\s*[\d.,]+/i)?.[0];
    const limit = source.match(/limite:\s*R\$\s*[\d.,]+/i)?.[0];
    const validity = source.match(/v[aá]lido at[eé]\s*\d{2}\/\d{2}\/\d{4}/i)?.[0];
    const details = [minimum, limit, validity].filter(Boolean);
    if (!method && !details.length) return "";
    return `${discount}${method ? ` com ${method}` : ""}${details.length ? ` (${details.join("; ")})` : ""}`;
  };

  const interestFreeOptions = (value) => {
    const source = tools.clean(value);
    const options = [];
    for (const match of source.matchAll(/at[eé]\s+\d{1,2}x\s+sem\s+juros(?:\s+com\s+(?:cart[aã]o Mercado Pago|todos os cart[oõ]es|estes cart[oõ]es))?/gi)) {
      options.push(match[0]);
    }
    const installment = source.match(/\b\d{1,2}x(?:\s+de\s+R\$\s*[\d.,]+)?\s+sem\s+juros\b/i)?.[0];
    if (installment) options.push(installment);
    return [...new Set(options.map((item) => `${item.charAt(0).toUpperCase()}${item.slice(1)}.`))];
  };

  const paymentBenefits = async (priceMethod) => {
    const pagePaymentText = [...document.querySelectorAll(".ui-pdp-payment, [class*='installment'], [class*='payment'], [class*='price']")]
      .filter(tools.visible)
      .map((element) => tools.clean(element.textContent))
      .join(" ");
    const benefits = [];
    const control = visibleControl(/meios de pagamento|formas de pagamento|ver.*pagamento/i);
    if (control) {
      control.click();
      await tools.waitFor(() => (/meios de pagamento|cart[oõ]es de cr[eé]dito|aproveite estas promo[cç][oõ]es/i.test(document.body.innerText) ? true : ""), 8000);
      const dialog = visibleDialog(/meios de pagamento|cart[oõ]es de cr[eé]dito|aproveite estas promo[cç][oõ]es/i);
      const sourceText = `${pagePaymentText} ${dialog?.innerText || document.body.innerText}`;
      [...sourceText.split(/\r?\n/).map(promotionSummary).filter(Boolean)].forEach((item) => benefits.push(`Promocao: ${item}.`));
      interestFreeOptions(sourceText).forEach((item) => benefits.push(item));
      if (dialog && tools.visible(dialog)) closeDialog(dialog);
    } else {
      interestFreeOptions(pagePaymentText).forEach((item) => benefits.push(item));
    }
    if (priceMethod === "Pix") {
      const noInterest = pagePaymentText.match(/R\$\s*[\d.,]+(?:\s+em\s+)?(?:\d{1,2}x\s+)?sem\s+juros/i)?.[0];
      if (noInterest) benefits.push(`No cartao sem juros: ${tools.clean(noInterest)}.`);
    }
    if (/frete gr[aá]tis/i.test(document.body.innerText)) benefits.push("Frete gratis.");
    return [...new Set(benefits)].join(" ");
  };

  const listProducts = (limit = 20) => tools.productLinks([/\/MLB-?\d{6,}/i, /\bMLB\d{6,}/i]).slice(0, limit);

  globalThis.TaBaratoStores.push({
    id: "mercado-livre",
    platform: "Mercado Livre",
    matches: () => /mercadolivre|mercadolibre/i.test(location.hostname),
    isProduct: () => /\bMLB-?\d{6,}\b/i.test(location.href)
      || Boolean(document.querySelector(".ui-pdp-title, .ui-pdp-price__second-line")),
    prepareAffiliateLink,
    listProducts,
    extract: async () => {
      let affiliateLink = "";
      try {
        affiliateLink = await captureAffiliateLink();
      } finally {
        await closeAffiliateDialog();
      }
      const structured = tools.jsonProduct();
      const productId = location.href.match(/\b(MLB-?\d{6,})\b/i)?.[1]?.replace("-", "").toUpperCase() || "";
      const priceInfo = tools.priceDetails(".ui-pdp-price__second-line .andes-money-amount", ".ui-pdp-price__main-container .andes-money-amount");
      const basePrice = priceInfo.value || tools.productPrice(structured);
      const couponPrice = tools.couponPriceDetails(basePrice);
      const coupon = tools.couponCandidates()[0]?.value || "Cupom disponivel no anuncio. Ative antes de comprar.";
      const product = {
        productName: tools.text(".ui-pdp-title", "h1") || tools.clean(structured.name) || tools.meta("og:title"),
        shortDescription: tools.description(".ui-pdp-description__content", ".ui-pdp-description") || tools.firstUsefulParagraph(structured.description) || tools.firstUsefulParagraph(tools.meta("og:description")),
        sourceCategory: tools.text(".andes-breadcrumb__container", ".ui-pdp-breadcrumb"),
        currentPrice: couponPrice.value || basePrice,
        previousPrice: tools.price(".ui-pdp-price__original-value .andes-money-amount", ".andes-money-amount--previous"),
        coupon,
        imageUrl: "",
        imageCandidates: [
          ...tools.imageCandidates(".ui-pdp-gallery__figure img", ".ui-pdp-image", "img[src*='mlstatic']"),
          ...tools.productImages(structured).map((url) => ({ url, score: 60, reason: "structured" })),
        ],
        affiliateLink: affiliateLink || tools.affiliateLink(),
        affiliateLinkType: affiliateLink ? "mercado-livre-generated" : "page-fallback",
        sourceUrl: tools.canonicalUrl(),
        externalProductId: productId,
        platform: "Mercado Livre",
        pricePaymentMethod: couponPrice.value ? "Cupom" : priceInfo.method,
        confidence: 0,
      };
      product.imageUrl = product.imageCandidates[0]?.url || "";
      product.extraText = await paymentBenefits(product.pricePaymentMethod);
      const required = [product.productName, product.currentPrice, product.imageUrl, product.externalProductId, MELI_LINK_PATTERN.test(product.affiliateLink)];
      product.confidence = required.filter(Boolean).length / required.length;
      await tools.closeTransientDialogs();
      return product;
    },
  });
})();
