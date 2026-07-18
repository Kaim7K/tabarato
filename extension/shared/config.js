(() => {
  if (globalThis.TaBaratoConfig) return;

  const OFFICIAL_BASE_URL = "https://www.tabaratoofertas.shop";
  const OFFICIAL_SITE_ORIGINS = Object.freeze([
    OFFICIAL_BASE_URL,
    "https://tabaratoofertas.shop",
  ]);
  const LEGACY_SITE_ORIGINS = new Set([
    "https://tabaratoofertas.vercel.app",
  ]);

  function migrateBaseUrl(value = "") {
    const candidate = String(value || "").trim();
    if (!candidate) return OFFICIAL_BASE_URL;
    try {
      const origin = new URL(candidate).origin;
      if (LEGACY_SITE_ORIGINS.has(origin) || OFFICIAL_SITE_ORIGINS.includes(origin)) return OFFICIAL_BASE_URL;
      return origin;
    } catch {
      return OFFICIAL_BASE_URL;
    }
  }

  globalThis.TaBaratoConfig = Object.freeze({
    officialBaseUrl: OFFICIAL_BASE_URL,
    officialSiteOrigins: OFFICIAL_SITE_ORIGINS,
    migrateBaseUrl,
  });
})();
