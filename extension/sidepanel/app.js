const STORAGE_KEY = "tabarato_extension_session";
const WHATSAPP_GROUP_KEY = "tabarato_whatsapp_group";
const LAST_BASE_URL_KEY = "tabarato_last_base_url";
const runtime = globalThis.TaBaratoRuntime;
const artwork = globalThis.TaBaratoArtwork;
const REQUEST_TIMEOUT = 20000;
const CAPTURE_TIMEOUT = 30000;
const WHATSAPP_TIMEOUT = 95000;

const elements = {
  setup: document.getElementById("setup-view"),
  editor: document.getElementById("editor-view"),
  loginForm: document.getElementById("login-form"),
  offerForm: document.getElementById("offer-form"),
  baseUrl: document.getElementById("base-url"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  loginButton: document.getElementById("login-button"),
  adminPanelButton: document.getElementById("admin-panel-button"),
  status: document.getElementById("connection-status"),
  loading: document.getElementById("loading-state"),
  empty: document.getElementById("empty-state"),
  captureSource: document.getElementById("capture-source"),
  refreshButton: document.getElementById("refresh-button"),
  logoutButton: document.getElementById("logout-button"),
  saveButton: document.getElementById("save-button"),
  saveOpenButton: document.getElementById("save-open-button"),
  publishButton: document.getElementById("publish-button"),
  whatsappButton: document.getElementById("whatsapp-button"),
  scheduledMessageButton: document.getElementById("scheduled-message-button"),
  whatsappGroup: document.getElementById("whatsapp-group"),
  duplicateWarning: document.getElementById("duplicate-warning"),
  captureQuality: document.getElementById("capture-quality"),
  affiliateWarning: document.getElementById("affiliate-warning"),
  toast: document.getElementById("toast"),
  previewImage: document.getElementById("preview-image"),
  previewName: document.getElementById("preview-name"),
  previewPrice: document.getElementById("preview-price"),
  previewCategory: document.getElementById("preview-category"),
  platformBadge: document.getElementById("platform-badge"),
  fields: {
    affiliateLink: document.getElementById("affiliate-link"),
    productName: document.getElementById("product-name"),
    currentPrice: document.getElementById("current-price"),
    previousPrice: document.getElementById("previous-price"),
    platform: document.getElementById("platform"),
    category: document.getElementById("category"),
    coupon: document.getElementById("coupon"),
    shortDescription: document.getElementById("short-description"),
    imageUrl: document.getElementById("image-url"),
    extraText: document.getElementById("extra-text"),
  },
};

let session = null;
let activeProduct = null;
let toastTimer = null;
let shareImagePromise = null;
let shareImageKey = "";
let shareImageTimer = null;
let availableCategories = [...elements.fields.category.options].map((option) => option.value);
let synchronizedOffers = [];
let capturedTabId = null;
let capturedPageUrl = "";
let catalogPromise = null;
let captureSequence = 0;
let offerActionsLockCount = 0;
const idleButtonContent = new WeakMap();

function normalizeBaseUrl(value) {
  const url = new URL(String(value || "").trim());
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("Use um endereco HTTPS. HTTP e permitido apenas localmente.");
  }
  return url.origin;
}

function normalizeLink(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return `${url.origin}${url.pathname.replace(/\/$/, "")}${url.search}`;
  } catch {
    return String(value || "").trim().replace(/\/$/, "");
  }
}

function setStatus(label, tone = "neutral") {
  elements.status.textContent = label;
  elements.status.dataset.tone = tone;
}

function showToast(message, tone = "neutral") {
  elements.toast.textContent = message;
  elements.toast.dataset.tone = tone;
  elements.toast.classList.remove("hidden");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.add("hidden"), 4000);
}

function setBusy(button, busy, label) {
  if (!button) return;
  button.disabled = busy;
  if (busy) {
    if (!idleButtonContent.has(button)) idleButtonContent.set(button, [...button.childNodes].map((node) => node.cloneNode(true)));
    button.replaceChildren(document.createTextNode(label));
  } else if (idleButtonContent.has(button)) {
    button.replaceChildren(...idleButtonContent.get(button).map((node) => node.cloneNode(true)));
    idleButtonContent.delete(button);
  }
}

function setOfferActionsBusy(activeButton, busy, label) {
  offerActionsLockCount = Math.max(0, offerActionsLockCount + (busy ? 1 : -1));
  setBusy(activeButton, busy, label);
  [elements.saveButton, elements.saveOpenButton, elements.publishButton, elements.whatsappButton].forEach((button) => {
    button.disabled = offerActionsLockCount > 0;
  });
}

async function saveSession(value) {
  session = value;
  await chrome.storage.local.set({ [STORAGE_KEY]: value });
}

