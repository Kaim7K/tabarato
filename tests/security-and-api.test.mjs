import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeProductUrl, isPrivateAddress } from "../api/_lib/productPreview.js";
import { createAdminExtensionToken, createAdminSessionToken, getCookie, handleExtensionCors, isValidUuid, publicError, readJson, requireAdmin, requireCron, verifyAdminExtensionToken } from "../api/_lib/http.js";
import { mapWithConcurrency } from "../src/lib/async.js";
import { evaluateRepublish, queuePriority } from "../api/_lib/offerIntelligence.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return value; },
    end() { return null; },
  };
}

test("product preview blocks private and local addresses", async () => {
  assert.equal(isPrivateAddress("127.0.0.1"), true);
  assert.equal(isPrivateAddress("10.0.0.1"), true);
  assert.equal(isPrivateAddress("192.168.1.2"), true);
  assert.equal(isPrivateAddress("::1"), true);
  assert.equal(isPrivateAddress("8.8.8.8"), false);
  await assert.rejects(assertSafeProductUrl("https://127.0.0.1/produto"), /endereco publico/);
  await assert.rejects(assertSafeProductUrl("http://example.com/produto"), /HTTPS/);
});

test("public errors expose external transfer quota as a temporary service issue", () => {
  const res = mockResponse();
  const originalError = console.error;
  console.error = () => {};
  try {
    publicError(res, new Error("Your project has exceeded the data transfer quota. Upgrade your plan to increase limits."));
  } finally {
    console.error = originalError;
  }
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, "DATA_TRANSFER_QUOTA");
  assert.match(res.body.error, /ofertas continuam salvas/i);
});

test("admin cookie uses a derived token instead of the API key", () => {
  const previous = process.env.ADMIN_API_KEY;
  process.env.ADMIN_API_KEY = "test-secret";
  try {
    const token = createAdminSessionToken(process.env.ADMIN_API_KEY);
    assert.notEqual(token, process.env.ADMIN_API_KEY);

    const response = mockResponse();
    const request = { headers: { cookie: `tb_admin_session=${token}` } };
    assert.equal(requireAdmin(request, response), true);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = previous;
  }
});

test("extension token expires and is limited to explicitly enabled routes", () => {
  const previous = process.env.ADMIN_API_KEY;
  process.env.ADMIN_API_KEY = "extension-test-secret";
  try {
    const now = Date.now();
    const token = createAdminExtensionToken(process.env.ADMIN_API_KEY, now + 60_000);
    assert.equal(verifyAdminExtensionToken(token, process.env.ADMIN_API_KEY, now), true);
    assert.equal(verifyAdminExtensionToken(token, process.env.ADMIN_API_KEY, now + 61_000), false);

    const request = { headers: { authorization: `Bearer ${token}` } };
    assert.equal(requireAdmin(request, mockResponse()), false);
    assert.equal(requireAdmin(request, mockResponse(), { allowExtension: true }), true);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_API_KEY;
    else process.env.ADMIN_API_KEY = previous;
  }
});

test("extension CORS accepts Chrome extension origins and rejects websites", () => {
  const extensionResponse = mockResponse();
  const handled = handleExtensionCors({ method: "OPTIONS", headers: { origin: `chrome-extension://${"a".repeat(32)}` } }, extensionResponse, ["POST"]);
  assert.equal(handled, true);
  assert.equal(extensionResponse.statusCode, 204);
  assert.equal(extensionResponse.headers["Access-Control-Allow-Origin"], `chrome-extension://${"a".repeat(32)}`);

  const websiteResponse = mockResponse();
  assert.equal(handleExtensionCors({ method: "OPTIONS", headers: { origin: "https://example.com" } }, websiteResponse, ["POST"]), false);
  assert.equal(websiteResponse.headers["Access-Control-Allow-Origin"], undefined);
});

