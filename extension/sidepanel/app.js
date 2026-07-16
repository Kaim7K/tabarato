const STORAGE_KEY = "tabarato_extension_session";
const WHATSAPP_GROUP_KEY = "tabarato_whatsapp_group";
const LAST_BASE_URL_KEY = "tabarato_last_base_url";

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
  whatsappGroup: document.getElementById("whatsapp-group"),
  duplicateWarning: document.getElementById("duplicate-warning"),
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
  button.disabled = busy;
  if (busy) {
    button.dataset.label = button.textContent;
    button.textContent = label;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
    delete button.dataset.label;
  }
}

function setOfferActionsBusy(activeButton, busy, label) {
  [elements.saveButton, elements.saveOpenButton, elements.publishButton, elements.whatsappButton].forEach((button) => {
    button.disabled = busy;
  });
  setBusy(activeButton, busy, label);
  if (!busy) {
    [elements.saveButton, elements.saveOpenButton, elements.publishButton, elements.whatsappButton].forEach((button) => {
      button.disabled = false;
    });
  }
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
    showToast(error.message, "error");
  }
}

async function requestApi(path, options = {}) {
  if (!session?.baseUrl || !session?.token) throw new Error("Conecte a extensao ao painel.");
  const response = await fetch(`${session.baseUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.token}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
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
  const data = await requestApi("/api/admin/ofertas");
  synchronizedOffers = data.offers || [];
  const categories = data.categories?.length
    ? data.categories
    : [...new Set(synchronizedOffers.map((offer) => offer.category).filter(Boolean))];
  updateCategoryOptions(categories);
  return data;
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
    coupon: product.coupon || "",
    shortDescription: product.shortDescription || "",
    imageUrl: product.imageUrl || "",
    extraText: product.extraText || "",
  };
  Object.entries(values).forEach(([key, value]) => { elements.fields[key].value = value; });
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
    category: elements.fields.category.value,
    imageUrl: elements.fields.imageUrl.value.trim(),
    affiliateLink: elements.fields.affiliateLink.value.trim(),
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
  if (!/^https:\/\//i.test(url)) throw new Error("A imagem original do produto nao possui uma URL valida.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`A loja respondeu com status ${response.status} ao carregar a imagem.`);
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) throw new Error("A URL capturada nao retornou uma imagem.");
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
  const image = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);
  image.close?.();
  const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!pngBlob) throw new Error("Nao foi possivel preparar a imagem original do produto.");
  return pngBlob;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Nao foi possivel preparar a imagem para o WhatsApp."));
    reader.readAsDataURL(file);
  });
}

function prepareWhatsAppImage(payload) {
  const key = payload.imageUrl;
  if (key === shareImageKey && shareImagePromise) return shareImagePromise;
  shareImageKey = key;
  shareImagePromise = productImageBlob(payload.imageUrl).then(async (sourceBlob) => {
    const imageBlob = await pngFromImage(sourceBlob);
    const slug = payload.productName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "produto";
    return new File([imageBlob], `${slug}.png`, { type: "image/png" });
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

async function captureProduct() {
  elements.loading.classList.remove("hidden");
  elements.empty.classList.add("hidden");
  elements.offerForm.classList.add("hidden");
  try {
    const catalogRequest = synchronizeCatalog().catch(() => null);
    const tab = await activeTab();
    if (!tab?.id) throw new Error("Nenhuma aba ativa encontrada.");
    const result = await chrome.tabs.sendMessage(tab.id, { type: "TABARATO_EXTRACT_PRODUCT" });
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
    fillForm(product);
  } catch (error) {
    elements.empty.querySelector("p").textContent = error.message;
    elements.empty.classList.remove("hidden");
  } finally {
    elements.loading.classList.add("hidden");
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
    showToast(error.message, "error");
  } finally {
    setOfferActionsBusy(button, false);
  }
}

async function sendOfferToWhatsApp(payload, groupName, onProgress = () => {}) {
  const file = await prepareWhatsAppImage(payload);
  onProgress("Abrindo WhatsApp...");
  const result = await chrome.runtime.sendMessage({
    type: "TABARATO_SHARE_WHATSAPP",
    groupName,
    text: whatsappMessage(payload),
    imageDataUrl: await fileToDataUrl(file),
    fileName: file.name,
  });
  if (!result?.ok) throw new Error(result?.error || "Nao foi possivel enviar para o grupo.");
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
    const created = await requestApi("/api/admin/ofertas", {
      method: "POST",
      body: { ...payload, status: "APROVADO" },
    });
    await requestApi(`/api/admin/ofertas/${created.offer.id}/publicar`, { method: "POST" });
    if (!groupName) {
      showToast(`Oferta publicada no Telegram. Informe o grupo para enviar tambem ao WhatsApp.`, "success");
      return;
    }

    try {
      await sendOfferToWhatsApp(payload, groupName, (label) => {
        elements.publishButton.textContent = label;
      });
      showToast(`Oferta publicada no Telegram e enviada para ${groupName}.`, "success");
    } catch (whatsappError) {
      showToast(`Publicada no Telegram, mas o WhatsApp falhou: ${whatsappError.message}`, "error");
    }
  } catch (error) {
    showToast(error.message, "error");
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
    showToast(error.message, "error");
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
    const response = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: elements.username.value.trim(),
        password: elements.password.value,
        client: "extension",
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.token) throw new Error(payload.error || "Login nao autorizado.");
    await saveSession({ baseUrl, token: payload.token, expiresAt: payload.expiresAt });
    await chrome.storage.local.set({ [LAST_BASE_URL_KEY]: baseUrl });
    elements.password.value = "";
    renderAuth();
    showToast("Extensao conectada ao painel.", "success");
  } catch (error) {
    setStatus("Erro de conexao", "error");
    showToast(error.message, "error");
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
elements.adminPanelButton.addEventListener("click", openAdminPanel);
elements.whatsappGroup.addEventListener("input", () => {
  chrome.storage.local.set({ [WHATSAPP_GROUP_KEY]: elements.whatsappGroup.value.trim() });
});
elements.refreshButton.addEventListener("click", captureProduct);
elements.logoutButton.addEventListener("click", async () => {
  await clearSession();
  renderAuth();
});
elements.fields.affiliateLink.addEventListener("change", checkDuplicate);
Object.values(elements.fields).forEach((field) => field.addEventListener("input", updatePreview));

chrome.storage.local.get([STORAGE_KEY, WHATSAPP_GROUP_KEY, LAST_BASE_URL_KEY]).then((stored) => {
  session = stored[STORAGE_KEY] || null;
  elements.whatsappGroup.value = stored[WHATSAPP_GROUP_KEY] || "";
  elements.baseUrl.value = session?.baseUrl || stored[LAST_BASE_URL_KEY] || "";
  if (session?.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) session = null;
  renderAuth();
});
