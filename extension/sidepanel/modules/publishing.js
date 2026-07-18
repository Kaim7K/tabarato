(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.publishing) return;

  const { elements, groupNames, lockActions, showToast, unlockActions } = panel;
  const runtime = globalThis.TaBaratoRuntime;
  const api = globalThis.TaBaratoExtensionApi;
  const { formatPrice, parsePrice } = globalThis.TaBaratoProductUtils;

  const failureMessage = (result, fallback) => {
    if (!result) return "";
    if (result.status === "rejected") return runtime.errorMessage(result.reason, fallback);
    return "";
  };

  async function publicationState(id) {
    try {
      return await runtime.retry(
        async () => {
          const data = await panel.api.request(`/api/admin/ofertas/${id}`, { timeout: 10000 });
          if (data?.offer?.status === "PUBLICANDO") throw new Error("Publicacao ainda em andamento.");
          return data;
        },
        {
          attempts: 3,
          delays: [800, 1600],
          shouldRetry: (error) => /ainda em andamento|demorou|timeout|rede|network/i.test(runtime.errorMessage(error)),
        },
      );
    } catch {
      return null;
    }
  }

  async function recordWhatsApp(id, result, errorMessage = "") {
    const failedGroups = Array.isArray(result?.results)
      ? result.results.filter((item) => !item.ok).map((item) => item.groupName).filter(Boolean)
      : [];
    const status = errorMessage || failedGroups.length ? "ERRO" : "SUCESSO";
    const detail = errorMessage || (failedGroups.length ? `Falha nos grupos: ${failedGroups.join(", ")}` : "");
    await panel.api.request(`/api/admin/ofertas/${id}/publicar`, {
      method: "POST",
      body: { action: "record-channel", channel: "WHATSAPP", status, errorMessage: detail },
      timeout: 10000,
    }).catch(() => {});
  }

  async function safePreparedShare(payload, suppliedShare = null) {
    if (suppliedShare) return suppliedShare;
    try {
      return await panel.media.prepareShare(payload);
    } catch (error) {
      runtime.reportError("prepare-publication-artwork", error);
      return { file: null, imageDataUrl: "", imageCacheKey: "" };
    }
  }

  async function publishOfferId(id, payload, options = {}) {
    const {
      forceRepublish = false,
      notifyWhatsApp = true,
      preparedShare: suppliedShare = null,
    } = options;
    const preparedShare = await safePreparedShare(payload, suppliedShare);
    const hasWhatsApp = notifyWhatsApp && groupNames().length > 0;

    // Site, Telegram e WhatsApp possuem ciclos independentes. O Telegram nunca
    // participa da barreira que libera o WhatsApp ou o proximo item do lote.
    const siteTask = panel.api.request(`/api/admin/ofertas/${id}/publicar`, {
      method: "POST",
      body: { action: "publish-site", forceRepublish },
      timeout: 18000,
    });
    const whatsappTask = hasWhatsApp
      ? panel.media.sendOfferToWhatsApp(payload, () => {}, preparedShare)
      : Promise.resolve(null);

    const telegramTracker = { state: "idle", value: null, error: null, promise: null };
    const launchTelegram = () => {
      if (telegramTracker.promise) return telegramTracker.promise;
      telegramTracker.state = "pending";
      telegramTracker.promise = panel.api.request(`/api/admin/ofertas/${id}/publicar`, {
        method: "POST",
        body: {
          action: "send-telegram",
          shareImageDataUrl: preparedShare.imageDataUrl || "",
          messageHeadline: payload.messageHeadline || "",
        },
        timeout: 38000,
      }).then((value) => {
        telegramTracker.state = "fulfilled";
        telegramTracker.value = value;
        return value;
      }).catch((error) => {
        telegramTracker.state = "rejected";
        telegramTracker.error = error;
        return null;
      });
      return telegramTracker.promise;
    };

    // Inicia o Telegram assim que o site confirmar, sem esperar o WhatsApp.
    siteTask.then((site) => {
      if (site?.sitePublished || site?.offer?.status === "PUBLICADO") launchTelegram();
    }).catch(() => {});

    const [siteSettled, whatsappSettled] = await Promise.allSettled([siteTask, whatsappTask]);
    let publication = siteSettled.status === "fulfilled" ? siteSettled.value : null;
    let sitePublished = Boolean(publication?.sitePublished || publication?.offer?.status === "PUBLICADO");
    let sitePending = Boolean(publication?.pending);
    let serverError = failureMessage(siteSettled, "O servidor nao confirmou a publicacao no site.");

    if (!sitePublished && (sitePending || serverError)) {
      const stateResult = await publicationState(id);
      if (stateResult?.offer) {
        publication = { ...(publication || {}), ok: true, offer: stateResult.offer };
        sitePublished = stateResult.offer.status === "PUBLICADO";
        sitePending = stateResult.offer.status === "PUBLICANDO";
        if (sitePublished) {
          serverError = "";
          launchTelegram();
        }
      }
    }

    let whatsappResult = whatsappSettled.status === "fulfilled" ? whatsappSettled.value : null;
    let whatsappError = failureMessage(whatsappSettled, "O WhatsApp nao confirmou o envio.");
    let whatsappWarning = "";
    if (hasWhatsApp && whatsappResult) {
      const failures = Array.isArray(whatsappResult.results)
        ? whatsappResult.results.filter((item) => !item.ok)
        : [];
      if (failures.length) {
        whatsappError = failures.map((item) => `${item.groupName}: ${item.error || "falha"}`).join("; ");
      }
      const textOnlyGroups = whatsappResult.results.filter((item) => item.ok && item.imageSkipped).map((item) => item.groupName);
      if (textOnlyGroups.length) whatsappWarning = `Imagem nao suportada; texto enviado em: ${textOnlyGroups.join(", ")}`;
      recordWhatsApp(id, whatsappResult, whatsappError).catch(() => {});
    } else if (hasWhatsApp && whatsappError) {
      recordWhatsApp(id, null, whatsappError).catch(() => {});
    }

    // Aproveita uma resposta que ja tenha chegado, mas nao espera o Telegram.
    if (telegramTracker.state === "pending") {
      await Promise.race([telegramTracker.promise, runtime.delay(350)]);
    }
    const telegramResponse = telegramTracker.value;
    const telegramError = telegramTracker.state === "rejected"
      ? runtime.errorMessage(telegramTracker.error, "O Telegram nao confirmou o envio.")
      : telegramResponse && !telegramResponse.ok && !telegramResponse.pending
        ? telegramResponse.error || "O Telegram nao confirmou o envio."
        : "";
    const telegramPending = telegramTracker.state === "pending"
      || Boolean(telegramResponse?.pending || telegramResponse?.uncertain);

    if (!sitePublished && !sitePending && serverError) {
      const error = new Error(serverError);
      error.channelResults = { telegramError, telegramPending, whatsappError, whatsappWarning, whatsappResult };
      throw error;
    }

    return {
      ...(publication || {}),
      ok: true,
      sitePublished,
      sitePending,
      telegramError,
      telegramPending,
      whatsappError,
      whatsappWarning,
      whatsappResult,
    };
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
      const [, preparedShare] = await Promise.all([
        panel.api.request(`/api/admin/ofertas/${existing.id}`, { method: "PATCH", body: payload }),
        safePreparedShare(payload),
      ]);
      const publication = await publishOfferId(existing.id, payload, {
        forceRepublish: true,
        notifyWhatsApp,
        preparedShare,
      });
      Object.assign(existing, payload, { status: "PUBLICADO", publishedAt: new Date().toISOString() });
      panel.catalog.addOffer(existing);
      if (refreshCatalog) await panel.catalog.synchronize();
      if (notifyUser) {
        const partial = publication.telegramError || publication.whatsappError;
        showToast(partial ? "Preco atualizado; um canal precisa de atencao." : "Preco melhor publicado novamente.", partial ? "neutral" : "success");
      }
      return { action: "updated", existing, publication };
    }

    if (nextPrice > oldPrice) {
      elements.duplicateWarning.textContent = `Preco pior detectado: ${formatPrice(nextPrice)}. Oferta removida do site.`;
      elements.duplicateWarning.classList.remove("hidden");
      await panel.api.request(`/api/admin/ofertas/${existing.id}`, { method: "DELETE" });
      panel.catalog.removeOffer(existing.id);
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
      panel.catalog.addOffer(data.offer);
      showToast(`Rascunho salvo: ${data.offer.productName}`, "success");
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
      const [created, preparedShare] = await Promise.all([
        panel.api.request("/api/admin/ofertas", { method: "POST", body: payload }),
        safePreparedShare(payload),
      ]);
      createdOffer = created.offer;
      const result = await publishOfferId(created.offer.id, payload, { notifyWhatsApp: true, preparedShare });
      panel.catalog.addOffer({
        ...created.offer,
        ...payload,
        status: result.sitePending ? "PUBLICANDO" : "PUBLICADO",
        publishedAt: result.sitePublished ? new Date().toISOString() : created.offer.publishedAt,
      });

      const issues = [];
      if (result.telegramPending) issues.push("Telegram pendente");
      else if (result.telegramError) issues.push("Telegram falhou");
      if (result.whatsappError) issues.push("WhatsApp parcial");
      else if (result.whatsappWarning) issues.push("WhatsApp enviado sem imagem em alguns grupos");
      showToast(
        issues.length ? `Oferta salva/publicada. ${issues.join("; ")}.` : "Oferta publicada em todos os canais selecionados.",
        issues.length ? "neutral" : "success",
      );
    } catch (error) {
      runtime.reportError("publish-offer", error);
      showToast(runtime.errorMessage(error), "error");
    } finally {
      if (createdOffer && !panel.catalog.findExisting(createdOffer)) panel.catalog.addOffer(createdOffer);
      unlockActions(owner, elements.publishButton);
    }
  }

  async function whatsapp() {
    if (!elements.offerForm.reportValidity()) return;
    const owner = "whatsapp";
    lockActions(owner, elements.whatsappButton, "Preparando...");
    try {
      const result = await panel.media.sendOfferToWhatsApp(panel.product.payload(), (label) => panel.setBusy(elements.whatsappButton, true, label));
      const failed = result.results?.filter((item) => !item.ok) || [];
      showToast(failed.length ? `Enviado com falha em ${failed.length} grupo(s).` : "Oferta enviada ao WhatsApp.", failed.length ? "neutral" : "success");
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

  async function customWhatsAppTask(message, imageUrl) {
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
    const result = await api.runtime.sendMessage({
      type: "TABARATO_SHARE_WHATSAPP",
      groupNames: groups,
      text: message,
      imageDataUrl,
      fileName: "mensagem.png",
      clipboardPrepared: await panel.media.copyDataUrlToClipboard(imageDataUrl, "mensagem.png").catch(() => false),
    });
    if (!result?.ok) throw new Error(result?.error || "Nao foi possivel enviar a mensagem ao WhatsApp.");
    return result;
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
      const channels = [];
      if (elements.customTelegram.checked) {
        channels.push("Telegram");
        tasks.push(panel.api.request("/api/admin/mensagens?action=send-custom", {
          method: "POST",
          body: { message, imageUrl },
          timeout: 45000,
        }));
      }
      if (elements.customWhatsapp.checked) {
        channels.push("WhatsApp");
        tasks.push(customWhatsAppTask(message, imageUrl));
      }

      const results = await Promise.allSettled(tasks);
      const succeeded = results.filter((item) => item.status === "fulfilled").length;
      const failed = results.map((item, index) => item.status === "rejected" ? `${channels[index]}: ${runtime.errorMessage(item.reason)}` : "").filter(Boolean);
      if (!succeeded) throw new Error(failed.join(" | ") || "Nenhum canal confirmou o envio.");
      showToast(failed.length ? `Mensagem enviada parcialmente. ${failed.join(" | ")}` : "Mensagem enviada.", failed.length ? "neutral" : "success");
    } catch (error) {
      runtime.reportError("custom-message", error);
      showToast(runtime.errorMessage(error), "error");
    } finally {
      unlockActions(owner, elements.customSendButton);
    }
  }

  panel.publishing = { publish, publishOfferId, reconcile, save, sendCustomMessage, whatsapp };
})();
