import test from "node:test";
import assert from "node:assert/strict";
import { formatTelegramMessage } from "../api/_lib/telegram.js";

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

test("Telegram message falls back to the current price when there is no previous price", () => {
  const message = formatTelegramMessage({
    productName: "Produto",
    currentPrice: 50,
    coupon: "Disponível no anúncio. Ative antes de comprar.",
  });
  assert.match(message, /❌ <s>R\$ 50,00<\/s>/u);
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
