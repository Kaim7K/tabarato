const STORAGE_KEY = "tabarato_extension_session";
const GROUPS_KEY = "tabarato_whatsapp_groups";
const LAST_BASE_URL_KEY = "tabarato_last_base_url";
const CONNECTED_HOSTS_KEY = "tabarato_connected_store_hosts";
const PRODUCT_DRAFT_KEY = "tabarato_product_draft";
const CAPTURE_REQUEST_KEY = "tabarato_capture_request";
const runtime = globalThis.TaBaratoRuntime;
const artwork = globalThis.TaBaratoArtwork;
const REQUEST_TIMEOUT = 22000;
const CAPTURE_TIMEOUT = 38000;
const WHATSAPP_TIMEOUT = 120000;
const MIN_BATCH_CONFIDENCE = 0.8;

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
  groupsToggle: document.getElementById("groups-toggle"),
  groupsPanel: document.getElementById("groups-panel"),
  whatsappGroups: document.getElementById("whatsapp-groups"),
  saveGroupsButton: document.getElementById("save-groups-button"),
  stopMacroButton: document.getElementById("stop-macro-button"),
  status: document.getElementById("connection-status"),
  modeSingle: document.getElementById("mode-single"),
  modeBatch: document.getElementById("mode-batch"),
  singleView: document.getElementById("single-view"),
  batchView: document.getElementById("batch-view"),
  loading: document.getElementById("loading-state"),
  empty: document.getElementById("empty-state"),
  captureSource: document.getElementById("capture-source"),
  refreshButton: document.getElementById("refresh-button"),
  logoutButton: document.getElementById("logout-button"),
  saveButton: document.getElementById("save-button"),
  publishButton: document.getElementById("publish-button"),
  whatsappButton: document.getElementById("whatsapp-button"),
  duplicateWarning: document.getElementById("duplicate-warning"),
  captureQuality: document.getElementById("capture-quality"),
  toast: document.getElementById("toast"),
  previewImage: document.getElementById("preview-image"),
  previewName: document.getElementById("preview-name"),
  previewPrice: document.getElementById("preview-price"),
  previewCategory: document.getElementById("preview-category"),
  platformBadge: document.getElementById("platform-badge"),
  batchLimit: document.getElementById("batch-limit"),
  batchStartButton: document.getElementById("batch-start-button"),
  batchStopButton: document.getElementById("batch-stop-button"),
  batchLog: document.getElementById("batch-log"),
  customToggle: document.getElementById("custom-toggle"),
  customBody: document.getElementById("custom-body"),
  customMessage: document.getElementById("custom-message"),
  customImageUrl: document.getElementById("custom-image-url"),
  customImageFile: document.getElementById("custom-image-file"),
  customTelegram: document.getElementById("custom-telegram"),
  customWhatsapp: document.getElementById("custom-whatsapp"),
  customSendButton: document.getElementById("custom-send-button"),
  couponLimit: document.getElementById("coupon-limit"),
  activateCouponsButton: document.getElementById("activate-coupons-button"),
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
let availableCategories = [...elements.fields.category.options].map((option) => option.value);
let synchronizedOffers = [];
let catalogPromise = null;
let captureSequence = 0;
let actionLockCount = 0;
let capturedTabId = null;
let capturedPageUrl = "";
let shareImagePromise = null;
let shareImageKey = "";
let batchAbortController = null;
const idleButtonContent = new WeakMap();

function normalizeBaseUrl(value) {
  const url = new URL(String(value || "").trim());
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("Use HTTPS. HTTP so e permitido localmente.");
  }
  return url.origin;
}

function normalizeText(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function parsePrice(value) {
  const raw = String(value || "").replace(/[^\d.,]/g, "");
  if (!raw) return NaN;
  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  const separator = Math.max(comma, dot);
  if (separator < 0) return Number(raw);
  const decimals = raw.slice(separator + 1);
  const integer = raw.slice(0, separator).replace(/[.,]/g, "");
  return Number(decimals.length === 2 ? `${integer}.${decimals}` : `${integer}${decimals}`);
}

function formatPrice(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number)
    : "Preco nao identificado";
}

function comparableUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return String(value || "").trim().replace(/\/$/, "");
  }
}

