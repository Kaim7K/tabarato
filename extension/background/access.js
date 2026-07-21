(() => {
  if (globalThis.TaBaratoBackgroundAccess) return;

  const runtime = globalThis.TaBaratoRuntime;
  const brandConfig = globalThis.TaBaratoConfig;
  const STORAGE_KEYS = [
    "tabarato_extension_session",
    "tabarato_last_base_url",
    "tabarato_connected_store_hosts",
  ];
  const CORE_STORE_HOSTS = ["mercadolivre.com.br", "mercadolibre.com", "shopee.com.br"];
  const OFFICIAL_SITE_ORIGINS = new Set(brandConfig.officialSiteOrigins);
  const DYNAMIC_CONTENT_SCRIPT_ID = "tabarato-connected-stores";
  const STORE_CONTENT_FILES = [
    "shared/runtime.js",
    "shared/page-context.js",
    "shared/coupon-code.js",
    "content/shared.js",
    "content/stores/generic.js",
    "content/index.js",
  ];
  let configCache = null;
  let initializationPromise = null;
  let initializationRequested = false;

  const hostMatches = (hostname, host) => hostname === host || hostname.endsWith(`.${host}`);
  const builtInAllowedHost = (hostname) => hostname === "web.whatsapp.com"
    || CORE_STORE_HOSTS.some((host) => hostMatches(hostname, host));

  async function config() {
    if (configCache) return configCache;
    const stored = await chrome.storage.local.get(STORAGE_KEYS);
    const dynamicHosts = Array.isArray(stored.tabarato_connected_store_hosts)
      ? stored.tabarato_connected_store_hosts.map(String).filter(Boolean)
      : [];
    const candidate = stored.tabarato_extension_session?.baseUrl || stored.tabarato_last_base_url || "";
    let configuredOrigin = "";
    try {
      configuredOrigin = new URL(candidate).origin;
    } catch { /* An invalid saved origin is ignored and migrated during initialization. */ }
    configCache = { configuredOrigin, dynamicHosts };
    return configCache;
  }

  async function migrateStoredBaseUrl() {
    const stored = await chrome.storage.local.get(["tabarato_extension_session", "tabarato_last_base_url"]);
    const updates = {};
    const session = stored.tabarato_extension_session;
    if (session?.baseUrl) {
      const baseUrl = brandConfig.migrateBaseUrl(session.baseUrl);
      if (baseUrl !== session.baseUrl) updates.tabarato_extension_session = { ...session, baseUrl };
    }
    const lastBaseUrl = brandConfig.migrateBaseUrl(stored.tabarato_last_base_url);
    if (lastBaseUrl !== stored.tabarato_last_base_url) updates.tabarato_last_base_url = lastBaseUrl;
    if (!Object.keys(updates).length) return;
    await chrome.storage.local.set(updates);
    configCache = null;
  }

  async function isAllowedUrl(value = "") {
    try {
      const target = new URL(value);
      if (!/^https?:$/.test(target.protocol)) return false;
      const { configuredOrigin, dynamicHosts } = await config();
      return builtInAllowedHost(target.hostname)
        || OFFICIAL_SITE_ORIGINS.has(target.origin)
        || target.origin === configuredOrigin
        || dynamicHosts.some((host) => hostMatches(target.hostname, host));
    } catch {
      return false;
    }
  }

  async function updateTab(tabId, url = "") {
    if (!tabId) return false;
    const allowed = await isAllowedUrl(url);
    const results = await Promise.allSettled([
      allowed ? chrome.action.enable(tabId) : chrome.action.disable(tabId),
      chrome.sidePanel.setOptions({ tabId, enabled: allowed, path: "sidepanel/index.html" }),
    ]);
    results.filter((result) => result.status === "rejected")
      .forEach((result) => runtime.reportError("tab-availability", result.reason));
    return allowed;
  }

  async function closePanelIfDisallowed(tab) {
    if (!tab?.id || !tab?.windowId || await isAllowedUrl(tab.url)) return;
    if (typeof chrome.sidePanel?.close !== "function") return;
    await chrome.sidePanel.close({ windowId: tab.windowId }).catch((error) => runtime.reportError("close-side-panel", error));
  }

  const validDynamicHost = (value) => {
    const host = String(value || "").trim().toLowerCase().replace(/^www\./, "");
    return /^(?:[a-z0-9-]+\.)+[a-z0-9-]{2,}$/.test(host) ? host : "";
  };

  async function synchronizeContentScripts() {
    const { configuredOrigin, dynamicHosts } = await config();
    const configuredHost = configuredOrigin ? new URL(configuredOrigin).hostname : "";
    const hosts = [...new Set([...dynamicHosts, configuredHost].map(validDynamicHost).filter(Boolean))]
      .filter((host) => !builtInAllowedHost(host) && !OFFICIAL_SITE_ORIGINS.has(`https://${host}`));
    await chrome.scripting.unregisterContentScripts({ ids: [DYNAMIC_CONTENT_SCRIPT_ID] }).catch(() => {});
    if (!hosts.length) return;
    await chrome.scripting.registerContentScripts([{
      id: DYNAMIC_CONTENT_SCRIPT_ID,
      matches: hosts.flatMap((host) => [`https://${host}/*`, `https://*.${host}/*`]),
      js: STORE_CONTENT_FILES,
      runAt: "document_idle",
      persistAcrossSessions: true,
    }]);
  }

  async function refreshAllTabs() {
    const tabs = await chrome.tabs.query({});
    const chunkSize = 20;
    for (let index = 0; index < tabs.length; index += chunkSize) {
      await Promise.all(tabs.slice(index, index + chunkSize).map((tab) => updateTab(tab.id, tab.url)));
    }
  }

  async function initialize() {
    await migrateStoredBaseUrl();
    await synchronizeContentScripts();
    await refreshAllTabs();
  }

  function scheduleInitialization() {
    initializationRequested = true;
    if (initializationPromise) return initializationPromise;
    initializationPromise = (async () => {
      while (initializationRequested) {
        initializationRequested = false;
        await initialize();
      }
    })().finally(() => { initializationPromise = null; });
    return initializationPromise;
  }

  function invalidate() {
    configCache = null;
    return scheduleInitialization();
  }

  globalThis.TaBaratoBackgroundAccess = {
    STORAGE_KEYS,
    closePanelIfDisallowed,
    invalidate,
    isAllowedUrl,
    scheduleInitialization,
    updateTab,
  };
})();
