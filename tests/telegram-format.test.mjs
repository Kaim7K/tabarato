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
