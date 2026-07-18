(() => {
  if (globalThis.__TABARATO_COUPON_AUTOMATION__) return;
  globalThis.__TABARATO_COUPON_AUTOMATION__ = true;
  const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
  const normalized = (value = "") => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visible = (element) => { const rectangle = element?.getBoundingClientRect(); return Boolean(rectangle && rectangle.width > 0 && rectangle.height > 0 && !element.disabled); };
  const controls = () => [...document.querySelectorAll("button, [role='button'], a")].filter(visible);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function activateCoupons(limit) {
    const filter = controls().find((element) => /nao ativados|disponiveis|novos/.test(normalized(`${element.textContent} ${element.getAttribute("aria-label") || ""}`)));
    if (filter) { filter.click(); await wait(900); }
    let activated = 0;
    let unchangedRounds = 0;
    while (activated < limit && unchangedRounds < 4) {
      const target = controls().find((element) => {
        const label = normalized(`${element.textContent} ${element.getAttribute("aria-label") || ""}`);
        return /^(ativar|aplicar|resgatar)( cupom)?$/.test(label) && !/ativado|aplicado|resgatado/.test(label);
      });
      if (!target) {
        window.scrollBy({ top: Math.max(500, window.innerHeight * 0.75), behavior: "smooth" });
        unchangedRounds += 1;
        await wait(1000);
        continue;
      }
      unchangedRounds = 0;
      target.scrollIntoView({ block: "center" });
      target.click();
      activated += 1;
      await wait(700);
    }
    return { ok: true, activated, requested: limit };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "TABARATO_ACTIVATE_COUPONS") return;
    activateCoupons(Math.max(1, Math.min(100, Number(message.limit) || 5)))
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message || "Falha ao ativar cupons." }));
    return true;
  });
})();
