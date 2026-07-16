import { useEffect } from "react";

const DEFAULT_DESCRIPTION = "Tá Barato — ofertas úteis selecionadas para você comprar melhor, com achados no Telegram e WhatsApp.";

function setMeta(selector, value, attribute = "name") {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement("meta");
    const match = selector.match(/="([^"]+)"/);
    element.setAttribute(attribute, match?.[1] || "");
    document.head.appendChild(element);
  }
  if (element) element.setAttribute("content", value);
}

export function useDocumentMetadata(title, description = DEFAULT_DESCRIPTION, robots = "index, follow") {
  useEffect(() => {
    document.title = title;
    setMeta('meta[name="description"]', description);
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
    setMeta('meta[name="robots"]', robots);
  }, [description, robots, title]);
}
