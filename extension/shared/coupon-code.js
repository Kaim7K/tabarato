(() => {
  if (globalThis.TaBaratoCouponCode) return;

  const BLOCKED_CODES = new Set([
    "ANUNCIO",
    "APLICAR",
    "ATIVE",
    "CARTAO",
    "COMPRAR",
    "CUPOM",
    "CUPONS",
    "DESCONTO",
    "DISPONIVEL",
    "FRETE",
    "GRATIS",
    "JUROS",
    "MERCADO",
    "PAGAMENTO",
    "PARCELAMENTO",
    "PRODUTOS",
  ]);

  function normalize(value = "") {
    const raw = String(value || "")
      .trim()
      .replace(/^(?:cupom|codigo)(?:\s+de\s+desconto)?\s*[:#-]?\s*/i, "")
      .replace(/["'`.,;:!?()[\]{}]/g, "")
      .trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{3,24}$/.test(raw)) return "";
    const hasCodeMarker = /[0-9_-]/.test(raw);
    if (!hasCodeMarker && raw !== raw.toUpperCase()) return "";
    const code = raw.toUpperCase();
    if (/^\d+$/.test(code) || BLOCKED_CODES.has(code)) return "";
    return code;
  }

  function extract(value = "") {
    const text = String(value || "");
    const matches = [];
    const patterns = [
      /(?:cupom|c[o\u00f3]digo)(?:\s+de\s+desconto)?\s*[:#-]\s*([A-Za-z0-9][A-Za-z0-9_-]{3,24})\b/gi,
      /\b(?:Com|COM)\s+([A-Z][A-Z0-9_-]{3,24})\b(?=\s+(?:\d{1,3}(?:[.,]\d+)?\s*%\s*OFF|R\$\s*[\d.,]+))/g,
    ];
    patterns.forEach((pattern) => {
      for (const match of text.matchAll(pattern)) {
        const code = normalize(match[1]);
        if (code && !matches.includes(code)) matches.push(code);
      }
    });
    return matches;
  }

  globalThis.TaBaratoCouponCode = Object.freeze({ extract, normalize });
})();
