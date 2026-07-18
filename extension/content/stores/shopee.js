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
      const priceInfo = tools.priceDetails("[data-testid='pdp-product-price']", "[class*='pqTWkA']", "main [class*='price']");
      const basePrice = priceInfo.value || tools.productPrice(structured);
      const couponPrice = tools.couponPriceDetails(basePrice);
      const coupon = tools.couponCandidates()[0]?.value || "";
      const product = {
        productName: tools.text("[data-testid='pdp-product-title']", "main h1", "h1") || tools.clean(structured.name) || tools.meta("og:title"),
        shortDescription: tools.description("[data-testid='pdp-product-description']", "[class*='product-detail']") || tools.firstUsefulParagraph(structured.description) || tools.firstUsefulParagraph(tools.meta("og:description")),
        sourceCategory: tools.text("[data-testid='pdp-breadcrumbs']", "nav[aria-label*='breadcrumb' i]"),
        currentPrice: couponPrice.value || basePrice,
        previousPrice: tools.price("[data-testid='pdp-product-original-price']", "main [class*='original-price']"),
        regularPrice: basePrice,
        coupon,
        extraText: tools.commerceBenefits(document.body.innerText),
        imageUrl: "",
        imageCandidates: [
          ...tools.imageCandidates("main img[class*='product']", "main img"),
          ...tools.productImages(structured).map((url) => ({ url, score: 60, reason: "structured" })),
        ],
        affiliateLink: tools.affiliateLink(),
        sourceUrl: tools.canonicalUrl(),
        externalProductId: ids ? `${ids[1]}.${ids[2]}` : "",
        platform: "Shopee",
        pricePaymentMethod: couponPrice.value ? "Cupom" : priceInfo.method,
        confidence: 0,
      };
      product.imageUrl = product.imageCandidates[0]?.url || "";
      if (product.pricePaymentMethod === "Pix" && !/sem juros/i.test(product.extraText)) {
        product.extraText = [product.extraText, "Confira o valor sem juros no anuncio."].filter(Boolean).join(" ");
      }
      const required = [product.productName, product.currentPrice, product.imageUrl, product.externalProductId, product.affiliateLink];
      product.confidence = required.filter(Boolean).length / required.length;
      await tools.closeTransientDialogs();
      return product;
    },
  });
})();
