(() => {
  const tools = globalThis.TaBaratoCapture;
  if (!tools || globalThis.TaBaratoStores?.some((store) => store.id === "mercado-livre")) return;
  const MELI_LINK_PATTERN = /^https:\/\/meli\.la\/[A-Za-z0-9_-]+/i;
  let affiliateRequestStartedAt = 0;

  const generatedAffiliateLink = () => tools.findAffiliateLink(MELI_LINK_PATTERN);
  const visible = (element) => {
    if (!element) return false;
    const rectangle = element.getBoundingClientRect();
    return rectangle.width > 0 && rectangle.height > 0;
  };

  const unique = (items) => [...new Set(items.filter(Boolean))];

  const visibleControl = (pattern) => [...document.querySelectorAll("button, a, [role='button']")]
    .find((element) => visible(element) && pattern.test(tools.clean(element.textContent || element.getAttribute("aria-label"))));

  const visibleDialog = (pattern) => [...document.querySelectorAll("[role='dialog'], .andes-modal, [class*='modal']")]
    .find((element) => visible(element) && pattern.test(tools.clean(element.textContent)));

  const closeDialog = (dialog) => {
    const close = [...dialog.querySelectorAll("button, [role='button']")].find((element) => {
      const label = tools.clean(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""} ${element.textContent || ""}`);
      return visible(element) && /^(?:fechar|close|x|×)$/i.test(label);
    });
    close?.click();
  };

  const closeAffiliateDialog = async () => {
    const dialog = visibleDialog(/gerar link|id de produto|texto sugerido/i);
    if (!dialog) return;
    closeDialog(dialog);
    await tools.waitFor(() => (visibleDialog(/gerar link|id de produto|texto sugerido/i) ? "" : true), 3000);
  };

  const promotionSummary = (value) => {
    const text = tools.clean(value);
    const discount = text.match(/\b\d{1,2}(?:[.,]\d+)?%\s*OFF\b/i)?.[0];
    if (!discount) return "";
    const method = text.match(/saldo no Mercado Pago|Pix|Mercado Pago/i)?.[0];
    const minimum = text.match(/pagamento m[ií]nimo:\s*R\$\s*[\d.,]+/i)?.[0];
    const limit = text.match(/limite:\s*R\$\s*[\d.,]+/i)?.[0];
    const validity = text.match(/v[aá]lido at[eé]\s*\d{2}\/\d{2}\/\d{4}/i)?.[0];
    const conditions = [minimum, limit, validity].filter(Boolean);
    if (!method && !conditions.length) return "";
    return `${discount}${method ? ` com ${method}` : ""}${conditions.length ? ` (${conditions.join("; ")})` : ""}`;
  };

  const paymentPromotions = (root, textSource = "") => {
    const candidates = [...root.querySelectorAll("article, li, [class*='card'], div")]
      .filter((element) => visible(element) && /\d{1,2}(?:[.,]\d+)?%\s*OFF/i.test(element.textContent))
      .filter((element) => ![...element.children].some((child) => /\d{1,2}(?:[.,]\d+)?%\s*OFF/i.test(child.textContent)));
    const sourceText = textSource || root.innerText || root.documentElement?.innerText || root.textContent || "";
    const lines = sourceText.split(/\r?\n/).map(tools.clean).filter(Boolean);
    const textBlocks = [];
    lines.forEach((line, index) => {
      if (!/\d{1,2}(?:[.,]\d+)?%\s*OFF/i.test(line)) return;
      const block = [line];
      for (let offset = 1; offset <= 8 && index + offset < lines.length; offset += 1) {
        const nextLine = lines[index + offset];
        if (/\d{1,2}(?:[.,]\d+)?%\s*OFF/i.test(nextLine)) break;
        block.push(nextLine);
        if (/ver termos|saiba mais/i.test(nextLine)) break;
      }
      textBlocks.push(block.join(" "));
    });
    return unique([
      ...candidates.map((element) => promotionSummary(element.textContent)),
      ...textBlocks.map(promotionSummary),
    ]);
  };

  const paymentModalText = () => {
    const lines = String(document.body.innerText || "").split(/\r?\n/);
    let start = -1;
    lines.forEach((line, index) => {
      if (/meios de pagamento para este produto|aproveite estas promo[cç][oõ]es/i.test(tools.clean(line))) start = index;
    });
    if (start < 0) return "";
    const end = Math.min(lines.length, start + 120);
    return lines.slice(start, end).join("\n");
  };

  const interestFreeOptions = (value) => {
    const text = tools.clean(value);
    const options = [];
    for (const match of text.matchAll(/at[eé]\s+\d{1,2}x\s+sem\s+juros(?:\s+com\s+(?:cart[aã]o Mercado Pago|estes cart[oõ]es))?/gi)) {
      options.push(match[0]);
    }
    if (!options.length) {
      const installment = text.match(/\b\d{1,2}x(?:\s+de\s+R\$\s*[\d.,]+)?\s+sem\s+juros\b/i)?.[0];
      if (installment) options.push(installment);
    }
    return unique(options.map((item) => item.charAt(0).toUpperCase() + item.slice(1)));
  };

  const paymentBenefits = async (price) => {
    const pagePaymentText = [...document.querySelectorAll(".ui-pdp-payment, [class*='installment'], [class*='payment']")]
      .filter(visible)
      .map((element) => tools.clean(element.textContent))
      .join(" ");
    let promotions = [];
    let installments = interestFreeOptions(pagePaymentText);
    const control = visibleControl(/meios de pagamento|formas de pagamento|ver.*pagamento/i);
    if (control) {
      control.click();
      await tools.waitFor(() => (/meios de pagamento|cart[oõ]es de cr[eé]dito|aproveite estas promo[cç][oõ]es/i.test(document.body.innerText) ? true : ""), 8000);
      const dialog = visibleDialog(/meios de pagamento|cart[oõ]es de cr[eé]dito|aproveite estas promo[cç][oõ]es/i);
      const paymentRoot = dialog || document;
      const paymentText = dialog?.innerText || paymentModalText();
      promotions = unique([...promotions, ...paymentPromotions(paymentRoot, paymentText)]);
      if (price > 500) {
        installments = unique([...installments, ...interestFreeOptions(paymentText)]);
        if (!installments.length) {
          const details = [...paymentRoot.querySelectorAll("button, a, [role='button']")].find((element) => {
            const label = tools.clean(`${element.textContent || ""} ${element.getAttribute("aria-label") || ""}`);
            return visible(element)
              && /saiba mais|ver (?:detalhes|condi[cç][oõ]es)|parcelamento/i.test(label)
              && /cart[aã]o|pagamento|parcela|juros/i.test(contextText(element));
          });
          if (details) {
            details.click();
            await tools.waitFor(() => (/\d{1,2}x\s+sem\s+juros/i.test(document.body.innerText) ? true : ""), 6000);
            installments = interestFreeOptions(document.body.innerText);
          }
        }
      }
      if (dialog && visible(dialog)) closeDialog(dialog);
    }
    return unique([
      ...promotions.map((item) => `Promo\u00e7\u00e3o: ${item}.`),
      ...installments.map((item) => `${item}.`),
    ]).join(" ");
  };

  const contextText = (element) => {
    let current = element;
    let value = "";
    for (let depth = 0; current && depth < 4; depth += 1) {
      value += ` ${tools.clean(current.textContent)}`;
      current = current.parentElement;
    }
    return value;
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
    .filter((element) => element.id !== "tabarato-send-product")
    .filter((element) => /^compartilhar$/i.test(tools.clean(element.textContent)))
    .filter((element) => {
      const rectangle = element.getBoundingClientRect();
      return rectangle.width > 0 && rectangle.height > 0;
    })
    .filter(affiliateShareContext)
    .sort((left, right) => {
      const score = (element) => (element.getBoundingClientRect().top < 180 ? 20 : 0);
      return score(right) - score(left);
    })[0];

  const prepareAffiliateLink = () => {
    if (generatedAffiliateLink()) return true;
    if (Date.now() - affiliateRequestStartedAt < 8000) return true;
    const control = shareControl();
    if (!control) return false;
    affiliateRequestStartedAt = Date.now();
    control.click();
    return true;
  };

  globalThis.TaBaratoStores.push({
    id: "mercado-livre",
    platform: "Mercado Livre",
    matches: () => /mercadolivre|mercadolibre/i.test(location.hostname),
    isProduct: () => /\bMLB-?\d{6,}\b/i.test(location.href)
      || Boolean(document.querySelector(".ui-pdp-title, .ui-pdp-price__second-line")),
    prepareAffiliateLink,
    extract: async () => {
      const shouldWaitForLink = prepareAffiliateLink();
      const affiliateLink = generatedAffiliateLink()
        || (shouldWaitForLink ? await tools.waitFor(generatedAffiliateLink) : "");
      const structured = tools.jsonProduct();
      const productId = location.href.match(/\b(MLB-?\d{6,})\b/i)?.[1]?.replace("-", "").toUpperCase() || "";
      const productName = tools.text(".ui-pdp-title", "h1") || tools.clean(structured.name) || tools.meta("og:title");
      const shortDescription = tools.description(".ui-pdp-description__content", ".ui-pdp-description") || tools.firstParagraph(structured.description) || tools.firstParagraph(tools.meta("og:description"));
      const sourceCategory = tools.text(".andes-breadcrumb__container", ".ui-pdp-breadcrumb");
      const currentPrice = tools.price(".ui-pdp-price__second-line .andes-money-amount", ".ui-pdp-price__main-container .andes-money-amount") || tools.productPrice(structured);
      let extraText = "";
      if (MELI_LINK_PATTERN.test(affiliateLink)) {
        await closeAffiliateDialog();
        const paymentText = await paymentBenefits(Number(currentPrice));
        const shippingText = /frete gr[aá]tis/i.test(document.body.innerText) ? "Frete grátis." : "";
        extraText = [paymentText, shippingText].filter(Boolean).join(" ");
      }
      return {
        productName,
        shortDescription,
        sourceCategory,
        currentPrice,
        previousPrice: tools.price(".ui-pdp-price__original-value .andes-money-amount", ".andes-money-amount--previous"),
        extraText,
        imageUrl: tools.bestImage(".ui-pdp-gallery__figure img", ".ui-pdp-image", "img[src*='mlstatic']") || tools.productImage(structured),
        affiliateLink: affiliateLink || tools.affiliateLink(),
        affiliateLinkType: affiliateLink ? "mercado-livre-generated" : "page-fallback",
        sourceUrl: tools.canonicalUrl(),
        externalProductId: productId,
        platform: "Mercado Livre",
      };
    },
  });
})();
