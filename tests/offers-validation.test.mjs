import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProductIdentity, toDbParams, validateOffer } from "../api/_lib/offers.js";
import { readFileSync } from "node:fs";

const validOffer = {
  productName: "Produto teste",
  currentPrice: "129.90",
  category: "Tecnologia",
  affiliateLink: "https://example.com/oferta",
  platform: "Mercado Livre",
};

test("validateOffer accepts a complete offer", () => {
  assert.deepEqual(validateOffer(validOffer), []);
});

test("validateOffer requires HTTPS affiliate links", () => {
  const errors = validateOffer({ ...validOffer, affiliateLink: "http://example.com/oferta" });
  assert.ok(errors.some((error) => error.includes("HTTPS")));
});

test("validateOffer requires scheduledAt for scheduled offers", () => {
  const errors = validateOffer({ ...validOffer, status: "AGENDADO" }, { requireSchedule: true });
  assert.ok(errors.some((error) => error.includes("agendamento")));
});

test("new offers start with zero real clicks", () => {
  const source = readFileSync(new URL("../api/_lib/offers.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /randomInt|createInitialClickCount/);
  assert.match(source, /data\.scheduled_at, 0,/);
});

test("product identity ignores accents, punctuation and casing", () => {
  assert.equal(normalizeProductIdentity("  Tênis Redley! Preto  "), "tenis redley preto");
});

test("database params never keep a previous price below the current price", () => {
  const params = toDbParams({ ...validOffer, currentPrice: "79.92", previousPrice: "78.99" });
  assert.equal(params.current_price, 79.92);
  assert.equal(params.previous_price, 79.92);
});