async function clearSession() {
  session = null;
  activeProduct = null;
  await chrome.storage.local.remove(STORAGE_KEY);
}

async function openAdminPanel() {
  const stored = await chrome.storage.local.get(LAST_BASE_URL_KEY);
  const candidate = session?.baseUrl || elements.baseUrl.value || stored[LAST_BASE_URL_KEY];
  if (!candidate) {
    elements.baseUrl.focus();
    showToast("Informe primeiro o endereco do site.", "error");
    return;
  }
  try {
    const baseUrl = normalizeBaseUrl(candidate);
    const targetUrl = `${baseUrl}/admin`;
    const existing = (await chrome.tabs.query({ url: `${baseUrl}/admin*` }))[0];
    if (existing?.id) {
      await chrome.windows.update(existing.windowId, { focused: true });
      await chrome.tabs.update(existing.id, { active: true });
      return;
    }
    await chrome.tabs.create({ url: targetUrl });
  } catch (error) {
    showToast(runtime.errorMessage(error), "error");
  }
}

async function requestApi(path, options = {}) {
  if (!session?.baseUrl || !session?.token) throw new Error("Conecte a extensao ao painel.");
  const response = await runtime.fetchWithTimeout(`${session.baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  }, options.timeout || REQUEST_TIMEOUT);
  const payload = await runtime.withTimeout(
    response.json(),
    5000,
    "O painel retornou uma resposta incompleta.",
  ).catch(() => ({}));
  if (response.status === 401) {
    await clearSession();
    renderAuth();
    throw new Error("Sua sessao expirou. Entre novamente.");
  }
  if (!response.ok) throw new Error(payload.error || "Nao foi possivel acessar o painel.");
  return payload;
}

async function requestApiPermission(baseUrl) {
  const origin = `${new URL(baseUrl).origin}/*`;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) throw new Error("Autorize o acesso ao dominio do seu site.");
}

function renderAuth() {
  const connected = Boolean(session?.token && session?.baseUrl && new Date(session.expiresAt).getTime() > Date.now());
  elements.setup.classList.toggle("hidden", connected);
  elements.editor.classList.toggle("hidden", !connected);
  setStatus(connected ? "Conectado" : "Desconectado", connected ? "success" : "neutral");
  if (connected) captureProduct();
}

function normalizedText(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const CATEGORY_PROFILES = [
  { categories: ["tecnologia", "eletronicos", "informatica"], words: ["celular", "smartphone", "galaxy", "iphone", "notebook", "computador", "monitor", "fone", "headset", "mouse", "teclado", "ssd", "tablet", "televisao", "smart tv", "console", "gamer"] },
  { categories: ["cozinha", "utilidades domesticas"], words: ["panela", "frigideira", "air fryer", "cafeteira", "liquidificador", "batedeira", "micro-ondas", "coqueteleira", "squeeze", "copo", "garrafa", "talher", "cozinha"] },
  { categories: ["ferramentas", "construcao"], words: ["furadeira", "parafusadeira", "serra", "chave", "broca", "alicate", "martelo", "ferramenta", "compressor", "solda"] },
  { categories: ["casa", "organizacao", "moveis", "decoracao"], words: ["cama", "colchao", "travesseiro", "lencol", "sofa", "mesa", "armario", "prateleira", "organizador", "limpeza", "banheiro", "quarto", "cortina", "tapete", "decoracao"] },
  { categories: ["beleza", "cuidados", "saude"], words: ["perfume", "maquiagem", "shampoo", "condicionador", "hidratante", "barbeador", "cabelo", "pele", "whey", "proteina", "creatina", "suplemento", "vitamina"] },
  { categories: ["escritorio", "papelaria"], words: ["escritorio", "papel", "caneta", "caderno", "impressora", "toner", "grampeador", "arquivo", "mochila executiva"] },
  { categories: ["moda", "roupas", "calcados"], words: ["tenis", "sapato", "sandalia", "camisa", "camiseta", "calca", "vestido", "jaqueta", "bolsa", "relogio"] },
  { categories: ["esporte", "fitness", "academia"], words: ["academia", "halter", "bicicleta", "bike", "futebol", "corrida", "camping", "pesca", "esportivo"] },
  { categories: ["automotivo", "carros", "motos"], words: ["carro", "moto", "automotivo", "pneu", "capacete", "oleo", "farol", "retrovisor"] },
  { categories: ["pet", "animais"], words: ["cachorro", "gato", "pet", "racao", "coleira", "aquario"] },
  { categories: ["bebe", "infantil"], words: ["bebe", "fralda", "mamadeira", "carrinho", "berco", "infantil"] },
];

function suggestCategory(product) {
  const productText = normalizedText(`${product.productName || ""} ${product.shortDescription || ""} ${product.sourceCategory || ""}`);
  const sourceText = normalizedText(product.sourceCategory || "");
  const scored = availableCategories.map((category, index) => {
    const categoryText = normalizedText(category);
    const categoryWords = categoryText.split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
    let score = categoryWords.reduce((total, word) => total + (productText.includes(word) ? 3 : 0), 0);
    if (sourceText && categoryWords.some((word) => sourceText.includes(word))) score += 6;
    CATEGORY_PROFILES.forEach((profile) => {
      if (!profile.categories.some((term) => categoryText.includes(term))) return;
      score += profile.words.reduce((total, word) => total + (productText.includes(word) ? 2 : 0), 0);
    });
    return { category, score, index };
  }).sort((left, right) => right.score - left.score || left.index - right.index);
  if (scored[0]?.score > 0) return scored[0].category;
  const captured = availableCategories.find((category) => normalizedText(category) === normalizedText(product.category));
  return captured || availableCategories.find((category) => normalizedText(category) === "tecnologia") || availableCategories[0] || "";
}

function updateCategoryOptions(categories) {
  const names = [...new Set(categories.map((item) => String(item?.name || item || "").trim()).filter(Boolean))];
  if (!names.length) return;
  availableCategories = names;
  const current = elements.fields.category.value;
  const options = names.map((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    return option;
  });
  elements.fields.category.replaceChildren(...options);
  if (names.includes(current)) elements.fields.category.value = current;
}

async function synchronizeCatalog() {
  if (catalogPromise) return catalogPromise;
  catalogPromise = requestApi("/api/admin/ofertas")
    .then((data) => {
      synchronizedOffers = data.offers || [];
      const categories = data.categories?.length
        ? data.categories
        : [...new Set(synchronizedOffers.map((offer) => offer.category).filter(Boolean))];
      updateCategoryOptions(categories);
      return data;
    })
    .finally(() => { catalogPromise = null; });
  return catalogPromise;
}

function updateAffiliateNotice() {
  const platform = elements.fields.platform.value;
  const link = elements.fields.affiliateLink.value.trim();
  const generatedMeliLink = platform === "Mercado Livre" && /^https:\/\/meli\.la\//i.test(link);
  elements.affiliateWarning.classList.toggle("notice-success", generatedMeliLink);
  elements.affiliateWarning.classList.toggle("notice-warning", platform === "Mercado Livre" && !generatedMeliLink);
  elements.affiliateWarning.textContent = generatedMeliLink
    ? "Link meli.la gerado pelo programa de afiliados e confirmado."
    : platform === "Mercado Livre"
      ? "Nao foi possivel capturar o meli.la. Abra Compartilhar no Mercado Livre ou cole o link gerado abaixo."
      : "Confirme se o link abaixo e o seu link de afiliado antes de salvar.";
}

function fillForm(product) {
  activeProduct = product;
  const values = {
    affiliateLink: product.affiliateLink || product.sourceUrl || "",
    productName: product.productName || "",
    currentPrice: product.currentPrice || "",
    previousPrice: product.previousPrice || "",
    platform: product.platform || "Outra",
    category: suggestCategory(product),
    coupon: "",
    shortDescription: product.shortDescription || "",
    imageUrl: product.imageUrl || "",
    extraText: product.extraText || "",
  };
  Object.entries(values).forEach(([key, value]) => { elements.fields[key].value = value; });
  const reviewItems = [
    !product.currentPrice && "preço",
    !product.imageUrl && "imagem",
    !product.externalProductId && "identificação do produto",
    product.coupon && /^(?:CUPONS?|\d+% OFF)$/i.test(product.coupon) && "código do cupom",
  ].filter(Boolean);
  elements.captureQuality.classList.toggle("hidden", reviewItems.length === 0);
  elements.captureQuality.textContent = reviewItems.length ? `Revise antes de publicar: ${reviewItems.join(", ")}.` : "";
  elements.captureSource.textContent = product.externalProductId
    ? `${product.platform} - ${product.externalProductId}`
    : product.platform || "Produto capturado";
  updateAffiliateNotice();
  elements.offerForm.classList.remove("hidden");
  updatePreview();
  checkDuplicate();
}

function mergeProduct(captured, serverProduct) {
  const merged = { ...captured };
  Object.entries(serverProduct || {}).forEach(([key, value]) => {
    if (!merged[key] && value) merged[key] = value;
  });
  return merged;
}

function firstParagraph(value = "") {
  return String(value).trim().split(/\r?\n/)[0].replace(/\s+/g, " ").trim();
}

function formPayload() {
  return {
    productName: elements.fields.productName.value.trim(),
    shortDescription: elements.fields.shortDescription.value.trim(),
    currentPrice: elements.fields.currentPrice.value,
    previousPrice: elements.fields.previousPrice.value,
    coupon: elements.fields.coupon.value.trim(),
    couponDiscountPercent: 0,
    category: elements.fields.category.value,
    imageUrl: elements.fields.imageUrl.value.trim(),
    affiliateLink: elements.fields.affiliateLink.value.trim(),
    sourceProductId: activeProduct?.externalProductId || activeProduct?.sourceProductId || "",
    platform: elements.fields.platform.value,
    extraText: elements.fields.extraText.value.trim(),
    status: "RASCUNHO",
    scheduledAt: null,
  };
}

function formatPrice(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number)
    : "Preco nao identificado";
}

async function productImageBlob(url) {
  const source = String(url || "").trim();
  const isHttpsImage = /^https:\/\//i.test(source);
  const isEmbeddedImage = /^data:image\/(?:png|jpe?g|webp);base64,/i.test(source);
  if (!isHttpsImage && !isEmbeddedImage) throw new Error("A imagem deve ser uma URL HTTPS ou um arquivo PNG, JPG ou WebP.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(source, { signal: controller.signal });
    if (!response.ok) throw new Error(`A loja respondeu com status ${response.status} ao carregar a imagem.`);
    const blob = await response.blob();
    if (!/^image\/(?:png|jpe?g|webp)$/i.test(blob.type)) throw new Error("A imagem precisa estar em PNG, JPG ou WebP.");
    if (blob.size > 12 * 1024 * 1024) throw new Error("A imagem do produto excede o limite de 12 MB.");
    return blob;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("A imagem original do produto demorou para carregar.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function pngFromImage(blob) {
  if (blob.type === "image/png") return blob;
  const image = await runtime.withTimeout(createImageBitmap(blob), 12000, "A imagem demorou para ser processada.");
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  image.close?.();
  const pngBlob = await runtime.withTimeout(
    new Promise((resolve) => canvas.toBlob(resolve, "image/png")),
    12000,
    "A conversao da imagem demorou demais.",
  );
  if (!pngBlob) throw new Error("Nao foi possivel preparar a imagem original do produto.");
  return pngBlob;
}

async function extensionAssetBlob(path) {
  const response = await runtime.fetchWithTimeout(
    chrome.runtime.getURL(path),
    {},
    8000,
    "Nao foi possivel carregar as logos da oferta.",
  );
  if (!response.ok) throw new Error("Nao foi possivel carregar as logos da oferta.");
  return response.blob();
}

function storeLogoPath(platform) {
  const normalizedPlatform = normalizedText(platform);
  if (normalizedPlatform.includes("mercado livre")) return "assets/mercado-livre.png";
  if (normalizedPlatform.includes("shopee")) return "assets/shopee.svg";
  return "";
}

function fileToDataUrl(file) {
  return runtime.withTimeout(new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Nao foi possivel preparar a imagem para o WhatsApp."));
    reader.onabort = () => reject(new Error("A preparacao da imagem foi cancelada."));
    reader.readAsDataURL(file);
  }), 12000, "A imagem demorou para ser preparada para o WhatsApp.");
}

function prepareWhatsAppImage(payload, { branded = true } = {}) {
  const key = JSON.stringify([
    branded,
    payload.imageUrl,
    payload.productName,
    payload.currentPrice,
    payload.previousPrice,
    payload.platform,
  ]);
  if (key === shareImageKey && shareImagePromise) return shareImagePromise;
  shareImageKey = key;
  const pendingImage = productImageBlob(payload.imageUrl).then(async (sourceBlob) => {
    let imageBlob;
    if (branded) {
      const storePath = storeLogoPath(payload.platform);
      const [siteLogoBlob, storeLogoBlob] = await Promise.all([
        extensionAssetBlob("assets/tabarato-logo.png"),
        storePath ? extensionAssetBlob(storePath) : Promise.resolve(null),
      ]);
      imageBlob = await runtime.withTimeout(
        artwork.createOfferArtwork({
          productBlob: sourceBlob,
          siteLogoBlob,
          storeLogoBlob,
          productName: payload.productName,
          currentPrice: payload.currentPrice,
          previousPrice: payload.previousPrice,
          platform: payload.platform,
        }),
        18000,
        "A arte da oferta demorou para ser gerada.",
      );
    } else {
      imageBlob = await pngFromImage(sourceBlob);
    }
    const slug = payload.productName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "produto";
    return new File([imageBlob], `${slug}.png`, { type: "image/png" });
  });
  shareImagePromise = pendingImage;
  pendingImage.catch(() => {
    if (shareImagePromise !== pendingImage) return;
    shareImagePromise = null;
    shareImageKey = "";
  });
  return shareImagePromise;
}

function scheduleWhatsAppImage() {
  window.clearTimeout(shareImageTimer);
  shareImageTimer = window.setTimeout(() => prepareWhatsAppImage(formPayload()).catch(() => {}), 250);
}

function whatsappMessage(payload) {
  const lines = [
    "\u{1F525} *T\u00c1 BARATO!*",
    "",
    `*${payload.productName}*`,
    "",
    `\u{1F4B0} Agora: *${formatPrice(payload.currentPrice)}*`,
  ];
  if (payload.previousPrice) lines.push(`Antes: ~${formatPrice(payload.previousPrice)}~`);
  if (payload.coupon) {
    const couponText = /^use o cupom da loja$/i.test(payload.coupon)
      ? `\u{1F3AB} *${payload.coupon}*`
      : `\u{1F3AB} Cupom: *${payload.coupon}*`;
    lines.push("", couponText);
  }
  if (payload.category) lines.push("", `\u{1F4E6} ${payload.category}`);
  if (payload.extraText) {
    const benefits = payload.extraText.split(/\.\s+/).map((item) => item.replace(/\.$/, "").trim()).filter(Boolean);
    lines.push("", ...benefits.map((item) => `\u{1F4B3} ${item}`));
  }
  lines.push("", "Pre\u00e7o e disponibilidade podem mudar.", "", "\u{1F6D2} *Comprar:*", payload.affiliateLink);
  return lines.join("\n");
}

function updatePreview() {
  const payload = formPayload();
  elements.previewName.textContent = payload.productName || "Nome do produto";
  elements.previewPrice.textContent = formatPrice(payload.currentPrice);
  elements.previewCategory.textContent = payload.category || "Categoria";
  elements.platformBadge.textContent = payload.platform || "Loja";
  elements.previewImage.src = payload.imageUrl || "";
  elements.previewImage.hidden = !payload.imageUrl;
  updateAffiliateNotice();
  scheduleWhatsAppImage();
}

async function checkDuplicate() {
  elements.duplicateWarning.classList.add("hidden");
  const link = normalizeLink(elements.fields.affiliateLink.value);
  if (!link) return;
  try {
    if (!synchronizedOffers.length) await synchronizeCatalog();
    const duplicate = synchronizedOffers.find((offer) => normalizeLink(offer.affiliateLink) === link);
    if (duplicate) {
      elements.duplicateWarning.textContent = `Este link ja esta cadastrado em: ${duplicate.productName}.`;
      elements.duplicateWarning.classList.remove("hidden");
    }
  } catch {
    // Duplicate checking is helpful but must not block editing.
  }
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function comparablePageUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function clearRefreshAttention() {
  elements.refreshButton.classList.remove("needs-refresh");
  elements.refreshButton.title = "Capturar novamente";
  elements.refreshButton.setAttribute("aria-label", "Capturar novamente");
}

function highlightProductChange(tab) {
  const nextUrl = comparablePageUrl(tab?.url);
  if (!session || !tab?.id || !nextUrl || !captureScriptsForUrl(nextUrl).length) return;
  if (tab.id === capturedTabId && nextUrl === capturedPageUrl) return;

  window.scrollTo(0, 0);
  document.scrollingElement?.scrollTo(0, 0);
  elements.captureSource.textContent = "A pagina do produto mudou. Recarregue os dados.";
  elements.refreshButton.classList.add("needs-refresh");
  elements.refreshButton.title = "Recarregar novo produto";
  elements.refreshButton.setAttribute("aria-label", "Recarregar novo produto");
  elements.refreshButton.focus({ preventScroll: true });
}

function captureScriptsForUrl(value) {
  try {
    const hostname = new URL(value).hostname;
    if (hostname === "mercadolivre.com.br" || hostname.endsWith(".mercadolivre.com.br")
      || hostname === "mercadolibre.com" || hostname.endsWith(".mercadolibre.com")) {
      return ["content/shared.js", "content/stores/mercado-livre.js", "content/index.js"];
    }
    if (hostname === "shopee.com.br" || hostname.endsWith(".shopee.com.br")) {
      return ["content/shared.js", "content/stores/shopee.js", "content/index.js"];
    }
  } catch { /* Unsupported and internal browser pages are handled below. */ }
  return [];
}

