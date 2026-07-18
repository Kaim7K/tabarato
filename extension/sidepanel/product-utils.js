(() => {
  if (globalThis.TaBaratoProductUtils) return;

  const normalizeText = (value = "") => String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  const parsePrice = (value) => {
    const raw = String(value || "").replace(/[^\d.,]/g, "");
    if (!raw) return NaN;
    const separator = Math.max(raw.lastIndexOf(","), raw.lastIndexOf("."));
    if (separator < 0) return Number(raw);
    const decimals = raw.slice(separator + 1);
    const integer = raw.slice(0, separator).replace(/[.,]/g, "");
    return Number(decimals.length === 2 ? `${integer}.${decimals}` : `${integer}${decimals}`);
  };

  const formatPrice = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number > 0
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number)
      : "Preco nao identificado";
  };

  const previousPriceFor = (currentValue, previousValue, regularValue) => {
    const current = parsePrice(currentValue);
    if (!Number.isFinite(current) || current <= 0) return "";
    const previous = parsePrice(previousValue);
    if (Number.isFinite(previous) && previous > current) return String(previous);
    const regular = parsePrice(regularValue);
    if (Number.isFinite(regular) && regular >= current) return String(regular);
    return String(current);
  };

  const comparableUrl = (value) => {
    try {
      const url = new URL(value);
      url.hash = "";
      return url.href.replace(/\/$/, "");
    } catch {
      return String(value || "").trim().replace(/\/$/, "");
    }
  };

  const firstUsefulParagraph = (value = "") => {
    const paragraphs = String(value || "")
      .split(/\r?\n+/)
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    if (!paragraphs.length) return "";
    if (paragraphs[0].split(/\s+/).length >= 10 || !paragraphs[1]) return paragraphs[0];
    return paragraphs[1];
  };

  const messageBenefits = (value = "") => {
    const source = String(value || "").replace(/\s+/g, " ").trim();
    const pix = /\b(?:no|via|pelo|preco principal no)\s+pix\b/i.test(normalizeText(source));
    const lines = [];
    let hasInstallments = false;
    let hasShipping = false;
    source.split(/(?<=[.!?])\s+/).forEach((sentence) => {
      const containedDiscount = /\b\d{1,3}(?:[.,]\d+)?%\s*(?:off|de desconto)\b/i.test(sentence);
      const clean = sentence
        .replace(/promo[cç][aã]o\s*:[^.!?]*/gi, "")
        .replace(/\b\d{1,3}(?:[.,]\d+)?%\s*(?:off|de desconto)\b/gi, "")
        .replace(/\s+/g, " ")
        .replace(/^[,;:\s-]+|[,;:\s-]+$/g, "")
        .trim();
      if (!clean || !/[\p{L}\p{N}]/u.test(clean) || /pre[cç]o principal no pix/i.test(clean)) return;
      if (containedDiscount && /^(?:com|no|via|pelo)?\s*pix\.?$/i.test(clean)) return;
      if (/frete gr[aá]tis/i.test(clean)) {
        if (!hasShipping) lines.push("🚚 Frete grátis.");
        hasShipping = true;
        return;
      }
      if (/sem juros|parcel(?:a|e|amento)|\b\d{1,2}x\b/i.test(clean)) {
        if (!hasInstallments) lines.push(`💳 ${clean.replace(/^no cart[aã]o\s*:?\s*/i, "")}`);
        hasInstallments = true;
        return;
      }
      if (!/promo[cç][aã]o|\boff\b/i.test(clean)) lines.push(clean);
    });
    return { pix, lines: [...new Set(lines)] };
  };

  globalThis.TaBaratoProductUtils = {
    comparableUrl,
    firstUsefulParagraph,
    formatPrice,
    messageBenefits,
    normalizeText,
    parsePrice,
    previousPriceFor,
  };
})();
