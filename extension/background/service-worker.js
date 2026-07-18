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
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

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
  TABARATO_SHARE_WHATSAPP: (message) => whatsapp.send(message),
  TABARATO_STOP_WHATSAPP: () => whatsapp.stop(),
  TABARATO_ACTIVATE_ML_COUPONS: (message) => coupons.activate(message.limit),
  TABARATO_STOP_ML_COUPONS: () => coupons.stop(),
  TABARATO_COUPON_CLICK: (message, sender) => coupons.trustedClick(message, sender),
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "TABARATO_OPEN_PANEL") {
    if (!sender.tab?.id || !sender.tab?.windowId) {
      sendResponse({ ok: false, error: "A aba ativa nao foi identificada." });
      return false;
    }
    chrome.sidePanel.open({ windowId: sender.tab.windowId })
      .then(async () => {
        await access.updateTab(sender.tab.id, sender.tab.url).catch(() => {});
        sendResponse({ ok: true });
      })
      .catch((error) => {
        const message = runtime.errorMessage(error);
        if (!/user gesture|gesto do usuario/i.test(message)) {
          runtime.reportError("message-TABARATO_OPEN_PANEL", error);
        }
        sendResponse({
          ok: false,
          requiresActionClick: /user gesture|gesto do usuario/i.test(message),
          error: /user gesture|gesto do usuario/i.test(message)
            ? "Clique no icone da extensao para abrir o painel lateral."
            : message,
        });
      });
    return true;
  }

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