async function extractProductFromTab(tab) {
  try {
    return await runtime.withTimeout(
      chrome.tabs.sendMessage(tab.id, { type: "TABARATO_EXTRACT_PRODUCT" }),
      CAPTURE_TIMEOUT,
      "A loja demorou para responder. Recarregue a pagina do produto e tente novamente.",
    );
  } catch (error) {
    const missingReceiver = /receiving end does not exist|could not establish connection/i.test(error?.message || "");
    if (!missingReceiver) throw error;
    const files = captureScriptsForUrl(tab.url);
    if (!files.length) throw new Error("Abra uma página de produto do Mercado Livre ou Shopee.");
    await runtime.withTimeout(
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["shared/runtime.js", ...files] }),
      10000,
      "Nao foi possivel preparar a captura nesta pagina.",
    );
    await runtime.delay(150);
    return runtime.withTimeout(
      chrome.tabs.sendMessage(tab.id, { type: "TABARATO_EXTRACT_PRODUCT" }),
      CAPTURE_TIMEOUT,
      "A captura do produto demorou demais. Tente recarregar a pagina.",
    );
  }
}

async function captureProduct() {
  const runId = ++captureSequence;
  clearRefreshAttention();
  setBusy(elements.refreshButton, true, "...");
  elements.loading.classList.remove("hidden");
  elements.empty.classList.add("hidden");
  if (!activeProduct) elements.offerForm.classList.add("hidden");
  try {
    const catalogRequest = synchronizeCatalog().catch(() => null);
    const tab = await activeTab();
    if (!tab?.id) throw new Error("Nenhuma aba ativa encontrada.");
    const result = await extractProductFromTab(tab);
    if (!result?.ok) throw new Error(result?.error || "Produto nao encontrado.");
    let product = result.product;
    const needsServerData = !product.productName || !product.currentPrice || !product.imageUrl || !product.shortDescription;
    if (needsServerData && product.affiliateLink) {
      try {
        const preview = await requestApi("/api/admin/product-preview", {
          method: "POST",
          body: { link: product.affiliateLink },
        });
        product = mergeProduct(product, preview.product);
      } catch {
        // DOM capture remains available when a store blocks server extraction.
      }
    }
    product.shortDescription = firstParagraph(product.shortDescription);
    await catalogRequest;
    if (runId !== captureSequence) return;
    fillForm(product);
    capturedTabId = tab.id;
    capturedPageUrl = comparablePageUrl(tab.url);
    clearRefreshAttention();
  } catch (error) {
    if (runId !== captureSequence) return;
    const message = runtime.reportError("capture-product", error);
    elements.empty.querySelector("p").textContent = message;
    elements.empty.classList.remove("hidden");
    elements.captureSource.textContent = "Falha na captura. Tente novamente.";
    elements.refreshButton.classList.add("needs-refresh");
    elements.refreshButton.title = "Tentar capturar novamente";
    elements.refreshButton.setAttribute("aria-label", "Tentar capturar novamente");
    if (activeProduct) elements.offerForm.classList.remove("hidden");
  } finally {
    if (runId === captureSequence) {
      elements.loading.classList.add("hidden");
      setBusy(elements.refreshButton, false);
    }
  }
}

