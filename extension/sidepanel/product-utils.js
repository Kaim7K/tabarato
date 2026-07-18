(() => {
  if (globalThis.TaBaratoProductUtils) return;

  const normalizeText = (value = "") => String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  const normalizeCouponCode = (value = "") => globalThis.TaBaratoCouponCode?.normalize(value) || "";
  const COUPON_ACTIVATION_MESSAGE = "disponível no anúncio. Ative antes de comprar.";

  function parsePrice(value) {
    const raw = String(value || "").replace(/[^\d.,]/g, "");
    if (!raw) return NaN;
    const separator = Math.max(raw.lastIndexOf(","), raw.lastIndexOf("."));
    if (separator < 0) return Number(raw);
    const decimals = raw.slice(separator + 1);
    const integer = raw.slice(0, separator).replace(/[.,]/g, "");
    return Number(decimals.length === 2 ? `${integer}.${decimals}` : `${integer}${decimals}`);
  }

  function formatPrice(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number)
      : "Preco nao identificado";
  }

  function couponNoticeForStatus(status = "") {
    return /^(?:activation-required|available-without-code)$/i.test(String(status || ""))
      ? COUPON_ACTIVATION_MESSAGE
      : "";
  }

  function normalizeCouponValue(value = "") {
    const code = normalizeCouponCode(value);
    if (code) return code;
    return normalizeText(value) === normalizeText(COUPON_ACTIVATION_MESSAGE)
      ? COUPON_ACTIVATION_MESSAGE
      : "";
  }

  function previousPriceFor(currentValue, previousValue, regularValue) {
    const current = parsePrice(currentValue);
    if (!Number.isFinite(current) || current <= 0) return "";
    const previous = parsePrice(previousValue);
    if (Number.isFinite(previous) && previous > current) return String(previous);
    const regular = parsePrice(regularValue);
    if (Number.isFinite(regular) && regular >= current) return String(regular);
    return String(current);
  }

  function comparableUrl(value) {
    try {
      const url = new URL(value);
      url.hash = "";
      return url.href.replace(/\/$/, "");
    } catch {
      return String(value || "").trim().replace(/\/$/, "");
    }
  }

  function firstUsefulParagraph(value = "") {
    const paragraphs = String(value)
      .split(/\r?\n+/)
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (!paragraphs.length) return "";
    if (paragraphs[0].split(/\s+/).length >= 10 || !paragraphs[1]) return paragraphs[0];
    return paragraphs[1];
  }

  function messageBenefits(value = "") {
    const source = String(value).replace(/\s+/g, " ").trim();
    const normalizedSource = normalizeText(source);
    const pix = /\b(?:no|via|pelo|preco principal no)\s+pix\b/i.test(normalizedSource);
    const lines = [];
    const seen = new Set();
    let hasInstallments = false;
    let hasShipping = false;

    const add = (line) => {
      const key = normalizeText(line);
      if (!key || seen.has(key)) return;
      seen.add(key);
      lines.push(line);
    };

    source.split(/(?<=[.!?])\s+/).forEach((sentence) => {
      const containedDiscount = /\b\d{1,3}(?:[.,]\d+)?%\s*(?:off|de desconto)\b/i.test(sentence);
      const clean = sentence
        .replace(/promo(?:c|\u00e7)(?:a|\u00e3)o\s*:[^.!?]*/gi, "")
        .replace(/\b\d{1,3}(?:[.,]\d+)?%\s*(?:off|de desconto)\b/gi, "")
        .replace(/\s+/g, " ")
        .replace(/^[,;:\s-]+|[,;:\s-]+$/g, "")
        .trim();
      const normalized = normalizeText(clean);
      if (!normalized || !/[\p{L}\p{N}]/u.test(clean) || /preco principal no pix/i.test(normalized)) return;
      if (containedDiscount && /^(?:com|no|via|pelo)?\s*pix\.?$/i.test(normalized)) return;
      if (/frete gratis/i.test(normalized)) {
        if (!hasShipping) add("\u{1F69A} Frete gr\u00e1tis.");
        hasShipping = true;
        return;
      }
      if (/sem juros|parcel(?:a|e|amento)|\b\d{1,2}x\b/i.test(normalized)) {
        if (!hasInstallments) add(`\u{1F4B3} ${clean.replace(/^no cart(?:a|\u00e3)o\s*:?\s*/i, "")}`);
        hasInstallments = true;
        return;
      }
      if (!/promocao|\boff\b/i.test(normalized)) add(clean);
    });
    return { pix, lines };
  }

  globalThis.TaBaratoProductUtils = Object.freeze({
    comparableUrl,
    couponNoticeForStatus,
    firstUsefulParagraph,
    formatPrice,
    messageBenefits,
    normalizeCouponCode,
    normalizeCouponValue,
    normalizeText,
    parsePrice,
    previousPriceFor,
  });
})();
