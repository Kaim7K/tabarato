(() => {
  const tools = globalThis.TaBaratoCapture;
  if (!tools || globalThis.TaBaratoStores?.some((store) => store.id === "mercado-livre")) return;

  const MELI_LINK_PATTERN = /^https:\/\/(?:www\.)?meli\.la\/[A-Za-z0-9_-]+(?:[/?#][^\s"'<>]*)?$/i;
  const MELI_LINK_SEARCH = /https:\/\/(?:www\.)?meli\.la\/[A-Za-z0-9_-]+(?:[/?#][^\s"'<>]*)?/i;
  let affiliateRequestStartedAt = 0;
  let capturedAffiliateLink = "";
  let capturedAffiliatePage = "";

  const scrollTop = () => Number(
    globalThis.scrollY
      || document.scrollingElement?.scrollTop
      || document.documentElement?.scrollTop
      || document.body?.scrollTop
      || 0
  );

  const pinPageToTop = () => {
    const roots = [document.scrollingElement, document.documentElement, document.body].filter(Boolean);
    roots.forEach((root) => {
      root.scrollTop = 0;
      root.scrollLeft = 0;
    });
    try {
      globalThis.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
    } catch {
      globalThis.scrollTo?.(0, 0);
    }
    return scrollTop() <= 2;
  };

  const stabilizePageTop = async (timeout = 1200) => {
    let stableSamples = 0;
    const ready = await tools.waitFor(() => {
      pinPageToTop();
      stableSamples = scrollTop() <= 2 ? stableSamples + 1 : 0;
      return stableSamples >= 3 ? true : "";
    }, timeout);
    pinPageToTop();
    return Boolean(ready);
  };

  const contextText = (element, depthLimit = 4) => {
    let current = element;
    let value = "";
    for (let depth = 0; current && depth < depthLimit; depth += 1) {
      value += ` ${tools.clean(current.textContent)}`;
      current = current.parentElement;
    }
    return value;
  };

  const controlLabel = (element) => {
    const descendants = [...(element?.querySelectorAll?.("[aria-label], [title], [data-testid]") || [])]
      .slice(0, 8)
      .map((item) => `${item.getAttribute("aria-label") || ""} ${item.getAttribute("title") || ""} ${item.getAttribute("data-testid") || ""}`)
      .join(" ");
    return tools.clean([
      element?.textContent || "",
      element?.getAttribute?.("aria-label") || "",
      element?.getAttribute?.("title") || "",
      element?.getAttribute?.("data-testid") || "",
      element?.getAttribute?.("name") || "",
      descendants,
    ].join(" "));
  };

  const extractMeliLink = (value = "") => {
    const decoded = String(value || "")
      .replace(/&amp;/gi, "&")
      .replace(/\\u002F/gi, "/")
      .replace(/\\\//g, "/");
    const match = decoded.match(MELI_LINK_SEARCH)?.[0]?.replace(/[),.;!?]+$/, "") || "";
    if (!match) return "";
    try {
      const url = new URL(match);
      return /^(?:www\.)?meli\.la$/i.test(url.hostname) ? url.href.replace(/\/$/, "") : "";
    } catch {
      return "";
    }
  };

  const productRoot = () => document.querySelector(".ui-pdp--sticky-wrapper-right")
    || document.querySelector(".ui-pdp-container--column-right")
    || document.querySelector(".ui-pdp-container__col.col-2")
    || document.querySelector(".ui-pdp-container--pdp")
    || document;

  const productControl = (pattern) => [...productRoot().querySelectorAll("button, a, [role='button']")]
    .find((element) => tools.visible(element) && pattern.test(controlLabel(element)));

  const visibleDialog = (pattern) => [...document.querySelectorAll("[role='dialog'], .andes-modal, [class*='modal']")]
    .find((element) => tools.visible(element) && pattern.test(tools.clean(element.textContent)));

  const affiliateDialog = () => visibleDialog(/gerar link\s*\/\s*id de produto|link do produto.*id do produto|texto sugerido|afiliad|meli\.la/i);

  const productLinkField = (dialog = affiliateDialog()) => {
    if (!dialog) return null;
    const candidates = [...dialog.querySelectorAll("input, textarea")]
      .filter((element) => extractMeliLink(element.value || element.getAttribute("value")))
      .map((element) => ({
        element,
        score: (element.matches("input") ? 30 : 0)
          + (/link do produto/i.test(contextText(element, 3)) ? 20 : 0)
          - (/texto sugerido/i.test(contextText(element, 3)) ? 10 : 0),
      }))
      .sort((left, right) => right.score - left.score);
    return candidates[0]?.element || null;
  };

  const readProductLink = (dialog = affiliateDialog()) => {
    if (!dialog) return "";
    const field = productLinkField(dialog);
    if (field) return extractMeliLink(field.value || field.getAttribute("value"));

    const values = [dialog.innerText, dialog.textContent, dialog.innerHTML];
    [...dialog.querySelectorAll("a[href], input, textarea, [contenteditable='true'], [data-clipboard-text], [data-copy], code, pre")]
      .forEach((element) => {
        values.push(
          element.href,
          element.value,
          element.textContent,
          element.getAttribute("value"),
          element.getAttribute("data-clipboard-text"),
          element.getAttribute("data-copy"),
        );
      });
    return values.map(extractMeliLink).find(Boolean) || "";
  };

  const copyProductLink = async (dialog, link) => {
    const field = productLinkField(dialog);
    const copyRoots = [field?.parentElement, dialog].filter(Boolean);
    const copyControl = copyRoots
      .flatMap((root) => [...root.querySelectorAll("button, [role='button']")])
      .filter(tools.visible)
      .find((element) => /copiar|copy/i.test(controlLabel(element)));
    if (copyControl) {
      copyControl.click();
      return;
    }
    if (document.hasFocus() && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link).catch(() => {});
    }
  };

  const closeDialog = (dialog) => {
    const close = [...dialog.querySelectorAll("button, [role='button'], a")].find((element) => {
      const label = tools.clean(`${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""} ${element.textContent || ""}`);
      return tools.visible(element) && /^(?:(?:fechar|close)(?: modal| janela| dialogo)?|x|×)$/i.test(label);
    });
    close?.click();
  };

  const closeAffiliateDialog = async () => {
    const dialog = affiliateDialog();
    if (dialog) closeDialog(dialog);
    await tools.closeTransientDialogs();
  };

  const affiliateContextScore = (element) => {
    let current = element;
    let score = 0;
    for (let depth = 0; current && depth < 9; depth += 1) {
      const text = tools.clean(current.textContent);
      if (/ganh(?:e|os?)\s*(?:extras?)?\s*(?:at[eé]\s*)?\d+(?:[.,]\d+)?\s*%/i.test(text)) score = Math.max(score, 120 - depth * 8);
      if (/programa\s+de\s+afiliados?|link\s+de\s+afiliado|afiliados?\s+e\s+criadores/i.test(text)) score = Math.max(score, 140 - depth * 8);
      current = current.parentElement;
    }
    return score;
  };

  const shareControls = () => [...document.querySelectorAll("button, a, [role='button']")]
    .filter((element) => element.id !== "tabarato-launcher" && tools.visible(element))
    .map((element) => {
      const label = controlLabel(element);
      const shareLabel = /compartilhar|compartilhe|\bshare\b|gerar\s+link|link\s+de\s+afiliado|afiliad/i.test(label);
      if (!shareLabel) return null;
      const contextScore = affiliateContextScore(element);
      const explicitAffiliateLabel = /afiliad|gerar\s+link|link\s+de\s+afiliado/i.test(label);
      const rectangle = element.getBoundingClientRect();
      const viewportWidth = Number(globalThis.innerWidth || document.documentElement?.clientWidth || 0);
      const topProductControl = rectangle.top >= 0
        && rectangle.top < 560
        && (viewportWidth <= 0 || rectangle.left > viewportWidth * 0.42);
      if (!contextScore && !explicitAffiliateLabel && !topProductControl) return null;
      const score = contextScore
        + (/compartilh|\bshare\b/i.test(label) ? 60 : 0)
        + (explicitAffiliateLabel ? 80 : 0)
        + (rectangle.top >= 0 && rectangle.top < 420 ? 35 : 0)
        - (rectangle.top > 900 ? 80 : 0)
        + (viewportWidth > 0 && rectangle.left > viewportWidth * 0.45 ? 10 : 0);
      return { element, score };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .map((item) => item.element);

  const affiliateRequestPending = () => Date.now() - affiliateRequestStartedAt < 1800;

  const prepareAffiliateLink = (force = false) => {
    pinPageToTop();
    if (affiliateDialog()) return true;
    if (!force && affiliateRequestPending()) return true;
    const control = shareControls()[0];
    if (!control) return false;
    affiliateRequestStartedAt = Date.now();
    control.click();
    return true;
  };

  const affiliateOutputControls = (dialog) => [...dialog.querySelectorAll("button, [role='button'], [role='tab'], a")]
    .filter(tools.visible);

  const activateAffiliateOutput = async (dialog) => {
    const controls = affiliateOutputControls(dialog);
    const productLinkTab = controls.find((element) => /^(?:link\s+do\s+produto|produto)$/i.test(controlLabel(element)));
    if (productLinkTab) productLinkTab.click();
    const generateControl = affiliateOutputControls(dialog)
      .find((element) => /^(?:gerar|gerar\s+link|criar\s+link)$/i.test(controlLabel(element)));
    generateControl?.click();
  };

  const openAffiliateDialog = async (attempt = 0) => {
    await stabilizePageTop();
    const existing = affiliateDialog();
    if (existing) return existing;
    if (affiliateRequestPending()) {
      const pendingDialog = await tools.waitFor(affiliateDialog, 1800);
      if (pendingDialog) return pendingDialog;
    }
    const controlWaits = [4500, 2500, 1800];
    const dialogWaits = [2500, 2000, 1500];
    const control = await tools.waitFor(() => shareControls()[0] || "", controlWaits[attempt] || 1800);
    if (!control) return null;
    affiliateRequestStartedAt = 0;
    prepareAffiliateLink(true);
    return tools.waitFor(affiliateDialog, dialogWaits[attempt] || 1500);
  };

  const captureAffiliateLink = async ({ force = false } = {}) => {
    if (!force && capturedAffiliatePage === location.href && MELI_LINK_PATTERN.test(capturedAffiliateLink)) {
      return capturedAffiliateLink;
    }
    if (force || capturedAffiliatePage !== location.href) affiliateRequestStartedAt = 0;
    capturedAffiliatePage = location.href;
    capturedAffiliateLink = "";
    await stabilizePageTop();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await stabilizePageTop();
      if (attempt > 0) await closeAffiliateDialog().catch(() => {});
      const dialog = await openAffiliateDialog(attempt);
      if (!dialog) continue;
      let link = readProductLink(dialog);
      if (!link) {
        const linkWaits = [2500, 1800, 1200];
        await activateAffiliateOutput(dialog);
        link = await tools.waitFor(() => readProductLink(affiliateDialog() || dialog), linkWaits[attempt] || 1200);
      }
      if (MELI_LINK_PATTERN.test(link)) {
        await copyProductLink(dialog, link);
        capturedAffiliateLink = link;
        return link;
      }
      affiliateRequestStartedAt = 0;
    }
    await closeAffiliateDialog().catch(() => {});
    return "";
  };

  const couponDialog = () => visibleDialog(/cupons? do mercado livre|cupom|conferir produtos|com\s*(?:\.{2,}|:|-)?\s*[A-Z][A-Z0-9_-]{3,24}/i);

  const usefulCoupon = (root = productRoot()) => tools.couponCandidates(root)[0]?.value || "";

  const couponDialogCodes = (root) => {
    if (!root) return [];
    const codes = [];
    const pushText = (value = "") => {
      globalThis.TaBaratoCouponCode.extractExplicitComCodes(value).forEach((code) => {
        if (!codes.includes(code)) codes.push(code);
      });
    };
    const rootText = root.innerText || root.textContent || "";
    const knownCouponSurface = root.matches?.("[role='dialog'], [aria-modal='true'], .andes-modal, [class*='modal' i]")
      || /cupons? do mercado livre|ver todos os meus cupons|conferir produtos/i.test(rootText);
    if (!knownCouponSurface) return [];

    // O modal pode ser grande. Leia o texto completo primeiro para capturar
    // rótulos como "Com MELIMODA" e "Com VALEDESCONTO" mesmo quando os
    // cartões não possuem classes com a palavra coupon/cupom.
    pushText(rootText);
    [...root.querySelectorAll("span, p, strong, b, label, small, div")]
      .filter(tools.visible)
      .map((element) => tools.clean(element.innerText || element.textContent || ""))
      .filter((text) => text && text.length <= 96 && /^com(?:\s+|(?:\.{2,}|:|-)\s*)[A-Z0-9]/i.test(text))
      .forEach(pushText);
    return codes;
  };

  const explicitCouponCode = (root = productRoot()) => {
    if (!root) return "";
    const modalCode = couponDialogCodes(root)[0] || "";
    if (modalCode) return modalCode;

    const selectors = [
      ".ui-vpp-coupons",
      "[class*='coupon' i]",
      "[class*='cupom' i]",
      "[data-testid*='coupon' i]",
      "[data-testid*='cupom' i]",
      ".ui-pdp-price__main-container",
      ".ui-pdp-price__second-line",
    ].join(", ");
    const candidates = [root, ...root.querySelectorAll(selectors)]
      .filter((element, index, values) => values.indexOf(element) === index)
      .filter((element) => element === root || tools.visible(element));
    for (const element of candidates) {
      const text = tools.clean(element.innerText || element.textContent || "");
      if (!text || text.length > 260 || !/\bcom\b/i.test(text)) continue;
      const code = globalThis.TaBaratoCouponCode.extractExplicitComCode(text);
      if (!code) continue;
      const couponContext = /cupom|coupon|desconto|\boff\b|R\$|ui-vpp-coupons/i.test(
        `${text} ${element.className || ""} ${element.getAttribute?.("data-testid") || ""}`,
      );
      if (couponContext) return code;
    }
    return "";
  };

  const captureCoupon = async (hasCouponPrice = false) => {
    const root = productRoot();
    const existing = explicitCouponCode(root) || usefulCoupon(root);
    if (existing) return { code: existing, status: "code" };
    const control = productControl(/ver cupons dispon[ií]veis|ver.*cupons?|cupons? dispon[ií]veis/i);
    const pageState = globalThis.TaBaratoCouponCode.classify(root.innerText || root.textContent || "", { hasCouponPrice });
    let dialog = couponDialog();
    if (!dialog && control) {
      control.click();
      dialog = await tools.waitFor(couponDialog, 3200);
    }
    try {
      if (!dialog) {
        const status = pageState.status !== "none"
          ? pageState.status
          : hasCouponPrice || control
            ? "activation-required"
            : "none";
        return { code: "", status };
      }
      const code = await tools.waitFor(() => {
        const activeDialog = couponDialog() || dialog;
        return explicitCouponCode(activeDialog) || usefulCoupon(activeDialog);
      }, 3600) || "";
      if (code) return { code, status: "code" };
      const dialogState = globalThis.TaBaratoCouponCode.classify(dialog.innerText || dialog.textContent || "", { hasCouponPrice });
      return dialogState.status === "none" && (hasCouponPrice || control)
        ? { code: "", status: "activation-required" }
        : dialogState;
    } finally {
      if (dialog && tools.visible(dialog)) closeDialog(dialog);
      await tools.closeTransientDialogs();
    }
  };

  const paymentBenefits = async () => {
    const root = productRoot();
    const pagePaymentText = [...root.querySelectorAll(".ui-pdp-price__subtitles, .ui-pdp-payment, [class*='installment' i], [class*='payment' i]")]
      .filter(tools.visible)
      .map((element) => tools.clean(element.textContent))
      .join(" ");
    const benefits = [];
    let installment = tools.installmentSummary(pagePaymentText);
    const control = !installment && productControl(/meios de pagamento|formas de pagamento|ver.*pagamento/i);
    if (!installment && control) {
      control.click();
      await tools.waitFor(() => (/meios de pagamento|cart[oõ]es de cr[eé]dito|aproveite estas promo[cç][oõ]es/i.test(document.body.innerText) ? true : ""), 3500);
      const dialog = visibleDialog(/meios de pagamento|cart[oõ]es de cr[eé]dito|aproveite estas promo[cç][oõ]es/i);
      installment = tools.installmentSummary(`${pagePaymentText} ${dialog?.innerText || ""}`);
      if (dialog && tools.visible(dialog)) closeDialog(dialog);
    }
    if (installment) benefits.push(installment);
    if (tools.hasExplicitFreeShipping(root)) benefits.push("Frete gratis.");
    return benefits.join(" ");
  };

  const listProducts = (limit = 20) => {
    const products = new Map();
    tools.productLinks([/\/MLB-?\d{6,}/i, /\bMLB\d{6,}/i]).forEach((url) => {
      const itemId = url.match(/(?:^|[/?-])(MLB-?\d{6,})(?:$|[/?#-])/i)?.[1]?.replace("-", "").toUpperCase();
      if (itemId && !products.has(itemId)) products.set(itemId, url);
    });
    return [...products.values()].slice(0, limit);
  };

  const absoluteImageUrl = (value = "") => {
    try {
      return new URL(value, location.href).href;
    } catch {
      return "";
    }
  };

  const mainGalleryImageCandidates = () => {
    const selectors = [
      ".ui-pdp-gallery__figure .ui-pdp-image",
      ".ui-pdp-gallery__figure img",
      ".ui-pdp-gallery img",
      "[data-testid*='gallery' i] img",
      ".ui-pdp-container__row--gallery img",
    ];
    const candidates = [];
    const push = (image, selector) => {
      if (!image || !tools.visible(image)) return;
      const source = image.currentSrc
        || image.src
        || image.getAttribute("data-src")
        || image.getAttribute("srcset")?.split(/\s+/)[0]
        || "";
      const url = absoluteImageUrl(source);
      if (!/^https?:\/\/[^?#]*mlstatic\.com\//i.test(url)) return;
      if (/sprite|logo|avatar|icon/i.test(url)) return;
      if (candidates.some((item) => item.url === url)) return;
      candidates.push({ url, score: Math.max(20, 120 - candidates.length), reason: `main-gallery:${selector}` });
    };
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((image) => push(image, selector));
    });
    return candidates;
  };

  globalThis.TaBaratoStores.push({
    id: "mercado-livre",
    platform: "Mercado Livre",
    matches: () => /mercadolivre|mercadolibre/i.test(location.hostname),
    isProduct: () => /(?:^|[/?-])MLB-?\d{6,}(?:$|[/?#-])/i.test(location.href)
      || Boolean(document.querySelector(".ui-pdp-title, .ui-pdp-price__second-line")),
    prepareAffiliateLink,
    captureAffiliateLink,
    listProducts,
    extract: async () => {
      try {
      let affiliateLink = "";
      try {
        affiliateLink = await captureAffiliateLink();
      } finally {
        await closeAffiliateDialog();
      }
      const structured = tools.jsonProduct();
      const productId = location.href.match(/\b(MLB-?\d{6,})\b/i)?.[1]?.replace("-", "").toUpperCase() || "";
      const priceInfo = tools.priceDetails(
        ".ui-pdp-price__main-container .ui-pdp-price__second-line > .ui-pdp-price__part__container > .andes-money-amount",
        ".ui-pdp-price__main-container .ui-pdp-price__second-line .andes-money-amount",
        ".ui-pdp-price__second-line .andes-money-amount"
      );
      const basePrice = priceInfo.value || tools.productPrice(structured);
      const couponPrice = tools.couponPriceDetails(basePrice);
      const couponState = await captureCoupon(Boolean(couponPrice.value));
      const currentPrice = couponPrice.value || basePrice;
      const capturedPreviousPrice = tools.price(
        ".ui-pdp-price__main-container .ui-pdp-price__original-value.andes-money-amount",
        ".ui-pdp-price__main-container .ui-pdp-price__original-value .andes-money-amount",
        ".ui-pdp-price__main-container .andes-money-amount--previous"
      );
      const previousPrice = Number(capturedPreviousPrice) > Number(currentPrice)
        ? capturedPreviousPrice
        : Number(basePrice) >= Number(currentPrice)
          ? basePrice
          : currentPrice;
      const product = {
        productName: tools.text(".ui-pdp-title", "h1") || tools.clean(structured.name) || tools.meta("og:title"),
        shortDescription: tools.description(".ui-pdp-description__content", ".ui-pdp-description") || tools.firstUsefulParagraph(structured.description) || tools.firstUsefulParagraph(tools.meta("og:description")),
        sourceCategory: tools.text(".andes-breadcrumb__container", ".ui-pdp-breadcrumb"),
        currentPrice,
        previousPrice,
        regularPrice: basePrice,
        coupon: couponState.code,
        couponStatus: couponState.status,
        imageUrl: "",
        imageCandidates: mainGalleryImageCandidates(),
        affiliateLink,
        affiliateLinkType: affiliateLink ? "mercado-livre-generated" : "missing",
        sourceUrl: tools.canonicalUrl(),
        externalProductId: productId,
        platform: "Mercado Livre",
        pricePaymentMethod: priceInfo.method === "Pix" ? "Pix" : couponPrice.value ? "Cupom" : "",
        confidence: 0,
      };
      product.imageUrl = product.imageCandidates[0]?.url || "";
      product.extraText = await paymentBenefits();
      const required = [product.productName, product.currentPrice, product.imageUrl, product.externalProductId, MELI_LINK_PATTERN.test(product.affiliateLink)];
      product.confidence = required.filter(Boolean).length / required.length;
      return product;
      } finally {
        await closeAffiliateDialog().catch(() => {});
        await tools.closeTransientDialogs();
      }
    },
  });
})();
