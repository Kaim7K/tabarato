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

test("extension manifest is valid Manifest V3 with restricted product matches", () => {
  const manifest = JSON.parse(readFileSync(join(extensionRoot, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "background/service-worker.js");
  assert.equal(manifest.side_panel.default_path, "sidepanel/index.html");
  assert.ok(manifest.content_scripts[0].matches.some((match) => match.includes("mercadolivre")));
  assert.ok(manifest.content_scripts[0].matches.some((match) => match.includes("shopee")));
  assert.doesNotMatch(JSON.stringify(manifest), /amazon/i);
  assert.doesNotMatch(JSON.stringify(manifest.content_scripts), /<all_urls>/);
  const referencedFiles = [
    manifest.background.service_worker,
    manifest.side_panel.default_path,
    manifest.icons["128"],
    ...manifest.content_scripts.flatMap((entry) => entry.js),
  ];
  assert.ok(referencedFiles.every((path) => existsSync(join(extensionRoot, path))));
});

test("extension action is enabled only on supported stores, WhatsApp and the configured site", () => {
  const background = readFileSync(join(extensionRoot, "background", "service-worker.js"), "utf8");
  assert.match(background, /allowedStoreHost/);
  assert.match(background, /web\.whatsapp\.com/);
  assert.match(background, /mercadolivre\.com\.br/);
  assert.match(background, /shopee\.com\.br/);
  assert.match(background, /configuredSiteOrigin/);
  assert.match(background, /tabaratoofertas\.vercel\.app/);
  assert.match(background, /chrome\.action\.disable/);
  assert.match(background, /chrome\.sidePanel\.setOptions/);
});

test("all extension JavaScript files have valid syntax", () => {
  listFiles(extensionRoot, ".js").forEach((path) => {
    assert.doesNotThrow(() => new vm.Script(readFileSync(path, "utf8"), { filename: path }));
  });
});

test("extension never embeds admin secrets or writes captured HTML", () => {
  const source = listFiles(extensionRoot, ".js").map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(source, /ADMIN_API_KEY/);
  assert.doesNotMatch(source, /innerHTML\s*=/);
  assert.match(source, /status: "RASCUNHO"/);
});

test("Mercado Livre capture waits for and requires the generated meli.la link", () => {
  const shared = readFileSync(join(extensionRoot, "content", "shared.js"), "utf8");
  const mercadoLivre = readFileSync(join(extensionRoot, "content", "stores", "mercado-livre.js"), "utf8");
  const sidePanel = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  assert.match(shared, /meli\\\.la/);
  assert.match(mercadoLivre, /prepareAffiliateLink/);
  assert.match(mercadoLivre, /affiliateShareContext/);
  assert.match(mercadoLivre, /ganhos\?\\s\*\(\?:extras\?\)\?\\s\*\\d/);
  assert.match(mercadoLivre, /\.filter\(affiliateShareContext\)/);
  assert.match(mercadoLivre, /rectangle\.height > 180/);
  assert.match(mercadoLivre, /tools\.waitFor\(generatedAffiliateLink\)/);
  assert.match(sidePanel, /Use o link meli\.la gerado pelo botao Compartilhar/);
});

test("Mercado Livre captures product coupons, payment promotions and interest-free installments", () => {
  const mercadoLivre = readFileSync(join(extensionRoot, "content", "stores", "mercado-livre.js"), "utf8");
  const sidePanel = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  assert.match(mercadoLivre, /productCoupon/);
  assert.match(mercadoLivre, /couponConditions/);
  assert.match(mercadoLivre, /const discount = text\.match/);
  assert.match(mercadoLivre, /namedCode/);
  assert.match(mercadoLivre, /CUPOM\[A-Z0-9_/);
  assert.match(mercadoLivre, /CUPONS\|COUPON/);
  assert.match(mercadoLivre, /couponElementText/);
  assert.match(mercadoLivre, /storeCouponLabel/);
  assert.match(mercadoLivre, /observedCouponCode/);
  assert.match(mercadoLivre, /data-tabarato-coupon-candidates/);
  assert.match(mercadoLivre, /Use o cupom da loja/);
  assert.match(mercadoLivre, /cupom da loja|cupons\?/);
  assert.match(mercadoLivre, /data-clipboard-text/);
  assert.match(mercadoLivre, /interactiveControl/);
  assert.match(mercadoLivre, /activateControl/);
  assert.match(mercadoLivre, /couponSurface/);
  assert.match(mercadoLivre, /couponModalText/);
  assert.match(mercadoLivre, /span, p, div, strong/);
  assert.match(mercadoLivre, /cupons\?\\s\+dispon/);
  assert.match(mercadoLivre, /Condi\\u00e7\\u00f5es do cupom/);
  assert.match(mercadoLivre, /paymentPromotions/);
  assert.match(mercadoLivre, /paymentModalText/);
  assert.match(mercadoLivre, /sourceText\.split/);
  assert.match(mercadoLivre, /if \(!method && !conditions\.length\) return ""/);
  assert.match(mercadoLivre, /interestFreeOptions/);
  assert.match(mercadoLivre, /price > 500/);
  assert.match(mercadoLivre, /meios de pagamento/);
  assert.match(mercadoLivre, /document\.body\.innerText/);
  assert.match(mercadoLivre, /saiba mais\|ver/);
  assert.match(mercadoLivre, /if \(MELI_LINK_PATTERN\.test\(affiliateLink\)\)/);
  assert.match(mercadoLivre, /await closeAffiliateDialog\(\)/);
  assert.match(sidePanel, /extraText: product\.extraText \|\| ""/);
  const observer = readFileSync(join(extensionRoot, "content", "stores", "mercado-livre-coupon-observer.js"), "utf8");
  assert.match(observer, /ROUTE_PATTERN/);
  assert.match(observer, /CUPOM\[A-Z0-9_/);
  assert.match(observer, /response\.clone\(\)\.text/);
  assert.match(observer, /XMLHttpRequest\.prototype/);
  assert.match(observer, /data-tabarato-coupon-candidates/);
});

test("extension publishes through the protected existing publisher", () => {
  const sidePanel = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  const publishRoute = readFileSync(join(root, "api", "admin", "ofertas", "[id]", "publicar.js"), "utf8");
  assert.match(sidePanel, /status: "APROVADO"/);
  assert.match(sidePanel, /\/api\/admin\/ofertas\/\$\{created\.offer\.id\}\/publicar/);
  assert.match(sidePanel, /window\.confirm/);
  assert.match(publishRoute, /handleExtensionCors/);
  assert.match(publishRoute, /allowExtension: true/);
});

test("extension keeps only the first captured description paragraph", () => {
  const shared = readFileSync(join(extensionRoot, "content", "shared.js"), "utf8");
  const sidePanel = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  const stores = ["mercado-livre.js", "shopee.js"]
    .map((file) => readFileSync(join(extensionRoot, "content", "stores", file), "utf8"));
  assert.match(shared, /const firstParagraph/);
  assert.match(shared, /container\.querySelector\("p, li"\)/);
  assert.match(sidePanel, /product\.shortDescription = firstParagraph/);
  stores.forEach((source) => assert.match(source, /tools\.description/));
});

test("extension shares the original product image and Telegram-style text on WhatsApp", () => {
  const html = readFileSync(join(extensionRoot, "sidepanel", "index.html"), "utf8");
  const app = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  const background = readFileSync(join(extensionRoot, "background", "service-worker.js"), "utf8");
  const whatsapp = readFileSync(join(extensionRoot, "content", "whatsapp.js"), "utf8");
  const manifest = JSON.parse(readFileSync(join(extensionRoot, "manifest.json"), "utf8"));
  assert.match(html, /id="whatsapp-button"/);
  assert.match(html, /id="whatsapp-group"/);
  assert.match(html, /assets\/whatsapp\.svg/);
  assert.match(app, /productImageBlob\(payload\.imageUrl\)/);
  assert.match(app, /data:image\\\/\(\?:png\|jpe\?g\|webp\);base64/);
  assert.match(app, /new File\(\[imageBlob\]/);
  assert.doesNotMatch(app, /context\.fillText/);
  assert.match(app, /controller\.abort\(\)/);
  assert.match(app, /TABARATO_SHARE_WHATSAPP/);
  assert.match(app, /async function sendOfferToWhatsApp/);
  assert.match(app, /await sendOfferToWhatsApp\(payload, groupName/);
  assert.match(app, /Publicada no Telegram, mas o WhatsApp falhou/);
  assert.match(app, /payload\.extraText/);
  assert.match(app, /Pre\\u00e7o e disponibilidade podem mudar/);
  assert.match(background, /chrome\.tabs\.query\(\{ url: "https:\/\/web\.whatsapp\.com\/\*" \}\)/);
  assert.match(background, /chrome\.tabs\.update\(tab\.id, \{ active: true \}\)/);
  assert.match(background, /withTimeout/);
  assert.match(whatsapp, /exactGroup/);
  assert.match(whatsapp, /currentGroupIs/);
  assert.match(whatsapp, /sameGroupName/);
  assert.match(whatsapp, /\\uFE0F/);
  assert.match(whatsapp, /clickableGroupRow/);
  assert.match(whatsapp, /activateGroupRow/);
  assert.match(whatsapp, /DataTransfer/);
  assert.match(whatsapp, /navigator\.clipboard\.write/);
  assert.match(whatsapp, /document\.hasFocus\(\)/);
  assert.match(whatsapp, /pasteImageFromClipboard\(composer, file\)/);
  assert.match(whatsapp, /new ClipboardItem/);
  assert.match(whatsapp, /new ClipboardEvent\("paste"/);
  assert.match(whatsapp, /await setEditableText\(composer, caption\)/);
  assert.match(whatsapp, /transfer\.setData\("text\/plain", text\)/);
  assert.match(whatsapp, /insertParagraph/);
  assert.match(whatsapp, /await setEditableText\(captionBox, caption\)/);
  assert.match(whatsapp, /if \(!clean\(captionBox\.innerText \|\| captionBox\.textContent\)\)/);
  assert.match(whatsapp, /replaceChildren\(content\)/);
  assert.match(whatsapp, /aria-placeholder/);
  assert.match(whatsapp, /sentMessageAppeared/);
  assert.match(whatsapp, /TABARATO_WHATSAPP_SEND/);
  assert.ok(manifest.host_permissions.some((permission) => permission.includes("mlstatic.com")));
  assert.ok(manifest.host_permissions.includes("https://web.whatsapp.com/*"));
  assert.ok(manifest.permissions.includes("clipboardWrite"));
  assert.match(app, /T\\u00c1 BARATO!/);
  assert.match(app, /Agora: \*\$\{formatPrice\(payload\.currentPrice\)\}\*/);
  assert.doesNotMatch(app, /Com cupom:/);
  assert.match(app, /Pre\\u00e7o e disponibilidade podem mudar/);
});

test("extension can open the admin panel without a captured product", () => {
  const html = readFileSync(join(extensionRoot, "sidepanel", "index.html"), "utf8");
  const app = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  assert.match(html, /id="admin-panel-button"/);
  assert.match(app, /async function openAdminPanel/);
  assert.match(app, /chrome\.tabs\.query\(\{ url: `\$\{baseUrl\}\/admin\*` \}\)/);
  assert.match(app, /chrome\.tabs\.create\(\{ url: targetUrl \}\)/);
});

test("extension reinjects the store capture script when a tab has no receiver", () => {
  const app = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  assert.match(app, /function captureScriptsForUrl/);
  assert.match(app, /async function extractProductFromTab/);
  assert.match(app, /receiving end does not exist\|could not establish connection/i);
  assert.match(app, /chrome\.scripting\.executeScript/);
  assert.match(app, /content\/stores\/mercado-livre\.js/);
  assert.match(app, /content\/stores\/shopee\.js/);
});

test("extension manually sends due WhatsApp scheduler messages", () => {
  const html = readFileSync(join(extensionRoot, "sidepanel", "index.html"), "utf8");
  const app = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  const whatsapp = readFileSync(join(extensionRoot, "content", "whatsapp.js"), "utf8");
  assert.match(html, /id="scheduled-message-button"/);
  assert.match(app, /action=pending-whatsapp/);
  assert.match(app, /action=complete-whatsapp/);
  assert.match(app, /scheduledMessage\.imageUrl/);
  assert.match(app, /body: \{ success: true \}/);
  assert.match(whatsapp, /async function sendTextMessage/);
});

test("extension synchronizes site categories and classifies captured products", () => {
  const app = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  const stores = ["mercado-livre.js", "shopee.js"]
    .map((file) => readFileSync(join(extensionRoot, "content", "stores", file), "utf8"));
  assert.match(app, /async function synchronizeCatalog/);
  assert.match(app, /data\.categories/);
  assert.match(app, /category\.replaceChildren\(\.\.\.options\)/);
  assert.match(app, /CATEGORY_PROFILES/);
  assert.match(app, /product\.sourceCategory/);
  stores.forEach((source) => assert.match(source, /sourceCategory\s*[:,]/));
});

test("extension captures useful commerce benefits without using discount as coupon text", () => {
  const shared = readFileSync(join(extensionRoot, "content", "shared.js"), "utf8");
  const mercadoLivre = readFileSync(join(extensionRoot, "content", "stores", "mercado-livre.js"), "utf8");
  const sidePanel = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  assert.match(shared, /commerceBenefits/);
  assert.match(shared, /Frete grátis/);
  assert.match(shared, /sem\\s\+juros/);
  assert.match(mercadoLivre, /couponDiscountPercent/);
  assert.match(mercadoLivre, /const conditions = \[minimum, limit, expires\]/);
  assert.doesNotMatch(mercadoLivre, /const conditions = \[discount, minimum/);
  assert.match(sidePanel, /captureQuality/);
});
