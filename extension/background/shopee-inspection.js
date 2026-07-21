(() => {
  if (globalThis.TaBaratoShopeeInspection) return;
  const runtime = globalThis.TaBaratoRuntime;
  async function inspectShopeeCandidates(candidates = []) {
  const ordered = [...candidates]
    .filter((item) => item?.url && /^https:\/\/(?:www\.)?shopee\.com\.br\//i.test(item.url))
    .sort((a, b) => Number(a.price || 0) - Number(b.price || 0) || Number(b.sales || 0) - Number(a.sales || 0))
    .slice(0, 8);
  const inspected = [];
  for (const candidate of ordered) {
    let tab;
    try {
      tab = await chrome.tabs.create({ url: candidate.url, active: false });
      const started = Date.now();
      while (Date.now() - started < 30000) {
        const current = await chrome.tabs.get(tab.id).catch(() => null);
        if (current?.status === "complete") break;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      const [{ result } = {}] = await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [0] },
        func: () => {
          const clean = (value = "") => String(value).replace(/\s+/g, " ").trim();
          const body = clean(document.body?.innerText || "");
          const title = clean(document.querySelector("[data-testid='pdp-product-title'], main h1, h1")?.textContent || "");
          const ratingCandidates = [
            ...document.querySelectorAll("[aria-label*='estrela' i], [aria-label*='star' i], [class*='rating' i], [data-testid*='rating' i]"),
          ].map((element) => clean(`${element.getAttribute?.("aria-label") || ""} ${element.textContent || ""}`));
          const ratingText = `${ratingCandidates.join(" ")} ${body.slice(0, 2500)}`;
          const ratingMatch = ratingText.match(/(?:^|\s)([0-5](?:[.,]\d{1,2})?)(?=\s*(?:de\s*5|estrelas?|avalia(?:cao|ções)|\u2b50))/i)
            || ratingText.match(/(?:nota|rating)\s*[:]?\s*([0-5](?:[.,]\d{1,2})?)/i);
          const rating = ratingMatch ? Number(ratingMatch[1].replace(",", ".")) : 0;
          const priceMatches = [...body.matchAll(/R\$\s*([\d.]+(?:,\d{1,2})?)/g)]
            .map((match) => Number(match[1].replace(/\./g, "").replace(",", ".")))
            .filter((value) => Number.isFinite(value) && value > 0);
          const currentPrice = priceMatches.length ? Math.min(...priceMatches.filter((value) => value < 10000000)) : 0;
          const oldCandidates = [...document.querySelectorAll("del, s, [style*='line-through'], [class*='original-price' i], [class*='price-before' i]")]
            .map((element) => clean(element.textContent).match(/R\$\s*([\d.]+(?:,\d{1,2})?)/))
            .filter(Boolean)
            .map((match) => Number(match[1].replace(/\./g, "").replace(",", ".")))
            .filter((value) => Number.isFinite(value) && value > currentPrice);
          const previousPrice = oldCandidates.length ? Math.min(...oldCandidates) : 0;
          const installment = body.match(/\b\d{1,2}x\s+(?:de\s+)?R\$\s*[\d.,]+\s+sem\s+juros\b/i)?.[0] || "";
          const pix = /(?:pre[cç]o|valor)?\s*(?:no\s+)?pix|\bno pix\b/i.test(body);
          const canonical = document.querySelector("link[rel='canonical']")?.href || location.href.split("?")[0];
          const image = document.querySelector("main img[src*='susercontent.com'], main img[src*='shopeeusercontent.com']")?.currentSrc || "";
          return { title, rating, currentPrice, previousPrice, installment: clean(installment), pix, url: canonical, image };
        },
      });
      const item = { ...candidate, ...(result || {}) };
      inspected.push(item);
      if (item.rating >= 4 && item.rating <= 5) return { ok: true, selected: item, inspected };
    } catch (error) {
      inspected.push({ ...candidate, error: runtime.errorMessage(error) });
    } finally {
      if (tab?.id) await chrome.tabs.remove(tab.id).catch(() => {});
    }
  }
  return { ok: false, selected: null, inspected, error: "Nenhum produto com nota entre 4 e 5 foi confirmado." };
}

  globalThis.TaBaratoShopeeInspection = { inspectShopeeCandidates };
})();
