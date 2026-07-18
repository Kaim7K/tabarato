(() => {
  if (globalThis.__TABARATO_BACKGROUND_MAIN__) return;
  globalThis.__TABARATO_BACKGROUND_MAIN__ = true;

  const api = globalThis.TaBaratoExtensionApi;
  const runtime = globalThis.TaBaratoRuntime;
  const access = globalThis.TaBaratoBackgroundAccess;
  const whatsapp = globalThis.TaBaratoBackgroundWhatsApp;
  const coupons = globalThis.TaBaratoBackgroundCoupons;

  async function openPanel(tab) {
    if (!tab?.id || !tab?.windowId || !await access.isAllowedUrl(tab.url)) {
      throw new Error("Abra uma pagina permitida antes de usar a extensao.");
    }
    if (api.sidePanel?.open) {
      try {
        await api.sidePanel.open({ windowId: tab.windowId });
        return { mode: "side-panel" };
      } catch (error) {
        runtime.reportError("open-side-panel", error);
      }
    }
    if (api.sidebarAction?.open) {
      try {
        await api.sidebarAction.open();
        return { mode: "sidebar" };
      } catch (error) {
        runtime.reportError("open-sidebar", error);
      }
    }
    const url = api.runtime.getURL("sidepanel/index.html");
    const existing = (await api.tabs.query({ url }))[0];
    if (existing?.id) {
      if (api.windows?.update && existing.windowId) await api.windows.update(existing.windowId, { focused: true });
      await api.tabs.update(existing.id, { active: true });
    } else {
      await api.tabs.create({ url, active: true, ...(tab.windowId ? { windowId: tab.windowId } : {}) });
    }
    return { mode: "tab" };
  }

  Promise.resolve(api.action?.disable?.()).catch(() => {});
  Promise.resolve(api.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true })).catch(() => {});

  api.runtime.onInstalled.addListener(() => {
    access.scheduleInitialization().catch((error) => runtime.reportError("extension-installed", error));
  });

  api.runtime.onStartup?.addListener(() => {
    access.scheduleInitialization().catch((error) => runtime.reportError("extension-startup", error));
  });

  api.action?.onClicked.addListener((tab) => {
    openPanel(tab).catch((error) => runtime.reportError("action-open-panel", error));
  });

  api.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo.url && changeInfo.status !== "complete") return;
    const updated = { ...tab, id: tabId, url: changeInfo.url || tab.url };
    access.updateTab(tabId, updated.url).catch((error) => runtime.reportError("tab-availability", error));
    if (updated.active) access.closePanelIfDisallowed(updated).catch(() => {});
  });

  api.tabs.onActivated.addListener(({ tabId }) => {
    api.tabs.get(tabId).then(async (tab) => {
      await access.updateTab(tabId, tab.url);
      await access.closePanelIfDisallowed(tab);
    }).catch(() => {});
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && access.STORAGE_KEYS.some((key) => changes[key])) {
      access.invalidate().catch((error) => runtime.reportError("refresh-tabs", error));
    }
  });

  api.debugger?.onDetach?.addListener(coupons.handleDebuggerDetach);

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

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "TABARATO_OPEN_PANEL") {
      if (!sender.tab?.id || !sender.tab?.windowId) {
        sendResponse({ ok: false, error: "A aba ativa nao foi identificada." });
        return false;
      }
      openPanel(sender.tab)
        .then(async (result) => {
          await access.updateTab(sender.tab.id, sender.tab.url).catch(() => {});
          sendResponse({ ok: true, ...result });
        })
        .catch((error) => {
          const text = runtime.errorMessage(error);
          const requiresActionClick = /user gesture|gesto do usuario|user action/i.test(text);
          if (!requiresActionClick) runtime.reportError("message-TABARATO_OPEN_PANEL", error);
          sendResponse({
            ok: false,
            requiresActionClick,
            error: requiresActionClick ? "Clique no icone da extensao para abrir o painel." : text,
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
})();
