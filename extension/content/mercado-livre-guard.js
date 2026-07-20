(() => {
  const STORAGE_KEY = "tabarato_affiliate_return_url";
  const isAffiliateHome = () => /^\/afiliados-home(?:\/|$)/i.test(location.pathname);
  if (!isAffiliateHome()) return;

  let guard = null;
  try {
    guard = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    guard = null;
  }
  sessionStorage.removeItem(STORAGE_KEY);

  const returnUrl = String(guard?.url || "");
  const expiresAt = Number(guard?.expiresAt || 0);
  if (!returnUrl || expiresAt <= Date.now() || !/\bMLB-?\d{6,}\b/i.test(returnUrl)) return;

  try { window.stop(); } catch { /* The document may not have started loading yet. */ }
  location.replace(returnUrl);
})();