async function saveOffer(openPanel = false) {
  if (!elements.offerForm.reportValidity()) return;
  const payload = formPayload();
  if (payload.platform === "Mercado Livre" && !/^https:\/\/meli\.la\/[A-Za-z0-9_-]+/i.test(payload.affiliateLink)) {
    elements.fields.affiliateLink.focus();
    showToast("Use o link meli.la gerado pelo botao Compartilhar.", "error");
    return;
  }
  const button = openPanel ? elements.saveOpenButton : elements.saveButton;
  setOfferActionsBusy(button, true, "Salvando...");
  try {
    const data = await requestApi("/api/admin/ofertas", { method: "POST", body: payload });
    showToast(`Rascunho salvo: ${data.offer.productName}`, "success");
    if (openPanel) await chrome.tabs.create({ url: `${session.baseUrl}/admin/ofertas` });
  } catch (error) {
    runtime.reportError("save-offer", error);
    showToast(runtime.errorMessage(error), "error");
  } finally {
    setOfferActionsBusy(button, false);
  }
}

async function sendOfferToWhatsApp(payload, groupName, onProgress = () => {}) {
  const file = await prepareWhatsAppImage(payload);
  onProgress("Abrindo WhatsApp...");
  const result = await runtime.withTimeout(
    chrome.runtime.sendMessage({
      type: "TABARATO_SHARE_WHATSAPP",
      groupName,
      text: whatsappMessage(payload),
      imageDataUrl: await fileToDataUrl(file),
      fileName: file.name,
    }),
    WHATSAPP_TIMEOUT,
    "O WhatsApp demorou para responder. Tente novamente.",
  );
  if (!result?.ok) throw new Error(result?.error || "Nao foi possivel enviar para o grupo.");
}

