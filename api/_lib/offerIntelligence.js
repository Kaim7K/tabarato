function number(value) {
  const parsed = Number(String(value ?? "").replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
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
