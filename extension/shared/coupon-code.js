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
      /\b(?:Com|COM)\s*(?:\.{2,}|:|-)?\s*([A-Z][A-Z0-9_-]{3,24})\b(?=[\s\S]{0,60}(?:\d{1,3}(?:[.,]\d+)?\s*%\s*OFF|R\$\s*[\d.,]+|compra\s+m[i\u00ed]nima|limite\s+de|cupom))/g,
    ];
    patterns.forEach((pattern) => {
      for (const match of text.matchAll(pattern)) {
        const code = normalize(match[1]);
        if (code && !matches.includes(code)) matches.push(code);
      }
    });
    return matches;
  }

  function extractExplicitComCode(value = "") {
    const text = String(value || "");
    for (const match of text.matchAll(/\b(?:Com|COM)\s*(?:\.{2,}|:|-)?\s*([A-Z][A-Z0-9_-]{3,24})\b/g)) {
      const code = normalize(match[1]);
      if (code) return code;
    }
    return "";
  }

  function classify(value = "", options = {}) {
    const text = String(value || "");
    const code = extract(text)[0] || "";
    if (code) return { code, status: "code" };
    const comparable = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (/\b(?:cupom\s+)?(?:ativado|aplicado|resgatado)\b|economizando[\s\S]{0,80}\bcom\s+\d+\s+cupom/.test(comparable)) {
      return { code: "", status: "applied-without-code" };
    }
    if (/nenhum cupom|nao (?:ha|tem|encontramos) cupons?|sem cupons? disponiveis?/.test(comparable)) {
      return { code: "", status: "none" };
    }
    if (/\b(?:ativar|aplicar|resgatar)\b[\s\S]{0,50}\bcupom\b|\bcupom\b[\s\S]{0,50}\b(?:ativar|aplicar|resgatar)\b/.test(comparable)) {
      return { code: "", status: "activation-required" };
    }
    if (options.hasCouponPrice && /cupom/.test(comparable)) {
      return { code: "", status: "activation-required" };
    }
    if (/cupons?\s+disponiveis?|ver\s+cupons?/.test(comparable)) {
      return { code: "", status: "available-without-code" };
    }
    return { code: "", status: "none" };
  }

  globalThis.TaBaratoCouponCode = Object.freeze({
    classify,
    extract,
    extractExplicitComCode,
    normalize,
  });
})();