async function sendScheduledMessage() {
  setBusy(elements.scheduledMessageButton, true, "Buscando mensagem...");
  let scheduledMessage = null;
  try {
    const pending = await requestApi("/api/admin/mensagens?action=pending-whatsapp");
    scheduledMessage = pending.message;
    if (!scheduledMessage) {
      showToast("Nenhuma mensagem de WhatsApp está pronta para envio.", "neutral");
      return;
    }
    const groupName = scheduledMessage.whatsappGroup || elements.whatsappGroup.value.trim();
    if (!groupName) throw new Error("Informe o grupo padrão do WhatsApp na extensão.");

    let imageDataUrl = "";
    let fileName = "mensagem.png";
    if (scheduledMessage.imageUrl) {
      setBusy(elements.scheduledMessageButton, true, "Preparando imagem...");
      const file = await prepareWhatsAppImage(
        { imageUrl: scheduledMessage.imageUrl, productName: scheduledMessage.title || "mensagem" },
        { branded: false },
      );
      imageDataUrl = await fileToDataUrl(file);
      fileName = file.name;
    }
    setBusy(elements.scheduledMessageButton, true, "Abrindo WhatsApp...");
    const result = await runtime.withTimeout(
      chrome.runtime.sendMessage({
        type: "TABARATO_SHARE_WHATSAPP",
        groupName,
        text: scheduledMessage.message,
        imageDataUrl,
        fileName,
      }),
      WHATSAPP_TIMEOUT,
      "O WhatsApp demorou para responder. Tente novamente.",
    );
    if (!result?.ok) throw new Error(result?.error || "Não foi possível enviar a mensagem agendada.");
    await requestApi(`/api/admin/mensagens?action=complete-whatsapp&id=${encodeURIComponent(scheduledMessage.id)}`, {
      method: "POST",
      body: { success: true },
    });
    showToast(`Mensagem enviada para ${groupName}.`, "success");
  } catch (error) {
    if (scheduledMessage?.id) {
      await requestApi(`/api/admin/mensagens?action=complete-whatsapp&id=${encodeURIComponent(scheduledMessage.id)}`, {
        method: "POST",
        body: { success: false, errorMessage: runtime.errorMessage(error) },
      }).catch(() => {});
    }
    runtime.reportError("scheduled-whatsapp", error);
    showToast(runtime.errorMessage(error), "error");
  } finally {
    setBusy(elements.scheduledMessageButton, false);
  }
}