function groupNames() {
  return [...new Set(String(elements.whatsappGroups.value || "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean))];
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
  toastTimer = window.setTimeout(() => elements.toast.classList.add("hidden"), 4300);
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

function setActionsBusy(button, busy, label) {
  actionLockCount = Math.max(0, actionLockCount + (busy ? 1 : -1));
  setBusy(button, busy, label);
  [elements.saveButton, elements.publishButton, elements.whatsappButton, elements.batchStartButton, elements.customSendButton].forEach((item) => {
    item.disabled = actionLockCount > 0;
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
  const payload = await response.json().catch(() => ({}));
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

async function openAdminPanel() {
  const stored = await chrome.storage.local.get(LAST_BASE_URL_KEY);
  const candidate = session?.baseUrl || elements.baseUrl.value || stored[LAST_BASE_URL_KEY];
  if (!candidate) {
    elements.baseUrl.focus();
    showToast("Informe o endereco do site.", "error");
    return;
  }
  const baseUrl = normalizeBaseUrl(candidate);
  const targetUrl = `${baseUrl}/admin`;
  const existing = (await chrome.tabs.query({ url: `${baseUrl}/admin*` }))[0];
  if (existing?.id) {
    await chrome.windows.update(existing.windowId, { focused: true });
    await chrome.tabs.update(existing.id, { active: true });
    return;
  }
  await chrome.tabs.create({ url: targetUrl });
}

function connectedHostsFromOffers(offers) {
  const hosts = new Set();
  offers.forEach((offer) => {
    [offer.affiliateLink, offer.imageUrl].forEach((value) => {
      try {
        const host = new URL(value).hostname.replace(/^www\./, "");
        if (host && !/mercadolivre|mercadolibre|shopee|mlstatic|susercontent/i.test(host)) hosts.add(host);
      } catch { /* Ignore invalid URLs. */ }
    });
  });
  return [...hosts].slice(0, 80);
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
    .then(async (data) => {
      synchronizedOffers = data.offers || [];
      const categories = data.categories?.length
        ? data.categories
        : [...new Set(synchronizedOffers.map((offer) => offer.category).filter(Boolean))];
      updateCategoryOptions(categories);
      await chrome.storage.local.set({ [CONNECTED_HOSTS_KEY]: data.connectedStoreHosts || connectedHostsFromOffers(synchronizedOffers) });
      return data;
    })
    .finally(() => { catalogPromise = null; });
  return catalogPromise;
}

const CATEGORY_PROFILES = [
  { categories: ["tecnologia", "eletronicos", "informatica"], words: ["celular", "smartphone", "iphone", "notebook", "fone", "monitor", "ssd", "tablet", "tv", "gamer"] },
  { categories: ["cozinha", "utilidades"], words: ["panela", "air fryer", "cafeteira", "liquidificador", "micro-ondas", "garrafa", "copo"] },
  { categories: ["ferramentas", "construcao"], words: ["furadeira", "parafusadeira", "serra", "chave", "broca", "alicate", "martelo"] },
  { categories: ["casa", "organizacao", "moveis"], words: ["cama", "colchao", "sofa", "mesa", "organizador", "banheiro", "tapete"] },
  { categories: ["beleza", "cuidados", "saude"], words: ["perfume", "maquiagem", "shampoo", "hidratante", "barbeador", "whey", "creatina"] },
  { categories: ["moda", "roupas", "calcados"], words: ["tenis", "sapato", "camisa", "calca", "jaqueta", "bolsa", "relogio"] },
];

function suggestCategory(product) {
  const productText = normalizeText(`${product.productName || ""} ${product.shortDescription || ""} ${product.sourceCategory || ""}`);
  const scored = availableCategories.map((category, index) => {
    const categoryText = normalizeText(category);
    let score = categoryText.split(/[^a-z0-9]+/).filter((word) => word.length >= 4)
      .reduce((total, word) => total + (productText.includes(word) ? 3 : 0), 0);
    CATEGORY_PROFILES.forEach((profile) => {
      if (profile.categories.some((term) => categoryText.includes(term))) {
        score += profile.words.reduce((total, word) => total + (productText.includes(word) ? 2 : 0), 0);
      }
    });
    return { category, score, index };
  }).sort((left, right) => right.score - left.score || left.index - right.index);
  return scored[0]?.score > 0 ? scored[0].category : availableCategories[0] || "";
}

function firstUsefulParagraph(value = "") {
  const paragraphs = String(value || "").split(/\r?\n+/).map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!paragraphs.length) return "";
  if (paragraphs[0].split(/\s+/).filter(Boolean).length >= 10 || !paragraphs[1]) return paragraphs[0];
  return paragraphs[1];
}

function fillForm(product) {
  activeProduct = product;
  const values = {
    affiliateLink: product.affiliateLink || product.sourceUrl || "",
    productName: product.productName || "",
    currentPrice: product.currentPrice || "",
    previousPrice: product.previousPrice || "",
    platform: product.platform || "Loja conectada",
    category: suggestCategory(product),
    coupon: product.coupon || "Cupom disponivel no anuncio. Ative antes de comprar.",
    shortDescription: firstUsefulParagraph(product.shortDescription || ""),
    imageUrl: product.imageUrl || product.imageCandidates?.[0]?.url || "",
    extraText: [product.pricePaymentMethod === "Pix" ? "Preco principal no Pix." : "", product.extraText || ""].filter(Boolean).join(" "),
  };
  Object.entries(values).forEach(([key, value]) => {
    elements.fields[key].value = value;
  });
  const reviewItems = [
    !values.affiliateLink && "link",
    !values.productName && "nome",
    !values.currentPrice && "preco",
    !values.imageUrl && "imagem",
    Number(product.confidence || 1) < MIN_BATCH_CONFIDENCE && "dados incertos",
  ].filter(Boolean);
  elements.captureQuality.classList.toggle("hidden", reviewItems.length === 0);
  elements.captureQuality.textContent = reviewItems.length ? `Revise antes de publicar: ${reviewItems.join(", ")}.` : "";
  elements.captureSource.textContent = product.externalProductId ? `${values.platform} - ${product.externalProductId}` : values.platform;
  elements.offerForm.classList.remove("hidden");
  elements.empty.classList.add("hidden");
  updatePreview();
}

async function persistProductDraft() {
  if (!activeProduct) return;
  await chrome.storage.local.set({
    [PRODUCT_DRAFT_KEY]: {
      product: activeProduct,
      values: Object.fromEntries(Object.entries(elements.fields).map(([key, field]) => [key, field.value])),
      capturedTabId,
      capturedPageUrl,
      savedAt: Date.now(),
    },
  });
}

function restoreProductDraft(draft) {
  if (!draft?.product) return false;
  activeProduct = draft.product;
  capturedTabId = draft.capturedTabId || null;
  capturedPageUrl = draft.capturedPageUrl || comparableUrl(draft.product.sourceUrl || "");
  fillForm(activeProduct);
  Object.entries(draft.values || {}).forEach(([key, value]) => {
    if (elements.fields[key]) elements.fields[key].value = value;
  });
  updatePreview();
  elements.captureSource.textContent = "Produto restaurado";
  return true;
}

function formPayload(status = "RASCUNHO") {
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
    status,
    scheduledAt: null,
  };
}

function updatePreview() {
  const payload = formPayload();
  elements.previewName.textContent = payload.productName || "Nome do produto";
  elements.previewPrice.textContent = `${formatPrice(payload.currentPrice)}${activeProduct?.pricePaymentMethod === "Pix" ? " (Pix)" : ""}`;
  elements.previewCategory.textContent = payload.category || "Categoria";
  elements.platformBadge.textContent = payload.platform || "Loja";
  elements.previewImage.src = payload.imageUrl || "";
  elements.previewImage.hidden = !payload.imageUrl;
  shareImagePromise = null;
  shareImageKey = "";
}

function findExistingOffer(product) {
  const productId = normalizeText(product.externalProductId || product.sourceProductId || "");
  const platform = normalizeText(product.platform || "");
  const link = comparableUrl(product.affiliateLink || product.sourceUrl || "");
  const name = normalizeText(product.productName || "");
  return synchronizedOffers.find((offer) => {
    const samePlatform = normalizeText(offer.platform) === platform;
    if (samePlatform && productId && normalizeText(offer.sourceProductId) === productId) return true;
    if (link && comparableUrl(offer.affiliateLink) === link) return true;
    return samePlatform && name && normalizeText(offer.productName) === name;
  }) || null;
}

async function reconcileExistingOffer(product) {
  elements.duplicateWarning.classList.add("hidden");
  if (!synchronizedOffers.length) return;
  const existing = findExistingOffer(product);
  if (!existing) return;

  const nextPrice = parsePrice(product.currentPrice);
  const oldPrice = parsePrice(existing.currentPrice);
  if (!Number.isFinite(nextPrice) || !Number.isFinite(oldPrice)) return;

  if (nextPrice < oldPrice) {
    elements.duplicateWarning.textContent = `Ja cadastrado por ${formatPrice(oldPrice)}. Preco melhor detectado; atualizando e republicando.`;
    elements.duplicateWarning.classList.remove("hidden");
    const payload = productToPayload(product, "APROVADO");
    await requestApi(`/api/admin/ofertas/${existing.id}`, { method: "PATCH", body: payload });
    await publishOfferId(existing.id, payload, { forceRepublish: true, notifyWhatsApp: true });
    await synchronizeCatalog();
    showToast("Preco melhor publicado novamente.", "success");
  } else if (nextPrice > oldPrice) {
    elements.duplicateWarning.textContent = `Preco pior detectado: ${formatPrice(nextPrice)}. Oferta removida do site.`;
    elements.duplicateWarning.classList.remove("hidden");
    await requestApi(`/api/admin/ofertas/${existing.id}`, { method: "DELETE" });
    await synchronizeCatalog();
    showToast("Oferta removida porque o preco piorou.", "success");
  } else {
    elements.duplicateWarning.textContent = `Este produto ja esta cadastrado com o mesmo preco em: ${existing.productName}.`;
    elements.duplicateWarning.classList.remove("hidden");
  }
}

function productToPayload(product, status = "RASCUNHO") {
  const previousActive = activeProduct;
  activeProduct = product;
  const payload = {
    productName: product.productName || "",
    shortDescription: firstUsefulParagraph(product.shortDescription || ""),
    currentPrice: product.currentPrice || "",
    previousPrice: product.previousPrice || "",
    coupon: product.coupon || "Cupom disponivel no anuncio. Ative antes de comprar.",
    couponDiscountPercent: 0,
    category: suggestCategory(product),
    imageUrl: product.imageUrl || product.imageCandidates?.[0]?.url || "",
    affiliateLink: product.affiliateLink || product.sourceUrl || "",
    sourceProductId: product.externalProductId || product.sourceProductId || "",
    platform: product.platform || "Loja conectada",
    extraText: [product.pricePaymentMethod === "Pix" ? "Preco principal no Pix." : "", product.extraText || ""].filter(Boolean).join(" "),
    status,
    scheduledAt: null,
  };
  activeProduct = previousActive;
  return payload;
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function captureScriptsForUrl(value) {
  try {
    const hostname = new URL(value).hostname;
    if (/mercadolivre|mercadolibre|shopee/i.test(hostname)) {
      return ["content/shared.js", "content/stores/mercado-livre.js", "content/stores/shopee.js", "content/stores/generic.js", "content/index.js"];
    }
    return ["content/shared.js", "content/stores/generic.js", "content/index.js"];
  } catch {
    return [];
  }
}

async function extractProductFromTab(tab) {
  try {
    return await runtime.withTimeout(
      chrome.tabs.sendMessage(tab.id, { type: "TABARATO_EXTRACT_PRODUCT" }),
      CAPTURE_TIMEOUT,
      "A loja demorou para responder. Recarregue a pagina e tente novamente.",
    );
  } catch (error) {
    const missingReceiver = /receiving end does not exist|could not establish connection/i.test(error?.message || "");
    if (!missingReceiver) throw error;
    const files = captureScriptsForUrl(tab.url);
    if (!files.length) throw new Error("Abra uma pagina permitida pelo Ta Barato.");
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["shared/runtime.js", ...files] });
    await runtime.delay(200);
    return runtime.withTimeout(chrome.tabs.sendMessage(tab.id, { type: "TABARATO_EXTRACT_PRODUCT" }), CAPTURE_TIMEOUT);
  }
}

async function captureProduct({ reconcile = true } = {}) {
  const runId = ++captureSequence;
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
    if ((!product.productName || !product.currentPrice || !product.imageUrl) && product.affiliateLink) {
      try {
        const preview = await requestApi("/api/admin/product-preview", { method: "POST", body: { link: product.affiliateLink } });
        product = { ...preview.product, ...product, imageUrl: product.imageUrl || preview.product?.imageUrl };
      } catch { /* DOM capture remains enough when preview is blocked. */ }
    }
    await catalogRequest;
    if (runId !== captureSequence) return;
    fillForm(product);
    capturedTabId = tab.id;
    capturedPageUrl = comparableUrl(tab.url);
    await persistProductDraft();
    elements.refreshButton.classList.remove("needs-refresh");
    if (reconcile) await reconcileExistingOffer(product).catch((error) => runtime.reportError("reconcile-product", error));
  } catch (error) {
    if (runId !== captureSequence) return;
    const message = runtime.reportError("capture-product", error);
    elements.empty.querySelector("p").textContent = message;
    elements.empty.classList.remove("hidden");
    elements.captureSource.textContent = "Falha na captura.";
    elements.refreshButton.classList.add("needs-refresh");
    if (activeProduct) elements.offerForm.classList.remove("hidden");
  } finally {
    if (runId === captureSequence) {
      elements.loading.classList.add("hidden");
      setBusy(elements.refreshButton, false);
    }
  }
}

async function productImageBlob(payload) {
  const candidates = [
    payload.imageUrl,
    ...(activeProduct?.imageCandidates || []).map((item) => item.url),
  ].filter(Boolean);
  let best = null;
  let bestScore = -Infinity;
  for (const source of [...new Set(candidates)].slice(0, 8)) {
    try {
      const response = await runtime.fetchWithTimeout(source, {}, 15000, "A imagem demorou para carregar.");
      if (!response.ok) continue;
      const blob = await response.blob();
      if (!/^image\/(?:png|jpe?g|webp)$/i.test(blob.type) || blob.size > 12 * 1024 * 1024) continue;
      const bitmap = await createImageBitmap(blob);
      const score = imageSceneScore(bitmap, source);
      bitmap.close?.();
      if (score > bestScore) {
        best = blob;
        bestScore = score;
      }
    } catch { /* Try next image candidate. */ }
  }
  if (!best) throw new Error("Nao foi possivel preparar a imagem do produto.");
  return best;
}

function imageSceneScore(bitmap, source) {
  const canvas = document.createElement("canvas");
  canvas.width = 24;
  canvas.height = 24;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0, 24, 24);
  const pixels = context.getImageData(0, 0, 24, 24).data;
  let white = 0;
  let colorful = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    if (r > 240 && g > 240 && b > 240) white += 1;
    if (Math.max(r, g, b) - Math.min(r, g, b) > 36) colorful += 1;
  }
  const total = pixels.length / 4;
  const usageBonus = /(uso|ambiente|review|cliente|lifestyle|scene|modelo)/i.test(source) ? 25 : 0;
  return colorful / total * 60 - white / total * 45 + usageBonus + Math.min(25, bitmap.width * bitmap.height / 90000);
}

async function extensionAssetBlob(path) {
  const response = await runtime.fetchWithTimeout(chrome.runtime.getURL(path), {}, 8000, "Nao foi possivel carregar as logos.");
  if (!response.ok) throw new Error("Nao foi possivel carregar as logos.");
  return response.blob();
}

function storeLogoPath(platform) {
  const value = normalizeText(platform);
  if (value.includes("mercado livre")) return "assets/mercado-livre.png";
  if (value.includes("shopee")) return "assets/shopee.svg";
  return "";
}

function fileToDataUrl(file) {
  return runtime.withTimeout(new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Nao foi possivel preparar a imagem."));
    reader.readAsDataURL(file);
  }), 15000, "A imagem demorou para ser preparada.");
}

