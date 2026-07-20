(() => {
  if (!/^\/cupons\/pdp(?:\/|$)/i.test(location.pathname)) return;
  if (globalThis.__TABARATO_COUPON_FRAME_CAPTURE__) {
    globalThis.__TABARATO_COUPON_FRAME_PUBLISH__?.(true);
    return;
  }
  globalThis.__TABARATO_COUPON_FRAME_CAPTURE__ = true;

  const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
  const normalize = (value = "") => clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const frameUrl = location.href;
  const itemId = new URL(frameUrl).searchParams.get("item_id") || "";
  const frameInstanceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let lastPayload = "";
  let observer = null;
  let timeoutId = 0;

  function unavailableCard(card) {
    if (!card) return false;
    const text = normalize(card.innerText || card.textContent || "");
    const className = String(card.className || "");
    return card.getAttribute?.("aria-disabled") === "true"
      || /(?:^|\s)(?:disabled|inactive|unavailable)(?:\s|$)/i.test(className)
      || /indisponivel|esgotado|encerrado|use este na proxima compra|ja aplicou um cupom melhor/.test(text);
  }

  function readState() {
    const elements = [...document.querySelectorAll(".smart-coupon-special__category-text")]
      .filter((element) => element?.isConnected)
      .map((element) => ({
        element,
        raw: clean(element.textContent || ""),
      }))
      .filter(({ raw }) => Boolean(raw));

    let hasRelevantCoupon = false;

    for (const { element, raw } of elements) {
      const card = element.closest(".smart-coupon-special");
      if (unavailableCard(card)) continue;
      hasRelevantCoupon = true;
      if (!/^com\s+/i.test(raw)) continue;

      const code = clean(raw.replace(/^com\s+/i, ""));
      if (/^[A-Z0-9_-]{3,40}$/i.test(code)) {
        return { status: "code", code: code.toUpperCase() };
      }
    }

    const bodyText = normalize(document.body?.innerText || document.body?.textContent || "");
    if (/nenhum cupom|sem cupons disponiveis|nao encontramos cupons/.test(bodyText)) {
      return { status: "none", code: "" };
    }

    if (hasRelevantCoupon) {
      return { status: "available-without-code", code: "" };
    }

    return { status: "pending", code: "" };
  }

  function publish(force = false) {
    const state = readState();
    const serialized = JSON.stringify(state);
    if (!force && serialized === lastPayload) return state;
    lastPayload = serialized;

    chrome.runtime.sendMessage({
      type: "TABARATO_COUPON_FRAME_STATE",
      ...state,
      frameUrl,
      itemId,
      frameInstanceId,
    }).catch(() => {});

    return state;
  }

  globalThis.__TABARATO_COUPON_FRAME_PUBLISH__ = publish;

  function start() {
    publish(true);
    observer = new MutationObserver(() => publish());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "aria-disabled"],
    });

    timeoutId = window.setInterval(() => publish(), 400);
    window.setTimeout(() => {
      window.clearInterval(timeoutId);
      observer?.disconnect();
    }, 20000);
  }

  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
