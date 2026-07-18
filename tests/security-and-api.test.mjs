import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeProductUrl, isPrivateAddress } from "../api/_lib/productPreview.js";
import { createAdminExtensionToken, createAdminSessionToken, handleExtensionCors, isValidUuid, requireAdmin, requireCron, verifyAdminExtensionToken } from "../api/_lib/http.js";

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
  assert.match(migration, /last_checked_at/);
  assert.match(publisher, /channel, status, external_message_id/);
  assert.match(maintenance, /fetchProductPreview/);
  assert.match(maintenance, /current_price=\$2/);
  assert.match(maintenance, /status='EXPIRADO'/);
  assert.match(cron, /refreshPublishedOffers/);
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