async function prepareShareImage(payload) {
  const key = JSON.stringify([payload.imageUrl, payload.productName, payload.currentPrice, payload.previousPrice, payload.platform, activeProduct?.imageCandidates?.map((item) => item.url).join("|")]);
  if (key === shareImageKey && shareImagePromise) return shareImagePromise;
  shareImageKey = key;
  shareImagePromise = productImageBlob(payload).then(async (sourceBlob) => {
    const storePath = storeLogoPath(payload.platform);
    const [siteLogoBlob, storeLogoBlob] = await Promise.all([
      extensionAssetBlob("assets/tabarato-logo.png"),
      storePath ? extensionAssetBlob(storePath) : Promise.resolve(null),
    ]);
    const imageBlob = await artwork.createOfferArtwork({
      productBlob: sourceBlob,
      siteLogoBlob,
      storeLogoBlob,
      currentPrice: payload.currentPrice,
      previousPrice: payload.previousPrice,
    });
    const slug = payload.productName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "produto";
    return new File([imageBlob], `${slug}.png`, { type: "image/png" });
  });
  shareImagePromise.catch(() => {
    shareImagePromise = null;
    shareImageKey = "";
  });
  return shareImagePromise;
}

function whatsappMessage(payload) {
  const lines = [
    "*TA BARATO!*",
    "",
    `*${payload.productName}*`,
    "",
    `Agora: *${formatPrice(payload.currentPrice)}*${activeProduct?.pricePaymentMethod === "Pix" ? " *(Pix)*" : ""}`,
  ];
  if (payload.previousPrice) lines.push(`Antes: ~${formatPrice(payload.previousPrice)}~`);
  if (payload.coupon) lines.push("", `Cupom: *${payload.coupon}*`);
  if (payload.category) lines.push("", `Categoria: ${payload.category}`);
  if (payload.extraText) lines.push("", payload.extraText);
  lines.push("", "Preco e disponibilidade podem mudar.", "", "Comprar:", payload.affiliateLink);
  return lines.join("\n");
}

