(() => {
  const tools = globalThis.TaBaratoCapture;

  globalThis.TaBaratoStores.push({
    id: "shopee",
    platform: "Shopee",
    matches: () => /shopee\.com\.br$/i.test(location.hostname),
    isProduct: () => /-i\.\d+\.\d+/i.test(location.pathname)
      || Boolean(document.querySelector("[data-testid='pdp-product-title'], main h1")),
    extract: () => {
      const structured = tools.jsonProduct();
      const ids = location.pathname.match(/-i\.(\d+)\.(\d+)/i);
      return {
        productName: tools.text("[data-testid='pdp-product-title']", "main h1", "h1") || tools.clean(structured.name) || tools.meta("og:title"),
        shortDescription: tools.description("[data-testid='pdp-product-description']", "[class*='product-detail']") || tools.firstParagraph(structured.description) || tools.firstParagraph(tools.meta("og:description")),
        currentPrice: tools.price("[data-testid='pdp-product-price']", "[class*='pqTWkA']", "main [class*='price']") || tools.productPrice(structured),
        previousPrice: tools.price("[data-testid='pdp-product-original-price']", "main [class*='original-price']"),
        coupon: tools.coupon("[data-testid*='voucher']", "[class*='voucher']", "[class*='coupon']"),
        imageUrl: tools.bestImage("main img[class*='product']", "main img") || tools.productImage(structured),
        affiliateLink: tools.affiliateLink(),
        sourceUrl: tools.canonicalUrl(),
        externalProductId: ids ? `${ids[1]}.${ids[2]}` : "",
        platform: "Shopee",
      };
    },
  });
})();
