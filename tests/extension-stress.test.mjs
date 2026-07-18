import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const extensionRoot = join(root, "extension");

function loadUtilities() {
  const context = { Intl, URL };
  context.globalThis = context;
  [
    join(extensionRoot, "shared", "coupon-code.js"),
    join(extensionRoot, "sidepanel", "product-utils.js"),
    join(extensionRoot, "sidepanel", "batch-utils.js"),
  ].forEach((path) => vm.runInNewContext(readFileSync(path, "utf8"), context, { filename: path }));
  return context;
}

test("extension utilities survive 42,501 deterministic stress assertions", () => {
  const context = loadUtilities();
  const coupons = context.TaBaratoCouponCode;
  const products = context.TaBaratoProductUtils;
  const batch = context.TaBaratoBatchUtils;
  let assertions = 0;
  const check = (condition, message) => {
    assertions += 1;
    assert.ok(condition, message);
  };

  let seed = 0x51f15e;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const br = (value) => value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const us = (value) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  for (let index = 0; index < 5000; index += 1) {
    const cents = 1 + Math.floor(random() * 99_999_999);
    const value = cents / 100;
    check(Math.abs(products.parsePrice(`R$ ${br(value)}`) - value) < 0.001, `Falha de preco BR em ${value}`);
    check(Math.abs(products.parsePrice(`BRL ${us(value)}`) - value) < 0.001, `Falha de preco internacional em ${value}`);
  }

  for (let index = 0; index < 5000; index += 1) {
    const current = (100 + Math.floor(random() * 900_000)) / 100;
    const previous = random() > 0.5
      ? current + (1 + Math.floor(random() * 50_000)) / 100
      : current - (1 + Math.floor(random() * 5_000)) / 100;
    const regular = random() > 0.5
      ? current + (1 + Math.floor(random() * 40_000)) / 100
      : current - (1 + Math.floor(random() * 4_000)) / 100;
    const parsedCurrent = products.parsePrice(br(current));
    const parsedPrevious = products.parsePrice(br(previous));
    const parsedRegular = products.parsePrice(br(regular));
    const result = products.parsePrice(products.previousPriceFor(br(current), br(previous), br(regular)));
    check(Number.isFinite(result), "Preco anterior nao numerico");
    check(result + 0.001 >= parsedCurrent, `Preco anterior abaixo do atual: ${result} < ${parsedCurrent}`);
    if (parsedPrevious > parsedCurrent) check(Math.abs(result - parsedPrevious) < 0.001, "Nao priorizou preco anterior valido");
    else if (parsedRegular >= parsedCurrent) check(Math.abs(result - parsedRegular) < 0.001, "Nao usou preco regular valido");
    else check(Math.abs(result - parsedCurrent) < 0.001, "Nao recuou para preco atual");
  }

  for (let index = 0; index < 5000; index += 1) {
    const code = `TB${String(index).padStart(5, "0")}OFF`;
    check(coupons.normalize(`Cupom: ${code}`) === code, `Normalizacao falhou: ${code}`);
    check(coupons.extract(`Use o cupom: ${code} antes de comprar.`)[0] === code, `Extracao falhou: ${code}`);
    check(coupons.classify(`Cupom: ${code}`).status === "code", `Classificacao falhou: ${code}`);
  }

  const routes = [];
  for (let index = 0; index < 2500; index += 1) {
    const id = String(100000000 + index);
    routes.push(`https://produto.mercadolivre.com.br/MLB-${id}-produto_JM?utm_source=${index}`);
    routes.push(`https://produto.mercadolivre.com.br/MLB-${id}-produto_JM?position=${index}`);
  }
  const normalized = batch.normalizeProductUrls(routes, "mercado-livre", 5000);
  check(normalized.length === 2500, `Deduplicacao produziu ${normalized.length}`);
  normalized.forEach((url) => check(
    !url.includes("?") && /^https:\/\/produto\.mercadolivre\.com\.br\/MLB-\d+-produto_JM$/.test(url),
    `Rota nao canonica: ${url}`,
  ));

  assert.equal(assertions, 42_501);
});
