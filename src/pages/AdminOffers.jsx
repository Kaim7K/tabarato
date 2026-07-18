import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardList, FolderKanban, LayoutDashboard, MessageSquareText, Plus } from "lucide-react";
import { DEFAULT_CATEGORIES, normalizeText } from "@/lib/catalog";
import { telegramOffersApi, telegramStatuses } from "@/lib/telegramOffersApi";
import { AdminHeader, AdminNavButton, AdminQuickLine } from "@/features/admin/AdminUi";
import { number, statusLabels } from "@/features/admin/adminOfferConfig";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";

const Dashboard = lazy(() => import("@/features/admin/AdminDashboard").then((module) => ({ default: module.Dashboard })));
const OffersView = lazy(() => import("@/features/admin/AdminOffersView").then((module) => ({ default: module.OffersView })));
const EditorView = lazy(() => import("@/features/admin/AdminEditorView").then((module) => ({ default: module.EditorView })));
const MessagesView = lazy(() => import("@/features/admin/AdminContentViews").then((module) => ({ default: module.MessagesView })));
const CategoriesView = lazy(() => import("@/features/admin/AdminContentViews").then((module) => ({ default: module.CategoriesView })));

const CUSTOM_CATEGORIES_KEY = "tb_admin_custom_categories";
const OFFER_FILTERS_KEY = "tb_admin_offer_filters";

const loadOfferFilters = () => {
  try {
    return JSON.parse(sessionStorage.getItem(OFFER_FILTERS_KEY) || "{}");
  } catch {
    return {};
  }
};

const emptyOffer = {
  productName: "",
  shortDescription: "",
  currentPrice: "",
  previousPrice: "",
  coupon: "",
  couponDiscountPercent: 0,
  category: "Tecnologia",
  imageUrl: "",
  affiliateLink: "",
  sourceProductId: "",
  platform: "Mercado Livre",
  extraText: "",
  status: "RASCUNHO",
  scheduledAt: "",
};

const emptyAutoMessage = {
  title: "",
  message: "",
  channel: "TELEGRAM",
  imageUrl: "",
  whatsappGroup: "",
  isActive: true,
  intervalMinutes: 1440,
  sortOrder: 0,
  nextSendAt: "",
};

const toDatetimeLocal = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const fromDatetimeLocal = (value) => (value ? new Date(value).toISOString() : "");

const normalizeFormPrice = (value = "") => {
  const raw = String(value).replace(/[^\d.,]/g, "");
  if (!raw) return "";
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const decimalIndex = Math.max(lastComma, lastDot);
  if (decimalIndex === -1) return raw;
  const decimals = raw.slice(decimalIndex + 1);
  const integer = raw.slice(0, decimalIndex).replace(/[.,]/g, "");
  if (decimals.length === 2) return `${integer}.${decimals}`;
  return `${integer}${decimals}`;
};

const suggestCategory = (product = {}, available = []) => {
  const text = normalizeText(`${product.productName || ""} ${product.shortDescription || ""}`);
  const rules = [
    { category: "Tecnologia", words: ["fone", "celular", "smartphone", "notebook", "computador", "mouse", "teclado", "monitor"] },
    { category: "Cozinha", words: ["panela", "air fryer", "cafeteira", "liquidificador", "cozinha"] },
    { category: "Ferramentas", words: ["furadeira", "parafusadeira", "ferramenta", "serra", "chave"] },
    { category: "Casa e organização", words: ["organizador", "casa", "armario", "prateleira", "limpeza"] },
    { category: "Beleza e cuidados", words: ["beleza", "perfume", "cabelo", "barbeador", "maquiagem"] },
    { category: "Escritório", words: ["escritorio", "cadeira", "mesa", "papel", "caneta"] },
  ];
  return rules.find((rule) => available.includes(rule.category) && rule.words.some((word) => text.includes(word)))?.category || "";
};

const loadCustomCategories = () => {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_CATEGORIES_KEY) || "[]");
  } catch {
    return [];
  }
};

