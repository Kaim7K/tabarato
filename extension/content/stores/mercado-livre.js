(() => {
  const tools = globalThis.TaBaratoCapture;

  globalThis.TaBaratoStores.push({
    id: "mercado-livre",
    platform: "Mercado Livre",
    matches: () => /mercadolivre|mercadolibre/i.test(location.hostname),
    isProduct: () => /\bMLB-?\d{6,}\b/i.test(location.href)
      || Boolean(document.querySelector(".ui-pdp-title, .ui-pdp-price__second-line")),
    extract: () => {
      const structured = tools.jsonProduct();
      const productId = location.href.match(/\b(MLB-?\d{6,})\b/i)?.[1]?.replace("-", "").toUpperCase() || "";
      return {
        productName: tools.text(".ui-pdp-title", "h1") || tools.clean(structured.name) || tools.meta("og:title"),
        shortDescription: tools.text(".ui-pdp-description__content", ".ui-pdp-description") || tools.clean(structured.description) || tools.meta("og:description"),
        currentPrice: tools.price(".ui-pdp-price__second-line .andes-money-amount", ".ui-pdp-price__main-container .andes-money-amount") || tools.productPrice(structured),
        previousPrice: tools.price(".ui-pdp-price__original-value .andes-money-amount", ".andes-money-amount--previous"),
        coupon: tools.coupon("[class*='coupon']", "[data-testid*='coupon']", "[class*='voucher']"),
        imageUrl: tools.bestImage(".ui-pdp-gallery__figure img", ".ui-pdp-image", "img[src*='mlstatic']") || tools.productImage(structured),
        affiliateLink: tools.affiliateLink(),
        sourceUrl: tools.canonicalUrl(),
        externalProductId: productId,
        platform: "Mercado Livre",
      };
    },
  });
})();