async function publishOffer() {
  if (!elements.offerForm.reportValidity()) return;
  const payload = formPayload();
  const groupName = elements.whatsappGroup.value.trim();
  if (payload.platform === "Mercado Livre" && !/^https:\/\/meli\.la\/[A-Za-z0-9_-]+/i.test(payload.affiliateLink)) {
    elements.fields.affiliateLink.focus();
    showToast("Use o link meli.la gerado pelo botao Compartilhar.", "error");
    return;
  }
  const destinations = groupName ? "Telegram e no WhatsApp" : "Telegram";
  if (!window.confirm(`Publicar "${payload.productName}" agora no ${destinations}?`)) return;

  setOfferActionsBusy(elements.publishButton, true, "Publicando...");
  try {
    elements.publishButton.textContent = "Gerando arte...";
    const shareFile = await prepareWhatsAppImage(payload);
    const shareImageDataUrl = await fileToDataUrl(shareFile);
    if (shareImageDataUrl.length > 3_500_000) throw new Error("A arte gerada ficou muito grande. Use uma imagem de produto menor.");
    elements.publishButton.textContent = "Publicando...";
    const created = await requestApi("/api/admin/ofertas", {
      method: "POST",
      body: { ...payload, status: "APROVADO" },
    });
    await requestApi(`/api/admin/ofertas/${created.offer.id}/publicar`, {
      method: "POST",
      body: { shareImageDataUrl },
      timeout: 30000,
    });
    if (!groupName) {
      showToast(`Oferta publicada no Telegram. Informe o grupo para enviar tambem ao WhatsApp.`, "success");
      return;
    }

    try {
      await sendOfferToWhatsApp(payload, groupName, (label) => {
        elements.publishButton.textContent = label;
      });
      await requestApi(`/api/admin/ofertas/${created.offer.id}/publicar`, { method: "POST", body: { action: "record-channel", channel: "WHATSAPP", status: "SUCESSO" } }).catch(() => {});
      showToast(`Oferta publicada no Telegram e enviada para ${groupName}.`, "success");
    } catch (whatsappError) {
      const message = runtime.errorMessage(whatsappError);
      runtime.reportError("publish-whatsapp", whatsappError);
      await requestApi(`/api/admin/ofertas/${created.offer.id}/publicar`, { method: "POST", body: { action: "record-channel", channel: "WHATSAPP", status: "ERRO", errorMessage: message } }).catch(() => {});
      showToast(`Publicada no Telegram, mas o WhatsApp falhou: ${message}`, "error");
    }
  } catch (error) {
    runtime.reportError("publish-offer", error);
    showToast(runtime.errorMessage(error), "error");
  } finally {
    setOfferActionsBusy(elements.publishButton, false);
  }
}

