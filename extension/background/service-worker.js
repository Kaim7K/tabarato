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
const DYNAMIC_CONTENT_SCRIPT_ID = "tabarato-connected-stores";
const STORE_CONTENT_FILES = [
  "shared/runtime.js",
  "content/shared.js",
  "content/stores/generic.js",
  "content/index.js",
];
let whatsappOperation = null;
let initializationPromise = null;
let initializationRequested = false;

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
  const results = await Promise.allSettled([
    allowed ? chrome.action.enable(tabId) : chrome.action.disable(tabId),
    chrome.sidePanel.setOptions({ tabId, enabled: allowed }),
  ]);
  results.filter((result) => result.status === "rejected")
    .forEach((result) => runtime.reportError("tab-availability", result.reason));
}

async function closePanelIfDisallowed(tab) {
  if (!tab?.id || !tab?.windowId || await isAllowedUrl(tab.url)) return;
  if (typeof chrome.sidePanel.close === "function") {
    await chrome.sidePanel.close({ windowId: tab.windowId }).catch(() => {});
  }
}

async function refreshAllTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map((tab) => updateTabAvailability(tab.id, tab.url)));
}

function validDynamicHost(value) {
  const host = String(value || "").trim().toLowerCase().replace(/^www\./, "");
  return /^(?:[a-z0-9-]+\.)+[a-z0-9-]{2,}$/.test(host) ? host : "";
}

async function syncDynamicContentScripts() {
  const { configuredOrigin, dynamicHosts } = await extensionConfig();
  const configuredHost = configuredOrigin ? new URL(configuredOrigin).hostname : "";
  const hosts = [...new Set([...dynamicHosts, configuredHost].map(validDynamicHost).filter(Boolean))]
    .filter((host) => !builtInAllowedHost(host) && !OFFICIAL_SITE_ORIGINS.has(`https://${host}`));
  await chrome.scripting.unregisterContentScripts({ ids: [DYNAMIC_CONTENT_SCRIPT_ID] }).catch(() => {});
  if (!hosts.length) return;
  await chrome.scripting.registerContentScripts([{
    id: DYNAMIC_CONTENT_SCRIPT_ID,
    matches: hosts.map((host) => `https://*.${host}/*`),
    js: STORE_CONTENT_FILES,
    runAt: "document_idle",
    persistAcrossSessions: true,
  }]);
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
  await runtime.waitForTabComplete(tab.id, 30000, "O WhatsApp Web demorou para carregar.");
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
  const couponUrl = "https://www.mercadolivre.com.br/cupons";
  const requestedLimit = Math.max(1, Math.min(100, Number(limit) || 5));
  const tabs = await chrome.tabs.query({});
  let tab = tabs
    .filter((item) => {
      try {
        const url = new URL(item.url || "");
        return /(?:^|\.)mercadolivre\.com\.br$/i.test(url.hostname) && /^\/cupons\/?$/i.test(url.pathname);
      } catch {
        return false;
      }
    })
    .sort((left, right) => Number(right.active) - Number(left.active) || (right.lastAccessed || 0) - (left.lastAccessed || 0))[0];

  if (tab?.id) {
    await chrome.windows.update(tab.windowId, { focused: true });
    tab = await chrome.tabs.update(tab.id, { active: true });
  } else {
    tab = await chrome.tabs.create({ url: couponUrl, active: true });
  }
  if (tab.status !== "complete") {
    await runtime.waitForTabComplete(tab.id, 45000, "A pagina de cupons demorou para carregar.");
  }
  await runtime.delay(450);
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content/coupons.js"] });
  const execution = chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (couponLimit) => {
      const automation = globalThis.__TABARATO_COUPON_AUTOMATION__;
      if (!automation?.activate) throw new Error("O automatizador de cupons nao foi carregado.");
      return automation.activate(couponLimit);
    },
    args: [requestedLimit],
  });
  const results = await runtime.withTimeout(
    execution,
    Math.max(45000, requestedLimit * 6000),
    "A ativacao de cupons demorou demais.",
  );
  const result = results?.[0]?.result;
  if (!result) throw new Error("A pagina de cupons nao retornou o resultado da ativacao.");
  return result;
}

chrome.action.disable().catch(() => {});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
chrome.action.onClicked.addListener((tab) => {
  if (!tab?.windowId) return;
  chrome.sidePanel.open({ windowId: tab.windowId })
    .catch((error) => runtime.reportError("action-open-panel", error));
});
async function initializeExtension() {
  await syncDynamicContentScripts();
  await refreshAllTabs();
}

function scheduleExtensionInitialization() {
  initializationRequested = true;
  if (initializationPromise) return initializationPromise;
  initializationPromise = (async () => {
    while (initializationRequested) {
      initializationRequested = false;
      await initializeExtension();
    }
  })().finally(() => {
    initializationPromise = null;
  });
  return initializationPromise;
}

chrome.runtime.onInstalled.addListener(() => scheduleExtensionInitialization().catch((error) => runtime.reportError("extension-installed", error)));
chrome.runtime.onStartup.addListener(() => scheduleExtensionInitialization().catch((error) => runtime.reportError("extension-startup", error)));
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
    scheduleExtensionInitialization().catch((error) => runtime.reportError("refresh-tabs", error));
  }
});

async function handleAllowedPage(message, sender) {
  const url = message.url || sender.tab?.url || "";
  const allowed = await isAllowedUrl(url);
  if (sender.tab?.id) await updateTabAvailability(sender.tab.id, url);
  return { ok: true, allowed };
}

function handleOpenPanel(_message, sender) {
  if (!sender.tab?.id || !sender.tab?.windowId) throw new Error("A aba ativa nao foi identificada.");
  return chrome.sidePanel.open({ windowId: sender.tab.windowId }).then(() => ({ ok: true }));
}

const MESSAGE_HANDLERS = {
  TABARATO_IS_ALLOWED_PAGE: handleAllowedPage,
  TABARATO_OPEN_PANEL: handleOpenPanel,
  TABARATO_SHARE_WHATSAPP: (message) => sendToWhatsApp(message),
  TABARATO_STOP_WHATSAPP: () => stopWhatsAppSend(),
  TABARATO_ACTIVATE_ML_COUPONS: (message) => activateMercadoLivreCoupons(message.limit),
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = MESSAGE_HANDLERS[message?.type];
  if (!handler) return false;
  try {
    Promise.resolve(handler(message, sender))
      .then((result) => sendResponse(result || { ok: true }))
      .catch((error) => {
        runtime.reportError(`message-${message.type}`, error);
        sendResponse({ ok: false, error: runtime.errorMessage(error) });
      });
  } catch (error) {
    runtime.reportError(`message-${message.type}`, error);
    sendResponse({ ok: false, error: runtime.errorMessage(error) });
  }
  return true;
});