async function sendOfferToWhatsApp(payload, onProgress = () => {}) {
  const groups = groupNames();
  if (!groups.length) throw new Error("Registre pelo menos um grupo do WhatsApp.");
  onProgress("Gerando arte...");
  const file = await prepareShareImage(payload);
  onProgress("Abrindo WhatsApp...");
  const result = await runtime.withTimeout(
    chrome.runtime.sendMessage({
      type: "TABARATO_SHARE_WHATSAPP",
      groupNames: groups,
      text: whatsappMessage(payload),
      imageDataUrl: await fileToDataUrl(file),
      fileName: file.name,
    }),
    WHATSAPP_TIMEOUT + groups.length * 70000,
    "O WhatsApp demorou para responder. Tente novamente.",
  );
  if (!result?.ok) throw new Error(result?.error || "Nao foi possivel enviar para o WhatsApp.");
  return result;
}

async function publishOfferId(id, payload, { forceRepublish = false, notifyWhatsApp = true } = {}) {
  const shareFile = await prepareShareImage(payload);
  const shareImageDataUrl = await fileToDataUrl(shareFile);
  const result = await requestApi(`/api/admin/ofertas/${id}/publicar`, {
    method: "POST",
    body: { shareImageDataUrl, forceRepublish },
    timeout: 45000,
  });
  if (!result?.ok) throw new Error(result?.error || "Nao foi possivel publicar no Telegram.");
  if (notifyWhatsApp && groupNames().length) {
    try {
      await sendOfferToWhatsApp(payload);
      await requestApi(`/api/admin/ofertas/${id}/publicar`, { method: "POST", body: { action: "record-channel", channel: "WHATSAPP", status: "SUCESSO" } }).catch(() => {});
    } catch (error) {
      await requestApi(`/api/admin/ofertas/${id}/publicar`, { method: "POST", body: { action: "record-channel", channel: "WHATSAPP", status: "ERRO", errorMessage: runtime.errorMessage(error) } }).catch(() => {});
      throw error;
    }
  }
  return result;
}

