importScripts("../shared/runtime.js");

const runtime = globalThis.TaBaratoRuntime;

const STORAGE_KEYS = [
  "tabarato_extension_session",
  "tabarato_last_base_url",
  "tabarato_connected_store_hosts",
];
const OFFICIAL_SITE_ORIGINS = new Set(["https://tabaratoofertas.vercel.app"]);
const CORE_STORE_HOSTS = [
  "mercadolivre.com.br",
  "mercadolibre.com",
  "shopee.com.br",
];
let whatsappOperation = null;

function hostMatches(hostname, host) {
  return hostname === host || hostname.endsWith(`.${host}`);
}

function builtInAllowedHost(hostname) {
  return hostname === "web.whatsapp.com" || CORE_STORE_HOSTS.some((host) => hostMatches(hostname, host));
}

async function extensionConfig() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS);
  const dynamicHosts = Array.isArray(stored.tabarato_connected_store_hosts)
    ? stored.tabarato_connected_store_hosts.map(String).filter(Boolean)
    : [];
  let configuredOrigin = "";
  const candidate = stored.tabarato_extension_session?.baseUrl || stored.tabarato_last_base_url || "";
  try {
    configuredOrigin = new URL(candidate).origin;
  } catch {
    configuredOrigin = "";
  }
  return { configuredOrigin, dynamicHosts };
}

async function isAllowedUrl(value = "") {
  try {
    const target = new URL(value);
    if (!["http:", "https:"].includes(target.protocol)) return false;
    const { configuredOrigin, dynamicHosts } = await extensionConfig();
    return builtInAllowedHost(target.hostname)
      || OFFICIAL_SITE_ORIGINS.has(target.origin)
      || target.origin === configuredOrigin
      || dynamicHosts.some((host) => hostMatches(target.hostname, host));
  } catch {
    return false;
  }
}

async function updateTabAvailability(tabId, url = "") {
  if (!tabId) return;
  const allowed = await isAllowedUrl(url);
  await Promise.all([
    allowed ? chrome.action.enable(tabId) : chrome.action.disable(tabId),
    chrome.sidePanel.setOptions({ tabId, enabled: allowed }),
  ]).catch(() => {});
}

async function closePanelIfDisallowed(tab) {
  if (!tab?.id || !tab?.windowId || await isAllowedUrl(tab.url)) return;
  await chrome.sidePanel.close({ windowId: tab.windowId }).catch(() => {});
}

async function refreshAllTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => updateTabAvailability(tab.id, tab.url)));
}

async function waitForTab(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      callback(value);
    };
    const timer = setTimeout(() => finish(reject, new Error("O WhatsApp Web demorou para carregar.")), timeout);
    const listener = (updatedId, changeInfo, tab) => {
      if (updatedId !== tabId || changeInfo.status !== "complete") return;
      finish(resolve, tab);
    };
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") finish(resolve, tab);
    }).catch((error) => finish(reject, error));
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function whatsappTab() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (tabs.length) return tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
  return chrome.tabs.create({ url: "https://web.whatsapp.com/" });
}

function normalizeGroups(message) {
  const raw = Array.isArray(message.groupNames) ? message.groupNames : [message.groupName];
  return [...new Set(raw.flatMap((value) => String(value || "").split(/\r?\n/))
    .map((value) => value.trim())
    .filter(Boolean))];
}

async function sendSingleWhatsApp(tab, payload) {
  try {
    return await runtime.withTimeout(
      chrome.tabs.sendMessage(tab.id, payload),
      70000,
      "O WhatsApp nao respondeu. Confirme se esta conectado e tente novamente.",
    );
  } catch (error) {
    const missingReceiver = /receiving end does not exist|could not establish connection/i.test(error?.message || "");
    if (!missingReceiver) throw error;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["shared/runtime.js", "content/whatsapp.js"] });
    return runtime.withTimeout(
      chrome.tabs.sendMessage(tab.id, payload),
      70000,
      "O WhatsApp nao respondeu. Confirme se esta conectado e tente novamente.",
    );
  }
}

