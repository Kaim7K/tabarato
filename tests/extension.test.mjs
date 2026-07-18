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

const backgroundSource = listFiles(join(extensionRoot, "background"), ".js")
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
const panelSource = [
  readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8"),
  ...listFiles(join(extensionRoot, "sidepanel", "modules"), ".js").map((path) => readFileSync(path, "utf8")),
].join("\n");

test("extension manifest is Manifest V3 and references existing files", () => {
  const manifest = JSON.parse(readFileSync(join(extensionRoot, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "background/service-worker.js");
  assert.equal(manifest.side_panel.default_path, "sidepanel/index.html");
  assert.equal(manifest.minimum_chrome_version, "116");
  assert.ok(manifest.permissions.includes("sidePanel"));
  assert.ok(manifest.permissions.includes("clipboardRead"));
  assert.ok(manifest.permissions.includes("clipboardWrite"));
  assert.ok(manifest.permissions.includes("debugger"));
  assert.ok(manifest.permissions.includes("offscreen"));
  assert.ok(manifest.host_permissions.includes("https://*/*"));
  assert.ok(manifest.content_scripts.some((entry) => entry.js.includes("content/stores/generic.js")));
  assert.ok(manifest.content_scripts.some((entry) => entry.matches.includes("https://*.mercadolivre.com.br/*") && entry.js.includes("content/coupons.js")));
  assert.ok(manifest.content_scripts.some((entry) => entry.matches.includes("https://web.whatsapp.com/*")));
  assert.ok(manifest.content_scripts.some((entry) => entry.matches.includes("https://www.tabaratoofertas.shop/*")));
  assert.ok(manifest.content_scripts.some((entry) => entry.matches.includes("https://tabaratoofertas.shop/*")));
  assert.ok(manifest.content_scripts.every((entry) => !entry.matches.includes("https://tabaratoofertas.vercel.app/*")));
  assert.ok(manifest.content_scripts.every((entry) => !entry.matches.includes("https://*/*")));
  const referencedFiles = [
    manifest.background.service_worker,
    manifest.side_panel.default_path,
    manifest.icons["128"],
    ...manifest.content_scripts.flatMap((entry) => entry.js),
  ];
  assert.ok(referencedFiles.every((path) => existsSync(join(extensionRoot, path))));
  assert.match(backgroundSource, /access\.js/);
  assert.match(backgroundSource, /TaBaratoExtensionApi\.sidePanel\?\.close|api\.sidePanel\?\.open/);
  assert.match(readFileSync(join(extensionRoot, "sidepanel", "index.html"), "utf8"), /product-utils\.js/);
});

test("extension uses the official domain and migrates the former Vercel address", () => {
  const config = readFileSync(join(extensionRoot, "shared", "config.js"), "utf8");
  assert.match(config, /https:\/\/www\.tabaratoofertas\.shop/);
  assert.match(config, /https:\/\/tabaratoofertas\.vercel\.app/);
  assert.match(backgroundSource, /migrateStoredBaseUrl/);
  assert.match(panelSource, /brandConfig\.migrateBaseUrl/);
});

test("extension action and launcher stay hidden outside allowed pages", () => {
  const content = readFileSync(join(extensionRoot, "content", "index.js"), "utf8");
  assert.match(backgroundSource, /builtInAllowedHost/);
  assert.match(backgroundSource, /tabarato_connected_store_hosts/);
  assert.match(backgroundSource, /configuredOrigin/);
  assert.match(backgroundSource, /registerContentScripts/);
  assert.match(backgroundSource, /tabarato-connected-stores/);
  assert.match(backgroundSource, /scheduleInitialization/);
  assert.match(backgroundSource, /Promise\.allSettled/);
  assert.match(backgroundSource, /TaBaratoExtensionApi\.action\?\.disable|api\.action\?\.disable/);
  assert.match(backgroundSource, /TaBaratoExtensionApi\.sidePanel\.setOptions/);
  assert.match(backgroundSource, /sidePanel\?\.close/);
  assert.match(backgroundSource, /api\.sidePanel\?\.open/);
  assert.match(backgroundSource, /message\?\.type === "TABARATO_OPEN_PANEL"/);
  assert.match(backgroundSource, /openPanelOnActionClick: true/);
  assert.match(backgroundSource, /api\.action\?\.onClicked/);
  assert.match(content, /TABARATO_IS_ALLOWED_PAGE/);
  assert.match(content, /existing\?\.(?:remove|remove\(\))/);
  assert.match(content, /currentSynchronousProductAdapter/);
  assert.match(content, /const panelRequest = globalThis\.TaBaratoExtensionApi\.runtime\.sendMessage\(\{ type: "TABARATO_OPEN_PANEL" \}\);[\s\S]+adapter\.prepareAffiliateLink/);
  assert.doesNotMatch(content, /const adapter = await currentAdapter\(\);[\s\S]{0,240}TABARATO_OPEN_PANEL/);
  assert.match(content, /assets\/icon-128\.png/);
  assert.doesNotMatch(content, /Enviar produto/);
});

test("all extension JavaScript files have valid syntax", () => {
  listFiles(extensionRoot, ".js").forEach((path) => {
    assert.doesNotThrow(() => new vm.Script(readFileSync(path, "utf8"), { filename: path }));
  });
});

test("extension entry points delegate work to focused modules", () => {
  const panelEntry = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  const workerEntry = readFileSync(join(extensionRoot, "background", "service-worker.js"), "utf8");
  assert.ok(panelEntry.split(/\r?\n/).length < 220);
  assert.ok(workerEntry.split(/\r?\n/).length < 140);
  ["api", "batch", "capture", "catalog", "core", "media", "product", "publishing"].forEach((module) => {
    assert.ok(existsSync(join(extensionRoot, "sidepanel", "modules", `${module}.js`)));
  });
  ["access", "clipboard", "coupons", "whatsapp"].forEach((module) => {
    assert.ok(existsSync(join(extensionRoot, "background", `${module}.js`)));
  });
});

test("production extension contains no development console logging", () => {
  const source = listFiles(extensionRoot, ".js").map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(source, /console\.(?:log|debug|warn)\s*\(/);
});

test("new brand identity uses the correct logo contrast in each surface", () => {
  const brand = readFileSync(join(root, "src", "lib", "brand.js"), "utf8");
  const footer = readFileSync(join(root, "src", "components", "Footer.jsx"), "utf8");
  const admin = readFileSync(join(root, "src", "features", "admin", "AdminUi.jsx"), "utf8");
  const shareCard = readFileSync(join(root, "src", "lib", "shareCard.js"), "utf8");
  const social = readFileSync(join(root, "src", "features", "social", "SocialPagePreview.jsx"), "utf8");
  const requiredAssets = [
    "public/brand/logo-card.png",
    "public/brand/favicon.png",
    "extension/assets/tabarato-logo.png",
    "extension/assets/icon-128.png",
  ];

  assert.ok(requiredAssets.every((path) => existsSync(join(root, path))));
  assert.match(brand, /BRAND_LOGO_DARK/);
  assert.match(brand, /BRAND_LOGO_CARD/);
  assert.match(brand, /BRAND_MASCOT/);
  assert.match(footer, /BRAND_LOGO_DARK/);
  assert.match(admin, /BRAND_LOGO_DARK/);
  assert.match(shareCard, /BRAND_LOGO_CARD/);
  assert.match(social, /BRAND_LOGO_CARD/);
  assert.doesNotMatch(social, /BRAND_MASCOT/);
});

test("every side panel selector references an existing element", () => {
  const html = readFileSync(join(extensionRoot, "sidepanel", "index.html"), "utf8");
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  const requested = [...panelSource.matchAll(/(?:getElementById|byId)\("([^"]+)"\)/g)].map((match) => match[1]);
  assert.deepEqual(requested.filter((id) => !ids.has(id)), []);
});

test("extension never embeds admin secrets or captured HTML", () => {
  const source = listFiles(extensionRoot, ".js").map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(source, /ADMIN_API_KEY/);
  assert.doesNotMatch(source, /innerHTML\s*=/);
  assert.match(source, /RASCUNHO/);
});

test("login captures the current product without requiring a manual refresh", () => {
  const app = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  assert.match(app, /panel\.api\.renderAuth\(\);\s*await captureCurrentPageAfterAuth\(\);/);
  assert.match(app, /async function captureCurrentPageAfterAuth\(stored = null\)/);
  assert.match(app, /await captureCurrentPageAfterAuth\(stored\);/);
  assert.match(app, /freshCaptureRequest\(captureRequest, tab\)/);
});

test("Mercado Livre pins the page to the top before opening the affiliate share control", () => {
  const source = readFileSync(join(extensionRoot, "content", "stores", "mercado-livre.js"), "utf8");
  let clicked = false;
  let clickedAtScroll = -1;
  const scrollingElement = { scrollTop: 900, scrollLeft: 0 };
  const affiliateContainer = {
    textContent: "Programa de afiliados Ganhos extras 10%",
    parentElement: null,
    getBoundingClientRect: () => ({ height: 80, top: 100, left: 700, width: 300 }),
  };
  const shareButton = {
    id: "share-icon",
    textContent: "",
    parentElement: affiliateContainer,
    getAttribute: (name) => name === "aria-label" ? "Compartilhar" : "",
    getBoundingClientRect: () => ({ height: 32, top: 120, left: 850, width: 32 }),
    scrollIntoView: () => { throw new Error("affiliate capture must not scrollIntoView"); },
    click: () => {
      clicked = true;
      clickedAtScroll = scrollingElement.scrollTop;
    },
  };
  const context = {
    Date,
    innerWidth: 1200,
    scrollY: 900,
    scrollTo: () => {
      context.scrollY = 0;
      scrollingElement.scrollTop = 0;
    },
    location: { href: "https://produto.mercadolivre.com.br/MLB-123456789-produto_JM", hostname: "produto.mercadolivre.com.br" },
    navigator: {},
    document: {
      scrollingElement,
      documentElement: { scrollTop: 900, scrollLeft: 0, clientWidth: 1200 },
      body: { scrollTop: 900, scrollLeft: 0 },
      querySelector: () => null,
      querySelectorAll: (selector) => selector.includes("role='dialog'") ? [] : [shareButton],
    },
    TaBaratoCapture: {
      clean: (value = "") => String(value).replace(/\s+/g, " ").trim(),
      visible: () => true,
    },
    TaBaratoStores: [],
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "mercado-livre.js" });
  assert.equal(context.TaBaratoStores[0].prepareAffiliateLink(), true);
  assert.equal(clicked, true);
  assert.equal(clickedAtScroll, 0);
  assert.doesNotMatch(source, /control\.scrollIntoView/);
});

test("batch capture pins Mercado Livre workers before affiliate checks and after reload", () => {
  const source = readFileSync(join(extensionRoot, "sidepanel", "modules", "capture.js"), "utf8");
  assert.match(source, /await waitForProductDom\(tabId, url, signal, 45000\);\s*await pinWorkerToTop\(tabId, url, signal\);\s*await waitForAffiliateSurface/);
  assert.match(source, /await reloadWorker\(tabId, url, signal\);\s*await pinWorkerToTop\(tabId, url, signal\);\s*await waitForAffiliateSurface/);
});

test("capture extracts requested product fields and closes store popups", () => {
  const couponCode = readFileSync(join(extensionRoot, "shared", "coupon-code.js"), "utf8");
  const shared = readFileSync(join(extensionRoot, "content", "shared.js"), "utf8");
  const meli = readFileSync(join(extensionRoot, "content", "stores", "mercado-livre.js"), "utf8");
  const shopee = readFileSync(join(extensionRoot, "content", "stores", "shopee.js"), "utf8");
  assert.match(shared, /firstUsefulParagraph/);
  assert.match(shared, /meaningfulParagraph/);
  assert.match(shared, /couponCandidates/);
  assert.match(shared, /couponCandidates = \(root = document\)/);
  assert.doesNotMatch(shared, /Cupom disponivel no anuncio\. Ative antes de comprar\./);
  assert.match(shared, /couponPriceDetails/);
  assert.match(shared, /com\\s\+\(\?:o\\s\+\)\?cupom/);
  assert.match(shared, /priceDetails/);
  assert.match(shared, /commerceBenefits/);
  assert.match(shared, /installmentSummary/);
  assert.match(shared, /hasExplicitFreeShipping/);
  assert.match(shared, /imageCandidates/);
  assert.match(shared, /closeTransientDialogs/);
  assert.match(meli, /captureAffiliateLink/);
  assert.match(meli, /MELI_LINK_PATTERN/);
  assert.match(meli, /mainGalleryImageCandidates/);
  assert.match(meli, /main-gallery/);
  assert.doesNotMatch(meli, /img\[src\*='mlstatic'\]/);
  assert.doesNotMatch(meli, /productImages\(structured\)\.map/);
  assert.match(meli, /pricePaymentMethod/);
  assert.match(meli, /couponPrice\.value \|\| basePrice/);
  assert.match(meli, /captureCoupon/);
  assert.match(meli, /explicitCouponCode\(activeDialog\) \|\| usefulCoupon\(activeDialog\)/);
  assert.match(meli, /const couponDialogCodes =/);
  assert.match(meli, /extractExplicitComCodes\(value\)/);
  assert.match(meli, /ver todos os meus cupons/);
  assert.match(meli, /}, 3600\) \|\| ""/);
  assert.match(meli, /regularPrice: basePrice/);
  assert.match(meli, /Number\(basePrice\) >= Number\(currentPrice\)/);
  assert.match(meli, /priceInfo\.method === "Pix"/);
  assert.match(meli, /affiliateLinkType: affiliateLink \? "mercado-livre-generated" : "missing"/);
  assert.match(meli, /const controlLabel =/);
  assert.match(meli, /getAttribute\?\.\("aria-label"\)/);
  assert.match(meli, /getAttribute\?\.\("title"\)/);
  assert.match(meli, /const shareLabel = \/compartilhar/);
  assert.doesNotMatch(meli, /affiliateLink: affiliateLink \|\| tools\.affiliateLink\(\)/);
  assert.doesNotMatch(meli, /promotionSummary/);
  assert.match(couponCode, /extractExplicitComCodes/);
  assert.match(meli, /await tools\.closeTransientDialogs/);
  assert.match(shopee, /couponCandidates/);
  assert.match(shopee, /confidence/);
  assert.match(shopee, /regularPrice: basePrice/);
});

test("coupon parser reads explicit Com CODE labels and never invents a coupon", () => {
  const couponCodeSource = readFileSync(join(extensionRoot, "shared", "coupon-code.js"), "utf8");
  const source = readFileSync(join(extensionRoot, "content", "shared.js"), "utf8");
  const document = { body: { innerText: "Cupons do Mercado Livre Com MELIMODA 20% OFF" }, querySelectorAll: () => [] };
  const context = {
    Array, Date, Intl, JSON, Math, Number, Object, Promise, RegExp, Set, String, URL,
    document,
    getComputedStyle: () => ({ visibility: "visible", display: "block" }),
    location: { href: "https://produto.mercadolivre.com.br/MLB-123", hostname: "produto.mercadolivre.com.br" },
  };
  context.globalThis = context;
  vm.runInNewContext(couponCodeSource, context, { filename: "coupon-code.js" });
  vm.runInNewContext(source, context, { filename: "shared.js" });
  assert.equal(context.TaBaratoCapture.couponCandidates()[0]?.value, "MELIMODA");
  document.body.innerText = "Cupom Fralda Roupa Intima Descartavel";
  assert.equal(context.TaBaratoCapture.couponCandidates().length, 0);
  document.body.innerText = "Cupom: FRALDA10 20% OFF";
  assert.equal(context.TaBaratoCapture.couponCandidates()[0]?.value, "FRALDA10");
  document.body.innerText = "Ver cupons disponiveis. Preco com cupom R$ 79,92.";
  assert.equal(context.TaBaratoCapture.couponCandidates().length, 0);
  assert.equal(context.TaBaratoCouponCode.extract("Com... MELIMODA 20% OFF")[0], "MELIMODA");
  assert.equal(context.TaBaratoCouponCode.classify("Ative o cupom antes da compra.", { hasCouponPrice: true }).status, "activation-required");
  assert.equal(context.TaBaratoCouponCode.classify("Nenhum cupom disponivel.").status, "none");
  assert.equal(context.TaBaratoCouponCode.extractExplicitComCode("Com MELIMODA"), "MELIMODA");
  assert.deepEqual(
    [...context.TaBaratoCouponCode.extractExplicitComCodes(
      "Cupons do Mercado Livre\nCom MELIMODA\n20% OFF\nCompra mínima R$ 49\nCom VALEDESCONTO\n18% OFF",
    )],
    ["MELIMODA", "VALEDESCONTO"],
  );
  assert.equal(context.TaBaratoCouponCode.extractExplicitComCode("R$ 51,84 com Cupom"), "");
  assert.equal(context.TaBaratoCouponCode.extractExplicitComCode("COMPRA MÍNIMA R$ 49"), "");
});

test("Mercado Livre pricing reads the installment total and only explicit free shipping", () => {
  const couponCodeSource = readFileSync(join(extensionRoot, "shared", "coupon-code.js"), "utf8");
  const source = readFileSync(join(extensionRoot, "content", "shared.js"), "utf8");
  const document = { body: { innerText: "" }, querySelectorAll: () => [] };
  const context = {
    Array, Date, Intl, JSON, Math, Number, Object, Promise, RegExp, Set, String, URL,
    document,
    getComputedStyle: () => ({ visibility: "visible", display: "block" }),
    location: { href: "https://produto.mercadolivre.com.br/MLB-123", hostname: "produto.mercadolivre.com.br" },
  };
  context.globalThis = context;
  vm.runInNewContext(couponCodeSource, context, { filename: "coupon-code.js" });
  vm.runInNewContext(source, context, { filename: "shared.js" });

  assert.equal(
    context.TaBaratoCapture.installmentSummary("R$ 637,91 20% OFF no Pix ou R$ 739,90 em 10x R$ 73,99 sem juros"),
    "R$ 739,90 em 10x sem juros.",
  );
  assert.equal(context.TaBaratoCapture.installmentSummary("8x sem juros"), "");
  assert.equal(context.TaBaratoCapture.commerceBenefits("8x sem juros. Frete gratis."), "Frete gratis.");
  assert.equal(context.TaBaratoCapture.commerceBenefits("8x R$ 4,25 sem juros. Frete gratis."), "Frete gratis. 8x R$ 4,25 sem juros.");

  const shippingElement = (textContent) => ({
    textContent,
    getBoundingClientRect: () => ({ width: 120, height: 24 }),
    querySelectorAll: () => [],
  });
  assert.equal(context.TaBaratoCapture.hasExplicitFreeShipping({ querySelectorAll: () => [shippingElement("Frete gratis acima de R$ 19")] }), false);
  assert.equal(context.TaBaratoCapture.hasExplicitFreeShipping({ querySelectorAll: () => [shippingElement("Chegara gratis segunda-feira")] }), true);
});

test("WhatsApp and Telegram omit coupon rows when the code is empty", () => {
  const telegram = readFileSync(join(root, "api", "_lib", "telegram.js"), "utf8");
  assert.match(panelSource, /if \(payload\.coupon\) lines\.push/);
  assert.match(telegram, /if \(offer\.coupon\) lines\.push/);
});

test("side panel provides groups, admin, modes, batch and custom messages", () => {
  const html = readFileSync(join(extensionRoot, "sidepanel", "index.html"), "utf8");
  assert.match(html, /id="groups-toggle"/);
  assert.match(html, /id="admin-panel-button"/);
  assert.match(html, /id="mode-single"/);
  assert.match(html, /id="mode-batch"/);
  assert.match(html, /id="batch-limit"/);
  assert.match(html, /id="custom-message"/);
  assert.match(panelSource, /function groupNames/);
  assert.match(panelSource, /function setMode/);
  assert.match(panelSource, /async function start\(/);
  assert.match(panelSource, /async function sendCustomMessage/);
  assert.match(panelSource, /action=send-custom/);
});

test("batch mode canonicalizes routes and preloads five stable product tabs", () => {
  const html = readFileSync(join(extensionRoot, "sidepanel", "index.html"), "utf8");
  const batchSource = readFileSync(join(extensionRoot, "sidepanel", "batch-utils.js"), "utf8");
  const content = readFileSync(join(extensionRoot, "content", "index.js"), "utf8");
  const context = { URL };
  context.globalThis = context;
  vm.runInNewContext(batchSource, context, { filename: "batch-utils.js" });

  const mercadoLivreRoutes = context.TaBaratoBatchUtils.normalizeProductUrls([
    "https://produto.mercadolivre.com.br/MLB-123456789-produto_JM?searchVariation=1&utm_source=x",
    "https://produto.mercadolivre.com.br/MLB-123456789-produto_JM?polycard_client=search",
    "https://produto.mercadolivre.com.br/MLB-987654321-outro_JM#position=2",
  ], "mercado-livre", 10);
  assert.equal(mercadoLivreRoutes.length, 2);
  assert.equal(mercadoLivreRoutes[0], "https://produto.mercadolivre.com.br/MLB-123456789-produto_JM");
  const mercadoLivreIdentity = context.TaBaratoBatchUtils.productIdentityFromUrl(mercadoLivreRoutes[0]);
  assert.equal(mercadoLivreIdentity.sourceProductId, "MLB123456789");
  assert.equal(mercadoLivreIdentity.platform, "Mercado Livre");
  const shopeeRoutes = context.TaBaratoBatchUtils.normalizeProductUrls([
    "https://shopee.com.br/produto-i.123.456?utm_source=x",
    "https://shopee.com.br/product/123/456?sp_atk=tracking",
  ], "shopee", 10);
  assert.equal(shopeeRoutes.length, 1);

  const validProduct = {
    productName: "Produto completo",
    currentPrice: "99,90",
    imageUrl: "https://http2.mlstatic.com/image.jpg",
    affiliateLink: "https://meli.la/abc123",
    platform: "Mercado Livre",
    confidence: 1,
  };
  assert.deepEqual(
    [...context.TaBaratoBatchUtils.reviewProduct(validProduct, 0.8, (value) => Number(String(value).replace(",", ".")))],
    [],
  );
  const missingAffiliate = {
    ...validProduct,
    affiliateLink: "",
    confidence: 0.8,
  };
  assert.deepEqual(
    [...context.TaBaratoBatchUtils.reviewProduct(missingAffiliate, 0.8, (value) => Number(String(value).replace(",", ".")))],
    ["link afiliado meli.la"],
  );
  assert.match(html, /src="batch-utils\.js"/);
  assert.equal(
    JSON.stringify(context.TaBaratoBatchUtils.chunkValues([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 5)),
    JSON.stringify([[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12]]),
  );
  assert.match(panelSource, /BATCH_WINDOW_SIZE = 5/);
  assert.match(panelSource, /Promise\.all\(urls\.map/);
  assert.match(panelSource, /active: false/);
  assert.match(panelSource, /loadedWorker/);
  assert.match(panelSource, /batchWorkerTabIds/);
  assert.doesNotMatch(panelSource, /url: "about:blank"/);
  assert.match(panelSource, /stableSamples >= 3/);
  assert.match(panelSource, /document\.readyState === "complete"/);
  assert.match(panelSource, /Boolean\(price\)/);
  assert.match(panelSource, /\^https\?:\/i\.test\(image\)/);
  assert.match(panelSource, /waitForAffiliateSurface/);
  assert.match(panelSource, /waitForProductDom/);
  assert.doesNotMatch(panelSource, /waitForTabComplete\(tabId, 40000/);
  assert.match(panelSource, /normalizeProductUrls/);
  assert.match(panelSource, /reviewProduct/);
  assert.match(panelSource, /recoverAffiliateLink/);
  assert.match(panelSource, /TABARATO_CAPTURE_AFFILIATE_LINK/);
  assert.match(panelSource, /TaBaratoExtensionApi\.tabs\.reload/);
  assert.doesNotMatch(panelSource, /captureUrlInTempTab/);
  assert.match(content, /storeId: adapter\?\.id/);
  assert.match(content, /message\?\.type === "TABARATO_CAPTURE_AFFILIATE_LINK"/);
});

test("extension publishes to site, Telegram and sequential WhatsApp groups", () => {
  const whatsapp = readFileSync(join(extensionRoot, "content", "whatsapp.js"), "utf8");
  assert.match(panelSource, /\/api\/admin\/ofertas/);
  assert.match(panelSource, /\/publicar/);
  assert.match(panelSource, /sendOfferToWhatsApp/);
  assert.match(panelSource, /groupNames\(\)/);
  assert.match(backgroundSource, /normalizeGroups/);
  assert.match(backgroundSource, /for \(let index = 0; index < groups\.length; index \+= 1\)/);
  assert.match(backgroundSource, /TABARATO_STOP_WHATSAPP/);
  assert.match(whatsapp, /TABARATO_WHATSAPP_CANCEL/);
  assert.match(whatsapp, /activeController/);
});

test("offer artwork matches the requested premium share card", () => {
  const artwork = readFileSync(join(extensionRoot, "sidepanel", "artwork.js"), "utf8");
  const media = readFileSync(join(extensionRoot, "sidepanel", "modules", "media.js"), "utf8");
  assert.match(media, /for \(const source of sources\)/);
  assert.doesNotMatch(media, /imageSceneScore|usageScore|review|cliente|depoimento/);
  assert.match(panelSource, /assets\/tabarato-logo\.png/);
  assert.match(panelSource, /assets\/mercado-livre\.png/);
  assert.match(panelSource, /assets\/shopee\.svg/);
  assert.match(artwork, /createOfferArtwork/);
  assert.match(artwork, /discountPercent/);
  assert.match(artwork, /subjectBounds/);
  assert.match(artwork, /drawProduct/);
  assert.match(artwork, /drawProduct\(context, product, \{ x: 42, y: 42, width: 996, height: 860 \}\)/);
  assert.match(artwork, /roundedRect\(context, 42, 918, 996, 126, 63\)/);
  assert.match(artwork, /previousX/);
  assert.match(artwork, /roundedRect\(context, 792, 54, 236, 78, 39\)/);
  assert.match(artwork, /font = "700 30px Montserrat/);
  assert.match(artwork, /lineCap = "round"/);
  assert.match(artwork, /drawContained\(context, storeLogo/);
  assert.match(artwork, /drawContained\(context, siteLogo/);
  assert.doesNotMatch(artwork, /font\s*=\s*["'`](?:800|900)\s/);
});

test("WhatsApp artwork is copied and pasted without file attachment inputs", () => {
  const media = readFileSync(join(extensionRoot, "sidepanel", "modules", "media.js"), "utf8");
  const whatsapp = readFileSync(join(extensionRoot, "content", "whatsapp.js"), "utf8");
  assert.match(media, /navigator\.clipboard\.write/);
  assert.match(media, /ClipboardItem/);
  assert.match(media, /copyImageToClipboard/);
  assert.match(backgroundSource, /api\.offscreen\.createDocument/);
  assert.match(backgroundSource, /TABARATO_OFFSCREEN_WRITE_IMAGE/);
  assert.ok(existsSync(join(extensionRoot, "offscreen", "clipboard.html")));
  const whatsappBackground = readFileSync(join(extensionRoot, "background", "whatsapp.js"), "utf8");
  assert.match(whatsappBackground, /let clipboardPrepared = Boolean\(message\.clipboardPrepared\)/);
  assert.match(whatsappBackground, /if \(!clipboardPrepared && message\.imageDataUrl\)/);
  assert.match(whatsappBackground, /clipboardPrepared,\s*\n/);
  assert.match(whatsapp, /clipboardPrepared/);
  assert.match(whatsapp, /execCommand\("paste"\)/);
  assert.match(whatsapp, /Nao foi possivel copiar a imagem para o clipboard/);
  assert.doesNotMatch(whatsapp, /transfer\.items\.add\(file\)|dispatchImagePaste/);
  assert.doesNotMatch(whatsapp, /input\[type=["']file["']\]/);
});

test("duplicate products are reconciled automatically by price movement", () => {
  const itemRoute = readFileSync(join(root, "api", "admin", "ofertas", "[id].js"), "utf8");
  const publishRoute = readFileSync(join(root, "api", "admin", "ofertas", "[id]", "publicar.js"), "utf8");
  const publisher = readFileSync(join(root, "api", "_lib", "publisher.js"), "utf8");
  assert.match(panelSource, /async function reconcile/);
  assert.match(panelSource, /nextPrice < oldPrice/);
  assert.match(panelSource, /method: "PATCH"/);
  assert.match(panelSource, /method: "DELETE"/);
  assert.match(panelSource, /forceRepublish: true/);
  assert.match(itemRoute, /allowExtension: true/);
  assert.match(itemRoute, /handleExtensionCors/);
  assert.match(publishRoute, /forceRepublish/);
  assert.match(publisher, /forceRepublish/);
});

test("extension synchronizes categories and connected store hosts from the site", () => {
  const generic = readFileSync(join(extensionRoot, "content", "stores", "generic.js"), "utf8");
  const listRoute = readFileSync(join(root, "api", "admin", "ofertas", "index.js"), "utf8");
  assert.match(panelSource, /async function synchronize/);
  assert.match(panelSource, /connectedHosts/);
  assert.match(panelSource, /connectedStoreHosts/);
  assert.match(generic, /matchesConnectedStore/);
  assert.match(generic, /tabarato_connected_store_hosts/);
  assert.match(listRoute, /connectedStoreHostsFromOffers/);
});

test("extension persists the active product and exposes admin mode to the site", () => {
  const contentIndex = readFileSync(join(extensionRoot, "content", "index.js"), "utf8");
  assert.match(panelSource, /tabarato_product_draft/);
  assert.match(panelSource, /persistDraft/);
  assert.match(contentIndex, /tabaratoExtensionAdmin/);
  assert.match(contentIndex, /tabarato:admin-extension/);
});

test("coupon activation uses confirmed filters and trusted Chrome input", () => {
  const sidePanelHtml = readFileSync(join(extensionRoot, "sidepanel", "index.html"), "utf8");
  const sidePanelStyles = readFileSync(join(extensionRoot, "sidepanel", "styles.css"), "utf8");
  const coupons = readFileSync(join(root, "extension", "content", "coupons.js"), "utf8");
  assert.match(sidePanelHtml, /activate-coupons-button/);
  assert.match(sidePanelHtml, /id="message-headline"/);
  assert.match(sidePanelHtml, /action-icon-button/);
  assert.match(coupons, /TABARATO_START_COUPONS/);
  assert.match(coupons, /TABARATO_STOP_COUPONS/);
  assert.match(coupons, /TaBaratoCoupons/);
  assert.match(coupons, /version: 3/);
  assert.match(coupons, /ensureCouponFilters/);
  assert.match(coupons, /filtrar e ordenar/);
  assert.match(coupons, /nao ativados/);
  assert.match(coupons, /inactiveFilterApplied/);
  assert.match(coupons, /newestOrderApplied/);
  assert.match(coupons, /Nao ativados, Mais novos/);
  assert.match(coupons, /activationControls/);
  assert.match(coupons, /ACTION_PATTERN/);
  assert.match(coupons, /TABARATO_COUPON_CLICK/);
  assert.match(coupons, /activationConfirmed/);
  assert.doesNotMatch(coupons, /dispatchEvent|\.click\(\)/);
  assert.match(backgroundSource, /activeOperation/);
  assert.match(backgroundSource, /activeOperation\.id !== message\.operationId/);
  assert.match(backgroundSource, /TABARATO_START_COUPONS/);
  assert.match(backgroundSource, /TABARATO_STOP_ML_COUPONS/);
  assert.match(backgroundSource, /ensureCouponAutomation/);
  assert.match(backgroundSource, /startCouponAutomation/);
  assert.match(backgroundSource, /Receiving end does not exist|receiving end does not exist/);
  assert.match(backgroundSource, /could not establish connection/);
  assert.match(backgroundSource, /O automatizador de cupons nao foi carregado/);
  assert.match(backgroundSource, /Input\.dispatchMouseEvent/);
  assert.match(backgroundSource, /TaBaratoExtensionApi\.debugger\?\.attach/);
  assert.match(backgroundSource, /TaBaratoExtensionApi\.debugger\?\.detach/);
  assert.match(backgroundSource, /PAGE_URL = "https:\/\/www\.mercadolivre\.com\.br\/cupons\/"/);
  assert.doesNotMatch(backgroundSource, /cupons\/filter\?new=true/);
  assert.match(backgroundSource, /\^\\\/cupons\(\?:\\\/\|\$\)/);
  assert.match(panelSource, /couponActivationRunning/);
  assert.match(panelSource, /Parar cupons/);
  assert.match(panelSource, /isCouponManagementUrl/);
  assert.match(backgroundSource, /api\.action\?\.onClicked/);
  assert.match(backgroundSource, /TaBaratoExtensionApi\.tabs\.query\(\{\}\)|api\.tabs\.query\(\{\}\)/);
  assert.match(panelSource, /Capturando o novo produto/);
  assert.match(sidePanelStyles, /position: fixed/);
  assert.match(sidePanelStyles, /Montserrat/);
});

test("side panel supports persistent light and dark themes", () => {
  const html = readFileSync(join(extensionRoot, "sidepanel", "index.html"), "utf8");
  const styles = readFileSync(join(extensionRoot, "sidepanel", "styles.css"), "utf8");
  const theme = readFileSync(join(extensionRoot, "sidepanel", "theme.js"), "utf8");

  assert.match(html, /id="theme-toggle"/);
  assert.match(html, /src="theme\.js"/);
  assert.match(styles, /:root\[data-theme="dark"\]/);
  assert.match(theme, /tabarato_extension_theme/);
  assert.match(theme, /prefers-color-scheme: dark/);
  assert.doesNotMatch(styles, /font-weight:\s*(?:8|9)00/);
});

test("Mercado Livre capture prioritizes the product coupon and ignores recommendation prices", () => {
  const source = readFileSync(join(extensionRoot, "content", "shared.js"), "utf8");
  class FakeElement {
    constructor({ text = "", className = "", aria = "", fraction = "", cents = "", parentElement = null }) {
      this.textContent = text;
      this.className = className;
      this.parentElement = parentElement;
      this.attributes = { "aria-label": aria };
      this.children = {};
      if (fraction) this.children[".andes-money-amount__fraction"] = new FakeElement({ text: fraction, className: "andes-money-amount__fraction", parentElement: this });
      if (cents) this.children[".andes-money-amount__cents"] = new FakeElement({ text: cents, className: "andes-money-amount__cents", parentElement: this });
    }
    getAttribute(name) {
      return this.attributes[name] || "";
    }
    getBoundingClientRect() {
      return { width: 80, height: 20 };
    }
    querySelector(selector) {
      return this.children[selector] || null;
    }
    closest(selector) {
      let current = this;
      while (current) {
        if (/poly-card/.test(selector) && /\bpoly-card\b/.test(current.className)) return current;
        if (/ui-vpp-coupons/.test(selector) && /\bui-vpp-coupons\b/.test(current.className)) return current;
        current = current.parentElement;
      }
      return null;
    }
  }
  const priceContainer = new FakeElement({ text: "R$399,90R$167,6558% OFF5x R$33,53 sem juros", className: "ui-pdp-price__main-container" });
  const secondLine = new FakeElement({ text: "R$167,6558% OFF", className: "ui-pdp-price__second-line", parentElement: priceContainer });
  const currentWrapper = new FakeElement({ text: "R$167,65", className: "ui-pdp-price__part__container", parentElement: secondLine });
  const previous = new FakeElement({ text: "R$399,90", className: "ui-pdp-price__original-value andes-money-amount andes-money-amount--previous", aria: "Antes: 399 reais com 90 centavos", fraction: "399", cents: "90", parentElement: priceContainer });
  const current = new FakeElement({ text: "R$167,65", className: "andes-money-amount", aria: "167 reais com 65 centavos", fraction: "167", cents: "65", parentElement: currentWrapper });
  const installment = new FakeElement({ text: "R$33,53", className: "andes-money-amount", aria: "33 reais com 53 centavos", fraction: "33", cents: "53", parentElement: new FakeElement({ text: "5x R$33,53 sem juros", className: "ui-pdp-price__subtitles", parentElement: priceContainer }) });
  const productCoupon = new FakeElement({ text: "R$134,12 com Cupom", className: "ui-vpp-coupons" });
  const recommendation = new FakeElement({ text: "R$399,90R$279,90 com Cupom12x R$29,34", className: "poly-card" });
  const recommendationCoupon = new FakeElement({ text: "R$279,90 com Cupom", className: "poly-component__coupons", parentElement: recommendation });
  const elements = [previous, current, installment, productCoupon, recommendation, recommendationCoupon];
  const context = {
    document: {
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
      },
      querySelectorAll(selector) {
        if (selector.includes("ui-pdp-price__second-line")) return [current, installment];
        if (selector.includes("ui-pdp-price__original-value")) return [previous];
        if (selector.includes("span, p, div, a, button")) return [productCoupon, recommendation, recommendationCoupon];
        if (selector.includes("andes-money-amount")) return [previous, current, installment];
        return elements;
      },
    },
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "shared.js" });
  assert.equal(context.TaBaratoCapture.priceDetails(".ui-pdp-price__second-line .andes-money-amount").value, "167.65");
  assert.equal(context.TaBaratoCapture.price(".ui-pdp-price__original-value .andes-money-amount"), "399.90");
  assert.equal(context.TaBaratoCapture.couponPriceDetails("167.65").value, "134.12");
});

test("side panel product utilities normalize prices and message benefits", () => {
  const couponCodeSource = readFileSync(join(extensionRoot, "shared", "coupon-code.js"), "utf8");
  const source = readFileSync(join(extensionRoot, "sidepanel", "product-utils.js"), "utf8");
  const context = { Intl, Number, Set, String, URL };
  context.globalThis = context;
  vm.runInNewContext(couponCodeSource, context, { filename: "coupon-code.js" });
  vm.runInNewContext(source, context, { filename: "product-utils.js" });
  assert.equal(context.TaBaratoProductUtils.parsePrice("R$ 1.234,56"), 1234.56);
  assert.equal(context.TaBaratoProductUtils.parsePrice("4847.8"), 4847.8);
  assert.equal(context.TaBaratoProductUtils.parsePrice("1.234"), 1234);
  assert.equal(context.TaBaratoProductUtils.previousPriceFor("79,92", "78,99", "99,90"), "99.9");
  assert.equal(context.TaBaratoProductUtils.previousPriceFor("79,92", "129,90", "99,90"), "129.9");
  assert.equal(context.TaBaratoProductUtils.normalizeCouponCode("Fralda"), "");
  assert.equal(context.TaBaratoProductUtils.normalizeCouponCode("MELIMODA"), "MELIMODA");
  assert.equal(context.TaBaratoProductUtils.normalizeCouponCode("Cupom: FRALDA10"), "FRALDA10");
  assert.equal(context.TaBaratoProductUtils.couponNoticeForStatus("activation-required"), "disponível no anúncio. Ative antes de comprar.");
  assert.equal(context.TaBaratoProductUtils.couponNoticeForStatus("applied-without-code"), "disponível no anúncio. Ative antes de comprar.");
  assert.equal(context.TaBaratoProductUtils.normalizeCouponValue("disponível no anúncio. Ative antes de comprar."), "disponível no anúncio. Ative antes de comprar.");
  assert.equal(context.TaBaratoProductUtils.firstUsefulParagraph("Muito curto.\nEste segundo paragrafo possui palavras suficientes para ser utilizado na oferta."), "Este segundo paragrafo possui palavras suficientes para ser utilizado na oferta.");
  const benefits = context.TaBaratoProductUtils.messageBenefits("Promocao: 43% OFF. 20% OFF com Pix. Preco principal no Pix. R$ 739,90 em 10x sem juros. 10x sem juros. Frete gratis. Frete gratis.");
  assert.equal(benefits.pix, true);
  assert.deepEqual([...benefits.lines], ["💳 R$ 739,90 em 10x sem juros.", "🚚 Frete grátis."]);
  assert.match(panelSource, /if \(benefits\.lines\.length\) lines\.push\("", \.\.\.benefits\.lines/);
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
    browser: { runtime: {}, storage: {} },
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "runtime.js" });
  await assert.rejects(
    context.TaBaratoRuntime.withTimeout(new Promise(() => {}), 5, "tempo limite"),
    /tempo limite/,
  );
  assert.equal(await context.TaBaratoRuntime.withTimeout(Promise.resolve("ok"), 20), "ok");
});

test("batch runtime keeps at most five preloaded tabs and reads them sequentially", async () => {
  const source = readFileSync(join(extensionRoot, "sidepanel", "modules", "batch.js"), "utf8");
  const utilitySource = readFileSync(join(extensionRoot, "sidepanel", "batch-utils.js"), "utf8");
  const urls = Array.from({ length: 12 }, (_, index) => `https://produto.mercadolivre.com.br/MLB-${100000000 + index}-produto_JM`);
  const events = [];
  const liveTabs = new Set();
  let maximumLiveTabs = 0;
  let nextTabId = 100;
  let toast = "";

  const classList = {
    contains: () => true,
    toggle: () => {},
  };
  const elements = {
    batchLimit: { value: "12" },
    batchStartButton: { disabled: false },
    batchLog: { appendChild: () => {}, replaceChildren: () => {} },
    duplicateWarning: { classList, textContent: "" },
  };
  const panel = {
    LIMITS: { minimumBatchConfidence: 0.8 },
    activeTab: async () => ({ id: 1, windowId: 9, url: "https://lista.mercadolivre.com.br/ofertas" }),
    elements,
    lockActions: () => {},
    showToast: (message) => { toast = message; },
    state: {
      activeProduct: null,
      batchController: null,
      batchWorkerTabId: null,
      batchWorkerTabIds: [],
      synchronizedOffers: [],
    },
    unlockActions: () => {},
    capture: {
      visibleProductUrls: async () => urls,
      waitForProductDom: async (tabId) => {
        events.push(`ready:${tabId}`);
      },
      reloadWorker: async () => {},
      loadedWorker: async (tabId, url) => {
        events.push(`read:${url}`);
        return {
          productName: `Produto ${tabId}`,
          currentPrice: "99,90",
          imageUrl: "https://http2.mlstatic.com/image.jpg",
          affiliateLink: `https://meli.la/${tabId}`,
          externalProductId: `MLB${100000000 + tabId}`,
          platform: "Mercado Livre",
          confidence: 1,
        };
      },
      recoverAffiliateLink: async (_tabId, product) => product,
    },
    catalog: {
      synchronize: async () => [],
      findExisting: () => ({ id: "existing" }),
    },
    publishing: {
      reconcile: async () => ({ action: "unchanged", publication: {} }),
    },
    product: {
      invalidateShareImage: () => {},
    },
    api: { request: async () => ({}) },
  };
  const context = {
    AbortController,
    URL,
    document: {
      createElement: () => ({ dataset: {}, scrollIntoView: () => {}, textContent: "" }),
    },
    chrome: {
      tabs: {
        create: async ({ url }) => {
          const tab = { id: nextTabId++, windowId: 9, url };
          liveTabs.add(tab.id);
          maximumLiveTabs = Math.max(maximumLiveTabs, liveTabs.size);
          events.push(`create:${url}`);
          return tab;
        },
        remove: async (values) => {
          (Array.isArray(values) ? values : [values]).forEach((id) => liveTabs.delete(id));
        },
        update: async (id) => ({ id, windowId: 9 }),
      },
      windows: { update: async () => ({}) },
      runtime: { sendMessage: async () => ({ ok: true }) },
    },
    TaBaratoPanel: panel,
    TaBaratoRuntime: {
      errorMessage: (error) => String(error?.message || error),
      reportError: () => {},
    },
    TaBaratoProductUtils: {
      parsePrice: (value) => Number(String(value).replace(",", ".")),
    },
  };
  context.TaBaratoExtensionApi = context.chrome;
  context.globalThis = context;
  vm.runInNewContext(utilitySource, context, { filename: "batch-utils.js" });
  vm.runInNewContext(source, context, { filename: "batch.js" });

  await context.TaBaratoPanel.batch.start();

  assert.equal(maximumLiveTabs, 5);
  assert.equal(events.filter((event) => event.startsWith("create:")).length, 12);
  assert.equal(events.filter((event) => event.startsWith("read:")).length, 12);
  const firstRead = events.findIndex((event) => event.startsWith("read:"));
  assert.equal(events.slice(0, firstRead).filter((event) => event.startsWith("create:")).length, 5);
  const sixthCreate = events.findIndex((event, index) => event.startsWith("create:")
    && events.slice(0, index + 1).filter((item) => item.startsWith("create:")).length === 6);
  const fifthRead = events.findIndex((event, index) => event.startsWith("read:")
    && events.slice(0, index + 1).filter((item) => item.startsWith("read:")).length === 5);
  const firstReadComplete = events.findIndex((event) => event.startsWith("read:"));
  assert.ok(sixthCreate > firstReadComplete);
  assert.ok(sixthCreate < fifthRead);
  assert.equal(liveTabs.size, 0);
  assert.match(toast, /12 ignorados, 0 erros/);
});

test("batch checks publication history before creating product tabs", () => {
  const batch = readFileSync(join(extensionRoot, "sidepanel", "modules", "batch.js"), "utf8");
  const catalog = readFileSync(join(extensionRoot, "sidepanel", "modules", "catalog.js"), "utf8");
  const historyCheck = batch.indexOf("previouslyPostedUrls");
  const tabPreload = batch.indexOf("const initialCount = Math.min(BATCH_WINDOW_SIZE");
  assert.ok(historyCheck >= 0);
  assert.ok(tabPreload > historyCheck);
  assert.match(batch, /Ja publicado, nao foi aberto/);
  assert.match(catalog, /resource: "posted-products"/);
  assert.match(catalog, /publicationCount/);
});

test("catalog resolves already published product IDs locally and from the database", async () => {
  const batchSource = readFileSync(join(extensionRoot, "sidepanel", "batch-utils.js"), "utf8");
  const catalogSource = readFileSync(join(extensionRoot, "sidepanel", "modules", "catalog.js"), "utf8");
  const requestedPaths = [];
  const panel = {
    STORAGE: { connectedHosts: "hosts" },
    elements: {
      fields: {
        category: {
          value: "",
          replaceChildren: () => {},
        },
      },
    },
    state: {
      availableCategories: [],
      synchronizedOffers: [{
        platform: "Mercado Livre",
        sourceProductId: "MLB111111111",
        status: "PUBLICADO",
      }],
    },
    api: {
      request: async (path) => {
        requestedPaths.push(path);
        return { postedProductIds: ["MLB222222222"] };
      },
    },
  };
  const context = {
    URL,
    URLSearchParams,
    chrome: { storage: { local: { set: async () => {} } } },
    document: { createElement: () => ({}) },
    TaBaratoPanel: panel,
    TaBaratoProductUtils: {
      comparableUrl: (value) => value,
      normalizeText: (value = "") => String(value).toLowerCase(),
    },
  };
  context.TaBaratoExtensionApi = context.chrome;
  context.globalThis = context;
  vm.runInNewContext(batchSource, context, { filename: "batch-utils.js" });
  vm.runInNewContext(catalogSource, context, { filename: "catalog.js" });

  const urls = [
    "https://produto.mercadolivre.com.br/MLB-111111111-primeiro_JM",
    "https://produto.mercadolivre.com.br/MLB-222222222-segundo_JM",
    "https://produto.mercadolivre.com.br/MLB-333333333-terceiro_JM",
  ];
  const posted = await context.TaBaratoPanel.catalog.previouslyPostedUrls(urls);
  assert.deepEqual([...posted.map((item) => item.sourceProductId)], ["MLB111111111", "MLB222222222"]);
  assert.equal(requestedPaths.length, 1);
  assert.match(requestedPaths[0], /resource=posted-products/);
  assert.match(requestedPaths[0], /MLB222222222/);
  assert.match(requestedPaths[0], /MLB333333333/);
});
