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
    const stored = await globalThis.TaBaratoExtensionApi.storage.local.get(STORAGE_KEYS);
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
    const stored = await globalThis.TaBaratoExtensionApi.storage.local.get(["tabarato_extension_session", "tabarato_last_base_url"]);
    const updates = {};
    const session = stored.tabarato_extension_session;
    if (session?.baseUrl) {
      const baseUrl = brandConfig.migrateBaseUrl(session.baseUrl);
      if (baseUrl !== session.baseUrl) updates.tabarato_extension_session = { ...session, baseUrl };
    }
    const lastBaseUrl = brandConfig.migrateBaseUrl(stored.tabarato_last_base_url);
    if (lastBaseUrl !== stored.tabarato_last_base_url) updates.tabarato_last_base_url = lastBaseUrl;
    if (!Object.keys(updates).length) return;
    await globalThis.TaBaratoExtensionApi.storage.local.set(updates);
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
    const tasks = [
      allowed ? globalThis.TaBaratoExtensionApi.action?.enable?.(tabId) : globalThis.TaBaratoExtensionApi.action?.disable?.(tabId),
    ];
    if (globalThis.TaBaratoExtensionApi.sidePanel?.setOptions) {
      tasks.push(globalThis.TaBaratoExtensionApi.sidePanel.setOptions({ tabId, enabled: allowed, path: "sidepanel/index.html" }));
    }
    const results = await Promise.allSettled(tasks.filter(Boolean));
    results.filter((result) => result.status === "rejected")
      .forEach((result) => runtime.reportError("tab-availability", result.reason));
    return allowed;
  }

  async function closePanelIfDisallowed(tab) {
    if (!tab?.id || !tab?.windowId || await isAllowedUrl(tab.url)) return;
    if (globalThis.TaBaratoExtensionApi.sidePanel?.close) {
      await globalThis.TaBaratoExtensionApi.sidePanel.close({ windowId: tab.windowId }).catch((error) => runtime.reportError("close-side-panel", error));
    }
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
    const scripting = globalThis.TaBaratoExtensionApi.scripting;
    if (!scripting?.registerContentScripts) return;
    await Promise.resolve(scripting.unregisterContentScripts?.({ ids: [DYNAMIC_CONTENT_SCRIPT_ID] })).catch(() => {});
    if (!hosts.length) return;
    const registration = {
      id: DYNAMIC_CONTENT_SCRIPT_ID,
      matches: hosts.map((host) => `https://*.${host}/*`),
      js: STORE_CONTENT_FILES,
      runAt: "document_idle",
    };
    try {
      await scripting.registerContentScripts([{ ...registration, persistAcrossSessions: true }]);
    } catch {
      await scripting.registerContentScripts([registration]);
    }
  }

  async function refreshAllTabs() {
    const tabs = await globalThis.TaBaratoExtensionApi.tabs.query({});
    await Promise.all(tabs.map((tab) => updateTab(tab.id, tab.url)));
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