async function saveOffer() {
  if (!elements.offerForm.reportValidity()) return;
  setActionsBusy(elements.saveButton, true, "Salvando...");
  try {
    const data = await requestApi("/api/admin/ofertas", { method: "POST", body: formPayload("RASCUNHO") });
    showToast(`Rascunho salvo: ${data.offer.productName}`, "success");
    await synchronizeCatalog();
  } catch (error) {
    runtime.reportError("save-offer", error);
    showToast(runtime.errorMessage(error), "error");
  } finally {
    setActionsBusy(elements.saveButton, false);
  }
}

async function publishOffer() {
  if (!elements.offerForm.reportValidity()) return;
  const payload = formPayload("APROVADO");
  setActionsBusy(elements.publishButton, true, "Publicando...");
  try {
    const created = await requestApi("/api/admin/ofertas", { method: "POST", body: payload });
    await publishOfferId(created.offer.id, payload, { notifyWhatsApp: true });
    showToast(groupNames().length ? "Oferta publicada no site, Telegram e WhatsApp." : "Oferta publicada no site e Telegram.", "success");
    await synchronizeCatalog();
  } catch (error) {
    runtime.reportError("publish-offer", error);
    showToast(runtime.errorMessage(error), "error");
  } finally {
    setActionsBusy(elements.publishButton, false);
  }
}

