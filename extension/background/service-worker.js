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
chrome.runtime.onInstalled.addListener(refreshAllTabs);
chrome.runtime.onStartup.addListener(refreshAllTabs);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === "complete") updateTabAvailability(tabId, changeInfo.url || tab.url);
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then((tab) => updateTabAvailability(tabId, tab.url)).catch(() => {});
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && SITE_URL_KEYS.some((key) => changes[key])) refreshAllTabs();
});

function waitForTab(tabId, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("O WhatsApp Web demorou para carregar."));
    }, timeout);
    const listener = (updatedId, changeInfo, tab) => {
      if (updatedId !== tabId || changeInfo.status !== "complete") return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(tab);
    };
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      }
    }).catch(reject);
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function withTimeout(promise, timeout, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeout);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function whatsappTab() {
  const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
  if (tabs.length) return tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
  return chrome.tabs.create({ url: "https://web.whatsapp.com/" });
}

async function sendToWhatsApp(message) {
  const tab = await whatsappTab();
  if (!tab?.id) throw new Error("Nao foi possivel abrir o WhatsApp Web.");
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.tabs.update(tab.id, { active: true });
  await waitForTab(tab.id);
  await new Promise((resolve) => setTimeout(resolve, 350));

  const payload = {
    type: "TABARATO_WHATSAPP_SEND",
    groupName: message.groupName,
    text: message.text,
    imageDataUrl: message.imageDataUrl,
    fileName: message.fileName,
  };

  try {
    return await withTimeout(
      chrome.tabs.sendMessage(tab.id, payload),
      65000,
      "O WhatsApp nao respondeu. Confirme se o grupo esta aberto e tente novamente.",
    );
  } catch (error) {
    const missingReceiver = /receiving end does not exist|could not establish connection/i.test(error?.message || "");
    if (!missingReceiver) throw error;
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/whatsapp.js"] });
    return withTimeout(
      chrome.tabs.sendMessage(tab.id, payload),
      65000,
      "O WhatsApp nao respondeu. Confirme se o grupo esta aberto e tente novamente.",
    );
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "TABARATO_OPEN_PANEL" && sender.tab?.id) {
    chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
    return;
  }
  if (message?.type === "TABARATO_SHARE_WHATSAPP") {
    sendToWhatsApp(message)
      .then((result) => sendResponse(result || { ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Falha ao acessar o WhatsApp Web." }));
    return true;
  }
});
