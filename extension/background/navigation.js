(() => {
  if (globalThis.TaBaratoBackgroundNavigation) return;

  const runtime = globalThis.TaBaratoRuntime;
  const guards = new Map();
  const DEFAULT_TTL = 30000;
  const RULE_BASE = 910000000;
  const ALARM_PREFIX = "tabarato-affiliate-guard-";
  const AFFILIATE_HOME_FILTER = "^https://([^/]+\\.)?(mercadolivre\\.com\\.br|mercadolibre\\.com)/afiliados-home([/?#].*)?$";

  function isMercadoLivreUrl(value = "") {
    try {
      const url = new URL(value);
      return /(?:^|\.)mercadolivre\.com\.br$/i.test(url.hostname)
        || /(?:^|\.)mercadolibre\.com$/i.test(url.hostname);
    } catch {
      return false;
    }
  }

  function isAffiliateHome(value = "") {
    try {
      const url = new URL(value);
      return isMercadoLivreUrl(url.href) && /^\/afiliados-home(?:\/|$)/i.test(url.pathname);
    } catch {
      return false;
    }
  }

  function isProductUrl(value = "") {
    return isMercadoLivreUrl(value) && /(?:^|[/?-])MLB-?\d{6,}(?:$|[/?#-])/i.test(value);
  }

  const ruleIdForTab = (tabId) => RULE_BASE + (Math.abs(Number(tabId)) % 100000000);
  const alarmNameForTab = (tabId) => `${ALARM_PREFIX}${Number(tabId)}`;

  async function removeInterception(tabId) {
    const id = Number(tabId);
    if (!Number.isInteger(id)) return;
    await Promise.all([
      chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleIdForTab(id)] }).catch(() => {}),
      chrome.alarms.clear(alarmNameForTab(id)).catch(() => false),
    ]);
  }

  async function installInterception(tabId, productUrl) {
    const id = Number(tabId);
    const ruleId = ruleIdForTab(id);
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
      addRules: [{
        id: ruleId,
        priority: 100,
        action: { type: "redirect", redirect: { url: String(productUrl) } },
        condition: {
          regexFilter: AFFILIATE_HOME_FILTER,
          resourceTypes: ["main_frame"],
          tabIds: [id],
        },
      }],
    });
  }

  function activeGuard(tabId) {
    const id = Number(tabId);
    const guard = guards.get(id);
    if (!guard) return null;
    if (guard.expiresAt <= Date.now()) {
      guards.delete(id);
      removeInterception(id).catch((error) => runtime.reportError("affiliate-guard-expire", error));
      return null;
    }
    return guard;
  }

  async function start(tabId, productUrl, ttl = DEFAULT_TTL) {
    const id = Number(tabId);
    if (!Number.isInteger(id) || !isProductUrl(productUrl)) {
      throw new Error("A pagina do produto nao foi identificada para proteger o link afiliado.");
    }
    const duration = Math.max(5000, Math.min(60000, Number(ttl) || DEFAULT_TTL));
    const guard = {
      productUrl: String(productUrl),
      expiresAt: Date.now() + duration,
      restoring: false,
    };
    await installInterception(id, guard.productUrl);
    guards.set(id, guard);
    await chrome.alarms.create(alarmNameForTab(id), { when: guard.expiresAt });
    return { ok: true, expiresAt: guard.expiresAt, intercepted: true };
  }

  async function finish(tabId) {
    const id = Number(tabId);
    const existed = guards.delete(id);
    await removeInterception(id);
    return { ok: true, existed };
  }

  async function handleUpdated(tabId, url = "") {
    const guard = activeGuard(tabId);
    if (!guard || !isAffiliateHome(url) || guard.restoring) return false;
    guard.restoring = true;
    try {
      await chrome.tabs.update(Number(tabId), { url: guard.productUrl });
      return true;
    } catch (error) {
      runtime.reportError("block-affiliate-home", error);
      return false;
    } finally {
      await finish(tabId);
    }
  }

  function handleRemoved(tabId) {
    return finish(tabId);
  }

  function handleAlarm(alarmName = "") {
    if (!String(alarmName).startsWith(ALARM_PREFIX)) return false;
    const tabId = Number(String(alarmName).slice(ALARM_PREFIX.length));
    if (!Number.isInteger(tabId)) return false;
    finish(tabId).catch((error) => runtime.reportError("affiliate-guard-alarm", error));
    return true;
  }

  globalThis.TaBaratoBackgroundNavigation = Object.freeze({
    finish,
    handleAlarm,
    handleRemoved,
    handleUpdated,
    isAffiliateHome,
    isProductUrl,
    start,
  });
})();
