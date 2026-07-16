(() => {
  const tools = globalThis.TaBaratoCapture;
  const MELI_LINK_PATTERN = /^https:\/\/meli\.la\/[A-Za-z0-9_-]+/i;
  let affiliateRequestStartedAt = 0;

  const generatedAffiliateLink = () => tools.findAffiliateLink(MELI_LINK_PATTERN);

  const contextText = (element) => {
    let current = element;
    let value = "";
    for (let depth = 0; current && depth < 4; depth += 1) {
      value += ` ${tools.clean(current.textContent)}`;
      current = current.parentElement;
    }
    return value;
  };

  const shareControl = () => [...document.querySelectorAll("button, a, [role='button']")]
    .filter((element) => element.id !== "tabarato-send-product")
    .filter((element) => /^compartilhar$/i.test(tools.clean(element.textContent)))
    .filter((element) => {
      const rectangle = element.getBoundingClientRect();
      return rectangle.width > 0 && rectangle.height > 0;
    })
    .sort((left, right) => {
      const score = (element) => (/ganhos\s*\d+%/i.test(contextText(element)) ? 100 : 0)
        + (element.getBoundingClientRect().top < 180 ? 20 : 0);
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
      return {
        productName: tools.text(".ui-pdp-title", "h1") || tools.clean(structured.name) || tools.meta("og:title"),
        shortDescription: tools.text(".ui-pdp-description__content", ".ui-pdp-description") || tools.clean(structured.description) || tools.meta("og:description"),
        currentPrice: tools.price(".ui-pdp-price__second-line .andes-money-amount", ".ui-pdp-price__main-container .andes-money-amount") || tools.productPrice(structured),
        previousPrice: tools.price(".ui-pdp-price__original-value .andes-money-amount", ".andes-money-amount--previous"),
        coupon: tools.coupon("[class*='coupon']", "[data-testid*='coupon']", "[class*='voucher']"),
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
