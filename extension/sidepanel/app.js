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

function wrapCanvasText(context, value, x, y, maxWidth, lineHeight, maxLines = 3) {
  const words = String(value || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else { lines.push(line); line = word; }
  });
  if (line) lines.push(line);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    let last = visible[maxLines - 1];
    while (last && context.measureText(`${last}...`).width > maxWidth) last = last.slice(0, -1);
    visible[maxLines - 1] = `${last}...`;
  }
  visible.forEach((item, index) => context.fillText(item, x, y + index * lineHeight));
  return y + visible.length * lineHeight;
}

async function loadShareImage(url) {
  if (!url) return null;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return createImageBitmap(await response.blob());
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function createWhatsAppImage(payload) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const context = canvas.getContext("2d");
  context.fillStyle = "#f4f5f6";
  context.fillRect(0, 0, 1080, 1080);

  const productImage = await loadShareImage(payload.imageUrl);
  if (productImage) {
    const maxWidth = 880;
    const maxHeight = 540;
    const scale = Math.min(maxWidth / productImage.width, maxHeight / productImage.height, 1);
    const width = productImage.width * scale;
    const height = productImage.height * scale;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 1080, 610);
    context.drawImage(productImage, (1080 - width) / 2, (580 - height) / 2, width, height);
    productImage.close?.();
  }

  context.fillStyle = "#111111";
  context.fillRect(0, 610, 1080, 470);
  context.fillStyle = "#ff6b35";
  context.fillRect(0, 610, 1080, 10);
  context.fillStyle = "#ff6b35";
  context.font = "800 34px system-ui, sans-serif";
  context.fillText("TA BARATO", 72, 682);
  context.fillStyle = "rgba(255,255,255,.58)";
  context.font = "600 24px system-ui, sans-serif";
  context.textAlign = "right";
  context.fillText(payload.platform || "OFERTA", 1008, 682);
  context.textAlign = "left";

  context.fillStyle = "#ffffff";
  context.font = "700 38px system-ui, sans-serif";
  const nextY = wrapCanvasText(context, payload.productName, 72, 752, 936, 48, 2);
  context.fillStyle = "#ffffff";
  context.font = "800 62px system-ui, sans-serif";
  context.fillText(formatPrice(payload.currentPrice), 72, nextY + 48);
  if (payload.previousPrice) {
    context.fillStyle = "rgba(255,255,255,.46)";
    context.font = "600 28px system-ui, sans-serif";
    const oldPrice = `Antes: ${formatPrice(payload.previousPrice)}`;
    context.fillText(oldPrice, 72, nextY + 94);
    const oldWidth = context.measureText(oldPrice).width;
    context.fillRect(72, nextY + 82, oldWidth, 3);
  }
  if (payload.coupon) {
    context.fillStyle = "#ff6b35";
    context.fillRect(72, 990, 420, 56);
    context.fillStyle = "#ffffff";
    context.font = "800 26px system-ui, sans-serif";
    context.fillText(`CUPOM: ${payload.coupon}`, 92, 1027);
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Nao foi possivel gerar a imagem da oferta.");
  const slug = payload.productName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "oferta";
  return new File([blob], `${slug}.png`, { type: "image/png" });
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
  const key = JSON.stringify([payload.productName, payload.currentPrice, payload.previousPrice, payload.coupon, payload.platform, payload.imageUrl]);
  if (key === shareImageKey && shareImagePromise) return shareImagePromise;
  shareImageKey = key;
  shareImagePromise = createWhatsAppImage(payload);
  return shareImagePromise;
}

function scheduleWhatsAppImage() {
  window.clearTimeout(shareImageTimer);
  shareImageTimer = window.setTimeout(() => prepareWhatsAppImage(formPayload()).catch(() => {}), 250);
}

function whatsappMessage(payload) {
  const lines = [
    "🔥 *TA BARATO!*",
    "",
    `*${payload.productName}*`,
    "",
    `💰 Agora: *${formatPrice(payload.currentPrice)}*`,
  ];
  if (payload.previousPrice) lines.push(`Antes: ~${formatPrice(payload.previousPrice)}~`);
  if (payload.coupon) lines.push(`Cupom: *${payload.coupon}*`);
  if (payload.category) lines.push("", `📦 ${payload.category}`);
  if (payload.shortDescription) lines.push("", payload.shortDescription);
  lines.push("", "Publicidade | Link de afiliado", "Preco e disponibilidade podem mudar.", "", `🛒 ${payload.affiliateLink}`);
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
    product.shortDescription = firstParagraph(product.shortDescription);
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
