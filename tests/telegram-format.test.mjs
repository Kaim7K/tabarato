import test from "node:test";
import assert from "node:assert/strict";
import { formatTelegramMessage } from "../api/_lib/telegram.js";

test("Telegram message strikes through the previous price", () => {
  const message = formatTelegramMessage({
    productName: "Produto teste",
    currentPrice: "24.90",
    previousPrice: "47.90",
    category: "Tecnologia",
  });

  assert.match(message, /Agora: <b>R\$ 24,90<\/b>/);
  assert.match(message, /Antes: <s>R\$ 47,90<\/s>/);
});

test("Telegram message presents a store coupon as an instruction", () => {
  const message = formatTelegramMessage({
    productName: "Produto",
    currentPrice: 50,
    coupon: "Use o cupom da loja",
  });
  assert.match(message, /<b>Use o cupom da loja<\/b>/);
  assert.doesNotMatch(message, /Cupom: <b>Use o cupom da loja/);
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