async function shareOnWhatsApp() {
  if (!elements.offerForm.reportValidity()) return;
  const groupName = elements.whatsappGroup.value.trim();
  if (!groupName) {
    elements.whatsappGroup.focus();
    showToast("Informe o nome exato do grupo do WhatsApp.", "error");
    return;
  }
  const payload = formPayload();
  setOfferActionsBusy(elements.whatsappButton, true, "Preparando...");
  try {
    await sendOfferToWhatsApp(payload, groupName, (label) => {
      elements.whatsappButton.textContent = label;
    });
    showToast(`Oferta enviada para ${groupName}.`, "success");
  } catch (error) {
    runtime.reportError("share-whatsapp", error);
    showToast(runtime.errorMessage(error), "error");
  } finally {
    setOfferActionsBusy(elements.whatsappButton, false);
  }
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(elements.loginButton, true, "Conectando...");
  try {
    const baseUrl = normalizeBaseUrl(elements.baseUrl.value);
    await requestApiPermission(baseUrl);
    const response = await runtime.fetchWithTimeout(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: elements.username.value.trim(),
        password: elements.password.value,
        client: "extension",
      }),
    }, REQUEST_TIMEOUT, "O painel demorou para responder. Tente conectar novamente.");
    const payload = await runtime.withTimeout(
      response.json(),
      5000,
      "O painel retornou uma resposta incompleta.",
    ).catch(() => ({}));
    if (!response.ok || !payload.token) throw new Error(payload.error || "Login nao autorizado.");
    await saveSession({ baseUrl, token: payload.token, expiresAt: payload.expiresAt });
    await chrome.storage.local.set({ [LAST_BASE_URL_KEY]: baseUrl });
    elements.password.value = "";
    renderAuth();
    showToast("Extensao conectada ao painel.", "success");
  } catch (error) {
    runtime.reportError("admin-login", error);
    setStatus("Erro de conexao", "error");
    showToast(runtime.errorMessage(error), "error");
  } finally {
    setBusy(elements.loginButton, false);
  }
});

