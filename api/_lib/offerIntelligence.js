function number(value) {
  const parsed = Number(String(value ?? "").replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function hoursSince(value) {
  const timestamp = value ? new Date(value).getTime() : 0;
  if (!Number.isFinite(timestamp) || timestamp <= 0) return Infinity;
  return (Date.now() - timestamp) / 3600000;
}

export function evaluateOffer(input = {}) {
  const current = number(input.currentPrice);
  const previous = number(input.previousPrice);
  const discount = previous > current && current > 0 ? Math.round(((previous - current) / previous) * 100) : 0;
  const text = String(input.extraText || "");
  const evidence = input.evidence || {};
  const reasons = [];
  let economy = Math.min(55, discount * 2);
  let trust = 0;
  let urgency = 0;
  let publishable = 0;
  if (discount >= 10) reasons.push(`${discount}% de desconto real`);
  if (input.coupon) { economy += 10; reasons.push("cupom identificado"); }
  if (/frete\s+gr[aá]tis/i.test(text)) { economy += 8; reasons.push("frete grátis"); }
  if (/pix/i.test(text)) economy += 4;
  if (Number(evidence.rating) >= 4.5) { trust += 12; reasons.push("avaliação alta"); }
  if (Number(evidence.soldCount) >= 1000) { trust += 10; reasons.push("alto volume de vendas"); }
  if (evidence.officialStore || evidence.authorizedSeller) { trust += 12; reasons.push("loja oficial ou autorizada"); }
  if (evidence.warrantyMonths >= 12) { trust += 6; reasons.push("garantia de fabricante"); }
  if (evidence.endsAt && new Date(evidence.endsAt).getTime() - Date.now() < 6 * 3600000) { urgency += 15; reasons.push("oferta próxima do fim"); }
  if (evidence.promoStock === "low") { urgency += 10; reasons.push("estoque promocional baixo"); }
  if (/^https:\/\//i.test(input.affiliateLink || "")) publishable += 12;
  if (/^https:\/\//i.test(input.imageUrl || "")) publishable += 8;
  if (input.category) publishable += 5;
  if (evidence.variantAvailable !== false) publishable += 5;
  const score = Math.max(0, Math.min(100, Math.round(economy + trust + urgency + publishable)));
  const action = !current || evidence.variantAvailable === false || !/^https:\/\//i.test(input.affiliateLink || "")
    ? "BLOQUEAR" : score >= 70 ? "PUBLICAR" : score >= 45 ? "REVISAR" : "OBSERVAR";
  return { score, action, reasons, dimensions: { economy, trust, urgency, publishable }, discount };
}

export function evaluateRepublish(input = {}, { cooldownHours = 24 } = {}) {
  const evidence = input.evidence || input.intelligenceEvidence || {};
  const current = number(input.currentPrice);
  const lastPublishedPrice = number(input.lastPublishedPrice);
  const previous = number(input.previousPrice);
  const lastPublishedAt = input.lastPublishedAt || input.publishedAt || input.sitePublishedAt;
  const hours = hoursSince(lastPublishedAt);
  const reasons = [];

  if (!lastPublishedAt) reasons.push("nunca publicado");
  if (lastPublishedPrice > current && current > 0) {
    const drop = Math.round(((lastPublishedPrice - current) / lastPublishedPrice) * 100);
    reasons.push(`preço caiu ${drop}% desde a última publicação`);
  } else if (previous > current && current > 0 && hours > cooldownHours) {
    reasons.push("desconto ativo após o intervalo configurado");
  }
  if (input.coupon && input.coupon !== input.lastPublishedCoupon) reasons.push("cupom novo ou diferente");
  if (/frete\s+gr[aá]tis/i.test(String(input.extraText || "")) && !input.lastPublishedFreeShipping) reasons.push("frete grátis melhorou a oferta");
  if (/em estoque|estoque dispon/i.test(String(input.availabilityStatus || "")) && /indispon|expir/i.test(String(input.previousAvailabilityStatus || ""))) reasons.push("oferta voltou ao estoque");
  if (evidence.endsAt && new Date(evidence.endsAt).getTime() > Date.now()) reasons.push("urgência ativa");

  const unchangedRecent = Boolean(lastPublishedAt) && hours <= cooldownHours && reasons.length === 0;
  return {
    eligible: !unchangedRecent && reasons.length > 0,
    hiddenByCooldown: unchangedRecent,
    reasons,
    hoursSinceLastPublication: Number.isFinite(hours) ? Math.round(hours * 10) / 10 : null,
  };
}

export function queuePriority(input = {}) {
  const quality = evaluateOffer(input);
  const evidence = input.evidence || input.intelligenceEvidence || {};
  const republish = evaluateRepublish(input);
  const kind = evidence.flashSale || evidence.endsAt ? "RELAMPAGO"
    : republish.reasons.some((reason) => /preço caiu|desconto ativo/i.test(reason)) ? "QUEDA_PRECO"
      : "NORMAL";
  const kindWeight = { RELAMPAGO: 300, QUEDA_PRECO: 200, NORMAL: 100 }[kind];
  const priority = Math.max(-10, Math.min(10, Number(input.priority) || 0));
  return {
    kind,
    score: Math.round(kindWeight + quality.score + (priority * 3)),
    reason: [
      kind === "RELAMPAGO" ? "oferta relâmpago/urgente" : "",
      ...quality.reasons,
      ...republish.reasons,
    ].filter(Boolean).slice(0, 4).join(", ") || "oferta normal sem urgência especial",
  };
}
