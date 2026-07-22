(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.product) return;

  const { LIMITS, STORAGE, elements, state } = panel;
  const {
    comparableUrl,
    couponNoticeForStatus,
    firstUsefulParagraph,
    formatPrice,
    normalizeCouponCode,
    normalizeCouponValue,
    previousPriceFor,
  } = globalThis.TaBaratoProductUtils;
  const MAX_DRAFTS = 40;

  function valuesFor(product) {
    const currentPrice = product.currentPrice || "";
    return {
      affiliateLink: product.affiliateLink || "",
      productName: product.productName || "",
      messageHeadline: product.messageHeadline || "",
      currentPrice,
      previousPrice: previousPriceFor(currentPrice, product.previousPrice, product.regularPrice || currentPrice),
      platform: product.platform || "Loja conectada",
      category: panel.catalog.resolveExistingCategory(product),
      coupon: normalizeCouponCode(product.coupon) || couponNoticeForStatus(product.couponStatus),
      shortDescription: firstUsefulParagraph(product.shortDescription || ""),
      imageUrl: product.imageUrl || product.imageCandidates?.[0]?.url || "",
      extraText: [product.pricePaymentMethod === "Pix" ? "Preco principal no Pix." : "", product.extraText || ""]
        .filter(Boolean)
        .join(" "),
      intelligenceEvidence: product.intelligenceEvidence || {},
    };
  }

  function payload(status = "RASCUNHO", sourceProduct = state.activeProduct) {
    const currentPrice = elements.fields.currentPrice.value;
    return {
      productName: elements.fields.productName.value.trim(),
      messageHeadline: elements.fields.messageHeadline.value.trim(),
      shortDescription: elements.fields.shortDescription.value.trim(),
      currentPrice,
      previousPrice: previousPriceFor(currentPrice, elements.fields.previousPrice.value, sourceProduct?.regularPrice || currentPrice),
      coupon: normalizeCouponValue(elements.fields.coupon.value),
      couponDiscountPercent: 0,
      category: elements.fields.category.value,
      imageUrl: elements.fields.imageUrl.value.trim(),
      affiliateLink: elements.fields.affiliateLink.value.trim(),
      sourceProductId: sourceProduct?.externalProductId || sourceProduct?.sourceProductId || "",
      platform: elements.fields.platform.value,
      extraText: elements.fields.extraText.value.trim(),
      intelligenceEvidence: sourceProduct?.intelligenceEvidence || {},
      status,
      scheduledAt: null,
    };
  }

  function toPayload(product, status = "RASCUNHO") {
    return {
      ...valuesFor(product),
      couponDiscountPercent: 0,
      sourceProductId: product.externalProductId || product.sourceProductId || "",
      status,
      scheduledAt: null,
    };
  }

  function invalidateShareImage() {
    state.shareImagePromise = null;
    state.shareImageKey = "";
  }

  function updatePreview() {
    const data = payload();
    elements.previewName.textContent = data.productName || "Nome do produto";
    const pix = state.activeProduct?.pricePaymentMethod === "Pix" ? " (Pix)" : "";
    elements.previewPrice.textContent = `${formatPrice(data.currentPrice)}${pix}`;
    elements.previewPreviousPrice.textContent = data.previousPrice ? formatPrice(data.previousPrice) : "";
    elements.previewCategory.textContent = data.category || "Categoria";
    elements.platformBadge.textContent = data.platform || "Loja";
    if ((elements.previewImage.getAttribute("src") || "") !== data.imageUrl) elements.previewImage.src = data.imageUrl || "";
    elements.previewImage.hidden = !data.imageUrl;
    invalidateShareImage();
    if (state.activeProduct) renderOfferIntelligence(state.activeProduct, data);
  }

  function parsedPrice(value) {
    const normalized = String(value || "").replace(/[^\d,.]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
    return Number(normalized) || 0;
  }

  function offerDecision(product, values) {
    const evidence = product?.intelligenceEvidence || {};
    const current = parsedPrice(values.currentPrice);
    const previous = parsedPrice(values.previousPrice);
    const discount = previous > current && current > 0 ? Math.round(((previous - current) / previous) * 100) : 0;
    const reasons = [];
    let economy = Math.min(55, discount * 2);
    let trust = 0;
    let urgency = 0;
    let publishable = 0;
    if (discount >= 10) reasons.push(`caiu ${discount}%`);
    if (values.coupon && !/disponivel|precisa/i.test(values.coupon)) { economy += 10; reasons.push("tem cupom"); }
    if (/frete\s+gr[aá]tis/i.test(values.extraText || "")) { economy += 8; reasons.push("frete grátis"); }
    if (Number(evidence.rating) >= 4.5) { trust += 12; reasons.push("avaliação alta"); }
    if (Number(evidence.soldCount) >= 1000) { trust += 10; reasons.push("muitas vendas"); }
    if (evidence.officialStore || evidence.authorizedSeller) { trust += 12; reasons.push("loja confiável"); }
    if (evidence.warrantyMonths >= 12) { trust += 6; reasons.push("garantia"); }
    if (evidence.endsAt && new Date(evidence.endsAt).getTime() - Date.now() < 6 * 60 * 60 * 1000) { urgency += 15; reasons.push("termina em breve"); }
    if (evidence.promoStock === "low") { urgency += 10; reasons.push("estoque promocional baixo"); }
    if (/^https:\/\//i.test(values.affiliateLink)) publishable += 12;
    if (/^https:\/\//i.test(values.imageUrl)) publishable += 8;
    if (values.category) publishable += 5;
    if (evidence.variantAvailable !== false) publishable += 5;
    const score = Math.max(0, Math.min(100, Math.round(economy + trust + urgency + publishable)));
    const action = evidence.variantAvailable === false
      ? "Bloquear"
      : !/^https:\/\//i.test(values.affiliateLink)
        ? "Gerar link"
        : score >= 70 ? "Publicar" : score >= 45 ? "Revisar" : "Observar";
    return { action, score, reasons, economy, trust, urgency, publishable };
  }

  function renderOfferIntelligence(product, values) {
    const decision = offerDecision(product, values);
    elements.intelligenceAction.textContent = decision.action;
    elements.intelligenceScore.textContent = `${decision.score}/100`;
    elements.intelligenceReason.textContent = decision.reasons.length
      ? `Decisão: ${decision.action.toLowerCase()} porque ${decision.reasons.join(", ")}.`
      : "Complete link, categoria e condições para uma recomendação mais precisa.";
    elements.intelligenceDimensions.replaceChildren(...[
      ["Economia", decision.economy],
      ["Confiança", decision.trust],
      ["Urgência", decision.urgency],
      ["Pronta", decision.publishable],
    ].map(([label, value]) => {
      const item = document.createElement("span");
      item.textContent = `${label}: ${value}`;
      return item;
    }));
    elements.offerIntelligence.classList.remove("hidden");
  }

  function renderCaptureState(product, values) {
    const couponPlaceholders = {
      "activation-required": "Cupom precisa ser ativado antes da compra.",
      "applied-without-code": "Cupom aplicado, mas sem codigo exibido.",
      "available-without-code": "Cupom disponivel, mas sem codigo exibido.",
      none: "",
    };
    elements.fields.coupon.placeholder = couponPlaceholders[product.couponStatus] || "Codigo do cupom";
    const reviewItems = [
      !values.affiliateLink && "link",
      !values.productName && "nome",
      !values.currentPrice && "preco",
      !values.imageUrl && "imagem",
      Number(product.confidence || 1) < LIMITS.minimumBatchConfidence && "dados incertos",
    ].filter(Boolean);
    elements.captureQuality.classList.toggle("hidden", reviewItems.length === 0);
    elements.captureQuality.textContent = product.captureStage === "instant"
      ? "Dados principais prontos. Completando link, cupom e pagamento em segundo plano..."
      : reviewItems.length
        ? `Revise antes de publicar: ${reviewItems.join(", ")}.`
        : "";
    const stage = product.captureStage === "instant" ? " · leitura instantanea" : "";
    elements.captureSource.textContent = product.externalProductId
      ? `${values.platform} - ${product.externalProductId}${stage}`
      : `${values.platform}${stage}`;
    elements.offerForm.classList.remove("hidden");
    elements.empty.classList.add("hidden");
    elements.shopeeLinkButton.classList.toggle("hidden", values.platform !== "Shopee" || Boolean(values.affiliateLink));
    updatePreview();
  }

  function fill(product) {
    const previousProductKey = state.activeProduct?.externalProductId || state.activeProduct?.sourceUrl || "";
    const nextProductKey = product?.externalProductId || product?.sourceUrl || "";
    if (previousProductKey && nextProductKey && previousProductKey !== nextProductKey) elements.fields.category.value = "";
    state.activeProduct = product;
    const values = valuesFor(product);
    Object.entries(values).forEach(([key, value]) => {
      const field = elements.fields[key];
      if (field) field.value = value;
    });
    state.autoFieldValues = { ...values };
    renderCaptureState(product, values);
    renderOfferIntelligence(product, values);
  }

  function mergeEnrichment(product) {
    const previousProduct = state.activeProduct || {};
    const previousValues = valuesFor(previousProduct);
    const mergedProduct = { ...previousProduct, ...product };
    const nextValues = valuesFor(mergedProduct);
    state.activeProduct = mergedProduct;
    Object.entries(nextValues).forEach(([key, value]) => {
      const field = elements.fields[key];
      if (!field) return;
      const previousAutomatic = Object.hasOwn(state.autoFieldValues || {}, key)
        ? state.autoFieldValues[key]
        : previousValues[key];
      const replaceableCouponNotice = key === "coupon" && [
        "Disponível no anúncio. Ative antes de comprar.",
        "Cupom aplicado, mas sem codigo exibido.",
        "Cupom disponivel, mas sem codigo exibido.",
        "Cupom precisa ser ativado antes da compra.",
      ].includes(field.value.trim());
      if (!field.value || field.value === previousAutomatic || replaceableCouponNotice) field.value = value;
    });
    state.autoFieldValues = { ...nextValues };
    renderCaptureState(mergedProduct, nextValues);
    updatePreview();
    return mergedProduct;
  }

  function draftKey(tabId, pageUrl) {
    const normalizedUrl = comparableUrl(pageUrl || "");
    return tabId && normalizedUrl ? `${tabId}::${normalizedUrl}` : "";
  }

  function draftRecord() {
    return {
      product: state.activeProduct,
      values: Object.fromEntries(Object.entries(elements.fields).map(([key, field]) => [key, field.value])),
      capturedTabId: state.capturedTabId,
      capturedPageUrl: state.capturedPageUrl,
      savedAt: Date.now(),
    };
  }

  function pruneDrafts(drafts) {
    return Object.fromEntries(Object.entries(drafts || {})
      .filter(([, draft]) => draft?.product && Number(draft.savedAt || 0) > Date.now() - 14 * 24 * 60 * 60 * 1000)
      .sort((left, right) => Number(right[1].savedAt || 0) - Number(left[1].savedAt || 0))
      .slice(0, MAX_DRAFTS));
  }

  async function persistDraft() {
    if (!state.activeProduct) return;
    const key = draftKey(state.capturedTabId, state.capturedPageUrl || state.activeProduct.sourceUrl);
    if (!key) return;
    const stored = await chrome.storage.local.get(STORAGE.productDrafts);
    const drafts = pruneDrafts(stored[STORAGE.productDrafts]);
    const currentDraft = draftRecord();
    drafts[key] = currentDraft;
    await chrome.storage.local.set({
      [STORAGE.productDrafts]: pruneDrafts(drafts),
      [STORAGE.lastActiveProduct]: currentDraft,
    });
  }

  function scheduleDraftPersist() {
    window.clearTimeout(state.draftPersistTimer);
    state.draftPersistTimer = window.setTimeout(() => persistDraft().catch(() => {}), 250);
  }

  function restoreDraft(draft) {
    if (!draft?.product) return false;
    state.capturedTabId = draft.capturedTabId || null;
    state.capturedPageUrl = draft.capturedPageUrl || comparableUrl(draft.product.sourceUrl || "");
    fill(draft.product);
    Object.entries(draft.values || {}).forEach(([key, value]) => {
      if (elements.fields[key]) elements.fields[key].value = key === "coupon" ? normalizeCouponValue(value) : value;
    });
    elements.fields.previousPrice.value = previousPriceFor(
      elements.fields.currentPrice.value,
      elements.fields.previousPrice.value,
      state.activeProduct.regularPrice || elements.fields.currentPrice.value,
    );
    updatePreview();
    elements.captureSource.textContent = "Produto restaurado nesta aba";
    return true;
  }

  function draftForTab(drafts, tab) {
    const exact = draftKey(tab?.id, tab?.url);
    if (exact && drafts?.[exact]) return drafts[exact];
    return Object.values(drafts || {})
      .filter((draft) => draft?.capturedTabId === tab?.id && comparableUrl(draft?.capturedPageUrl) === comparableUrl(tab?.url))
      .sort((left, right) => Number(right.savedAt || 0) - Number(left.savedAt || 0))[0] || null;
  }

  function restoreDraftForTab(drafts, tab, legacyDraft = null) {
    const draft = draftForTab(drafts, tab)
      || (legacyDraft?.capturedTabId === tab?.id && comparableUrl(legacyDraft?.capturedPageUrl) === comparableUrl(tab?.url)
        ? legacyDraft
        : null);
    return restoreDraft(draft);
  }

  function clearForTab() {
    state.activeProduct = null;
    state.capturedTabId = null;
    state.capturedPageUrl = "";
    Object.values(elements.fields).forEach((field) => { field.value = ""; });
    state.autoFieldValues = {};
    elements.offerForm.classList.add("hidden");
    elements.shopeeLinkButton.classList.add("hidden");
    elements.loading.classList.add("hidden");
    elements.empty.classList.remove("hidden");
    elements.captureQuality.classList.add("hidden");
    elements.captureQuality.textContent = "";
    elements.captureSource.textContent = "Abra um produto para capturar.";
    elements.offerIntelligence.classList.add("hidden");
    updatePreview();
  }

  function normalizePriceFields() {
    elements.fields.previousPrice.value = previousPriceFor(
      elements.fields.currentPrice.value,
      elements.fields.previousPrice.value,
      state.activeProduct?.regularPrice || elements.fields.currentPrice.value,
    );
    updatePreview();
    scheduleDraftPersist();
  }

  panel.product = {
    clearForTab,
    draftForTab,
    fill,
    mergeEnrichment,
    invalidateShareImage,
    normalizePriceFields,
    payload,
    persistDraft,
    restoreDraft,
    restoreDraftForTab,
    scheduleDraftPersist,
    toPayload,
    updatePreview,
    valuesFor,
  };
})();
