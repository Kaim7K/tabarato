(() => {
  if (globalThis.top && globalThis.top !== globalThis) return;
  const tools = globalThis.TaBaratoCapture;
  if (!tools || globalThis.TaBaratoStores?.some((store) => store.id === "mercado-livre")) return;

  const MELI_LINK_PATTERN = /^https:\/\/(?:www\.)?meli\.la\/[A-Za-z0-9_-]+(?:[/?#][^\s"'<>]*)?$/i;
  const MELI_LINK_SEARCH = /https:\/\/(?:www\.)?meli\.la\/[A-Za-z0-9_-]+(?:[/?#][^\s"'<>]*)?/i;
  let capturedAffiliateLink = "";
  let capturedAffiliatePage = "";
  let affiliateCapturePromise = null;
  let affiliateCapturePromisePage = "";

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

  const stabilizePageTop = async (timeout = 900) => {
    let stableSamples = 0;
    const ready = await tools.waitFor(() => {
      pinPageToTop();
      stableSamples = scrollTop() <= 2 ? stableSamples + 1 : 0;
      return stableSamples >= 2 ? true : "";
    }, timeout);
    pinPageToTop();
    return Boolean(ready);
  };

  const restorePageScroll = (position) => {
    const top = Math.max(0, Number(position) || 0);
    const roots = [document.scrollingElement, document.documentElement, document.body].filter(Boolean);
    roots.forEach((root) => { root.scrollTop = top; });
    try {
      globalThis.scrollTo?.({ top, left: 0, behavior: "auto" });
    } catch {
      globalThis.scrollTo?.(0, top);
    }
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
      descendants,
    ].join(" "));
  };

  const normalizeLabel = (value = "") => tools.clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

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

  const meliLinkKey = (value = "") => {
    const link = extractMeliLink(value);
    if (!link) return "";
    try {
      const url = new URL(link);
      return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "")}`;
    } catch {
      return "";
    }
  };

  const publishProductPatch = async (patch, url = location.href) => {
    if (!patch || typeof patch !== "object" || !Object.keys(patch).length) return false;
    const response = await chrome.runtime.sendMessage({
      type: "TABARATO_PRODUCT_PATCH",
      url,
      patch,
    }).catch(() => null);
    return Boolean(response?.ok);
  };

  const productRoot = () => document.querySelector(".ui-pdp--sticky-wrapper-right")
    || document.querySelector(".ui-pdp-container--column-right")
    || document.querySelector(".ui-pdp-container__col.col-2")
    || document.querySelector(".ui-pdp-container--pdp")
    || document;

  const matchingControl = (root, pattern) => [...root.querySelectorAll("button, a, [role='button']")]
    .find((element) => tools.visible(element) && pattern.test(controlLabel(element)));

  const productControl = (pattern) => matchingControl(productRoot(), pattern);
  const visibleDialogs = (pattern) => [...document.querySelectorAll("[role='dialog'], [aria-modal='true'], .andes-modal, [class*='modal']")]
    .filter((element) => tools.visible(element) && pattern.test(tools.clean(element.textContent)));

  const visibleDialog = (pattern) => visibleDialogs(pattern)[0] || null;

  const affiliateDialogs = () => visibleDialogs(/gerar link\s*\/\s*id de produto|link do produto|id do produto|texto sugerido|meli\.la/i)
    .map((element) => {
      const text = tools.clean(element.textContent || "");
      const rectangle = element.getBoundingClientRect();
      const directLink = extractMeliLink(text);
      const score = (directLink ? 1000 : 0)
        + (/link do produto/i.test(text) ? 420 : 0)
        + (/id do produto/i.test(text) ? 120 : 0)
        + (/texto sugerido/i.test(text) ? 80 : 0)
        - Math.max(0, text.length - 6000) / 25
        - Math.max(0, rectangle.width * rectangle.height - 900000) / 5000;
      return { element, score };
    })
    .sort((left, right) => right.score - left.score)
    .map((item) => item.element);

  const affiliateDialog = () => affiliateDialogs()[0] || null;

  const productLinkValue = (element) => extractMeliLink([
    element?.value || "",
    element?.getAttribute?.("value") || "",
    element?.getAttribute?.("aria-label") || "",
    element?.getAttribute?.("title") || "",
    element?.textContent || "",
  ].join(" "));

  const productLinkField = (dialog) => {
    const roots = dialog ? [dialog] : affiliateDialogs();
    if (!roots.length) return null;
    return roots.flatMap((root) => [...root.querySelectorAll("input, textarea, a, span, p, [data-testid], [role='textbox'], div")])
      .filter((element, index, values) => values.indexOf(element) === index && tools.visible(element))
      .map((element) => {
        const context = normalizeLabel(contextText(element, 5));
        const value = productLinkValue(element);
        const ownText = tools.clean(element.textContent || "");
        const compactText = ownText.length <= 220;
        const directValue = extractMeliLink([element.value || "", element.getAttribute?.("value") || ""].join(" "));
        const score = (value ? 420 : 0)
          + (directValue ? 260 : 0)
          + (/link do produto/.test(context) ? 300 : 0)
          + (element.matches("input, textarea, [role='textbox']") ? 80 : 0)
          + (compactText ? 40 : -160)
          - (/texto sugerido/.test(context) ? 120 : 0)
          - (/id do produto/.test(context) && !/link do produto/.test(context) ? 180 : 0);
        return { element, score };
      })
      .filter((item) => item.score > 0 && productLinkValue(item.element))
      .sort((left, right) => right.score - left.score)[0]?.element || null;
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

  const exactControlLabel = (element, expected) => [
    element?.textContent || "",
    element?.getAttribute?.("aria-label") || "",
    element?.getAttribute?.("title") || "",
  ].some((value) => normalizeLabel(value) === expected);

  const darkWideSurface = (element) => {
    const viewportWidth = Number(globalThis.innerWidth || document.documentElement?.clientWidth || 0);
    let current = element;
    for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
      const rectangle = current.getBoundingClientRect();
      const background = String(getComputedStyle(current).backgroundColor || "");
      const channels = background.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) || [];
      const dark = channels.length === 3 && channels.reduce((sum, value) => sum + value, 0) < 420;
      const wide = viewportWidth <= 0 || rectangle.width >= viewportWidth * 0.45;
      if (dark && wide && rectangle.top < 120) return true;
    }
    return false;
  };

  const strictShareControl = () => [...document.querySelectorAll("button, [role='button']")]
    .filter((element) => element.id !== "tabarato-launcher" && tools.visible(element))
    .filter((element) => exactControlLabel(element, "compartilhar"))
    .filter((element) => !element.closest?.("a[href*='/afiliados-home']"))
    .map((element) => {
      const rectangle = element.getBoundingClientRect();
      if (rectangle.top < -8 || rectangle.top > 170 || rectangle.width < 50 || rectangle.height < 24) return null;
      let current = element;
      let affiliateBar = false;
      for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
        const text = normalizeLabel(current.textContent || "");
        if (/ganhos? extras?/.test(text)) affiliateBar = true;
      }
      const darkSurface = darkWideSurface(element);
      if (!affiliateBar && !darkSurface) return null;
      return {
        element,
        score: (affiliateBar ? 200 : 0) + (darkSurface ? 120 : 0) + Math.max(0, 170 - rectangle.top),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)[0]?.element || null;

  const prepareAffiliateLink = () => {
    pinPageToTop();
    return Boolean(strictShareControl());
  };

  function copyControlForField(field, dialog) {
    if (!field || !dialog) return null;
    const fieldRect = field.getBoundingClientRect();
    const directRoots = [field.parentElement, field.parentElement?.parentElement].filter(Boolean);
    const roots = [...directRoots, dialog];
    const candidates = roots.flatMap((root, rootIndex) => [...root.querySelectorAll("button, [role='button']")]
      .map((element) => ({ element, rootIndex })))
      .filter((item, index, values) => values.findIndex((candidate) => candidate.element === item.element) === index)
      .filter(({ element }) => tools.visible(element))
      .map(({ element, rootIndex }) => {
        const label = normalizeLabel(controlLabel(element));
        if (/fechar|close|^x$|^×$/.test(label)) return null;
        const rect = element.getBoundingClientRect();
        const verticalOverlap = Math.min(fieldRect.bottom, rect.bottom) - Math.max(fieldRect.top, rect.top);
        const sameRow = verticalOverlap > Math.min(fieldRect.height, rect.height) * 0.3;
        const adjacent = rect.left >= fieldRect.right - 24
          && rect.left <= fieldRect.right + 140
          && sameRow;
        const explicitCopy = /copiar|copy/.test(label);
        const rowText = normalizeLabel(contextText(element, 4));
        const inProductLinkRow = /link do produto/.test(rowText) && !/id do produto/.test(rowText.replace("link do produto", ""));
        const compactIcon = rect.width <= 80 && rect.height <= 80;
        const directSiblingControl = rootIndex <= 1 && compactIcon && sameRow;
        if (!explicitCopy && !adjacent && !(inProductLinkRow && compactIcon) && !directSiblingControl) return null;
        return {
          element,
          score: (explicitCopy ? 260 : 0)
            + (adjacent ? 180 : 0)
            + (inProductLinkRow ? 180 : 0)
            + (directSiblingControl ? 220 : 0)
            + (compactIcon ? 30 : 0)
            - Math.abs(rect.left - fieldRect.right),
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.score - left.score);
    return candidates[0]?.element || null;
  }

  async function copyAffiliateLinkFromDialog(dialog, expectedUrl) {
    const field = await tools.waitFor(() => {
      if (location.href !== expectedUrl) return "";
      // Alguns produtos ja exibem o meli.la imediatamente ao abrir o painel,
      // sem qualquer etapa "Gerar link". Procure em todas as superficies
      // afiliadas visiveis e priorize a linha real "Link do produto".
      const candidate = productLinkField() || productLinkField(dialog);
      return candidate && productLinkValue(candidate) ? candidate : "";
    }, 3200);
    if (!field) return "";

    const expectedLink = productLinkValue(field);
    if (!MELI_LINK_PATTERN.test(expectedLink)) return "";
    const fieldDialog = affiliateDialogs().find((candidate) => candidate.contains(field)) || affiliateDialog() || dialog;
    const copyControl = copyControlForField(field, fieldDialog);
    if (!copyControl) return "";

    copyControl.scrollIntoView?.({ block: "center", inline: "center", behavior: "auto" });
    copyControl.focus?.({ preventScroll: true });
    copyControl.click();

    // A coleta continua obrigatoriamente pelo botao real de copia. O link e
    // confirmado pela mesma linha "Link do produto", sem tentar reler o
    // clipboard a partir do service worker, que nao possui foco de documento.
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    // O textarea que originou o clique e a fonte mais confiavel. Reexecutar a
    // busca global pode selecionar um ancestral duplicado ou outra superficie
    // aninhada do modal e descartar um link que ja foi gerado corretamente.
    const confirmedLink = productLinkValue(field);
    return meliLinkKey(confirmedLink) === meliLinkKey(expectedLink) ? confirmedLink : "";
  }

  const openAffiliateDialog = async (attempt = 0, expectedUrl = location.href) => {
    if (location.href !== expectedUrl) return null;
    await stabilizePageTop();
    if (location.href !== expectedUrl) return null;
    const existing = affiliateDialog();
    if (existing) return existing;
    const controlWaits = [5000, 3500, 2500];
    const dialogWaits = [5000, 3800, 2800];
    const control = await tools.waitFor(
      () => location.href === expectedUrl ? strictShareControl() || "" : "",
      controlWaits[attempt] || 2500,
    );
    if (!control || location.href !== expectedUrl) return null;
    control.click();
    return tools.waitFor(() => location.href === expectedUrl ? affiliateDialog() || "" : "", dialogWaits[attempt] || 2800);
  };

  const captureAffiliateLink = async ({ force = false, expectedUrl = location.href } = {}) => {
    if (location.href !== expectedUrl || /\/afiliados-home(?:\/|$)/i.test(location.pathname)) return "";
    if (!force && capturedAffiliatePage === expectedUrl && MELI_LINK_PATTERN.test(capturedAffiliateLink)) {
      return capturedAffiliateLink;
    }
    if (affiliateCapturePromise && affiliateCapturePromisePage === expectedUrl) return affiliateCapturePromise;

    affiliateCapturePromisePage = expectedUrl;
    const initialScrollPosition = scrollTop();
    affiliateCapturePromise = (async () => {
      capturedAffiliatePage = expectedUrl;
      capturedAffiliateLink = "";
      try {
        const dialog = await openAffiliateDialog(0, expectedUrl);
        if (!dialog || location.href !== expectedUrl) return "";
        const link = await copyAffiliateLinkFromDialog(dialog, expectedUrl);
        if (!MELI_LINK_PATTERN.test(link)) return "";
        capturedAffiliateLink = link;
        await publishProductPatch({
          affiliateLink: link,
          affiliateLinkType: "mercado-livre-generated",
        }, expectedUrl);
        return link;
      } finally {
        await closeAffiliateDialog().catch(() => {});
        if (location.href === expectedUrl) restorePageScroll(initialScrollPosition);
      }
    })().finally(() => {
      affiliateCapturePromise = null;
      affiliateCapturePromisePage = "";
    });
    return affiliateCapturePromise;
  };

  const couponTrigger = () => {
    const labels = [
      "ver cupons disponiveis",
      "ver cupom disponivel",
      "ver cupons",
    ];
    return [...document.querySelectorAll("button, a, [role='button']")]
      .filter((element) => tools.visible(element))
      .find((element) => {
        const label = normalizeLabel([
          element.textContent || "",
          element.getAttribute("aria-label") || "",
          element.getAttribute("title") || "",
        ].join(" "));
        return labels.some((expected) => label === expected || label.startsWith(`${expected} `));
      }) || null;
  };

  const couponFrame = () => [...document.querySelectorAll("iframe.ui-pdp-iframe")]
    .find((frame) => frame.isConnected && (
      /cupons\/pdp/i.test(frame.getAttribute("src") || "")
      || /ver cupons disponiveis/i.test(frame.getAttribute("title") || "")
    )) || null;



  const closeCouponModal = async () => {
    const frame = couponFrame();
    if (!frame) return true;

    const isCloseControl = (element) => {
      if (!element || !tools.visible(element)) return false;
      const label = normalizeLabel([
        element.getAttribute?.("aria-label") || "",
        element.getAttribute?.("title") || "",
        element.getAttribute?.("data-testid") || "",
        element.textContent || "",
      ].join(" "));
      return /^(?:fechar|close)(?: modal| janela| dialogo| cupons)?$/.test(label)
        || label === "x"
        || label === "×"
        || /(?:close|fechar).*(?:modal|dialog|coupon|cupom)/.test(label);
    };

    const clickableAncestor = (element) => element?.closest?.("button, [role='button'], a") || element;
    const candidates = [];

    let container = frame.parentElement;
    for (let depth = 0; container && depth < 10; depth += 1) {
      candidates.push(...container.querySelectorAll?.("button, [role='button'], a, [aria-label], [title], [data-testid]") || []);
      container = container.parentElement;
    }

    candidates.push(...document.querySelectorAll("button, [role='button'], a, [aria-label], [title], [data-testid]"));

    let button = candidates
      .map(clickableAncestor)
      .find(isCloseControl) || null;

    if (button) {
      button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: globalThis }));
      button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: globalThis }));
      button.click();
    }

    let closed = await tools.waitFor(() => (couponFrame() ? "" : true), 2200);
    if (!closed) {
      for (const target of [document.activeElement, document.body, document]) {
        target?.dispatchEvent?.(new KeyboardEvent("keydown", {
          key: "Escape",
          code: "Escape",
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true,
        }));
        target?.dispatchEvent?.(new KeyboardEvent("keyup", {
          key: "Escape",
          code: "Escape",
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true,
        }));
      }
      closed = await tools.waitFor(() => (couponFrame() ? "" : true), 1600);
    }

    return Boolean(closed);
  };

  const captureCoupon = async () => {
    const initialScrollPosition = scrollTop();
    const expectedProductUrl = location.href;
    const existingFrame = couponFrame();
    const control = couponTrigger();
    if (!existingFrame && !control) return { code: "", status: "none" };

    await chrome.runtime.sendMessage({ type: "TABARATO_CLEAR_COUPON_FRAME_STATE" }).catch(() => {});
    const startedAt = Date.now();
    if (!existingFrame && control) {
      control.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "auto" });
      control.focus?.({ preventScroll: true });
      control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: globalThis }));
      control.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: globalThis }));
      control.click();
    }

    try {
      const frame = existingFrame || await tools.waitFor(() => couponFrame(), 8000);
      if (!frame) return { code: "", status: "none" };
      await chrome.runtime.sendMessage({ type: "TABARATO_ENSURE_COUPON_FRAME_SCRIPT" }).catch(() => null);

      const frameSrc = frame.getAttribute("src") || frame.src || "";
      let expectedItemId = "";
      try { expectedItemId = new URL(frameSrc, location.href).searchParams.get("item_id") || ""; } catch {}

      let stableStatus = "pending";
      let stableCount = 0;

      while (Date.now() - startedAt < 16000) {
        const response = await chrome.runtime.sendMessage({
          type: "TABARATO_GET_COUPON_FRAME_STATE",
          itemId: expectedItemId,
        }).catch(() => null);
        const state = response?.state;

        if (state?.updatedAt >= startedAt && (!expectedItemId || state.itemId === expectedItemId)) {
          if (state.status === "code" && state.code) {
            return { code: state.code, status: "code" };
          }

          if (state.status && state.status !== "pending") {
            if (state.status === stableStatus) stableCount += 1;
            else {
              stableStatus = state.status;
              stableCount = 1;
            }

            const elapsed = Date.now() - startedAt;
            const terminalIsExplicitNone = state.status === "none";
            const requiredSamples = terminalIsExplicitNone ? 4 : 8;
            const minimumElapsed = terminalIsExplicitNone ? 2500 : 5000;
            if (stableCount >= requiredSamples && elapsed >= minimumElapsed) {
              return { code: "", status: state.status };
            }
          } else {
            stableStatus = "pending";
            stableCount = 0;
          }
        }

        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }

      return { code: "", status: stableStatus === "pending" ? "none" : stableStatus };
    } finally {
      await closeCouponModal().catch(() => {});
      await chrome.runtime.sendMessage({ type: "TABARATO_CLEAR_COUPON_FRAME_STATE" }).catch(() => {});
      if (location.href === expectedProductUrl) restorePageScroll(initialScrollPosition);
    }
  };

  const paymentTextElements = (root = productRoot()) => [...root.querySelectorAll(
    ".ui-pdp-price__subtitles, .ui-pdp-payment, [class*='installment' i], [class*='payment' i]"
  )]
    .filter(tools.visible)
    .filter((element) => !element.closest?.(".poly-card, [class*='recommend' i], [class*='recos' i]"));

  const bestInstallmentSummary = (root = productRoot()) => paymentTextElements(root)
    .map((element) => tools.clean(element.textContent))
    .filter((text) => /sem\s+juros/i.test(text))
    .map((text) => tools.installmentSummary(text))
    .filter(Boolean)
    .sort((left, right) => {
      const score = (value) => (/R\$/.test(value) ? 100 : 0) + (/de\s+R\$/i.test(value) ? 50 : 0) + Number(value.match(/(\d{1,2})x/i)?.[1] || 0);
      return score(right) - score(left);
    })[0] || "";

  const visiblePaymentBenefits = () => {
    const root = productRoot();
    const benefits = [];
    const installment = bestInstallmentSummary(root);
    if (installment) benefits.push(installment);
    if (tools.hasExplicitFreeShipping(root)) benefits.push("Frete gratis.");
    return benefits.join(" ");
  };

  const paymentBenefits = async () => {
    const root = productRoot();
    const benefits = [];
    let installment = bestInstallmentSummary(root);
    const control = !installment && productControl(/meios de pagamento|formas de pagamento|ver.*pagamento/i);
    let dialog = null;
    if (!installment && control) {
      control.click();
      dialog = await tools.waitFor(
        () => visibleDialog(/meios de pagamento|cart[oõ]es de cr[eé]dito|aproveite estas promo[cç][oõ]es/i) || "",
        3500,
      );
      if (dialog) installment = bestInstallmentSummary(dialog);
    }
    if (installment) benefits.push(installment);
    if (tools.hasExplicitFreeShipping(root)) benefits.push("Frete gratis.");
    if (dialog && tools.visible(dialog)) closeDialog(dialog);
    await tools.closeTransientDialogs();
    return benefits.join(" ");
  };

  const quickCouponState = (hasCouponPrice = false) => {
    // O código do cupom nunca é inferido pelo texto geral da página. A única
    // fonte autorizada é o modal /cupons/pdp, lido pelo coupon-frame.js.
    return hasCouponPrice || Boolean(couponTrigger())
      ? { code: "", status: "pending" }
      : { code: "", status: "none" };
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

  const cachedAffiliateLinkForPage = () => capturedAffiliatePage === location.href
    && MELI_LINK_PATTERN.test(capturedAffiliateLink)
    ? capturedAffiliateLink
    : "";

  const mergedImageCandidates = (structured = {}) => {
    const candidates = mainGalleryImageCandidates();
    const push = (value, score, reason) => {
      const url = absoluteImageUrl(value);
      if (!/^https?:\/\/[^?#]*mlstatic\.com\//i.test(url)) return;
      if (/sprite|logo|avatar|icon/i.test(url)) return;
      if (candidates.some((item) => item.url === url)) return;
      candidates.push({ url, score, reason });
    };
    push(tools.meta("og:image") || tools.meta("twitter:image"), 75, "metadata");
    const structuredImages = tools.productImages(structured);
    structuredImages.forEach((value, index) => push(value, Math.max(35, 65 - index), "structured-data"));
    return candidates.sort((left, right) => right.score - left.score);
  };

  const productBreadcrumb = () => {
    const roots = document.querySelectorAll(".andes-breadcrumb__container, .ui-pdp-breadcrumb, nav[aria-label*='breadcrumb' i]");
    for (const root of roots) {
      const parts = [...root.querySelectorAll("a, span")]
        .map((item) => tools.clean(item.textContent))
        .filter((item) => item && !/^voltar$/i.test(item));
      const unique = [...new Set(parts)];
      if (unique.length) return unique.join(" > ");
    }
    return "";
  };

  const ratingValue = () => {
    const selectors = [
      ".ui-pdp-review__rating",
      ".ui-pdp-review__ratings__average",
      "[class*='rating' i]",
      "[aria-label*='avalia' i]",
      "[aria-label*='rating' i]",
    ];
    for (const selector of selectors) {
      for (const element of document.querySelectorAll(selector)) {
        if (!tools.visible(element)) continue;
        const text = tools.clean(`${element.getAttribute?.("aria-label") || ""} ${element.textContent || ""}`);
        const match = text.match(/(?:nota|avaliacao|avaliação|rating)?\s*([0-5](?:[.,]\d{1,2})?)(?:\s*de\s*5)?/i);
        const value = match ? Number(match[1].replace(",", ".")) : 0;
        if (value >= 1 && value <= 5) return value;
      }
    }
    const topText = tools.clean(document.querySelector("main")?.innerText || document.body?.innerText || "").slice(0, 5500);
    const fallback = topText.match(/\b([4-5](?:[.,]\d{1,2})?)\s*(?:\(|avaliacoes|avaliações|opinioes|opiniões|estrelas)/i);
    const value = fallback ? Number(fallback[1].replace(",", ".")) : 0;
    return value >= 1 && value <= 5 ? value : 0;
  };

  const fastProductSnapshot = () => {
    const structured = tools.jsonProduct();
    const productId = location.href.match(/\b(MLB-?\d{6,})\b/i)?.[1]?.replace("-", "").toUpperCase() || "";
    const priceInfo = tools.priceDetails(
      ".ui-pdp-price__main-container .ui-pdp-price__second-line > .ui-pdp-price__part__container > .andes-money-amount",
      ".ui-pdp-price__main-container .ui-pdp-price__second-line .andes-money-amount",
      ".ui-pdp-price__second-line .andes-money-amount"
    );
    const basePrice = priceInfo.value || tools.productPrice(structured);
    const couponPrice = tools.couponPriceDetails(basePrice);
    const couponState = quickCouponState(Boolean(couponPrice.value));
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
    const affiliateLink = cachedAffiliateLinkForPage();
    const product = {
      productName: tools.text(".ui-pdp-title", "h1") || tools.clean(structured.name) || tools.meta("og:title"),
      shortDescription: tools.description(".ui-pdp-description__content", ".ui-pdp-description") || tools.firstUsefulParagraph(structured.description) || tools.firstUsefulParagraph(tools.meta("og:description")),
      sourceCategory: productBreadcrumb(),
      currentPrice,
      previousPrice,
      regularPrice: basePrice,
      coupon: couponState.code,
      couponStatus: couponState.status,
      imageUrl: "",
      imageCandidates: mergedImageCandidates(structured),
      affiliateLink,
      affiliateLinkType: affiliateLink ? "mercado-livre-generated" : "pending",
      sourceUrl: tools.canonicalUrl(),
      externalProductId: productId,
      platform: "Mercado Livre",
      pricePaymentMethod: priceInfo.method === "Pix" ? "Pix" : couponPrice.value ? "Cupom" : "",
      extraText: visiblePaymentBenefits(),
      rating: ratingValue(),
      captureStage: "instant",
      confidence: 0,
    };
    product.imageUrl = product.imageCandidates[0]?.url || "";
    const required = [product.productName, product.currentPrice, product.imageUrl, product.externalProductId];
    product.confidence = required.filter(Boolean).length / required.length;
    return product;
  };

  const enrichProduct = async (baseProduct = {}) => {
    const expectedUrl = location.href;
    const assertCurrentPage = () => {
      if (location.href !== expectedUrl) throw new Error("A pagina mudou durante a captura complementar.");
    };
    const freshSnapshot = fastProductSnapshot();
    const product = {
      ...freshSnapshot,
      ...baseProduct,
      imageCandidates: baseProduct.imageCandidates?.length
        ? baseProduct.imageCandidates
        : freshSnapshot.imageCandidates,
    };
    try {
      if (!MELI_LINK_PATTERN.test(product.affiliateLink || "")) {
        product.affiliateLink = await captureAffiliateLink({ expectedUrl });
      }
      assertCurrentPage();
    } finally {
      await closeAffiliateDialog().catch(() => {});
    }

    assertCurrentPage();
    const couponIndicated = Boolean(
      product.pricePaymentMethod === "Cupom"
      || product.coupon
      || (product.couponStatus && product.couponStatus !== "none")
      || couponTrigger(),
    );
    if (couponIndicated) {
      const priceBeforeCoupon = Number(product.currentPrice || 0);
      const couponState = await captureCoupon();
      assertCurrentPage();
      if (/^applied/.test(couponState.status || "")) {
        const changed = await tools.waitFor(() => {
          const snapshot = fastProductSnapshot();
          const nextPrice = Number(snapshot.currentPrice || 0);
          return nextPrice > 0 && priceBeforeCoupon > 0 && nextPrice < priceBeforeCoupon ? snapshot : "";
        }, 5000, 300);
        if (changed) {
          product.currentPrice = changed.currentPrice;
          product.regularPrice = changed.regularPrice || product.regularPrice || String(priceBeforeCoupon);
          product.previousPrice = Number(product.previousPrice || 0) > Number(changed.currentPrice || 0)
            ? product.previousPrice
            : String(priceBeforeCoupon);
          product.pricePaymentMethod = "Cupom";
        }
      }
      // O iframe /cupons/pdp e a fonte autorizada para o codigo. Um codigo
      // confirmado e publicado imediatamente; estados genericos nunca o
      // sobrescrevem depois.
      if (couponState.status === "code" && couponState.code) {
        product.coupon = couponState.code;
        product.couponStatus = "code";
      } else {
        // Limpa qualquer valor antigo ou inferido. Sem código gravável, o
        // painel decide entre aviso de ativação e campo vazio pelo status.
        product.coupon = "";
        product.couponStatus = couponState.status || "none";
      }
      await publishProductPatch({ coupon: product.coupon, couponStatus: product.couponStatus }, expectedUrl);
    }

    assertCurrentPage();
    const completeBenefits = await paymentBenefits();
    assertCurrentPage();
    if (completeBenefits) {
      product.extraText = completeBenefits;
      await publishProductPatch({ extraText: completeBenefits }, expectedUrl);
    }
    const latestSnapshot = fastProductSnapshot();
    [
      "productName",
      "shortDescription",
      "sourceCategory",
      "currentPrice",
      "previousPrice",
      "regularPrice",
      "imageUrl",
      "imageCandidates",
      "externalProductId",
      "sourceUrl",
      "pricePaymentMethod",
    ].forEach((key) => {
      const value = latestSnapshot[key];
      if (Array.isArray(value) ? value.length : value) product[key] = value;
    });
    product.affiliateLinkType = MELI_LINK_PATTERN.test(product.affiliateLink || "")
      ? "mercado-livre-generated"
      : "missing";
    product.captureStage = "complete";
    const required = [product.productName, product.currentPrice, product.imageUrl, product.externalProductId, MELI_LINK_PATTERN.test(product.affiliateLink || "")];
    product.confidence = required.filter(Boolean).length / required.length;
    await closeAffiliateDialog().catch(() => {});
    await tools.closeTransientDialogs();
    return product;
  };

  globalThis.TaBaratoStores.push({
    id: "mercado-livre",
    platform: "Mercado Livre",
    matches: () => /mercadolivre|mercadolibre/i.test(location.hostname),
    isProduct: () => globalThis.TaBaratoPageContext?.routeFor?.() === "product"
      || /(?:^|[/?-])MLB-?\d{6,}(?:$|[/?#-])/i.test(location.href),
    prepareAffiliateLink,
    captureAffiliateLink,
    listProducts,
    extract: async () => fastProductSnapshot(),
    enrich: enrichProduct,
  });

})();
