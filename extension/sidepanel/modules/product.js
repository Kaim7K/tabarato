(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.product) return;

  const { LIMITS, STORAGE, elements, state } = panel;
  const {
    comparableUrl,
    firstUsefulParagraph,
    formatPrice,
    normalizeCouponCode,
    previousPriceFor,
  } = globalThis.TaBaratoProductUtils;

  function valuesFor(product) {
    const currentPrice = product.currentPrice || "";
    return {
      affiliateLink: product.platform === "Mercado Livre"
        ? product.affiliateLink || ""
        : product.affiliateLink || product.sourceUrl || "",
      productName: product.productName || "",
      messageHeadline: product.messageHeadline || "",
      currentPrice,
      previousPrice: previousPriceFor(currentPrice, product.previousPrice, product.regularPrice || currentPrice),
      platform: product.platform || "Loja conectada",
      category: panel.catalog.suggestCategory(product),
      coupon: normalizeCouponCode(product.coupon),
      shortDescription: firstUsefulParagraph(product.shortDescription || ""),
      imageUrl: product.imageUrl || product.imageCandidates?.[0]?.url || "",
      extraText: [product.pricePaymentMethod === "Pix" ? "Preco principal no Pix." : "", product.extraText || ""]
        .filter(Boolean)
        .join(" "),
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
      coupon: normalizeCouponCode(elements.fields.coupon.value),
      couponDiscountPercent: 0,
      category: elements.fields.category.value,
      imageUrl: elements.fields.imageUrl.value.trim(),
      affiliateLink: elements.fields.affiliateLink.value.trim(),
      sourceProductId: sourceProduct?.externalProductId || sourceProduct?.sourceProductId || "",
      platform: elements.fields.platform.value,
      extraText: elements.fields.extraText.value.trim(),
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
  }

  function fill(product) {
    state.activeProduct = product;
    const values = valuesFor(product);
    Object.entries(values).forEach(([key, value]) => { elements.fields[key].value = value; });
    const reviewItems = [
      !values.affiliateLink && "link",
      !values.productName && "nome",
      !values.currentPrice && "preco",
      !values.imageUrl && "imagem",
      Number(product.confidence || 1) < LIMITS.minimumBatchConfidence && "dados incertos",
    ].filter(Boolean);
    elements.captureQuality.classList.toggle("hidden", reviewItems.length === 0);
    elements.captureQuality.textContent = reviewItems.length ? `Revise antes de publicar: ${reviewItems.join(", ")}.` : "";
    elements.captureSource.textContent = product.externalProductId ? `${values.platform} - ${product.externalProductId}` : values.platform;
    elements.offerForm.classList.remove("hidden");
    elements.empty.classList.add("hidden");
    updatePreview();
  }

  async function persistDraft() {
    if (!state.activeProduct) return;
    await chrome.storage.local.set({
      [STORAGE.productDraft]: {
        product: state.activeProduct,
        values: Object.fromEntries(Object.entries(elements.fields).map(([key, field]) => [key, field.value])),
        capturedTabId: state.capturedTabId,
        capturedPageUrl: state.capturedPageUrl,
        savedAt: Date.now(),
      },
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
      if (elements.fields[key]) elements.fields[key].value = key === "coupon" ? normalizeCouponCode(value) : value;
    });
    elements.fields.previousPrice.value = previousPriceFor(
      elements.fields.currentPrice.value,
      elements.fields.previousPrice.value,
      state.activeProduct.regularPrice || elements.fields.currentPrice.value,
    );
    updatePreview();
    elements.captureSource.textContent = "Produto restaurado";
    return true;
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
    fill,
    invalidateShareImage,
    normalizePriceFields,
    payload,
    persistDraft,
    restoreDraft,
    scheduleDraftPersist,
    toPayload,
    updatePreview,
    valuesFor,
  };
})();
