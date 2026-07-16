import test from "node:test";
import assert from "node:assert/strict";
import { createInitialClickCount, validateOffer } from "../api/_lib/offers.js";

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

test("new offers receive an integer click count between 0 and 20", () => {
  const samples = Array.from({ length: 100 }, () => createInitialClickCount());
  assert.ok(samples.every((value) => Number.isInteger(value) && value >= 0 && value <= 20));
});
