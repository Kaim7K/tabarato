(() => {
  const tools = globalThis.TaBaratoCapture;
  if (!tools || globalThis.TaBaratoStores?.some((store) => store.id === "generic")) return;

  const CORE_HOSTS = ["mercadolivre.com.br", "mercadolibre.com", "shopee.com.br", "web.whatsapp.com"];
  const hostMatches = (hostname, host) => hostname === host || hostname.endsWith(`.${host}`);

  async function connectedHosts() {
    const stored = await chrome.storage.local.get(["tabarato_connected_store_hosts"]);
    return Array.isArray(stored.tabarato_connected_store_hosts) ? stored.tabarato_connected_store_hosts.map(String) : [];
  }

  async function matchesConnectedStore() {
    const hosts = await connectedHosts();
    return hosts.some((host) => hostMatches(location.hostname, host))
      && !CORE_HOSTS.some((host) => hostMatches(location.hostname, host));
  }

  const listProducts = (limit = 20) => tools.productLinks([/\/(?:p|produto|product|item|dp)\//i, /[?&](?:sku|productId|itemId)=/i]).slice(0, limit);

  globalThis.TaBaratoStores.push({
    id: "generic",
    platform: "Loja conectada",
    matches: () => false,
    matchesAsync: matchesConnectedStore,
    isProduct: () => Boolean(tools.jsonProduct().name || tools.meta("og:type") === "product" || document.querySelector("h1")),
    listProducts,
    extract: async () => {
      const structured = tools.jsonProduct();
      const coupon = tools.couponCandidates()[0]?.value || "Cupom disponivel no anuncio. Ative antes de comprar.";
      const priceInfo = tools.priceDetails("[itemprop='price']", "[class*='price']", "[data-price]");
      const platform = document.querySelector('meta[property="og:site_name"]')?.content || location.hostname.replace(/^www\./, "");
      const product = {
        productName: tools.text("h1", "[itemprop='name']") || tools.clean(structured.name) || tools.meta("og:title"),
        shortDescription: tools.description("[itemprop='description']", "[class*='description']", "main") || tools.firstUsefulParagraph(structured.description) || tools.firstUsefulParagraph(tools.meta("og:description")),
        sourceCategory: tools.text("nav[aria-label*='breadcrumb' i]", "[class*='breadcrumb']"),
        currentPrice: priceInfo.value || tools.productPrice(structured),
        previousPrice: tools.price("[class*='old-price']", "[class*='original']", "del"),
        coupon,
        extraText: tools.commerceBenefits(document.body.innerText),
        imageUrl: "",
        imageCandidates: [
          ...tools.imageCandidates("[itemprop='image']", "main img", "img"),
          ...tools.productImages(structured).map((url) => ({ url, score: 60, reason: "structured" })),
        ],
        affiliateLink: tools.affiliateLink(),
        sourceUrl: tools.canonicalUrl(),
        externalProductId: tools.meta("product:retailer_item_id") || tools.meta("sku") || "",
        platform,
        pricePaymentMethod: priceInfo.method,
        confidence: 0,
      };
      product.imageUrl = product.imageCandidates[0]?.url || "";
      const required = [product.productName, product.currentPrice, product.imageUrl, product.affiliateLink];
      product.confidence = required.filter(Boolean).length / required.length;
      await tools.closeTransientDialogs();
      return product;
    },
  });
})();
