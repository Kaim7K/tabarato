(() => {
  const tools = globalThis.TaBaratoCapture;

  globalThis.TaBaratoStores.push({
    id: "amazon",
    platform: "Amazon",
    matches: () => /amazon\.com\.br$/i.test(location.hostname),
    isProduct: () => /\/(?:dp|gp\/product)\/[A-Z0-9]{10}/i.test(location.pathname)
      || Boolean(document.querySelector("#productTitle")),
    extract: () => {
      const structured = tools.jsonProduct();
      const productId = location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase() || "";
      return {
        productName: tools.text("#productTitle", "h1") || tools.clean(structured.name) || tools.meta("og:title"),
        shortDescription: tools.description("#feature-bullets", "#productDescription") || tools.firstParagraph(structured.description) || tools.firstParagraph(tools.meta("og:description")),
        sourceCategory: tools.text("#wayfinding-breadcrumbs_feature_div", "nav[aria-label*='breadcrumb' i]"),
        currentPrice: tools.price("#corePrice_feature_div .a-price .a-offscreen", ".priceToPay .a-offscreen", ".a-price .a-offscreen") || tools.productPrice(structured),
        previousPrice: tools.price(".basisPrice .a-offscreen", ".a-text-price .a-offscreen"),
        coupon: tools.coupon("#couponText", "[id*='coupon']", "[class*='coupon']"),
        imageUrl: tools.bestImage("#landingImage", "#imgTagWrapperId img") || tools.productImage(structured),
        affiliateLink: tools.affiliateLink(),
        sourceUrl: tools.canonicalUrl(),
        externalProductId: productId,
        platform: "Amazon",
      };
    },
  });
})();
