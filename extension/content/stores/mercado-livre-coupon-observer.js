(() => {
  const MARKER = "data-tabarato-coupon-candidates";
  const ROUTE_PATTERN = /coupon|cupon|promotion|promoc|benefit|discount|voucher/i;
  const CODE_PATTERN = /\bCUPOM[A-Z0-9_-]{3,25}\b/gi;
  const candidates = [];

  const publishCodes = (value, source = "") => {
    const text = String(value || "");
    if (!text) return;
    const discovered = [...text.matchAll(CODE_PATTERN)];
    for (const match of discovered) {
      const code = match[0].toUpperCase();
      const start = Math.max(0, match.index - 180);
      const end = Math.min(text.length, match.index + code.length + 180);
      const context = text.slice(start, end).replace(/\s+/g, " ").slice(0, 380);
      const existing = candidates.find((candidate) => candidate.code === code);
      if (existing) {
        existing.context = context || existing.context;
        existing.source = source || existing.source;
        existing.seenAt = Date.now();
      } else {
        candidates.push({ code, context, source, seenAt: Date.now() });
      }
    }
    if (!discovered.length || !document.documentElement) return;
    document.documentElement.setAttribute(MARKER, JSON.stringify(candidates.slice(-20)));
  };

  const inspectResponse = (response) => {
    try {
      const url = response?.url || "";
      if (!ROUTE_PATTERN.test(url)) return;
      const contentType = response.headers?.get("content-type") || "";
      if (!/json|text|javascript/i.test(contentType)) return;
      response.clone().text().then((text) => publishCodes(text, url)).catch(() => {});
    } catch { /* The original store response must never be affected. */ }
  };

  const nativeFetch = window.fetch;
  window.fetch = async function observedFetch(...args) {
    const response = await nativeFetch.apply(this, args);
    inspectResponse(response);
    return response;
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  const nativeSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function observedOpen(method, url, ...args) {
    this.__tabaratoCouponUrl = String(url || "");
    return nativeOpen.call(this, method, url, ...args);
  };
  XMLHttpRequest.prototype.send = function observedSend(...args) {
    if (ROUTE_PATTERN.test(this.__tabaratoCouponUrl || "")) {
      this.addEventListener("loadend", () => {
        try {
          const value = this.responseType === "json" ? JSON.stringify(this.response) : this.responseText;
          publishCodes(value, this.__tabaratoCouponUrl);
        } catch { /* Ignore opaque responses. */ }
      }, { once: true });
    }
    return nativeSend.apply(this, args);
  };

  const scanPageState = () => {
    document.querySelectorAll("script").forEach((script) => publishCodes(script.textContent, "page-state"));
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scanPageState, { once: true });
  } else {
    scanPageState();
  }
})();