test("cron secret is not accepted in the query string", () => {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "cron-secret";
  try {
    const response = mockResponse();
    const request = { headers: {}, query: { secret: "cron-secret" } };
    assert.equal(requireCron(request, response), false);
    assert.equal(response.statusCode, 401);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});

test("UUID validation rejects malformed route IDs", () => {
  assert.equal(isValidUuid("550e8400-e29b-41d4-a716-446655440000"), true);
  assert.equal(isValidUuid("not-an-id"), false);
});

test("cookie parser ignores malformed percent encoding", () => {
  const request = { headers: { cookie: "tb_admin_session=%E0%A4%A" } };
  assert.equal(getCookie(request, "tb_admin_session"), "");
});

test("readJson supports Buffer bodies and stops oversized streams", async () => {
  assert.deepEqual(await readJson({ body: Buffer.from('{"valid":true}') }), { valid: true });

  const oversizedRequest = {
    async *[Symbol.asyncIterator]() {
      yield Buffer.alloc(1_000_001);
    },
  };

  await assert.rejects(readJson(oversizedRequest), /Corpo da requisicao muito grande/);
});

test("bounded async mapping preserves order and limits concurrent work", async () => {
  let active = 0;
  let peak = 0;
  const results = await mapWithConcurrency([1, 2, 3, 4, 5], async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 2;
  }, 2);

  assert.deepEqual(results, [2, 4, 6, 8, 10]);
  assert.equal(peak, 2);
});

test("public click tracking only updates published offers", () => {
  const source = readFileSync(join(root, "api", "ofertas", "[id].js"), "utf8");
  assert.match(source, /AND status='PUBLICADO'/);
  assert.match(source, /click: "clicks", share: "shares", favorite: "favorites"/);
});

test("public offer sorting uses a fixed allowlist", () => {
  const source = readFileSync(join(root, "api", "ofertas", "index.js"), "utf8");
  assert.match(source, /const orderBy = \{/);
  assert.match(source, /\}\[sort\] \|\|/);
  assert.doesNotMatch(source, /ORDER BY \$\{sort\}/);
});