async function shareOnWhatsApp() {
  if (!elements.offerForm.reportValidity()) return;
  const payload = formPayload();
  setActionsBusy(elements.whatsappButton, true, "Preparando...");
  try {
    await sendOfferToWhatsApp(payload, (label) => setBusy(elements.whatsappButton, true, label));
    showToast("Oferta enviada ao WhatsApp.", "success");
  } catch (error) {
    runtime.reportError("share-whatsapp", error);
    showToast(runtime.errorMessage(error), "error");
  } finally {
    setActionsBusy(elements.whatsappButton, false);
  }
}

async function stopMacros() {
  batchAbortController?.abort();
  await chrome.runtime.sendMessage({ type: "TABARATO_STOP_WHATSAPP" }).catch(() => {});
  showToast("Macro interrompido.", "success");
}

function logBatch(message, tone = "neutral") {
  const item = document.createElement("li");
  item.textContent = message;
  item.dataset.tone = tone;
  elements.batchLog.appendChild(item);
  item.scrollIntoView({ block: "nearest" });
}

async function waitForTabComplete(tabId, timeout = 35000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      callback(value);
    };
    const timer = setTimeout(() => finish(reject, new Error("A pagina demorou para carregar.")), timeout);
    const listener = (id, changeInfo, tab) => {
      if (id === tabId && changeInfo.status === "complete") finish(resolve, tab);
    };
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") finish(resolve, tab);
    }).catch((error) => finish(reject, error));
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function visibleProductUrls(limit) {
  const tab = await activeTab();
  if (!tab?.id) throw new Error("Nenhuma aba ativa encontrada.");
  const result = await chrome.tabs.sendMessage(tab.id, { type: "TABARATO_LIST_VISIBLE_PRODUCTS", limit }).catch(async () => {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["shared/runtime.js", ...captureScriptsForUrl(tab.url)] });
    return chrome.tabs.sendMessage(tab.id, { type: "TABARATO_LIST_VISIBLE_PRODUCTS", limit });
  });
  if (!result?.ok) throw new Error(result?.error || "Nao foi possivel listar produtos na tela.");
  return result.urls || [];
}

