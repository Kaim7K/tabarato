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
  assert.doesNotMatch(JSON.stringify(manifest), /coupon-observer/i);
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

test("Mercado Livre captures payment promotions and installments without scanning coupons", () => {
  const mercadoLivre = readFileSync(join(extensionRoot, "content", "stores", "mercado-livre.js"), "utf8");
  const sidePanel = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
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
  assert.doesNotMatch(mercadoLivre, /productCoupon|couponSurface|observedCouponCode|data-tabarato-coupon-candidates/);
  assert.match(sidePanel, /extraText: product\.extraText \|\| ""/);
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

test("extension highlights product refresh when the active store page changes", () => {
  const html = readFileSync(join(extensionRoot, "sidepanel", "index.html"), "utf8");
  const styles = readFileSync(join(extensionRoot, "sidepanel", "styles.css"), "utf8");
  const app = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  assert.match(html, /capture-source[^>]+aria-live="polite"/);
  assert.match(styles, /\.icon-button\.needs-refresh/);
  assert.match(styles, /@keyframes refresh-attention/);
  assert.match(app, /chrome\.tabs\.onUpdated\.addListener/);
  assert.match(app, /chrome\.tabs\.onActivated\.addListener/);
  assert.match(app, /function highlightProductChange/);
  assert.match(app, /window\.scrollTo\(0, 0\)/);
  assert.match(app, /classList\.add\("needs-refresh"\)/);
  assert.match(app, /Recarregar novo produto/);
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

test("extension recovers UI, capture and image state after failures", () => {
  const app = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  const content = readFileSync(join(extensionRoot, "content", "index.js"), "utf8");
  const background = readFileSync(join(extensionRoot, "background", "service-worker.js"), "utf8");
  assert.match(app, /runtime\.fetchWithTimeout/);
  assert.match(app, /const runId = \+\+captureSequence/);
  assert.match(app, /if \(!activeProduct\) elements\.offerForm\.classList\.add/);
  assert.match(app, /if \(runId === captureSequence\)/);
  assert.match(app, /shareImagePromise = null/);
  assert.match(app, /setBusy\(elements\.refreshButton, false\)/);
  assert.match(content, /__TABARATO_STORE_CONTENT__/);
  assert.match(content, /extractionUrl !== currentUrl/);
  assert.match(background, /\.finally\(\(\) => \{ whatsappOperation = null; \}\)/);
  assert.match(background, /chrome\.tabs\.onUpdated\.removeListener\(listener\)/);
  const whatsapp = readFileSync(join(extensionRoot, "content", "whatsapp.js"), "utf8");
  assert.match(whatsapp, /const controller = new AbortController\(\)/);
  assert.match(whatsapp, /aborted\(signal\);\s*send\.click\(\)/);
  assert.match(whatsapp, /controller\.abort\(\)/);
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

test("extension captures commerce benefits without automatic coupon detection", () => {
  const shared = readFileSync(join(extensionRoot, "content", "shared.js"), "utf8");
  const mercadoLivre = readFileSync(join(extensionRoot, "content", "stores", "mercado-livre.js"), "utf8");
  const shopee = readFileSync(join(extensionRoot, "content", "stores", "shopee.js"), "utf8");
  const sidePanel = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  assert.match(shared, /commerceBenefits/);
  assert.match(shared, /Frete grátis/);
  assert.match(shared, /sem\\s\+juros/);
  assert.doesNotMatch(shared, /const coupon =/);
  assert.doesNotMatch(mercadoLivre, /productCoupon|couponConditions|tools\.coupon/);
  assert.doesNotMatch(shopee, /tools\.coupon/);
  assert.doesNotMatch(mercadoLivre, /coupon\s*:/);
  assert.doesNotMatch(shopee, /coupon\s*:/);
  assert.match(sidePanel, /coupon: ""/);
  assert.match(sidePanel, /captureQuality/);
});
