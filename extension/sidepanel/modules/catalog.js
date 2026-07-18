(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.catalog) return;

  const { STORAGE, elements, state } = panel;
  const { comparableUrl, normalizeText } = globalThis.TaBaratoProductUtils;
  const batchUtils = globalThis.TaBaratoBatchUtils;

  const CATEGORY_PROFILES = [
    { categories: ["tecnologia", "eletronicos", "informatica"], words: ["celular", "smartphone", "iphone", "notebook", "fone", "monitor", "ssd", "tablet", "tv", "gamer"] },
    { categories: ["cozinha", "utilidades"], words: ["panela", "air fryer", "cafeteira", "liquidificador", "micro-ondas", "garrafa", "copo"] },
    { categories: ["ferramentas", "construcao"], words: ["furadeira", "parafusadeira", "serra", "chave", "broca", "alicate", "martelo"] },
    { categories: ["casa", "organizacao", "moveis"], words: ["cama", "colchao", "sofa", "mesa", "organizador", "banheiro", "tapete"] },
    { categories: ["beleza", "cuidados", "saude"], words: ["perfume", "maquiagem", "shampoo", "hidratante", "barbeador", "whey", "creatina"] },
    { categories: ["moda", "roupas", "calcados"], words: ["tenis", "sapato", "camisa", "calca", "jaqueta", "bolsa", "relogio"] },
  ];

  function connectedHostsFromOffers(offers) {
    const hosts = new Set();
    offers.forEach((offer) => {
      [offer.affiliateLink, offer.imageUrl].forEach((value) => {
        try {
          const host = new URL(value).hostname.replace(/^www\./, "");
          if (host && !/mercadolivre|mercadolibre|shopee|mlstatic|susercontent/i.test(host)) hosts.add(host);
        } catch { /* Invalid URLs cannot become connected stores. */ }
      });
    });
    return [...hosts].slice(0, 80);
  }

  function updateCategoryOptions(categories) {
    const names = [...new Set(categories.map((item) => String(item?.name || item || "").trim()).filter(Boolean))];
    if (!names.length) return;
    state.availableCategories = names;
    const current = elements.fields.category.value;
    elements.fields.category.replaceChildren(...names.map((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      return option;
    }));
    elements.fields.category.value = names.includes(current) ? current : names[0];
  }

  async function synchronize() {
    if (state.catalogPromise) return state.catalogPromise;
    state.catalogPromise = panel.api.request("/api/admin/ofertas")
      .then(async (data) => {
        state.synchronizedOffers = Array.isArray(data.offers) ? data.offers : [];
        const categories = data.categories?.length
          ? data.categories
          : [...new Set(state.synchronizedOffers.map((offer) => offer.category).filter(Boolean))];
        updateCategoryOptions(categories);
        const connectedHosts = Array.isArray(data.connectedStoreHosts)
          ? data.connectedStoreHosts
          : connectedHostsFromOffers(state.synchronizedOffers);
        await chrome.storage.local.set({ [STORAGE.connectedHosts]: connectedHosts });
        return data;
      })
      .finally(() => { state.catalogPromise = null; });
    return state.catalogPromise;
  }

  function suggestCategory(product) {
    const productText = normalizeText(`${product.productName || ""} ${product.shortDescription || ""} ${product.sourceCategory || ""}`);
    const ranked = state.availableCategories.map((category, index) => {
      const categoryText = normalizeText(category);
      let score = categoryText.split(/[^a-z0-9]+/).filter((word) => word.length >= 4)
        .reduce((total, word) => total + (productText.includes(word) ? 3 : 0), 0);
      CATEGORY_PROFILES.forEach((profile) => {
        if (profile.categories.some((term) => categoryText.includes(term))) {
          score += profile.words.reduce((total, word) => total + (productText.includes(word) ? 2 : 0), 0);
        }
      });
      return { category, index, score };
    }).sort((left, right) => right.score - left.score || left.index - right.index);
    return ranked[0]?.score > 0 ? ranked[0].category : state.availableCategories[0] || "";
  }


  function offerWasPublished(offer) {
    return Boolean(
      offer
      && (
        Number(offer.publicationCount || 0) > 0
        || offer.lastPublishedAt
        || offer.publishedAt
        || String(offer.status || "").toUpperCase() === "PUBLICADO"
      )
    );
  }

  function normalizedSourceProductId(value = "") {
    return String(value || "").replace(/-/g, "").trim().toUpperCase();
  }

  async function previouslyPostedUrls(urls) {
    const identities = (Array.isArray(urls) ? urls : [])
      .map((url) => ({ url, identity: batchUtils?.productIdentityFromUrl?.(url) || null }))
      .filter((item) => item.identity?.sourceProductId && item.identity?.platform);
    if (!identities.length) return [];

    const postedKeys = new Set(
      state.synchronizedOffers
        .filter(offerWasPublished)
        .map((offer) => {
          const platform = normalizeText(offer.platform || "");
          const sourceProductId = normalizedSourceProductId(offer.sourceProductId);
          return platform && sourceProductId ? `${platform}:${sourceProductId}` : "";
        })
        .filter(Boolean),
    );

    const byPlatform = new Map();
    identities.forEach(({ identity }) => {
      const platform = identity.platform;
      if (!byPlatform.has(platform)) byPlatform.set(platform, new Set());
      byPlatform.get(platform).add(normalizedSourceProductId(identity.sourceProductId));
    });

    for (const [platform, ids] of byPlatform) {
      const platformKey = normalizeText(platform);
      const sourceProductIds = [...ids].filter((id) => !postedKeys.has(`${platformKey}:${id}`));
      if (!sourceProductIds.length) continue;
      const search = new URLSearchParams({
        resource: "posted-products",
        platform,
        sourceProductIds: sourceProductIds.join(","),
      });
      try {
        const result = await panel.api.request(`/api/admin/ofertas?${search.toString()}`, { timeout: 12000 });
        (Array.isArray(result.postedProductIds) ? result.postedProductIds : [])
          .map(normalizedSourceProductId)
          .filter(Boolean)
          .forEach((id) => postedKeys.add(`${platformKey}:${id}`));
      } catch {
        // Compatibilidade com uma versao antiga do site: usa o catalogo ja sincronizado.
      }
    }

    return identities
      .filter(({ identity }) => postedKeys.has(`${normalizeText(identity.platform)}:${normalizedSourceProductId(identity.sourceProductId)}`))
      .map(({ url, identity }) => ({
        url,
        platform: identity.platform,
        sourceProductId: normalizedSourceProductId(identity.sourceProductId),
      }));
  }

  function findExisting(product) {
    const productId = normalizeText(product.externalProductId || product.sourceProductId || "");
    const platform = normalizeText(product.platform || "");
    const link = comparableUrl(product.affiliateLink || product.sourceUrl || "");
    const name = normalizeText(product.productName || "");
    return state.synchronizedOffers.find((offer) => {
      const samePlatform = normalizeText(offer.platform) === platform;
      if (samePlatform && productId && normalizeText(offer.sourceProductId) === productId) return true;
      if (link && comparableUrl(offer.affiliateLink) === link) return true;
      return samePlatform && name && normalizeText(offer.productName) === name;
    }) || null;
  }

  panel.catalog = {
    findExisting,
    previouslyPostedUrls,
    suggestCategory,
    synchronize,
    updateCategoryOptions,
  };
})();
