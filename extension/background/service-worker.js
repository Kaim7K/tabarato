importScripts(
  "../shared/runtime.js",
  "../shared/config.js",
  "access.js",
  "clipboard.js",
  "whatsapp.js",
  "coupons.js",
);

const runtime = globalThis.TaBaratoRuntime;
const access = globalThis.TaBaratoBackgroundAccess;
const whatsapp = globalThis.TaBaratoBackgroundWhatsApp;
const coupons = globalThis.TaBaratoBackgroundCoupons;

chrome.action.disable().catch(() => {});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

chrome.runtime.onInstalled.addListener(() => {
  access.scheduleInitialization().catch((error) => runtime.reportError("extension-installed", error));
});

chrome.runtime.onStartup.addListener(() => {
  access.scheduleInitialization().catch((error) => runtime.reportError("extension-startup", error));
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !tab?.windowId || !await access.isAllowedUrl(tab.url)) return;
  await chrome.sidePanel.open({ windowId: tab.windowId })
    .catch((error) => runtime.reportError("action-open-panel", error));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== "complete") return;
  const updated = { ...tab, id: tabId, url: changeInfo.url || tab.url };
  access.updateTab(tabId, updated.url).catch((error) => runtime.reportError("tab-availability", error));
  if (updated.active) access.closePanelIfDisallowed(updated).catch(() => {});
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId).then(async (tab) => {
    await access.updateTab(tabId, tab.url);
    await access.closePanelIfDisallowed(tab);
  }).catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && access.STORAGE_KEYS.some((key) => changes[key])) {
    access.invalidate().catch((error) => runtime.reportError("refresh-tabs", error));
  }
});

chrome.debugger.onDetach.addListener(coupons.handleDebuggerDetach);

const handlers = {
  TABARATO_IS_ALLOWED_PAGE: async (message, sender) => {
    const url = message.url || sender.tab?.url || "";
    const allowed = await access.isAllowedUrl(url);
    if (sender.tab?.id) await access.updateTab(sender.tab.id, url);
    return { ok: true, allowed };
  },
  TABARATO_OPEN_PANEL: async (_message, sender) => {
    if (!sender.tab?.id || !sender.tab?.windowId || !await access.isAllowedUrl(sender.tab.url)) {
      throw new Error("A aba ativa nao e permitida pelo Ta Barato.");
    }
    await chrome.sidePanel.open({ windowId: sender.tab.windowId });
    return { ok: true };
  },
  TABARATO_SHARE_WHATSAPP: (message) => whatsapp.send(message),
  TABARATO_STOP_WHATSAPP: () => whatsapp.stop(),
  TABARATO_ACTIVATE_ML_COUPONS: (message) => coupons.activate(message.limit),
  TABARATO_STOP_ML_COUPONS: () => coupons.stop(),
  TABARATO_COUPON_CLICK: (message, sender) => coupons.trustedClick(message, sender),
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler) return false;
  Promise.resolve()
    .then(() => handler(message, sender))
    .then((result) => sendResponse(result || { ok: true }))
    .catch((error) => {
      runtime.reportError(`message-${message.type}`, error);
      sendResponse({ ok: false, error: runtime.errorMessage(error) });
    });
  return true;
});

access.scheduleInitialization().catch((error) => runtime.reportError("extension-load", error));
