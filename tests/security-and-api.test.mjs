import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeProductUrl, isPrivateAddress } from "../api/_lib/productPreview.js";
import { createAdminSessionToken, isValidUuid, requireAdmin, requireCron } from "../api/_lib/http.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function mockResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(value) { this.statusCode = value; return this; },
    json(value) { this.body = value; return value; },
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
  assert.match(migration, /CREATE TABLE IF NOT EXISTS telegram_auto_messages/);
});

test("database migration records real price changes", () => {
  const migration = readFileSync(join(root, "migrations", "001_create_telegram_offers.sql"), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS offer_price_history/);
  assert.match(migration, /OLD\.current_price IS DISTINCT FROM NEW\.current_price/);
  assert.match(migration, /AFTER INSERT OR UPDATE OF current_price/);
});