async function performWhatsAppSend(message, operation) {
  const groups = normalizeGroups(message);
  if (!groups.length) throw new Error("Registre pelo menos um grupo do WhatsApp.");
  if (!String(message?.text || "").trim()) throw new Error("A mensagem do WhatsApp esta vazia.");
  if (String(message?.imageDataUrl || "").length > 17 * 1024 * 1024) throw new Error("A imagem excede o limite permitido para envio.");

  const tab = await whatsappTab();
  if (!tab?.id) throw new Error("Nao foi possivel abrir o WhatsApp Web.");
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.tabs.update(tab.id, { active: true });
  await waitForTab(tab.id);
  await runtime.delay(350);

  const results = [];
  for (const groupName of groups) {
    if (operation.cancelled) {
      results.push({ groupName, ok: false, stopped: true, error: "Envio interrompido." });
      break;
    }
    const payload = {
      type: "TABARATO_WHATSAPP_SEND",
      groupName,
      text: message.text,
      imageDataUrl: message.imageDataUrl || "",
      fileName: message.fileName || "oferta.png",
    };
    const result = await sendSingleWhatsApp(tab, payload);
    if (!result?.ok) throw new Error(result?.error || `Nao foi possivel enviar para ${groupName}.`);
    results.push({ groupName, ok: true });
    await runtime.delay(650);
  }
  return { ok: true, results, stopped: operation.cancelled };
}

function sendToWhatsApp(message) {
  if (whatsappOperation) return Promise.reject(new Error("Ja existe um envio para o WhatsApp em andamento."));
  const operation = { cancelled: false };
  whatsappOperation = operation;
  return runtime.withTimeout(
    performWhatsAppSend(message, operation),
    Math.max(95000, normalizeGroups(message).length * 90000),
    "O envio para o WhatsApp excedeu o tempo limite. Tente novamente.",
  )
    .catch((error) => {
      runtime.reportError("whatsapp-background", error);
      throw error;
    })
    .finally(() => {
      if (whatsappOperation === operation) whatsappOperation = null;
    });
}

async function stopWhatsAppSend() {
  if (whatsappOperation) whatsappOperation.cancelled = true;
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  await Promise.all(tabs.map((tab) => chrome.tabs.sendMessage(tab.id, { type: "TABARATO_WHATSAPP_CANCEL" }).catch(() => {})));
  return { ok: true };
}

async function activateMercadoLivreCoupons(limit) {
  const tab = await chrome.tabs.create({ url: "https://www.mercadolivre.com.br/cupons", active: true });
  await waitForTab(tab.id, 45000);
  await runtime.delay(1000);
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/coupons.js"] });
  return runtime.withTimeout(
    chrome.tabs.sendMessage(tab.id, { type: "TABARATO_ACTIVATE_COUPONS", limit }),
    Math.max(45000, Number(limit) * 4000),
    "A ativacao de cupons demorou demais.",
  );
}

chrome.action.disable().catch(() => {});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.runtime.onInstalled.addListener(() => refreshAllTabs().catch((error) => runtime.reportError("extension-installed", error)));
chrome.runtime.onStartup.addListener(() => refreshAllTabs().catch((error) => runtime.reportError("extension-startup", error)));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    updateTabAvailability(tabId, changeInfo.url || tab.url).catch((error) => runtime.reportError("tab-availability", error));
    if (tab.active) closePanelIfDisallowed({ ...tab, id: tabId, url: changeInfo.url || tab.url }).catch(() => {});
  }
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then(async (tab) => {
    await updateTabAvailability(tabId, tab.url);
    await closePanelIfDisallowed(tab);
  }).catch(() => {});
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && STORAGE_KEYS.some((key) => changes[key])) {
    refreshAllTabs().catch((error) => runtime.reportError("refresh-tabs", error));
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "TABARATO_IS_ALLOWED_PAGE") {
    isAllowedUrl(message.url || sender.tab?.url)
      .then((allowed) => sendResponse({ ok: true, allowed }))
      .catch(() => sendResponse({ ok: true, allowed: false }));
    return true;
  }
  if (message?.type === "TABARATO_OPEN_PANEL" && sender.tab?.id) {
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
    return;
  }
  if (message?.type === "TABARATO_SHARE_WHATSAPP") {
    sendToWhatsApp(message)
      .then((result) => sendResponse(result || { ok: true }))
      .catch((error) => sendResponse({ ok: false, error: runtime.errorMessage(error, "Falha ao acessar o WhatsApp Web.") }));
    return true;
  }
  if (message?.type === "TABARATO_STOP_WHATSAPP") {
    stopWhatsAppSend()
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: runtime.errorMessage(error) }));
    return true;
  }
  if (message?.type === "TABARATO_ACTIVATE_ML_COUPONS") {
    activateMercadoLivreCoupons(message.limit)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: runtime.errorMessage(error) }));
    return true;
  }
});