const browserCaptureScript = `(() => {
  const clean = (value = "") => String(value).replace(/\\s+/g, " ").trim();
  const meta = (key) => clean(document.querySelector(\`meta[property="\${key}"],meta[name="\${key}"]\`)?.content || "");
  const text = (...selectors) => {
    for (const selector of selectors) {
      const value = clean(document.querySelector(selector)?.innerText || document.querySelector(selector)?.textContent || "");
      if (value) return value;
    }
    return "";
  };
  const normalizePrice = (value = "") => {
    const raw = clean(value).replace(/[^\\d,.]/g, "");
    if (!raw) return "";
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    const decimalIndex = Math.max(lastComma, lastDot);
    if (decimalIndex === -1) return raw;
    const decimals = raw.slice(decimalIndex + 1);
    const integer = raw.slice(0, decimalIndex).replace(/[.,]/g, "");
    if (decimals.length === 2) return \`\${integer}.\${decimals}\`;
    return \`\${integer}\${decimals}\`;
  };
  const money = (...selectors) => {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const fraction = clean(el.querySelector(".andes-money-amount__fraction")?.textContent || "");
      const cents = clean(el.querySelector(".andes-money-amount__cents")?.textContent || "");
      const value = fraction ? \`\${fraction}\${cents ? "," + cents : ""}\` : clean(el.textContent || "");
      const price = normalizePrice(value);
      if (price) return price;
    }
    return "";
  };
  const bestImage = () => {
    const fromMeta = meta("og:image") || meta("twitter:image");
    if (fromMeta) return fromMeta;
    const selectors = [
      ".ui-pdp-gallery__figure img",
      ".ui-pdp-image",
      "img[data-zoom]",
      "img[src*='mlstatic']",
      "main img",
    ];
    for (const selector of selectors) {
      const img = [...document.querySelectorAll(selector)].find((item) => item.currentSrc || item.src);
      if (img) return img.currentSrc || img.src;
    }
    return [...document.images]
      .filter((img) => img.currentSrc || img.src)
      .sort((a, b) => ((b.naturalWidth || 0) * (b.naturalHeight || 0)) - ((a.naturalWidth || 0) * (a.naturalHeight || 0)))[0]?.currentSrc || "";
  };
  const host = location.hostname.replace(/^www\\./, "");
  const platform = host.includes("mercadolivre") || host.includes("mercadolibre")
    ? "Mercado Livre"
    : host.includes("shopee")
      ? "Shopee"
      : host.includes("amazon")
        ? "Amazon"
        : "Outra";
  const product = {
    productName: text(".ui-pdp-title", "h1[data-testid='product-title']", "h1") || meta("og:title") || document.title,
    shortDescription: text(".ui-pdp-description__content", "[data-testid='product-description']", "#productDescription", ".product-description") || meta("og:description") || meta("description"),
    currentPrice: money(".ui-pdp-price__second-line .andes-money-amount", "[data-testid='price-part'] .andes-money-amount", ".andes-money-amount") || normalizePrice(meta("product:price:amount")),
    previousPrice: money(".ui-pdp-price__original-value .andes-money-amount", ".andes-money-amount--previous", ".price-tag__old-price"),
    imageUrl: bestImage(),
    affiliateLink: location.href,
    sourceProductId: location.href.match(/\b(MLB-?\d{6,})\b/i)?.[1]?.replace("-", "").toUpperCase()
      || location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase()
      || (location.pathname.match(/-i\.(\d+)\.(\d+)/i)?.slice(1).join("."))
      || "",
    platform,
  };
  const output = JSON.stringify(product, null, 2);
  window.__TABARATO_PRODUCT__ = output;
  try {
    if (typeof copy === "function") {
      copy(output);
      console.log("Dados copiados para a area de transferencia:", product);
      return;
    }
  } catch (error) {
    console.log("A copia automatica foi bloqueada pelo navegador da loja.");
  }
  console.log("Copie o JSON abaixo e cole no botao Importar captura do painel:");
  console.log(output);
  try {
    const box = document.createElement("textarea");
    box.value = output;
    box.setAttribute("readonly", "readonly");
    box.style.position = "fixed";
    box.style.left = "16px";
    box.style.bottom = "16px";
    box.style.zIndex = "2147483647";
    box.style.width = "420px";
    box.style.height = "180px";
    box.style.padding = "12px";
    box.style.background = "#111";
    box.style.color = "#fff";
    box.style.border = "2px solid #ff6b35";
    document.body.appendChild(box);
    box.focus();
    box.select();
    console.log("Tambem deixei uma caixa na pagina com o JSON selecionado para copiar.");
  } catch (error) {
    console.log("Nao consegui criar a caixa visual. Use o JSON impresso acima.");
  }
})();`;