async function captureUrlInTempTab(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForTabComplete(tab.id);
    await runtime.delay(600);
    const result = await extractProductFromTab(tab);
    if (!result?.ok) throw new Error(result?.error || "Produto nao encontrado.");
    return result.product;
  } finally {
    if (tab?.id) await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function startBatch() {
  const limit = Math.max(1, Math.min(50, Number(elements.batchLimit.value) || 5));
  elements.batchLog.replaceChildren();
  batchAbortController = new AbortController();
  setActionsBusy(elements.batchStartButton, true, "Enviando...");
  try {
    await synchronizeCatalog();
    const urls = (await visibleProductUrls(limit)).slice(0, limit);
    if (!urls.length) throw new Error("Nenhum produto visivel foi encontrado.");
    logBatch(`${urls.length} produtos encontrados.`);
    for (const [index, url] of urls.entries()) {
      if (batchAbortController.signal.aborted) break;
      try {
        logBatch(`Lendo ${index + 1}/${urls.length}...`);
        const product = await captureUrlInTempTab(url);
        if (Number(product.confidence || 0) < MIN_BATCH_CONFIDENCE) {
          logBatch(`Pulou produto com dados incertos: ${product.productName || url}`, "error");
          continue;
        }
        const existing = findExistingOffer(product);
        if (existing) {
          logBatch(`Ja cadastrado: ${product.productName}`, "error");
          continue;
        }
        const payload = productToPayload(product, "APROVADO");
        activeProduct = product;
        const created = await requestApi("/api/admin/ofertas", { method: "POST", body: payload });
        await publishOfferId(created.offer.id, payload, { notifyWhatsApp: true });
        synchronizedOffers.unshift(created.offer);
        logBatch(`Publicado: ${payload.productName}`, "success");
      } catch (error) {
        logBatch(runtime.errorMessage(error), "error");
      }
    }
    showToast("Envio em lote finalizado.", "success");
  } catch (error) {
    runtime.reportError("batch-send", error);
    showToast(runtime.errorMessage(error), "error");
  } finally {
    setActionsBusy(elements.batchStartButton, false);
    batchAbortController = null;
  }
}

async function fileInputDataUrl() {
  const file = elements.customImageFile.files?.[0];
  if (!file) return "";
  if (!/^image\/(?:png|jpe?g|webp)$/i.test(file.type)) throw new Error("Use PNG, JPG ou WebP.");
  if (file.size > 12 * 1024 * 1024) throw new Error("Imagem muito grande.");
  return fileToDataUrl(file);
}

async function sendCustomMessage() {
  const message = elements.customMessage.value.trim();
  if (!message) {
    elements.customMessage.focus();
    showToast("Escreva a mensagem personalizada.", "error");
    return;
  }
  const imageUrl = await fileInputDataUrl() || elements.customImageUrl.value.trim();
  setActionsBusy(elements.customSendButton, true, "Enviando...");
  try {
    if (elements.customTelegram.checked) {
      await requestApi("/api/admin/mensagens?action=send-custom", {
        method: "POST",
        body: { message, imageUrl },
        timeout: 30000,
      });
    }
    if (elements.customWhatsapp.checked) {
      const groups = groupNames();
      if (!groups.length) throw new Error("Registre pelo menos um grupo do WhatsApp.");
      let imageDataUrl = imageUrl;
      if (imageUrl && /^https:\/\//i.test(imageUrl)) {
        const response = await runtime.fetchWithTimeout(imageUrl, {}, 15000);
        const blob = await response.blob();
        imageDataUrl = await fileToDataUrl(new File([blob], "mensagem.png", { type: blob.type || "image/png" }));
      }
      await chrome.runtime.sendMessage({
        type: "TABARATO_SHARE_WHATSAPP",
        groupNames: groups,
        text: message,
        imageDataUrl,
        fileName: "mensagem.png",
      });
    }
    showToast("Mensagem enviada.", "success");
  } catch (error) {
    runtime.reportError("custom-message", error);
    showToast(runtime.errorMessage(error), "error");
  } finally {
    setActionsBusy(elements.customSendButton, false);
  }
}

function setMode(mode) {
  const batch = mode === "batch";
  elements.modeSingle.classList.toggle("active", !batch);
  elements.modeBatch.classList.toggle("active", batch);
  elements.singleView.classList.toggle("hidden", batch);
  elements.batchView.classList.toggle("hidden", !batch);
}

function renderAuth() {
  const connected = Boolean(session?.token && session?.baseUrl && new Date(session.expiresAt).getTime() > Date.now());
  elements.setup.classList.toggle("hidden", connected);
  elements.editor.classList.toggle("hidden", !connected);
  setStatus(connected ? "Conectado" : "Desconectado", connected ? "success" : "neutral");
}

function highlightProductChange(tab) {
  const nextUrl = comparableUrl(tab?.url);
  if (!session || !tab?.id || !nextUrl || !captureScriptsForUrl(nextUrl).length) return;
  if (tab.id === capturedTabId && nextUrl === capturedPageUrl) return;
  elements.captureSource.textContent = "Pagina mudou. Capture o novo produto.";
  elements.refreshButton.classList.add("needs-refresh");
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
    }, REQUEST_TIMEOUT, "O painel demorou para responder.");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.token) throw new Error(payload.error || "Login nao autorizado.");
    await saveSession({ baseUrl, token: payload.token, expiresAt: payload.expiresAt });
    await chrome.storage.local.set({ [LAST_BASE_URL_KEY]: baseUrl });
    elements.password.value = "";
    renderAuth();
    showToast("Extensao conectada ao painel.", "success");
  } catch (error) {
    runtime.reportError("admin-login", error);
    setStatus("Erro", "error");
    showToast(runtime.errorMessage(error), "error");
  } finally {
    setBusy(elements.loginButton, false);
  }
});