elements.offerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveOffer(false);
});
elements.saveOpenButton.addEventListener("click", () => saveOffer(true));
elements.publishButton.addEventListener("click", publishOffer);
elements.whatsappButton.addEventListener("click", shareOnWhatsApp);
elements.scheduledMessageButton.addEventListener("click", sendScheduledMessage);
elements.adminPanelButton.addEventListener("click", openAdminPanel);
elements.whatsappGroup.addEventListener("input", () => {
  chrome.storage.local.set({ [WHATSAPP_GROUP_KEY]: elements.whatsappGroup.value.trim() })
    .catch((error) => runtime.reportError("save-whatsapp-group", error));
});
elements.refreshButton.addEventListener("click", captureProduct);
elements.logoutButton.addEventListener("click", async () => {
  try {
    await clearSession();
    renderAuth();
  } catch (error) {
    runtime.reportError("admin-logout", error);
    showToast(runtime.errorMessage(error), "error");
  }
});
elements.fields.affiliateLink.addEventListener("change", checkDuplicate);
Object.values(elements.fields).forEach((field) => field.addEventListener("input", updatePreview));

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url || !tab.active) return;
  highlightProductChange({ ...tab, id: tabId, url: changeInfo.url });
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    highlightProductChange(tab);
  } catch {
    // Closed and browser-internal tabs do not need product refresh feedback.
  }
});

chrome.storage.local.get([STORAGE_KEY, WHATSAPP_GROUP_KEY, LAST_BASE_URL_KEY]).then((stored) => {
  session = stored[STORAGE_KEY] || null;
  elements.whatsappGroup.value = stored[WHATSAPP_GROUP_KEY] || "";
  elements.baseUrl.value = session?.baseUrl || stored[LAST_BASE_URL_KEY] || "";
  if (session?.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) session = null;
  renderAuth();
}).catch((error) => {
  runtime.reportError("load-settings", error);
  session = null;
  renderAuth();
  showToast("Nao foi possivel carregar as configuracoes. Tente reabrir o painel.", "error");
});
