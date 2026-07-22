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


  const CATEGORY_ALIASES = new Map([
    ["celulares e smartphones", "Celulares e smartphones"],
    ["smartphones", "Celulares e smartphones"],
    ["telefonia", "Celulares e smartphones"],
    ["suplementos alimentares", "Suplementos alimentares"],
    ["suplementos", "Suplementos alimentares"],
    ["componentes para pc", "Componentes para PC"],
    ["informatica", "Informática"],
    ["roupas masculinas", "Moda masculina"],
    ["roupas femininas", "Moda feminina"],
    ["beleza e cuidado pessoal", "Beleza e cuidados"],
    ["beleza e cuidados", "Beleza e cuidados"],
  ]);

  const categoryKey = (value = "") => normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();
  const usefulWords = (value = "") => new Set(categoryKey(value).split(" ").filter((word) => word.length >= 4));
  const overlap = (left, right) => {
    const a = usefulWords(left);
    const b = usefulWords(right);
    if (!a.size || !b.size) return 0;
    let matches = 0;
    a.forEach((word) => { if (b.has(word)) matches += 1; });
    return matches / Math.min(a.size, b.size);
  };

  function trustedSourceCategory(product) {
    const parts = String(product.sourceCategory || "")
      .split(/>|\/|→|›/)
      .map((part) => part.replace(/^voltar\s*/i, "").trim())
      .filter(Boolean);
    const leaf = parts.at(-1) || "";
    if (leaf.length < 3 || leaf.length > 55) return "";
    if (/^(inicio|home|produto|produtos|oferta|ofertas|todos)$/i.test(leaf)) return "";
    if (overlap(leaf, product.productName || "") > 0.85 && leaf.split(/\s+/).length > 5) return "";
    return CATEGORY_ALIASES.get(categoryKey(leaf)) || leaf.replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function similarOfferCategory(product) {
    const target = `${product.productName || ""} ${product.shortDescription || ""} ${product.sourceCategory || ""} ${product.brand || ""} ${product.productType || ""}`;
    const ranked = state.synchronizedOffers
      .filter((offer) => offer.category && offer.productName)
      .map((offer) => ({ category: offer.category, score: overlap(target, `${offer.productName} ${offer.shortDescription || ""}`) }))
      .sort((left, right) => right.score - left.score);
    return ranked[0]?.score >= 0.58 ? ranked[0].category : "";
  }

  function resolveExistingCategory(product) {
    // Nunca cria categorias e nunca escolhe a primeira opção como fallback.
    const available = state.availableCategories.filter(Boolean);
    if (!available.length) return "";

    const explicit = String(product?.category || "").trim();
    const source = trustedSourceCategory(product || {});
    const similar = similarOfferCategory(product || {});
    const suggested = suggestCategory(product || {});
    const candidates = [explicit, source, similar, suggested].filter(Boolean);

    for (const proposed of candidates) {
      const exact = available.find((category) => categoryKey(category) === categoryKey(proposed));
      if (exact) return exact;

      const alias = CATEGORY_ALIASES.get(categoryKey(proposed));
      if (alias) {
        const aliasMatch = available.find((category) => categoryKey(category) === categoryKey(alias));
        if (aliasMatch) return aliasMatch;
      }

      const synonym = available
        .map((category) => ({ category, score: overlap(category, proposed) }))
        .sort((left, right) => right.score - left.score)[0];
      if (synonym?.score >= 0.78) return synonym.category;
    }

    const current = String(elements.fields.category.value || "").trim();
    return available.includes(current) ? current : "";
  }

  async function ensureCategory(product) {
    return resolveExistingCategory(product);
  }

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
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecione uma categoria";
    elements.fields.category.replaceChildren(placeholder, ...names.map((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      return option;
    }));
    elements.fields.category.value = names.includes(current) ? current : "";
  }

  async function synchronize() {
    if (state.catalogPromise) return state.catalogPromise;
    state.catalogPromise = panel.api.request("/api/admin/ofertas", { timeout: 12000, attempts: 2 })
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
    return ranked[0]?.score >= 3 ? ranked[0].category : "";
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

    const showRecent = elements.batchShowRecent?.checked === true;
    const withinCooldownWithoutChanges = (offer) => {
      if (showRecent || !offerWasPublished(offer)) return false;
      const publishedAt = new Date(offer.lastPublishedAt || offer.publishedAt || 0).getTime();
      const updatedAt = new Date(offer.updatedAt || 0).getTime();
      if (!publishedAt) return true;
      return publishedAt > Date.now() - (24 * 60 * 60 * 1000) && (!updatedAt || updatedAt <= publishedAt);
    };
    const postedKeys = new Set(
      state.synchronizedOffers
        .filter(withinCooldownWithoutChanges)
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
      if (!showRecent) {
        search.set("recentOnly", "true");
        search.set("cooldownHours", "24");
      }
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
    const productId = normalizedSourceProductId(product.externalProductId || product.sourceProductId || "");
    const platform = normalizeText(product.platform || "");
    const identity = batchUtils?.productIdentityFromUrl?.(product.sourceUrl || product.affiliateLink || "") || null;
    const link = comparableUrl(product.affiliateLink || product.sourceUrl || "");
    const name = normalizeText(product.productName || "");
    return state.synchronizedOffers.find((offer) => {
      const samePlatform = normalizeText(offer.platform) === platform;
      const offerProductId = normalizedSourceProductId(offer.sourceProductId);
      if (samePlatform && productId && offerProductId === productId) return true;

      const offerIdentity = batchUtils?.productIdentityFromUrl?.(offer.affiliateLink || offer.sourceUrl || "") || null;
      if (identity?.key && offerIdentity?.key === identity.key) return true;
      if (link && comparableUrl(offer.affiliateLink || offer.sourceUrl || "") === link) return true;
      return samePlatform && name && normalizeText(offer.productName) === name;
    }) || null;
  }

  panel.catalog = {
    findExisting,
    previouslyPostedUrls,
    suggestCategory,
    resolveExistingCategory,
    ensureCategory,
    synchronize,
    updateCategoryOptions,
  };
})();