elements.offerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveOffer();
});
elements.publishButton.addEventListener("click", publishOffer);
elements.whatsappButton.addEventListener("click", shareOnWhatsApp);
elements.adminPanelButton.addEventListener("click", () => openAdminPanel().catch((error) => showToast(runtime.errorMessage(error), "error")));
elements.groupsToggle.addEventListener("click", () => elements.groupsPanel.classList.toggle("hidden"));
elements.saveGroupsButton.addEventListener("click", async () => {
  await chrome.storage.local.set({ [GROUPS_KEY]: elements.whatsappGroups.value });
  showToast(`${groupNames().length} grupos registrados.`, "success");
});
elements.stopMacroButton.addEventListener("click", stopMacros);
elements.batchStopButton.addEventListener("click", stopMacros);
elements.refreshButton.addEventListener("click", () => captureProduct());
elements.activateCouponsButton.addEventListener("click", async () => {
  setBusy(elements.activateCouponsButton, true, "Ativando...");
  try {
    const result = await chrome.runtime.sendMessage({ type: "TABARATO_ACTIVATE_ML_COUPONS", limit: Number(elements.couponLimit.value) || 5 });
    if (!result?.ok) throw new Error(result?.error || "Nao foi possivel ativar os cupons.");
    showToast(`${result.activated} cupons ativados.`, result.activated ? "success" : "neutral");
  } catch (error) {
    showToast(runtime.errorMessage(error), "error");
  } finally {
    setBusy(elements.activateCouponsButton, false);
  }
});
elements.modeSingle.addEventListener("click", () => setMode("single"));
elements.modeBatch.addEventListener("click", () => setMode("batch"));
elements.batchStartButton.addEventListener("click", startBatch);
elements.customToggle.addEventListener("click", () => elements.customBody.classList.toggle("hidden"));
elements.customSendButton.addEventListener("click", () => sendCustomMessage().catch((error) => showToast(runtime.errorMessage(error), "error")));
elements.logoutButton.addEventListener("click", async () => {
  await clearSession();
  renderAuth();
});
Object.values(elements.fields).forEach((field) => field.addEventListener("input", () => {
  updatePreview();
  persistProductDraft().catch(() => {});
}));

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url || !tab.active) return;
  highlightProductChange({ ...tab, id: tabId, url: changeInfo.url });
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    highlightProductChange(await chrome.tabs.get(tabId));
  } catch { /* Closed tabs are ignored. */ }
});

chrome.storage.local.get([STORAGE_KEY, GROUPS_KEY, LAST_BASE_URL_KEY, PRODUCT_DRAFT_KEY, CAPTURE_REQUEST_KEY]).then(async (stored) => {
  session = stored[STORAGE_KEY] || null;
  elements.whatsappGroups.value = stored[GROUPS_KEY] || "";
  elements.baseUrl.value = session?.baseUrl || stored[LAST_BASE_URL_KEY] || "";
  if (session?.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) session = null;
  restoreProductDraft(stored[PRODUCT_DRAFT_KEY]);
  renderAuth();
  const captureRequest = stored[CAPTURE_REQUEST_KEY];
  const tab = await activeTab().catch(() => null);
  if (session && captureRequest?.at > Date.now() - 15000 && comparableUrl(captureRequest.url) === comparableUrl(tab?.url)) {
    await chrome.storage.local.remove(CAPTURE_REQUEST_KEY);
    captureProduct();
  } else if (session && !activeProduct && tab?.url && !/web\.whatsapp\.com/i.test(tab.url)) {
    captureProduct();
  }
}).catch((error) => {
  runtime.reportError("load-settings", error);
  renderAuth();
  showToast("Nao foi possivel carregar as configuracoes.", "error");
});
