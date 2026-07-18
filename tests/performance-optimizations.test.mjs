import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

test("database schema migrations use a version gate, advisory lock and search index", () => {
  const database = read("api", "_lib", "db.js");
  const publicOffers = read("api", "ofertas", "index.js");
  assert.match(database, /SCHEMA_VERSION = 3/);
  assert.match(database, /app_schema_meta/);
  assert.match(database, /pg_advisory_lock/);
  assert.match(database, /CREATE EXTENSION IF NOT EXISTS pg_trgm/);
  assert.match(database, /idx_public_offers_search/);
  assert.match(publicOffers, /immutable_unaccent\(product_name/);
});

test("public UI requests only the offers needed by each surface", () => {
  const api = read("src", "lib", "offersApi.js");
  const search = read("src", "components", "SmartSearch.jsx");
  const favorites = read("src", "pages", "Favorites.jsx");
  const compare = read("src", "pages", "Compare.jsx");
  const detail = read("src", "pages", "OfferDetail.jsx");
  assert.match(api, /includeTotal", "0"/);
  assert.match(api, /listPublicOffersByIds/);
  assert.match(api, /limit: 6/);
  assert.match(search, /AbortController/);
  assert.match(search, /searchSequence/);
  assert.match(favorites, /listPublicOffersByIds\(favorites/);
  assert.match(compare, /listPublicOffersByIds\(compareIds/);
  assert.match(detail, /category: currentOffer\.category, limit: 5/);
  assert.doesNotMatch(detail, /listPublicOffers\(\{ limit: 50 \}\)/);
});

test("extension pipeline uses continuous preloading and event-driven readiness", () => {
  const batch = read("extension", "sidepanel", "modules", "batch.js");
  const capture = read("extension", "sidepanel", "modules", "capture.js");
  assert.match(batch, /const initialCount = Math\.min\(BATCH_WINDOW_SIZE/);
  assert.match(batch, /await closeWorker\(worker\.tabId\);[\s\S]*preloadWorker/);
  assert.match(batch, /while \(workers\.length/);
  assert.match(capture, /new MutationObserver/);
  assert.match(capture, /stableSamples >= 3/);
  assert.doesNotMatch(capture, /chrome\.windows\.update\(targetWindowId/);
});

test("WhatsApp transfers generated artwork once and reuses it across groups", () => {
  const media = read("extension", "sidepanel", "modules", "media.js");
  const background = read("extension", "background", "whatsapp.js");
  const content = read("extension", "content", "whatsapp.js");
  const publishing = read("extension", "sidepanel", "modules", "publishing.js");
  assert.match(media, /prepareShare/);
  assert.match(media, /extensionAssetCache/);
  assert.match(publishing, /preparedShare/);
  assert.match(background, /imageDataUrl: index === 0/);
  assert.match(background, /imageCacheKey/);
  assert.match(content, /imageFileCache/);
  assert.match(content, /new MutationObserver/);
  assert.doesNotMatch(content, /setTimeout\(resolve, 260\)/);
});
