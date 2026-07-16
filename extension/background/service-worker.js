importScripts("../shared/runtime.js");

const runtime = globalThis.TaBaratoRuntime;
const SITE_URL_KEYS = ["tabarato_extension_session", "tabarato_last_base_url"];
const OFFICIAL_SITE_ORIGINS = new Set(["https://tabaratoofertas.vercel.app"]);

function allowedStoreHost(hostname) {
  return hostname === "web.whatsapp.com"
    || hostname === "mercadolivre.com.br"
    || hostname.endsWith(".mercadolivre.com.br")
    || hostname === "mercadolibre.com"
    || hostname.endsWith(".mercadolibre.com")
    || hostname === "shopee.com.br"
    || hostname.endsWith(".shopee.com.br");
}

async function configuredSiteOrigin() {
  const stored = await chrome.storage.local.get(SITE_URL_KEYS);
  const candidate = stored.tabarato_extension_session?.baseUrl || stored.tabarato_last_base_url || "";
  try {
    return new URL(candidate).origin;
  } catch {
    return "";
  }
}

async function updateTabAvailability(tabId, url = "") {
  if (!tabId) return;
  let allowed = false;
  try {
    const target = new URL(url);
    allowed = ["http:", "https:"].includes(target.protocol)
      && (allowedStoreHost(target.hostname)
        || OFFICIAL_SITE_ORIGINS.has(target.origin)
        || target.origin === await configuredSiteOrigin());
  } catch { /* Browser internal pages stay disabled. */ }

  await Promise.all([
    allowed ? chrome.action.enable(tabId) : chrome.action.disable(tabId),
    chrome.sidePanel.setOptions({ tabId, path: "sidepanel/index.html", enabled: allowed }),
  ]).catch(() => {});
}

async function refreshAllTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => updateTabAvailability(tab.id, tab.url)));
}

chrome.action.disable().catch(() => {});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
chrome.runtime.onInstalled.addListener(() => {
  refreshAllTabs().catch((error) => runtime.reportError("extension-installed", error));
});
chrome.runtime.onStartup.addListener(() => {
  refreshAllTabs().catch((error) => runtime.reportError("extension-startup", error));
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    updateTabAvailability(tabId, changeInfo.url || tab.url).catch((error) => runtime.reportError("tab-availability", error));
  }
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then((tab) => updateTabAvailability(tabId, tab.url)).catch(() => {});
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && SITE_URL_KEYS.some((key) => changes[key])) {
    refreshAllTabs().catch((error) => runtime.reportError("refresh-tabs", error));
  }
});

function waitForTab(tabId, timeout = 25000) {
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

let whatsappOperation = null;

async function performWhatsAppSend(message) {
  if (!String(message?.groupName || "").trim()) throw new Error("Informe o grupo do WhatsApp.");
  if (!String(message?.text || "").trim()) throw new Error("A mensagem do WhatsApp esta vazia.");
  if (String(message?.imageDataUrl || "").length > 17 * 1024 * 1024) throw new Error("A imagem excede o limite permitido para envio.");
  const tab = await whatsappTab();
  if (!tab?.id) throw new Error("Nao foi possivel abrir o WhatsApp Web.");
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.tabs.update(tab.id, { active: true });
  await waitForTab(tab.id);
  await runtime.delay(350);

  const payload = {
    type: "TABARATO_WHATSAPP_SEND",
    groupName: message.groupName,
    text: message.text,
    imageDataUrl: message.imageDataUrl,
    fileName: message.fileName,
  };

  try {
    return await runtime.withTimeout(
      chrome.tabs.sendMessage(tab.id, payload),
      65000,
      "O WhatsApp nao respondeu. Confirme se o grupo esta aberto e tente novamente.",
    );
  } catch (error) {
    const missingReceiver = /receiving end does not exist|could not establish connection/i.test(error?.message || "");
    if (!missingReceiver) throw error;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["shared/runtime.js", "content/whatsapp.js"] });
    return runtime.withTimeout(
      chrome.tabs.sendMessage(tab.id, payload),
      65000,
      "O WhatsApp nao respondeu. Confirme se o grupo esta aberto e tente novamente.",
    );
  }
}

function sendToWhatsApp(message) {
  if (whatsappOperation) return Promise.reject(new Error("Ja existe um envio para o WhatsApp em andamento."));
  whatsappOperation = runtime.withTimeout(
    performWhatsAppSend(message),
    92000,
    "O envio para o WhatsApp excedeu o tempo limite. Tente novamente.",
  )
    .catch((error) => {
      runtime.reportError("whatsapp-background", error);
      throw error;
    })
    .finally(() => { whatsappOperation = null; });
  return whatsappOperation;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "TABARATO_OPEN_PANEL" && sender.tab?.id) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
    return;
  }
  if (message?.type === "TABARATO_SHARE_WHATSAPP") {
    sendToWhatsApp(message)
      .then((result) => sendResponse(result || { ok: true }))
      .catch((error) => sendResponse({ ok: false, error: runtime.errorMessage(error, "Falha ao acessar o WhatsApp Web.") }));
    return true;
  }
});
