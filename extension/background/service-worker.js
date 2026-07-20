importScripts(
  "../shared/runtime.js",
  "../shared/config.js",
  "access.js",
  "navigation.js",
  "whatsapp.js",
  "operations.js",
  "coupons.js",
);

const runtime = globalThis.TaBaratoRuntime;
const access = globalThis.TaBaratoBackgroundAccess;
const navigation = globalThis.TaBaratoBackgroundNavigation;
const whatsapp = globalThis.TaBaratoBackgroundWhatsApp;
const operations = globalThis.TaBaratoBackgroundOperations;
const coupons = globalThis.TaBaratoBackgroundCoupons;
const CLEANUP_ALARM = "tabarato-operation-cleanup";
const COUPON_STATE_TTL = 30000;
const MAX_COUPON_STATE_TABS = 80;
const couponFrameStates = new Map();

function pruneCouponFrameStates(now = Date.now()) {
  for (const [tabId, state] of couponFrameStates) {
    if (!state?.updatedAt || now - state.updatedAt > COUPON_STATE_TTL) couponFrameStates.delete(tabId);
  }
  while (couponFrameStates.size > MAX_COUPON_STATE_TABS) {
    couponFrameStates.delete(couponFrameStates.keys().next().value);
  }
}

function scheduleCleanupAlarm() {
  return chrome.alarms.create(CLEANUP_ALARM, { periodInMinutes: 1 });
}

chrome.action.disable().catch(() => {});
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onInstalled.addListener(() => {
  Promise.all([access.scheduleInitialization(), scheduleCleanupAlarm()])
    .catch((error) => runtime.reportError("extension-installed", error));
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
  navigation.handleUpdated(tabId, updated.url).then((blocked) => {
    if (blocked) return;
    access.updateTab(tabId, updated.url).catch((error) => runtime.reportError("tab-availability", error));
    if (updated.active) access.closePanelIfDisallowed(updated).catch(() => {});
    coupons.handleTabUpdated(tabId, changeInfo, updated).catch((error) => runtime.reportError("coupon-tab-update", error));
  }).catch((error) => runtime.reportError("affiliate-navigation-guard", error));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  couponFrameStates.delete(tabId);
  navigation.handleRemoved(tabId).catch(() => {});
  operations.untrack([tabId]).catch(() => {});
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

chrome.alarms.onAlarm.addListener((alarm) => {
  if (navigation.handleAlarm(alarm.name)) return;
  if (alarm.name === CLEANUP_ALARM) operations.cleanupStale().catch((error) => runtime.reportError("cleanup-stale-operations", error));
});

const handlers = {
  TABARATO_IS_ALLOWED_PAGE: async (message, sender) => {
    const url = message.url || sender.tab?.url || "";
    const allowed = await access.isAllowedUrl(url);
    if (sender.tab?.id) await access.updateTab(sender.tab.id, url);
    return { ok: true, allowed };
  },
  TABARATO_COUPON_FRAME_STATE: (message, sender) => {
    const tabId = sender.tab?.id || null;
    let framePath = "";
    try { framePath = new URL(sender.url || message.frameUrl || "https://invalid.local").pathname; } catch {}
    if (!tabId || !/\/cupons\/pdp(?:\/|$)/i.test(framePath)) return { ok: false };
    const frameUrl = String(sender.url || message.frameUrl || "");
    let itemId = String(message.itemId || "").trim();
    if (!itemId) {
      try { itemId = new URL(frameUrl).searchParams.get("item_id") || ""; } catch {}
    }
    const state = {
      code: String(message.code || "").trim(),
      status: String(message.status || "pending"),
      updatedAt: Date.now(),
      frameId: sender.frameId ?? null,
      frameUrl,
      itemId,
      frameInstanceId: String(message.frameInstanceId || ""),
    };
    couponFrameStates.set(tabId, state);
    pruneCouponFrameStates(state.updatedAt);
    return { ok: true };
  },
  TABARATO_GET_COUPON_FRAME_STATE: (message, sender) => {
    const tabId = sender.tab?.id || null;
    pruneCouponFrameStates();
    const state = tabId ? couponFrameStates.get(tabId) : null;
    const expectedItemId = String(message?.itemId || "").trim();
    if (state && expectedItemId && state.itemId !== expectedItemId) {
      return { ok: true, state: null };
    }
    return { ok: true, state: state || null };
  },
  TABARATO_CLEAR_COUPON_FRAME_STATE: (_message, sender) => {
    const tabId = sender.tab?.id || null;
    if (tabId) couponFrameStates.delete(tabId);
    return { ok: true };
  },
  TABARATO_ENSURE_COUPON_FRAME_SCRIPT: async (_message, sender) => {
    const tabId = sender.tab?.id || null;
    if (!tabId) return { ok: false, error: "A aba do produto não foi identificada." };
    const results = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["content/coupon-frame.js"],
    }).catch(() => []);
    return { ok: true, injectedFrames: results.length };
  },
  TABARATO_PRODUCT_PATCH: async (message, sender) => {
    const tabId = sender.tab?.id || null;
    const patch = message?.patch && typeof message.patch === "object" ? message.patch : {};
    if (!tabId || !Object.keys(patch).length) return { ok: false, error: "A atualizacao do produto nao foi identificada." };
    await chrome.runtime.sendMessage({
      type: "TABARATO_PRODUCT_PATCH_BROADCAST",
      tabId,
      url: message.url || sender.tab?.url || "",
      patch,
    }).catch(() => {});
    return { ok: true };
  },
  TABARATO_START_AFFILIATE_GUARD: (message, sender) => navigation.start(sender.tab?.id, message.productUrl, message.ttl),
  TABARATO_STOP_AFFILIATE_GUARD: (_message, sender) => navigation.finish(sender.tab?.id),
  TABARATO_SHARE_WHATSAPP: (message) => whatsapp.send(message),
  TABARATO_STOP_WHATSAPP: () => whatsapp.stop(),
  TABARATO_BATCH_TRACK_WORKERS: (message) => operations.track(message.tabIds),
  TABARATO_BATCH_UNTRACK_WORKERS: (message) => operations.untrack(message.tabIds),
  TABARATO_BATCH_HEARTBEAT: (message) => operations.heartbeat(message.tabIds),
  TABARATO_STOP_BATCH_WORKERS: () => operations.stop(),
  TABARATO_ACTIVATE_ML_COUPONS: (message) => coupons.activate(message.limit),
  TABARATO_STOP_ML_COUPONS: () => coupons.stop(),
  TABARATO_COUPON_FILTER_RELOAD_PENDING: (message, sender) => coupons.markFilterReloadPending(message, sender),
  TABARATO_COUPON_STATUS: () => coupons.status(),
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

Promise.all([
  access.scheduleInitialization(),
  whatsapp.initialize(),
  operations.migrateLegacyLease(),
  operations.cleanupStale(),
  coupons.resumePersisted(),
  scheduleCleanupAlarm(),
]).catch((error) => runtime.reportError("extension-load", error));
