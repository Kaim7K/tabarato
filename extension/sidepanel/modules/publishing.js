(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.publishing) return;

  const { elements, groupNames, lockActions, selectedDestinations, showToast, state, unlockActions } = panel;
  const runtime = globalThis.TaBaratoRuntime;
  const { formatPrice, parsePrice } = globalThis.TaBaratoProductUtils;

  function publicationOperationId(id, payload) {
    const price = String(payload.currentPrice || "").replace(/[^0-9]/g, "") || "none";
    const coupon = String(payload.coupon || "none").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "none";
    return `publish:${id}:${price}:${coupon}`;
  }

  async function operationMessage(type, value) {
    const response = await chrome.runtime.sendMessage({ type, ...value }).catch(() => null);
    return response?.ok === false ? null : response;
  }

  function channelPatch(operationId, channel, patch) {
    return operationMessage("TABARATO_OPERATION_CHANNEL", { id: operationId, channel, patch });
  }

  function failedWhatsAppSummary(result) {
    const failed = (result?.results || []).filter((item) => !item.ok);
    if (!failed.length) return "";
    return failed.map((item) => `${item.groupName}: ${item.error || "não confirmado"}`).join(" | ");
  }

  async function recordWhatsApp(id, result, errorMessage = "") {
    const ok = Boolean(result?.ok);
    await panel.api.request(`/api/admin/ofertas/${id}/publicar`, {
      method: "POST",
      body: {
        action: "record-channel",
        channel: "WHATSAPP",
        status: ok ? "SUCESSO" : "ERRO",
        errorMessage: ok ? "" : (errorMessage || failedWhatsAppSummary(result)),
      },
    }).catch((error) => runtime.reportError("record-whatsapp-publication", error));
  }

  async function publishOfferId(id, payload, options = {}) {
    const { forceRepublish = false, notifyWhatsApp = true, destinations = selectedDestinations() } = options;
    const groups = groupNames();
    const siteRequested = destinations.site !== false;
    const telegramRequested = destinations.telegram !== false;
    const remoteRequested = siteRequested || telegramRequested;
    const whatsappRequested = notifyWhatsApp && destinations.whatsapp !== false && groups.length > 0;
    if (!remoteRequested && !whatsappRequested) throw new Error("Selecione pelo menos um destino para enviar.");
    const operationId = publicationOperationId(id, payload);
    await operationMessage("TABARATO_OPERATION_CREATE", {
      operation: {
        id: operationId,
        kind: "publish",
        offerId: id,
        marketplace: payload.platform || "",
        productId: payload.sourceProductId || "",
        price: payload.currentPrice || "",
        coupon: payload.coupon || "",
        payload: { productName: payload.productName || "" },
        requestedChannels: { site: siteRequested, telegram: telegramRequested, whatsapp: whatsappRequested },
      },
    });
    await Promise.all([
      siteRequested ? channelPatch(operationId, "site", { status: "running", attempts: 1 }) : Promise.resolve(),
      telegramRequested ? channelPatch(operationId, "telegram", { status: "running", attempts: 1 }) : Promise.resolve(),
      whatsappRequested ? channelPatch(operationId, "whatsapp", { status: "running", attempts: 1 }) : Promise.resolve(),
    ]);

    const artwork = panel.media.shareImage(payload)
      .then(async (file) => ({ file, dataUrl: await panel.media.fileToDataUrl(file) }));

    const telegramTask = remoteRequested
      ? artwork
        .catch((error) => {
          runtime.reportError("prepare-telegram-artwork", error);
          return { dataUrl: "" };
        })
        .then(({ dataUrl }) => panel.api.request(`/api/admin/ofertas/${id}/publicar`, {
          method: "POST",
          body: {
            shareImageDataUrl: dataUrl,
            forceRepublish,
            messageHeadline: payload.messageHeadline || "",
            destinations: { site: siteRequested, telegram: telegramRequested },
          },
          timeout: 65000,
        }))
      : Promise.resolve({ ok: true, skipped: true });

    const whatsappTask = whatsappRequested
      ? panel.media.sendOfferToWhatsApp(payload)
      : Promise.resolve({ ok: true, skipped: true, results: [] });

    const [telegramSettled, whatsappSettled] = await Promise.allSettled([telegramTask, whatsappTask]);
    const channels = {
      telegram: {
        requested: telegramRequested,
        ok: !telegramRequested || (telegramSettled.status === "fulfilled" && Boolean(telegramSettled.value?.ok)),
        result: telegramSettled.status === "fulfilled" ? telegramSettled.value : telegramSettled.reason?.payload || null,
      },
      whatsapp: {
        requested: whatsappRequested,
        ok: !whatsappRequested || (whatsappSettled.status === "fulfilled" && Boolean(whatsappSettled.value?.ok)),
        partial: whatsappSettled.status === "fulfilled" && Boolean(whatsappSettled.value?.partial),
        result: whatsappSettled.status === "fulfilled" ? whatsappSettled.value : null,
      },
    };

    const telegramError = channels.telegram.ok
      ? ""
      : runtime.errorMessage(
        telegramSettled.status === "rejected" ? telegramSettled.reason : telegramSettled.value?.error,
        "Não foi possível publicar no site e Telegram.",
      );
    const whatsappError = !whatsappRequested || channels.whatsapp.ok
      ? ""
      : runtime.errorMessage(
        whatsappSettled.status === "rejected" ? whatsappSettled.reason : failedWhatsAppSummary(whatsappSettled.value),
        "O WhatsApp não confirmou todos os envios.",
      );

    if (whatsappRequested) await recordWhatsApp(id, channels.whatsapp.result, whatsappError);

    await Promise.all([
      siteRequested ? channelPatch(operationId, "site", {
        status: channels.telegram.ok ? "completed" : "failed",
        errorCode: channels.telegram.ok ? "" : "SITE_TELEGRAM_FAILED",
        errorMessage: telegramError,
      }) : Promise.resolve(),
      telegramRequested ? channelPatch(operationId, "telegram", {
        status: channels.telegram.ok ? "completed" : "failed",
        errorCode: channels.telegram.ok ? "" : "TELEGRAM_FAILED",
        errorMessage: telegramError,
      }) : Promise.resolve(),
      whatsappRequested ? channelPatch(operationId, "whatsapp", {
        status: channels.whatsapp.ok ? "completed" : "failed",
        errorCode: channels.whatsapp.ok ? "" : "WHATSAPP_FAILED",
        errorMessage: whatsappError,
      }) : Promise.resolve(),
    ]);

    const successfulChannels = [channels.telegram.ok, whatsappRequested && (channels.whatsapp.ok || channels.whatsapp.partial)].filter(Boolean).length;
    const failedChannels = [!channels.telegram.ok, whatsappRequested && !channels.whatsapp.ok].filter(Boolean).length;
    return {
      ok: failedChannels === 0,
      partial: successfulChannels > 0 && failedChannels > 0,
      channels,
      telegramError,
      whatsappError,
      offer: channels.telegram.result?.offer || null,
    };
  }

  function publicationToast(publication, hasWhatsApp) {
    const telegramOk = publication.channels.telegram.ok;
    const whatsapp = publication.channels.whatsapp;
    if (telegramOk && (!hasWhatsApp || whatsapp.ok)) {
      return {
        message: hasWhatsApp ? "Oferta publicada no site, Telegram e WhatsApp." : "Oferta publicada no site e Telegram.",
        tone: "success",
      };
    }
    if (telegramOk && hasWhatsApp) {
      return {
        message: `Site e Telegram publicados. WhatsApp incompleto: ${publication.whatsappError}`,
        tone: "neutral",
      };
    }
    if (!telegramOk && hasWhatsApp && (whatsapp.ok || whatsapp.partial)) {
      return {
        message: `WhatsApp enviado, mas o site/Telegram falhou: ${publication.telegramError}`,
        tone: "neutral",
      };
    }
    return {
      message: [publication.telegramError, publication.whatsappError].filter(Boolean).join(" | ") || "A publicação não foi concluída.",
      tone: "error",
    };
  }

  function inspectExisting(product) {
    elements.duplicateWarning.classList.add("hidden");
    const existing = panel.catalog.findExisting(product);
    if (!existing) return null;
    const nextPrice = parsePrice(product.currentPrice);
    const oldPrice = parsePrice(existing.currentPrice);
    let message = `Produto já cadastrado: ${existing.productName}.`;
    if (Number.isFinite(nextPrice) && Number.isFinite(oldPrice)) {
      if (nextPrice < oldPrice) message = `Já cadastrado por ${formatPrice(oldPrice)}. O novo preço é melhor e será atualizado apenas ao confirmar a publicação.`;
      else if (nextPrice > oldPrice) message = `Já cadastrado por ${formatPrice(oldPrice)}. O preço atual é pior; nada será removido automaticamente.`;
      else message = `Este produto já está cadastrado com o mesmo preço: ${formatPrice(oldPrice)}.`;
    }
    elements.duplicateWarning.textContent = message;
    elements.duplicateWarning.classList.remove("hidden");
    return existing;
  }

  async function reconcile(product, options = {}) {
    const { refreshCatalog = true, notifyWhatsApp = true, notifyUser = true } = options;
    const existing = inspectExisting(product);
    if (!existing) return { action: "none" };

    const nextPrice = parsePrice(product.currentPrice);
    const oldPrice = parsePrice(existing.currentPrice);
    if (!Number.isFinite(nextPrice) || !Number.isFinite(oldPrice)) return { action: "invalid", existing };

    if (nextPrice < oldPrice) {
      const payload = panel.product.toPayload(product, "APROVADO");
      await panel.api.request(`/api/admin/ofertas/${existing.id}`, { method: "PATCH", body: payload });
      const publication = await publishOfferId(existing.id, payload, { forceRepublish: true, notifyWhatsApp });
      Object.assign(existing, payload, publication.offer || {});
      if (refreshCatalog) await panel.catalog.synchronize();
      if (notifyUser) {
        const feedback = publicationToast(publication, notifyWhatsApp && groupNames().length > 0);
        showToast(feedback.message, feedback.tone);
      }
      return { action: "updated", existing, publication };
    }

    if (nextPrice > oldPrice) {
      // Preço pior nunca apaga uma publicação existente. O lote registra e segue.
      return { action: "worse-price", existing };
    }
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
    let changedCatalog = false;
    lockActions(owner, elements.publishButton, "Publicando...");
    try {
      const existing = panel.catalog.findExisting(state.activeProduct || payload);
      let offer;
      let forceRepublish = false;
      if (existing) {
        await panel.api.request(`/api/admin/ofertas/${existing.id}`, { method: "PATCH", body: payload });
        Object.assign(existing, payload);
        offer = existing;
        forceRepublish = true;
      } else {
        const created = await panel.api.request("/api/admin/ofertas", { method: "POST", body: payload });
        offer = created.offer;
        state.synchronizedOffers.unshift(offer);
      }
      changedCatalog = true;
      const destinations = selectedDestinations();
      const publication = await publishOfferId(offer.id, payload, { notifyWhatsApp: true, forceRepublish, destinations });
      if (publication.offer) Object.assign(offer, publication.offer);
      const feedback = publicationToast(publication, selectedDestinations().whatsapp && groupNames().length > 0);
      showToast(feedback.message, feedback.tone);
    } catch (error) {
      runtime.reportError("publish-offer", error);
      showToast(runtime.errorMessage(error), "error");
    } finally {
      if (changedCatalog) await panel.catalog.synchronize().catch((error) => runtime.reportError("sync-after-publish", error));
      unlockActions(owner, elements.publishButton);
    }
  }

  async function whatsapp() {
    if (!elements.offerForm.reportValidity()) return;
    const owner = "whatsapp";
    lockActions(owner, elements.whatsappButton, "Preparando...");
    try {
      const result = await panel.media.sendOfferToWhatsApp(panel.product.payload(), (label) => panel.setBusy(elements.whatsappButton, true, label));
      if (result.ok) showToast("Oferta enviada a todos os grupos do WhatsApp.", "success");
      else if (result.partial) showToast(`Envio parcial: ${failedWhatsAppSummary(result)}`, "neutral");
      else showToast(failedWhatsAppSummary(result) || "O WhatsApp não confirmou o envio.", "error");
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

  async function sendCustomWhatsApp(message, imageUrl) {
    const groups = groupNames();
    if (!groups.length) throw new Error("Registre pelo menos um grupo do WhatsApp.");
    let imageDataUrl = imageUrl;
    if (imageUrl && /^https:\/\//i.test(imageUrl)) {
      const response = await runtime.fetchWithTimeout(imageUrl, {}, 15000);
      if (!response.ok) throw new Error("Não foi possível carregar a imagem personalizada.");
      const blob = await response.blob();
      if (!/^image\//i.test(blob.type)) throw new Error("A URL informada não retornou uma imagem válida.");
      imageDataUrl = await panel.media.fileToDataUrl(new File([blob], "mensagem.png", { type: blob.type || "image/png" }));
    }
    return chrome.runtime.sendMessage({
      type: "TABARATO_SHARE_WHATSAPP",
      groupNames: groups,
      text: message,
      imageDataUrl,
      fileName: "mensagem.png",
    });
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
      const tasks = [];
      if (elements.customTelegram.checked) {
        tasks.push(["Telegram", panel.api.request("/api/admin/mensagens?action=send-custom", {
          method: "POST",
          body: { message, imageUrl },
          timeout: 45000,
        })]);
      }
      if (elements.customWhatsapp.checked) tasks.push(["WhatsApp", sendCustomWhatsApp(message, imageUrl)]);
      const settled = await Promise.allSettled(tasks.map(([, task]) => task));
      const failures = settled.flatMap((result, index) => {
        if (result.status === "rejected") return [`${tasks[index][0]}: ${runtime.errorMessage(result.reason)}`];
        if (tasks[index][0] === "WhatsApp" && !result.value?.ok) {
          return [`WhatsApp: ${failedWhatsAppSummary(result.value) || result.value?.error || "envio não confirmado"}`];
        }
        return [];
      });
      if (!failures.length) showToast("Mensagem enviada nos canais selecionados.", "success");
      else if (failures.length < tasks.length) showToast(`Envio parcial. ${failures.join(" | ")}`, "neutral");
      else showToast(failures.join(" | "), "error");
    } catch (error) {
      runtime.reportError("custom-message", error);
      showToast(runtime.errorMessage(error), "error");
    } finally {
      unlockActions(owner, elements.customSendButton);
    }
  }

  panel.publishing = {
    inspectExisting,
    publish,
    publishOfferId,
    reconcile,
    save,
    sendCustomMessage,
    whatsapp,
  };
})();
