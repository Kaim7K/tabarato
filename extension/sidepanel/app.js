const STORAGE_KEY = "tabarato_extension_session";

const elements = {
  setup: document.getElementById("setup-view"),
  editor: document.getElementById("editor-view"),
  loginForm: document.getElementById("login-form"),
  offerForm: document.getElementById("offer-form"),
  baseUrl: document.getElementById("base-url"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  loginButton: document.getElementById("login-button"),
  status: document.getElementById("connection-status"),
  loading: document.getElementById("loading-state"),
  empty: document.getElementById("empty-state"),
  captureSource: document.getElementById("capture-source"),
  refreshButton: document.getElementById("refresh-button"),
  logoutButton: document.getElementById("logout-button"),
  saveButton: document.getElementById("save-button"),
  saveOpenButton: document.getElementById("save-open-button"),
  publishButton: document.getElementById("publish-button"),
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
  [elements.saveButton, elements.saveOpenButton, elements.publishButton].forEach((button) => {
    button.disabled = busy;
  });
  setBusy(activeButton, busy, label);
  if (!busy) {
    [elements.saveButton, elements.saveOpenButton, elements.publishButton].forEach((button) => {
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

function suggestCategory(product) {
  const value = `${product.productName || ""} ${product.shortDescription || ""}`.toLowerCase();
  if (/notebook|celular|smartphone|fone|monitor|mouse|teclado|ssd|tablet|tv\b/.test(value)) return "Tecnologia";
  if (/panela|frigideira|liquidificador|cafeteira|air fryer|cozinha/.test(value)) return "Cozinha";
  if (/furadeira|parafusadeira|chave|serra|ferramenta/.test(value)) return "Ferramentas";
  if (/maquiagem|perfume|shampoo|hidratante|barbeador/.test(value)) return "Beleza e cuidados";
  if (/cadeira|mesa|papel|caneta|escritorio|impressora/.test(value)) return "Escritório";
  if (/casa|organizador|limpeza|quarto|banheiro/.test(value)) return "Casa e organização";
  return "Tecnologia";
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
    extraText: "",
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

function updatePreview() {
  const payload = formPayload();
  elements.previewName.textContent = payload.productName || "Nome do produto";
  elements.previewPrice.textContent = formatPrice(payload.currentPrice);
  elements.previewCategory.textContent = payload.category || "Categoria";
  elements.platformBadge.textContent = payload.platform || "Loja";
  elements.previewImage.src = payload.imageUrl || "";
  elements.previewImage.hidden = !payload.imageUrl;
  updateAffiliateNotice();
}

async function checkDuplicate() {
  elements.duplicateWarning.classList.add("hidden");
  const link = normalizeLink(elements.fields.affiliateLink.value);
  if (!link) return;
  try {
    const data = await requestApi("/api/admin/ofertas");
    const duplicate = (data.offers || []).find((offer) => normalizeLink(offer.affiliateLink) === link);
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

async function publishOffer() {
  if (!elements.offerForm.reportValidity()) return;
  const payload = formPayload();
  if (payload.platform === "Mercado Livre" && !/^https:\/\/meli\.la\/[A-Za-z0-9_-]+/i.test(payload.affiliateLink)) {
    elements.fields.affiliateLink.focus();
    showToast("Use o link meli.la gerado pelo botao Compartilhar.", "error");
    return;
  }
  if (!window.confirm(`Publicar "${payload.productName}" agora no Telegram?`)) return;

  setOfferActionsBusy(elements.publishButton, true, "Publicando...");
  try {
    const created = await requestApi("/api/admin/ofertas", {
      method: "POST",
      body: { ...payload, status: "APROVADO" },
    });
    const result = await requestApi(`/api/admin/ofertas/${created.offer.id}/publicar`, { method: "POST" });
    showToast(`Oferta publicada: ${result.offer.productName}`, "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    setOfferActionsBusy(elements.publishButton, false);
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
elements.refreshButton.addEventListener("click", captureProduct);
elements.logoutButton.addEventListener("click", async () => {
  await clearSession();
  renderAuth();
});
elements.fields.affiliateLink.addEventListener("change", checkDuplicate);
Object.values(elements.fields).forEach((field) => field.addEventListener("input", updatePreview));

chrome.storage.local.get(STORAGE_KEY).then((stored) => {
  session = stored[STORAGE_KEY] || null;
  if (session?.baseUrl) elements.baseUrl.value = session.baseUrl;
  if (session?.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) session = null;
  renderAuth();
});