export default function AdminOffers() {
  useDocumentMetadata("Painel administrativo | Tá Barato", undefined, "noindex, nofollow");
  const [offers, setOffers] = useState([]);
  const [siteMetrics, setSiteMetrics] = useState({ uniqueVisitors: 0, visits: 0, realClicks: 0, socialUniqueVisitors: 0, socialVisits: 0, socialVisitsToday: 0, socialVisits7d: 0 });
  const [autoMessages, setAutoMessages] = useState([]);
  const [form, setForm] = useState(emptyOffer);
  const [messageForm, setMessageForm] = useState(emptyAutoMessage);
  const [editingId, setEditingId] = useState("");
  const [editingMessageId, setEditingMessageId] = useState("");
  const [search, setSearch] = useState(() => loadOfferFilters().search || "");
  const [status, setStatus] = useState(() => loadOfferFilters().status || "");
  const [category, setCategory] = useState(() => loadOfferFilters().category || "");
  const [activeView, setActiveView] = useState("dashboard");
  const [customCategories, setCustomCategories] = useState([]);
  const [newCategory, setNewCategory] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkCategory, setBulkCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingMessageId, setSendingMessageId] = useState("");
  const [autoFilling, setAutoFilling] = useState(false);
  const [message, setMessage] = useState(null);
  const messageTimerRef = useRef(null);

  const baseCategories = DEFAULT_CATEGORIES.filter((item) => !item.virtual).map((item) => item.name);
  const categories = useMemo(() => [...new Set([...baseCategories, ...customCategories.map((item) => item.name)])], [customCategories]);
  const selected = useMemo(() => offers.find((offer) => offer.id === editingId), [offers, editingId]);

  const filteredOffers = useMemo(() => {
    const text = search.trim().toLowerCase();
    return offers.filter((offer) => {
      const matchesSearch = !text || `${offer.productName} ${offer.platform} ${offer.category}`.toLowerCase().includes(text);
      const matchesStatus = !status || offer.status === status;
      const matchesCategory = !category || offer.category === category;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [offers, search, status, category]);

  const analytics = useMemo(() => {
    const byStatus = telegramStatuses.map((item) => ({
      name: statusLabels[item] || item,
      value: offers.filter((offer) => offer.status === item).length,
      status: item,
    })).filter((item) => item.value > 0);

    const byCategory = categories.map((item) => ({
      name: item,
      ofertas: offers.filter((offer) => offer.category === item).length,
    })).filter((item) => item.ofertas > 0);

    const published = offers.filter((offer) => offer.status === "PUBLICADO");
    const scheduled = offers.filter((offer) => offer.status === "AGENDADO");
    const totalClicks = offers.reduce((sum, offer) => sum + number(offer.clicks), 0);
    const totalShares = offers.reduce((sum, offer) => sum + number(offer.shares), 0);
    const totalFavorites = offers.reduce((sum, offer) => sum + number(offer.favorites), 0);
    const publicationCount = offers.reduce((sum, offer) => sum + number(offer.publicationCount), 0);
    const totalValue = published.reduce((sum, offer) => sum + number(offer.currentPrice), 0);
    const discounts = offers.map((offer) => {
      const previous = number(offer.previousPrice);
      const current = number(offer.currentPrice);
      return previous > current && current > 0 ? Math.round(((previous - current) / previous) * 100) : 0;
    }).filter(Boolean);

    return {
      byStatus,
      byCategory,
      total: offers.length,
      published: published.length,
      scheduled: scheduled.length,
      errors: offers.filter((offer) => offer.status === "ERRO").length,
      drafts: offers.filter((offer) => offer.status === "RASCUNHO").length,
      totalClicks,
      totalShares,
      totalFavorites,
      publicationCount,
      uniqueVisitors: siteMetrics.uniqueVisitors,
      visits: siteMetrics.visits,
      socialUniqueVisitors: siteMetrics.socialUniqueVisitors,
      socialVisits: siteMetrics.socialVisits,
      socialVisitsToday: siteMetrics.socialVisitsToday,
      socialVisits7d: siteMetrics.socialVisits7d,
      topOffers: [...offers].sort((a, b) => number(b.clicks) - number(a.clicks)).slice(0, 5),
      byPlatform: [...new Set(offers.map((offer) => offer.platform).filter(Boolean))].map((name) => ({
        name,
        offers: offers.filter((offer) => offer.platform === name).length,
        clicks: offers.filter((offer) => offer.platform === name).reduce((sum, offer) => sum + number(offer.clicks), 0),
      })).sort((a, b) => b.clicks - a.clicks),
      averageDiscount: discounts.length ? Math.round(discounts.reduce((a, b) => a + b, 0) / discounts.length) : 0,
      averageTicket: published.length ? totalValue / published.length : 0,
      nextScheduled: scheduled
        .filter((offer) => offer.scheduledAt)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
        .slice(0, 4),
    };
  }, [offers, categories, siteMetrics]);

  const showMessage = (value, tone) => {
    const resolvedTone = tone || (/erro|faltam|informe|selecione|escolha|nao |não |inval/i.test(value) ? "error" : "success");
    setMessage({ text: value, tone: resolvedTone });
    if (messageTimerRef.current) window.clearTimeout(messageTimerRef.current);
    messageTimerRef.current = window.setTimeout(() => setMessage(null), 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const [data, messagesData] = await Promise.all([
        telegramOffersApi.list(),
        telegramOffersApi.listMessages(),
      ]);
      const nextOffers = data.offers || [];
      const serverCategories = data.categories || [];
      const legacyCategories = loadCustomCategories();
      const knownNames = new Set(serverCategories.map((item) => item.name.toLowerCase()));
      const missingLegacy = legacyCategories.filter((item) => !knownNames.has(item.name.toLowerCase()));
      const migrated = await Promise.all(missingLegacy.map((item) => telegramOffersApi.createCategory(item.name)));
      const synchronizedCategories = [...serverCategories, ...migrated.map((item) => item.category)];
      setOffers(nextOffers);
      setSiteMetrics(data.siteMetrics || { uniqueVisitors: 0, visits: 0, realClicks: 0, socialUniqueVisitors: 0, socialVisits: 0, socialVisitsToday: 0, socialVisits7d: 0 });
      const requestedId = new URLSearchParams(window.location.search).get("edit");
      const requestedOffer = nextOffers.find((offer) => offer.id === requestedId);
      if (requestedOffer) edit(requestedOffer);
      setCustomCategories(synchronizedCategories.filter((item) => !baseCategories.includes(item.name)));
      setAutoMessages(messagesData.messages || []);
      setSelectedIds((current) => current.filter((id) => nextOffers.some((offer) => offer.id === id)));
      localStorage.removeItem(CUSTOM_CATEGORIES_KEY);
    } catch (error) {
      showMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => () => {
    if (messageTimerRef.current) window.clearTimeout(messageTimerRef.current);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(OFFER_FILTERS_KEY, JSON.stringify({ search, status, category }));
    } catch {
      // Session storage may be unavailable in restricted browsers.
    }
  }, [category, search, status]);

  const addCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    if (categories.some((item) => item.toLowerCase() === name.toLowerCase())) {
      showMessage("Categoria ja existe.");
      return;
    }
    try {
      const data = await telegramOffersApi.createCategory(name);
      setCustomCategories((current) => [...current, data.category]);
      setNewCategory("");
      showMessage("Categoria adicionada.");
    } catch (error) {
      showMessage(error.message);
    }
  };

  const removeCategory = async (name) => {
    const item = customCategories.find((current) => current.name === name);
    if (!item) return;
    try {
      await telegramOffersApi.removeCategory(item.slug);
      setCustomCategories((current) => current.filter((categoryItem) => categoryItem.name !== name));
      if (form.category === name) setForm((current) => ({ ...current, category: "Tecnologia" }));
      if (category === name) setCategory("");
      showMessage("Categoria removida.");
    } catch (error) {
      showMessage(error.message);
    }
  };

  const startNew = () => {
    setEditingId("");
    setForm({ ...emptyOffer, category: categories.includes("Tecnologia") ? "Tecnologia" : categories[0] || "" });
    setActiveView("editor");
  };

  const edit = (offer) => {
    setEditingId(offer.id);
    setForm({
      productName: offer.productName || "",
      shortDescription: offer.shortDescription || "",
      currentPrice: offer.currentPrice || "",
      previousPrice: offer.previousPrice || "",
      coupon: offer.coupon || "",
      couponDiscountPercent: offer.couponDiscountPercent || 0,
      category: offer.category || "Tecnologia",
      imageUrl: offer.imageUrl || "",
      affiliateLink: offer.affiliateLink || "",
      sourceProductId: offer.sourceProductId || "",
      platform: offer.platform || "Mercado Livre",
      extraText: offer.extraText || "",
      status: offer.status || "RASCUNHO",
      scheduledAt: toDatetimeLocal(offer.scheduledAt),
    });
    setActiveView("editor");
  };

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const autoFillFromLink = async () => {
    if (!form.affiliateLink) {
      showMessage("Cole o link do produto antes de preencher.");
      return;
    }
    setAutoFilling(true);
    try {
      const data = await telegramOffersApi.previewProduct(form.affiliateLink);
      const product = data.product || {};
      setForm((current) => ({
        ...current,
        productName: product.productName || current.productName,
        shortDescription: product.shortDescription || current.shortDescription,
        currentPrice: product.currentPrice ? normalizeFormPrice(product.currentPrice) : current.currentPrice,
        previousPrice: product.previousPrice ? normalizeFormPrice(product.previousPrice) : current.previousPrice,
        couponDiscountPercent: product.couponDiscountPercent || current.couponDiscountPercent,
        imageUrl: product.imageUrl || current.imageUrl,
        affiliateLink: product.affiliateLink || current.affiliateLink,
        sourceProductId: product.sourceProductId || product.externalProductId || current.sourceProductId,
        platform: product.platform || current.platform,
        category: suggestCategory(product, categories) || current.category,
      }));
      showMessage("Produto preenchido automaticamente.");
    } catch (error) {
      showMessage(error.message);
    } finally {
      setAutoFilling(false);
    }
  };

  const applyCapturedProduct = (product = {}) => {
    setForm((current) => ({
      ...current,
      productName: product.productName || current.productName,
      shortDescription: product.shortDescription || current.shortDescription,
      currentPrice: product.currentPrice ? normalizeFormPrice(product.currentPrice) : current.currentPrice,
      previousPrice: product.previousPrice ? normalizeFormPrice(product.previousPrice) : current.previousPrice,
      couponDiscountPercent: product.couponDiscountPercent || current.couponDiscountPercent,
      imageUrl: product.imageUrl || current.imageUrl,
      affiliateLink: product.affiliateLink || current.affiliateLink,
      sourceProductId: product.sourceProductId || product.externalProductId || current.sourceProductId,
      platform: product.platform || current.platform,
    }));
  };

  const openBrowserCapture = async () => {
    if (!form.affiliateLink) {
      showMessage("Cole o link do produto antes de abrir.");
      return;
    }
    try {
      await navigator.clipboard.writeText(browserCaptureScript);
      window.open(form.affiliateLink, "_blank", "noopener,noreferrer");
      showMessage("Script copiado. Cole no console da pagina do produto.");
    } catch {
      showMessage("Nao consegui copiar o script automaticamente.");
    }
  };

  const importBrowserCapture = async () => {
    try {
      const raw = await navigator.clipboard.readText();
      const product = JSON.parse(raw);
      applyCapturedProduct(product);
      showMessage("Dados importados da captura.");
    } catch {
      const raw = window.prompt("Cole aqui o JSON gerado no console da loja:");
      if (!raw) {
        showMessage("Nao encontrei uma captura valida na area de transferencia.");
        return;
      }
      try {
        const product = JSON.parse(raw);
        applyCapturedProduct(product);
        showMessage("Dados importados da captura.");
      } catch {
        showMessage("O texto colado nao parece ser uma captura valida.");
      }
    }
  };

  const validateClient = () => {
    const missing = [];
    if (!form.productName) missing.push("nome");
    if (!form.currentPrice) missing.push("preco");
    if (!form.affiliateLink) missing.push("link");
    if (!form.category) missing.push("categoria");
    return missing;
  };

  const payload = (override = {}) => ({
    ...form,
    ...override,
    scheduledAt: fromDatetimeLocal(override.scheduledAt ?? form.scheduledAt),
  });

  const save = async (override = {}) => {
    const missing = validateClient();
    if (missing.length && override.status !== "RASCUNHO") {
      showMessage(`Faltam informacoes: ${missing.join(", ")}.`);
      return null;
    }
    const duplicate = offers.find((offer) => offer.id !== editingId
      && normalizeText(offer.platform) === normalizeText(form.platform)
      && Number(offer.currentPrice) === Number(normalizeFormPrice(form.currentPrice))
      && ((form.sourceProductId && offer.sourceProductId && form.sourceProductId === offer.sourceProductId)
        || normalizeText(offer.productName) === normalizeText(form.productName)));
    if (duplicate) {
      showMessage(`Este produto já está cadastrado com o mesmo preço em "${duplicate.productName}".`);
      return null;
    }
    setSaving(true);
    try {
      const data = editingId
        ? await telegramOffersApi.update(editingId, payload(override))
        : await telegramOffersApi.create(payload(override));
      showMessage("Oferta salva.");
      await load();
      edit(data.offer);
      return data.offer;
    } catch (error) {
      showMessage(error.message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const publishNow = async () => {
    if (!window.confirm("Publicar esta oferta agora no Telegram?")) return;
    const offer = await save({ status: "APROVADO" });
    if (!offer) return;
    setSaving(true);
    try {
      const result = await telegramOffersApi.publish(offer.id);
      showMessage(result.telegram?.ok
        ? "Oferta publicada no site e enviada ao Telegram."
        : `Oferta publicada no site. Telegram: ${result.telegram?.error || "envio pendente"}`);
      await load();
      startNew();
    } catch (error) {
      showMessage(error.message);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const schedule = async () => {
    if (!form.scheduledAt) {
      showMessage("Informe data e horario para agendar.");
      return;
    }
    const offer = await save({ status: "AGENDADO" });
    if (!offer) return;
    try {
      await telegramOffersApi.schedule(offer.id, fromDatetimeLocal(form.scheduledAt));
      showMessage("Oferta agendada.");
      await load();
    } catch (error) {
      showMessage(error.message);
    }
  };

  const remove = async (offer) => {
    if (!window.confirm(`Excluir "${offer.productName}"?`)) return;
    try {
      await telegramOffersApi.remove(offer.id);
      showMessage("Oferta excluida.");
      await load();
      if (editingId === offer.id) startNew();
    } catch (error) {
      showMessage(error.message);
    }
  };

  const retry = async (offer) => {
    try {
      const result = await telegramOffersApi.publish(offer.id);
      showMessage(result.telegram?.ok
        ? "Reenvio ao Telegram concluido."
        : `A oferta continua publicada. Telegram: ${result.telegram?.error || "envio pendente"}`);
      await load();
    } catch (error) {
      showMessage(error.message);
      await load();
    }
  };

  const toggleSelected = (id) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleAllVisible = (visibleOffers) => {
    const visibleIds = visibleOffers.map((offer) => offer.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => {
      if (allSelected) return current.filter((id) => !visibleIds.includes(id));
      return [...new Set([...current, ...visibleIds])];
    });
  };

  const selectedOffers = () => offers.filter((offer) => selectedIds.includes(offer.id));

  const clearSelection = () => setSelectedIds([]);

  const bulkRemove = async () => {
    const items = selectedOffers();
    if (!items.length) {
      showMessage("Selecione pelo menos uma oferta.");
      return;
    }
    if (!window.confirm(`Excluir ${items.length} oferta(s) selecionada(s)?`)) return;
    setSaving(true);
    try {
      await Promise.all(items.map((offer) => telegramOffersApi.remove(offer.id)));
      showMessage(`${items.length} oferta(s) excluida(s).`);
      clearSelection();
      await load();
      if (items.some((offer) => offer.id === editingId)) startNew();
    } catch (error) {
      showMessage(error.message);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const bulkUpdate = async () => {
    const items = selectedOffers();
    if (!items.length) {
      showMessage("Selecione pelo menos uma oferta.");
      return;
    }
    if (!bulkStatus && !bulkCategory) {
      showMessage("Escolha um status ou categoria para aplicar.");
      return;
    }
    if (!window.confirm(`Atualizar ${items.length} oferta(s) selecionada(s)?`)) return;
    setSaving(true);
    try {
      await Promise.all(items.map((offer) => telegramOffersApi.update(offer.id, {
        ...offer,
        status: bulkStatus || offer.status,
        category: bulkCategory || offer.category,
      })));
      showMessage(`${items.length} oferta(s) atualizada(s).`);
      setBulkStatus("");
      setBulkCategory("");
      clearSelection();
      await load();
    } catch (error) {
      showMessage(error.message);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const saveAutoMessage = async () => {
    if (!messageForm.title.trim() || !messageForm.message.trim()) {
      showMessage("Informe titulo e mensagem.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...messageForm,
        nextSendAt: fromDatetimeLocal(messageForm.nextSendAt) || new Date().toISOString(),
      };
      if (editingMessageId) await telegramOffersApi.updateMessage(editingMessageId, payload);
      else await telegramOffersApi.createMessage(payload);
      showMessage("Mensagem salva.");
      setEditingMessageId("");
      setMessageForm(emptyAutoMessage);
      await load();
    } catch (error) {
      showMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const editAutoMessage = (message) => {
    setEditingMessageId(message.id);
    setMessageForm({
      title: message.title || "",
      message: message.message || "",
      channel: message.channel || "TELEGRAM",
      imageUrl: message.imageUrl || "",
      whatsappGroup: message.whatsappGroup || "",
      isActive: message.isActive !== false,
      intervalMinutes: message.intervalMinutes || 1440,
      sortOrder: message.sortOrder || 0,
      nextSendAt: toDatetimeLocal(message.nextSendAt),
    });
  };

  const removeAutoMessage = async (message) => {
    if (!window.confirm(`Excluir "${message.title}"?`)) return;
    setSaving(true);
    try {
      await telegramOffersApi.removeMessage(message.id);
      showMessage("Mensagem excluida.");
      if (editingMessageId === message.id) {
        setEditingMessageId("");
        setMessageForm(emptyAutoMessage);
      }
      await load();
    } catch (error) {
      showMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const sendAutoMessageNow = async (message) => {
    const channelLabel = message.channel === "WHATSAPP" ? "WhatsApp pela extensão" : "Telegram";
    if (!window.confirm(`Enviar "${message.title}" agora no ${channelLabel}?`)) return;
    setSendingMessageId(message.id);
    try {
      await telegramOffersApi.sendMessageNow(message.id);
      showMessage(message.channel === "WHATSAPP" ? "Mensagem disponibilizada para envio na extensão." : "Mensagem enviada no Telegram.");
      await load();
    } catch (error) {
      showMessage(error.message);
      await load();
    } finally {
      setSendingMessageId("");
    }
  };

  const testTelegram = async () => {
    setSaving(true);
    try {
      await telegramOffersApi.testTelegram();
      showMessage("Telegram conectado com sucesso.");
    } catch (error) {
      showMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-theme min-h-screen bg-[#0D0D0D] text-white">
      <AdminHeader testTelegram={testTelegram} saving={saving} />

      <main className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid lg:grid-cols-[240px_minmax(0,1fr)] gap-6">
          <aside className="lg:sticky lg:top-20 lg:self-start min-w-0">
            <div className="bg-white/5 border border-white/10 rounded-lg p-2 flex lg:block gap-1 overflow-x-auto no-scrollbar">
              <AdminNavButton icon={LayoutDashboard} label="Dashboard" active={activeView === "dashboard"} onClick={() => setActiveView("dashboard")} />
              <AdminNavButton icon={ClipboardList} label="Ofertas" active={activeView === "offers"} onClick={() => setActiveView("offers")} />
              <AdminNavButton icon={Plus} label={selected ? "Editar oferta" : "Nova oferta"} active={activeView === "editor"} onClick={() => setActiveView("editor")} />
              <AdminNavButton icon={MessageSquareText} label="Mensagens" active={activeView === "messages"} onClick={() => setActiveView("messages")} />
              <AdminNavButton icon={FolderKanban} label="Categorias" active={activeView === "categories"} onClick={() => setActiveView("categories")} />
            </div>

            <div className="hidden lg:block mt-4 bg-white/5 border border-white/10 rounded-lg p-4">
              <p className="text-xs text-white/40 mb-3">Resumo rapido</p>
              <div className="space-y-2 text-sm">
                <AdminQuickLine label="Publicadas" value={analytics.published} />
                <AdminQuickLine label="Agendadas" value={analytics.scheduled} />
                <AdminQuickLine label="Com erro" value={analytics.errors} tone={analytics.errors ? "text-red-300" : "text-white"} />
              </div>
            </div>
          </aside>

          <section className="min-w-0">
            <Suspense fallback={<div className="min-h-64 flex items-center justify-center text-sm text-white/45" role="status">Carregando seção...</div>}>
            {activeView === "dashboard" && (
              <Dashboard analytics={analytics} offers={offers} loading={loading} onNew={startNew} onEdit={edit} onRefresh={load} />
            )}

            {activeView === "offers" && (
              <OffersView
                offers={filteredOffers}
                loading={loading}
                search={search}
                setSearch={setSearch}
                status={status}
                setStatus={setStatus}
                category={category}
                setCategory={setCategory}
                categories={categories}
                onNew={startNew}
                onEdit={edit}
                onRefresh={load}
                onRetry={retry}
                onRemove={remove}
                selectedIds={selectedIds}
                toggleSelected={toggleSelected}
                toggleAllVisible={toggleAllVisible}
                clearSelection={clearSelection}
                bulkStatus={bulkStatus}
                setBulkStatus={setBulkStatus}
                bulkCategory={bulkCategory}
                setBulkCategory={setBulkCategory}
                bulkUpdate={bulkUpdate}
                bulkRemove={bulkRemove}
                bulkBusy={saving}
              />
            )}

            {activeView === "editor" && (
              <EditorView
                form={form}
                selected={selected}
                categories={categories}
                saving={saving}
                autoFilling={autoFilling}
                set={set}
                startNew={startNew}
                autoFillFromLink={autoFillFromLink}
                openBrowserCapture={openBrowserCapture}
                importBrowserCapture={importBrowserCapture}
                save={save}
                publishNow={publishNow}
                schedule={schedule}
              />
            )}

            {activeView === "messages" && (
              <MessagesView
                messages={autoMessages}
                form={messageForm}
                setForm={setMessageForm}
                editingId={editingMessageId}
                setEditingId={setEditingMessageId}
                edit={editAutoMessage}
                save={saveAutoMessage}
                remove={removeAutoMessage}
                sendNow={sendAutoMessageNow}
                reset={() => {
                  setEditingMessageId("");
                  setMessageForm(emptyAutoMessage);
                }}
                saving={saving}
                sendingMessageId={sendingMessageId}
              />
            )}

            {activeView === "categories" && (
              <CategoriesView
                baseCategories={baseCategories}
                customCategories={customCategories}
                newCategory={newCategory}
                setNewCategory={setNewCategory}
                addCategory={addCategory}
                removeCategory={removeCategory}
                offers={offers}
              />
            )}
            </Suspense>
          </section>
        </div>
      </main>

      {message && (
        <div
          role={message.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`fixed bottom-4 sm:bottom-6 right-4 sm:right-6 max-w-[calc(100vw-2rem)] rounded-lg px-4 py-3 text-sm font-medium shadow-xl z-50 border ${
            message.tone === "error"
              ? "bg-red-950 text-red-100 border-red-500/40"
              : "bg-white text-[#111111] border-[#111111]/10"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