test("public catalog keeps pagination counts separate from the limited offer query", () => {
  const source = readFileSync(join(root, "api", "ofertas", "index.js"), "utf8");
  const migration = readFileSync(join(root, "migrations", "007_public_catalog_performance.sql"), "utf8");
  assert.match(source, /Promise\.all\(\[/);
  assert.match(source, /SELECT COUNT\(\*\) AS total_count/);
  assert.doesNotMatch(source, /COUNT\(\*\) OVER\(\)/);
  assert.match(migration, /idx_telegram_offers_public_recent/);
  assert.match(migration, /idx_telegram_offers_public_price/);
});

test("automatic messages are claimed before Telegram delivery", () => {
  const source = readFileSync(join(root, "api", "_lib", "autoMessages.js"), "utf8");
  assert.match(source, /SET next_send_at=NOW\(\) \+ INTERVAL '5 minutes'/);
  assert.match(source, /next_send_at <= NOW\(\)/);
});

test("database migration includes recurring messages", () => {
  const migration = readFileSync(join(root, "migrations", "001_create_telegram_offers.sql"), "utf8");
  const runtimeSchema = readFileSync(join(root, "api", "_lib", "db.js"), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS telegram_auto_messages/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS channel/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS image_url/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS whatsapp_group/);
  assert.match(runtimeSchema, /ADD COLUMN IF NOT EXISTS channel/);
  assert.match(runtimeSchema, /ADD COLUMN IF NOT EXISTS image_url/);
  assert.match(runtimeSchema, /ADD COLUMN IF NOT EXISTS whatsapp_group/);
});

test("scheduled messages separate automatic Telegram from manual WhatsApp delivery", () => {
  const messages = readFileSync(join(root, "api", "_lib", "autoMessages.js"), "utf8");
  const route = readFileSync(join(root, "api", "admin", "mensagens", "index.js"), "utf8");
  const telegram = readFileSync(join(root, "api", "_lib", "telegram.js"), "utf8");
  assert.match(messages, /channel='TELEGRAM'/);
  assert.match(messages, /claimDueWhatsAppMessage/);
  assert.match(messages, /completeWhatsAppMessage/);
  assert.match(route, /pending-whatsapp/);
  assert.match(route, /complete-whatsapp/);
  assert.match(telegram, /sendPhoto/);
  assert.match(telegram, /body instanceof FormData/);
});

test("admin offers do not disappear when automatic messages fail", () => {
  const page = readFileSync(join(root, "src", "pages", "AdminOffers.jsx"), "utf8");
  const route = readFileSync(join(root, "api", "admin", "ofertas", "index.js"), "utf8");
  const offers = readFileSync(join(root, "api", "_lib", "offers.js"), "utf8");
  assert.match(page, /Promise\.allSettled/);
  assert.match(page, /offersResult\.status !== "fulfilled"/);
  assert.match(page, /messagesResult\.status === "fulfilled"/);
  assert.match(page, /Ofertas carregadas, mas mensagens falharam/);
  assert.match(route, /safeListCategories/);
  assert.match(route, /safeSiteMetrics/);
  assert.match(offers, /admin-offers-fallback/);
  assert.match(offers, /column \.\* does not exist\|relation \.\* does not exist/);
});

test("admin list endpoints avoid heavy payloads that can exhaust transfer quota", () => {
  const offers = readFileSync(join(root, "api", "_lib", "offers.js"), "utf8");
  const messages = readFileSync(join(root, "api", "_lib", "autoMessages.js"), "utf8");
  assert.match(offers, /ADMIN_OFFER_COLUMNS/);
  assert.doesNotMatch(offers, /SELECT telegram_offers\.\*/);
  assert.match(offers, /LIMIT 300/);
  assert.match(offers, /NULL AS telegram_response/);
  assert.match(messages, /CASE WHEN image_url LIKE 'data:image\/%'/);
  assert.match(messages, /hasEmbeddedImage/);
});

test("extension publication sends a transient branded image to Telegram", () => {
  const route = readFileSync(join(root, "api", "admin", "ofertas", "[id]", "publicar.js"), "utf8");
  const publisher = readFileSync(join(root, "api", "_lib", "publisher.js"), "utf8");
  const telegram = readFileSync(join(root, "api", "_lib", "telegram.js"), "utf8");
  assert.match(route, /shareImageDataUrl/);
  assert.match(route, /3_500_000/);
  assert.match(route, /data:image\\\/png;base64/);
  assert.match(publisher, /sendTelegramOffer\(\{ \.\.\.offer, shareImageDataUrl, messageHeadline \}\)/);
  assert.match(telegram, /imageDataUrl\(offer\.shareImageDataUrl\)/);
  assert.match(telegram, /body = new FormData\(\)/);
  assert.match(telegram, /body\.set\("reply_markup", JSON\.stringify\(reply_markup\)\)/);
});

test("database migration records real price changes", () => {
  const migration = readFileSync(join(root, "migrations", "001_create_telegram_offers.sql"), "utf8");
  const runtimeSchema = readFileSync(join(root, "api", "_lib", "db.js"), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS offer_price_history/);
  assert.match(migration, /OLD\.current_price IS DISTINCT FROM NEW\.current_price/);
  assert.match(migration, /AFTER INSERT OR UPDATE OF current_price/);
  assert.match(migration, /offer\.previous_price IS DISTINCT FROM offer\.current_price/);
  assert.match(migration, /last_recorded_price IS DISTINCT FROM OLD\.current_price/);
  assert.match(migration, /VALUES \(NEW\.id, OLD\.current_price, NOW\(\) - INTERVAL '1 millisecond'\)/);
  assert.match(runtimeSchema, /offer\.previous_price IS DISTINCT FROM offer\.current_price/);
  assert.match(runtimeSchema, /last_recorded_price IS DISTINCT FROM OLD\.current_price/);
});

test("database prevents duplicate product and price pairs", () => {
  const migration = readFileSync(join(root, "migrations", "001_create_telegram_offers.sql"), "utf8");
  assert.match(migration, /source_product_id TEXT/);
  assert.match(migration, /product_key TEXT/);
  assert.match(migration, /idx_telegram_offers_unique_product_price/);
  assert.match(migration, /UNIQUE INDEX/);
  const offers = readFileSync(join(root, "api", "_lib", "offers.js"), "utf8");
  const publisher = readFileSync(join(root, "api", "_lib", "publisher.js"), "utf8");
  assert.match(offers, /findDuplicateOffer/);
  assert.match(offers, /statusCode: 409/);
  assert.match(offers, /23505/);
  assert.match(publisher, /\["PUBLICADO", "PUBLICANDO"\]/);
});

test("system stores publication history and refreshes published offer prices", () => {
  const migration = readFileSync(join(root, "migrations", "001_create_telegram_offers.sql"), "utf8");
  const publisher = readFileSync(join(root, "api", "_lib", "publisher.js"), "utf8");
  const maintenance = readFileSync(join(root, "api", "_lib", "offerMaintenance.js"), "utf8");
  const cron = readFileSync(join(root, "api", "cron", "publicar-agendadas.js"), "utf8");
  assert.match(migration, /offer_publication_history/);
  assert.match(migration, /price_snapshot/);
  assert.match(migration, /coupon_snapshot/);
  assert.match(migration, /free_shipping_snapshot/);
  assert.match(migration, /last_checked_at/);
  assert.match(publisher, /external_message_id/);
  assert.doesNotMatch(publisher, /price_snapshot, coupon_snapshot, free_shipping_snapshot/);
  assert.match(maintenance, /fetchProductPreview/);
  assert.match(maintenance, /current_price=\$2/);
  assert.match(maintenance, /status='EXPIRADO'/);
  assert.match(cron, /refreshPublishedOffers/);
});

test("publication retries preserve a successful site publication and avoid unsafe duplicate sends", () => {
  const publisher = readFileSync(join(root, "api", "_lib", "publisher.js"), "utf8");
  const publicOffers = readFileSync(join(root, "api", "ofertas", "index.js"), "utf8");
  const migration = readFileSync(join(root, "migrations", "004_publication_retries.sql"), "utf8");
  assert.match(publisher, /const MAX_TELEGRAM_RETRIES = 3/);
  assert.match(publisher, /error\?\.code === "RATE_LIMIT"/);
  assert.match(publisher, /site_published_at/);
  assert.match(publisher, /telegram_next_retry_at/);
  assert.match(publisher, /retryTelegram: true, destinations: \{ site: false, telegram: true \}/);
  assert.match(publicOffers, /site_published_at IS NOT NULL/);
  assert.match(migration, /telegram_retry_count/);
});

test("recent publication filtering keeps changed-price products eligible for a new batch", () => {
  const offers = readFileSync(join(root, "api", "_lib", "offers.js"), "utf8");
  const route = readFileSync(join(root, "api", "admin", "ofertas", "index.js"), "utf8");
  assert.match(offers, /recentOnly = false, cooldownHours = 24/);
  assert.match(offers, /price_history\.recorded_at > offer\.published_at/);
  assert.doesNotMatch(offers, /price_snapshot/);
  assert.doesNotMatch(offers, /coupon_snapshot/);
  assert.match(route, /cooldownHours/);
});

test("smart offer radar explains republication and queue priority", () => {
  const lastPublishedAt = new Date(Date.now() - 2 * 3600000).toISOString();
  const republish = evaluateRepublish({
    currentPrice: "80",
    previousPrice: "120",
    lastPublishedPrice: "100",
    lastPublishedAt,
    coupon: "NOVO10",
    lastPublishedCoupon: "",
    extraText: "Frete grátis.",
  });
  assert.equal(republish.eligible, true);
  assert.match(republish.reasons.join(" "), /preço caiu|cupom novo|frete grátis/);

  const unchanged = evaluateRepublish({
    currentPrice: "100",
    lastPublishedPrice: "100",
    lastPublishedAt,
  });
  assert.equal(unchanged.hiddenByCooldown, true);

  const priority = queuePriority({
    currentPrice: "80",
    previousPrice: "120",
    affiliateLink: "https://example.com/oferta",
    imageUrl: "https://example.com/image.jpg",
    category: "Tecnologia",
    evidence: { flashSale: true },
  });
  assert.equal(priority.kind, "RELAMPAGO");
  assert.ok(priority.score > 300);
  assert.match(priority.reason, /oferta relâmpago/);
});

test("public search expands synonyms and public offers expose final coupon price", () => {
  const search = readFileSync(join(root, "api", "_lib", "search.js"), "utf8");
  const offersRoute = readFileSync(join(root, "api", "ofertas", "index.js"), "utf8");
  const publicOffers = readFileSync(join(root, "api", "_lib", "publicOffers.js"), "utf8");
  assert.match(search, /smartphone.*celular|celular.*smartphone/s);
  assert.match(offersRoute, /searchGroups/);
  assert.match(offersRoute, /unaccent/);
  assert.match(publicOffers, /coupon_discount_percent/);
  assert.match(publicOffers, /final_price/);
});
