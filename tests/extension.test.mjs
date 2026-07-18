import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const extensionRoot = join(root, "extension");

function listFiles(dir, extension) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listFiles(path, extension) : path.endsWith(extension) ? [path] : [];
  });
}

test("extension manifest is Manifest V3 and references existing files", () => {
  const manifest = JSON.parse(readFileSync(join(extensionRoot, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "background/service-worker.js");
  assert.equal(manifest.side_panel.default_path, "sidepanel/index.html");
  assert.ok(manifest.permissions.includes("sidePanel"));
  assert.ok(manifest.permissions.includes("clipboardWrite"));
  assert.ok(manifest.host_permissions.includes("https://*/*"));
  assert.ok(manifest.content_scripts[0].js.includes("content/stores/generic.js"));
  assert.ok(manifest.content_scripts.some((entry) => entry.matches.includes("https://web.whatsapp.com/*")));
  const referencedFiles = [
    manifest.background.service_worker,
    manifest.side_panel.default_path,
    manifest.icons["128"],
    ...manifest.content_scripts.flatMap((entry) => entry.js),
  ];
  assert.ok(referencedFiles.every((path) => existsSync(join(extensionRoot, path))));
});

test("extension action and launcher stay hidden outside allowed pages", () => {
  const background = readFileSync(join(extensionRoot, "background", "service-worker.js"), "utf8");
  const content = readFileSync(join(extensionRoot, "content", "index.js"), "utf8");
  assert.match(background, /builtInAllowedHost/);
  assert.match(background, /tabarato_connected_store_hosts/);
  assert.match(background, /configuredOrigin/);
  assert.match(background, /chrome\.action\.disable/);
  assert.match(background, /chrome\.sidePanel\.setOptions/);
  assert.match(content, /TABARATO_IS_ALLOWED_PAGE/);
  assert.match(content, /existing\?\.(?:remove|remove\(\))/);
  assert.match(content, /assets\/icon\.png/);
  assert.doesNotMatch(content, /Enviar produto/);
});

test("all extension JavaScript files have valid syntax", () => {
  listFiles(extensionRoot, ".js").forEach((path) => {
    assert.doesNotThrow(() => new vm.Script(readFileSync(path, "utf8"), { filename: path }));
  });
});

test("extension never embeds admin secrets or captured HTML", () => {
  const source = listFiles(extensionRoot, ".js").map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(source, /ADMIN_API_KEY/);
  assert.doesNotMatch(source, /innerHTML\s*=/);
  assert.match(source, /RASCUNHO/);
});

test("capture extracts requested product fields and closes store popups", () => {
  const shared = readFileSync(join(extensionRoot, "content", "shared.js"), "utf8");
  const meli = readFileSync(join(extensionRoot, "content", "stores", "mercado-livre.js"), "utf8");
  const shopee = readFileSync(join(extensionRoot, "content", "stores", "shopee.js"), "utf8");
  assert.match(shared, /firstUsefulParagraph/);
  assert.match(shared, /couponCandidates/);
  assert.match(shared, /priceDetails/);
  assert.match(shared, /commerceBenefits/);
  assert.match(shared, /imageCandidates/);
  assert.match(shared, /closeTransientDialogs/);
  assert.match(meli, /captureAffiliateLink/);
  assert.match(meli, /MELI_LINK_PATTERN/);
  assert.match(meli, /pricePaymentMethod/);
  assert.match(meli, /Cupom disponivel no anuncio/);
  assert.match(meli, /await tools\.closeTransientDialogs/);
  assert.match(shopee, /couponCandidates/);
  assert.match(shopee, /confidence/);
});

test("side panel provides groups, admin, modes, batch and custom messages", () => {
  const html = readFileSync(join(extensionRoot, "sidepanel", "index.html"), "utf8");
  const app = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  assert.match(html, /id="groups-toggle"/);
  assert.match(html, /id="admin-panel-button"/);
  assert.match(html, /id="mode-single"/);
  assert.match(html, /id="mode-batch"/);
  assert.match(html, /id="batch-limit"/);
  assert.match(html, /id="custom-message"/);
  assert.match(app, /function groupNames/);
  assert.match(app, /function setMode/);
  assert.match(app, /async function startBatch/);
  assert.match(app, /async function sendCustomMessage/);
  assert.match(app, /action=send-custom/);
});

test("extension publishes to site, Telegram and sequential WhatsApp groups", () => {
  const app = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  const background = readFileSync(join(extensionRoot, "background", "service-worker.js"), "utf8");
  const whatsapp = readFileSync(join(extensionRoot, "content", "whatsapp.js"), "utf8");
  assert.match(app, /\/api\/admin\/ofertas/);
  assert.match(app, /\/publicar/);
  assert.match(app, /sendOfferToWhatsApp/);
  assert.match(app, /groupNames\(\)/);
  assert.match(background, /normalizeGroups/);
  assert.match(background, /for \(const groupName of groups\)/);
  assert.match(background, /TABARATO_STOP_WHATSAPP/);
  assert.match(whatsapp, /TABARATO_WHATSAPP_CANCEL/);
  assert.match(whatsapp, /activeController/);
});

test("offer artwork matches the requested premium share card", () => {
  const app = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  const artwork = readFileSync(join(extensionRoot, "sidepanel", "artwork.js"), "utf8");
  assert.match(app, /imageSceneScore/);
  assert.match(app, /assets\/tabarato-logo\.png/);
  assert.match(app, /assets\/mercado-livre\.png/);
  assert.match(app, /assets\/shopee\.svg/);
  assert.match(artwork, /createOfferArtwork/);
  assert.match(artwork, /discountPercent/);
  assert.match(artwork, /roundedRect\(context, bar\.x, bar\.y, bar\.width, bar\.height, 77\)/);
  assert.match(artwork, /drawLogo\(context, storeLogo/);
  assert.match(artwork, /drawLogo\(context, siteLogo/);
});

test("duplicate products are reconciled automatically by price movement", () => {
  const app = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  const itemRoute = readFileSync(join(root, "api", "admin", "ofertas", "[id].js"), "utf8");
  const publishRoute = readFileSync(join(root, "api", "admin", "ofertas", "[id]", "publicar.js"), "utf8");
  const publisher = readFileSync(join(root, "api", "_lib", "publisher.js"), "utf8");
  assert.match(app, /reconcileExistingOffer/);
  assert.match(app, /nextPrice < oldPrice/);
  assert.match(app, /method: "PATCH"/);
  assert.match(app, /method: "DELETE"/);
  assert.match(app, /forceRepublish: true/);
  assert.match(itemRoute, /allowExtension: true/);
  assert.match(itemRoute, /handleExtensionCors/);
  assert.match(publishRoute, /forceRepublish/);
  assert.match(publisher, /forceRepublish/);
});

test("extension synchronizes categories and connected store hosts from the site", () => {
  const app = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  const generic = readFileSync(join(extensionRoot, "content", "stores", "generic.js"), "utf8");
  const listRoute = readFileSync(join(root, "api", "admin", "ofertas", "index.js"), "utf8");
  assert.match(app, /synchronizeCatalog/);
  assert.match(app, /CONNECTED_HOSTS_KEY/);
  assert.match(app, /connectedStoreHosts/);
  assert.match(generic, /matchesConnectedStore/);
  assert.match(generic, /tabarato_connected_store_hosts/);
  assert.match(listRoute, /connectedStoreHostsFromOffers/);
});

test("extension persists the active product and exposes admin mode to the site", () => {
  const sidePanelApp = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  const contentIndex = readFileSync(join(extensionRoot, "content", "index.js"), "utf8");
  assert.match(sidePanelApp, /tabarato_product_draft/);
  assert.match(sidePanelApp, /persistProductDraft/);
  assert.match(contentIndex, /tabaratoExtensionAdmin/);
  assert.match(contentIndex, /tabarato:admin-extension/);
});

test("extension offers coupon activation and compact icon actions", () => {
  const sidePanelHtml = readFileSync(join(extensionRoot, "sidepanel", "index.html"), "utf8");
  const sidePanelStyles = readFileSync(join(extensionRoot, "sidepanel", "styles.css"), "utf8");
  const coupons = readFileSync(join(root, "extension", "content", "coupons.js"), "utf8");
  assert.match(sidePanelHtml, /activate-coupons-button/);
  assert.match(sidePanelHtml, /action-icon-button/);
  assert.match(coupons, /TABARATO_ACTIVATE_COUPONS/);
  assert.match(sidePanelStyles, /Montserrat/);
});

test("extension runtime releases timed out operations", async () => {
  const source = readFileSync(join(extensionRoot, "shared", "runtime.js"), "utf8");
  const context = {
    AbortController,
    Date,
    Error,
    Promise,
    clearTimeout,
    console: { error() {} },
    fetch,
    setTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "runtime.js" });
  await assert.rejects(
    context.TaBaratoRuntime.withTimeout(new Promise(() => {}), 5, "tempo limite"),
    /tempo limite/,
  );
  assert.equal(await context.TaBaratoRuntime.withTimeout(Promise.resolve("ok"), 20), "ok");
});
