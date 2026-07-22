import test from "node:test";
import assert from "node:assert/strict";
import { formatTelegramMessage, publicationSignals } from "../api/_lib/telegram.js";

test("Telegram message keeps current and previous prices on one line", () => {
  const message = formatTelegramMessage({
    productName: "Produto teste",
    currentPrice: "24.90",
    previousPrice: "47.90",
    affiliateLink: "https://meli.la/teste",
  });

  assert.match(message, /💰 <b>R\$ 24,90<\/b>\s+\|\s+❌ <s>R\$ 47,90<\/s>/u);
  assert.match(message, /👇 <b>Compre aqui:<\/b>\nhttps:\/\/meli\.la\/teste/u);
});

test("Telegram message displays the coupon in the requested format", () => {
  const message = formatTelegramMessage({
    productName: "Produto",
    currentPrice: 50,
    coupon: "MELIMODA",
  });
  assert.match(message, /🎟️ Cupom: <b>MELIMODA<\/b>/u);
});

test("Telegram message omits the coupon line when there is no coupon", () => {
  const message = formatTelegramMessage({
    productName: "Produto",
    currentPrice: 50,
  });
  assert.match(message, /❌ <s>R\$ 50,00<\/s>/u);
  assert.doesNotMatch(message, /Cupom:/u);
});

test("Telegram message never shows a previous price below the current price", () => {
  const message = formatTelegramMessage({
    productName: "Produto",
    currentPrice: 79.92,
    previousPrice: 78.99,
  });
  assert.match(message, /❌ <s>R\$ 79,92<\/s>/u);
  assert.doesNotMatch(message, /78,99/u);
});

test("Telegram message uses the custom headline", () => {
  const message = formatTelegramMessage({
    productName: "Produto",
    currentPrice: 50,
    messageHeadline: "OFERTA RELAMPAGO!",
  });
  assert.match(message, /🔥 OFERTA RELAMPAGO!/u);
  assert.doesNotMatch(message, /TÁ BARATO/u);
});

test("Telegram message never invents a final coupon price", () => {
  const message = formatTelegramMessage({
    productName: "Produto",
    currentPrice: 619.99,
    couponDiscountPercent: 24,
  });
  assert.doesNotMatch(message, /Com cupom/i);
  assert.doesNotMatch(message, /471,19/);
});

test("Telegram message keeps benefits concise and places Pix beside the price", () => {
  const message = formatTelegramMessage({
    productName: "Produto",
    currentPrice: 176.9,
    extraText: "Promocao: 43% OFF. Preco principal no Pix. Ate 10x sem juros. Frete gratis.",
  });

  assert.match(message, /R\$ 176,90<\/b> \(no Pix\)/);
  assert.match(message, /💳/u);
  assert.match(message, /🚚 Frete grátis/u);
  assert.doesNotMatch(message, /Promo(?:ção|cao)|43%|OFF/i);
  assert.doesNotMatch(message, /^\.$/m);
});

test("Telegram removes discount copy and deduplicates payment and shipping benefits", () => {
  const message = formatTelegramMessage({
    productName: "Produto",
    currentPrice: 577.91,
    previousPrice: 799,
    extraText: "Preco principal no Pix. 20% OFF com Pix. R$ 739,90 em 10x sem juros. 10x sem juros. Frete gratis. Frete gratis.",
  });

  assert.match(message, /R\$ 577,91<\/b> \(no Pix\)/);
  assert.match(message, /R\$ 739,90 em 10x sem juros/);
  assert.doesNotMatch(message, /20%|OFF|com Pix/i);
  assert.equal((message.match(/sem juros/g) || []).length, 1);
  assert.equal((message.match(/Frete grátis/g) || []).length, 1);
});

test("Telegram separates prices from free shipping with a blank line", () => {
  const message = formatTelegramMessage({
    productName: "Produto",
    currentPrice: 69.9,
    previousPrice: 99.99,
    extraText: "Frete gratis.",
  });

  assert.match(message, /<s>R\$ 99,99<\/s>\n\n🚚 Frete grátis/u);
});

test("Telegram applies automatic templates for commerce signals", () => {
  const endsAt = new Date(Date.now() + 2 * 3600000).toISOString();
  const offer = {
    productName: "Produto",
    currentPrice: 89.9,
    coupon: "GANHE10",
    extraText: "Preço principal no Pix. Mercado Livre Full. Frete grátis.",
    intelligenceEvidence: { officialStore: true, endsAt },
  };
  const message = formatTelegramMessage(offer);
  assert.deepEqual(publicationSignals(offer), {
    pix: true,
    coupon: true,
    full: true,
    freeShipping: true,
    officialStore: true,
    lastHours: true,
  });
  assert.match(message, /ÚLTIMAS HORAS/u);
  assert.match(message, /Cupom: <b>GANHE10<\/b>/u);
  assert.match(message, /Últimas horas da oferta/u);
  assert.match(message, /Envio Full/u);
  assert.match(message, /Loja oficial ou vendedor autorizado/u);
});
