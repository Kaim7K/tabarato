(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.publishing) return;

  const { elements, groupNames, lockActions, showToast, state, unlockActions } = panel;
  const runtime = globalThis.TaBaratoRuntime;
  const { formatPrice, parsePrice } = globalThis.TaBaratoProductUtils;

  async function publishOfferId(id, payload, options = {}) {
    const {
      forceRepublish = false,
      notifyWhatsApp = true,
      tolerateWhatsAppFailure = false,
    } = options;
    const shareFile = await panel.media.shareImage(payload);
    const shareImageDataUrl = await panel.media.fileToDataUrl(shareFile);
    const publication = await panel.api.request(`/api/admin/ofertas/${id}/publicar`, {
      method: "POST",
      body: { shareImageDataUrl, forceRepublish, messageHeadline: payload.messageHeadline || "" },
      timeout: 45000,
    });
    if (!publication?.ok) throw new Error(publication?.error || "Nao foi possivel publicar no Telegram.");

    if (notifyWhatsApp && groupNames().length) {
      try {
        await panel.media.sendOfferToWhatsApp(payload);
        await panel.api.request(`/api/admin/ofertas/${id}/publicar`, {
          method: "POST",
          body: { action: "record-channel", channel: "WHATSAPP", status: "SUCESSO" },
        }).catch(() => {});
      } catch (error) {
        const message = runtime.errorMessage(error);
        await panel.api.request(`/api/admin/ofertas/${id}/publicar`, {
          method: "POST",
          body: { action: "record-channel", channel: "WHATSAPP", status: "ERRO", errorMessage: message },
        }).catch(() => {});
        if (tolerateWhatsAppFailure) return { ...publication, whatsappError: message };
        throw error;
      }
    }
    return publication;
  }

  async function reconcile(product, options = {}) {
    const {
      refreshCatalog = true,
      notifyWhatsApp = true,
      notifyUser = true,
    } = options;
    elements.duplicateWarning.classList.add("hidden");
    const existing = panel.catalog.findExisting(product);
    if (!existing) return { action: "none" };

    const nextPrice = parsePrice(product.currentPrice);
    const oldPrice = parsePrice(existing.currentPrice);
    if (!Number.isFinite(nextPrice) || !Number.isFinite(oldPrice)) return { action: "invalid", existing };

    if (nextPrice < oldPrice) {
      elements.duplicateWarning.textContent = `Ja cadastrado por ${formatPrice(oldPrice)}. Preco melhor detectado; atualizando e republicando.`;
      elements.duplicateWarning.classList.remove("hidden");
      const payload = panel.product.toPayload(product, "APROVADO");
      await panel.api.request(`/api/admin/ofertas/${existing.id}`, { method: "PATCH", body: payload });
      const publication = await publishOfferId(existing.id, payload, {
        forceRepublish: true,
        notifyWhatsApp,
        tolerateWhatsAppFailure: !notifyUser,
      });
      Object.assign(existing, payload);
      if (refreshCatalog) await panel.catalog.synchronize();
      if (notifyUser) showToast("Preco melhor publicado novamente.", "success");
      return { action: "updated", existing, publication };
    }

    if (nextPrice > oldPrice) {
      elements.duplicateWarning.textContent = `Preco pior detectado: ${formatPrice(nextPrice)}. Oferta removida do site.`;
      elements.duplicateWarning.classList.remove("hidden");
      await panel.api.request(`/api/admin/ofertas/${existing.id}`, { method: "DELETE" });
      state.synchronizedOffers = state.synchronizedOffers.filter((offer) => offer.id !== existing.id);
      if (refreshCatalog) await panel.catalog.synchronize();
      if (notifyUser) showToast("Oferta removida porque o preco piorou.", "success");
      return { action: "deleted", existing };
    }

    elements.duplicateWarning.textContent = `Este produto ja esta cadastrado com o mesmo preco em: ${existing.productName}.`;
    elements.duplicateWarning.classList.remove("hidden");
    return { action: "unchanged", existing };
  }

  async function save() {
    if (!elements.offerForm.reportValidity()) return;
    const owner = "save";
    lockActions(owner, elements.saveButton, "Salvando...");
    try {
      const data = await panel.api.request("/api/admin/ofertas", { method: "POST", body: panel.product.payload("RASCUNHO") });
      showToast(`Rascunho salvo: ${data.offer.productName}`, "success");
      await panel.catalog.synchronize();
    } catch (error) {
      runtime.reportError("save-offer", error);
      showToast(runtime.errorMessage(error), "error");
    } finally {
      unlockActions(owner, elements.saveButton);
    }
  }

  async function publish() {
    if (!elements.offerForm.reportValidity()) return;
    const owner = "publish";
    const payload = panel.product.payload("APROVADO");
    let createdOffer = null;
    lockActions(owner, elements.publishButton, "Publicando...");
    try {
      const created = await panel.api.request("/api/admin/ofertas", { method: "POST", body: payload });
      createdOffer = created.offer;
      await publishOfferId(created.offer.id, payload, { notifyWhatsApp: true });
      showToast(
        groupNames().length ? "Oferta publicada no site, Telegram e WhatsApp." : "Oferta publicada no site e Telegram.",
        "success",
      );
    } catch (error) {
      runtime.reportError("publish-offer", error);
      showToast(runtime.errorMessage(error), "error");
    } finally {
      if (createdOffer) await panel.catalog.synchronize().catch((error) => runtime.reportError("sync-after-publish", error));
      unlockActions(owner, elements.publishButton);
    }
  }

  async function whatsapp() {
    if (!elements.offerForm.reportValidity()) return;
    const owner = "whatsapp";
    lockActions(owner, elements.whatsappButton, "Preparando...");
    try {
      await panel.media.sendOfferToWhatsApp(panel.product.payload(), (label) => panel.setBusy(elements.whatsappButton, true, label));
      showToast("Oferta enviada ao WhatsApp.", "success");
    } catch (error) {
      runtime.reportError("share-whatsapp", error);
      showToast(runtime.errorMessage(error), "error");
    } finally {
      unlockActions(owner, elements.whatsappButton);
    }
  }

  async function customImageDataUrl() {
    const file = elements.customImageFile.files?.[0];
    if (!file) return "";
    if (!/^image\/(?:png|jpe?g|webp)$/i.test(file.type)) throw new Error("Use PNG, JPG ou WebP.");
    if (file.size > 12 * 1024 * 1024) throw new Error("Imagem muito grande.");
    return panel.media.fileToDataUrl(file);
  }

  async function sendCustomMessage() {
    const message = elements.customMessage.value.trim();
    if (!message) {
      elements.customMessage.focus();
      showToast("Escreva a mensagem personalizada.", "error");
      return;
    }
    if (!elements.customTelegram.checked && !elements.customWhatsapp.checked) {
      showToast("Selecione Telegram ou WhatsApp.", "error");
      return;
    }

    const owner = "custom-message";
    lockActions(owner, elements.customSendButton, "Enviando...");
    try {
      const imageUrl = await customImageDataUrl() || elements.customImageUrl.value.trim();
      if (elements.customTelegram.checked) {
        await panel.api.request("/api/admin/mensagens?action=send-custom", {
          method: "POST",
          body: { message, imageUrl },
          timeout: 30000,
        });
      }
      if (elements.customWhatsapp.checked) {
        const groups = groupNames();
        if (!groups.length) throw new Error("Registre pelo menos um grupo do WhatsApp.");
        let imageDataUrl = imageUrl;
        if (imageUrl && /^https:\/\//i.test(imageUrl)) {
          const response = await runtime.fetchWithTimeout(imageUrl, {}, 15000);
          if (!response.ok) throw new Error("Nao foi possivel carregar a imagem personalizada.");
          const blob = await response.blob();
          if (!/^image\//i.test(blob.type)) throw new Error("A URL informada nao retornou uma imagem valida.");
          imageDataUrl = await panel.media.fileToDataUrl(new File([blob], "mensagem.png", { type: blob.type || "image/png" }));
        }
        const result = await chrome.runtime.sendMessage({
          type: "TABARATO_SHARE_WHATSAPP",
          groupNames: groups,
            text: message,
            imageDataUrl,
            fileName: "mensagem.png",
            clipboardPrepared: await panel.media.copyDataUrlToClipboard(imageDataUrl, "mensagem.png").catch(() => false),
          });
        if (!result?.ok) throw new Error(result?.error || "Nao foi possivel enviar a mensagem ao WhatsApp.");
      }
      showToast("Mensagem enviada.", "success");
    } catch (error) {
      runtime.reportError("custom-message", error);
      showToast(runtime.errorMessage(error), "error");
    } finally {
      unlockActions(owner, elements.customSendButton);
    }
  }

  panel.publishing = { publish, publishOfferId, reconcile, save, sendCustomMessage, whatsapp };
})();
