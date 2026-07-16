import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clipboard,
  ClipboardList,
  ExternalLink,
  FolderKanban,
  LayoutDashboard,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  Tag,
  Trash2,
  Zap,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DEFAULT_CATEGORIES, formatPrice, SITE_NAME, slugify } from "@/lib/catalog";
import { logoutAdmin } from "@/lib/adminAuth";
import { formatTelegramPreview, telegramOffersApi, telegramStatuses } from "@/lib/telegramOffersApi";

const CUSTOM_CATEGORIES_KEY = "tb_admin_custom_categories";

const emptyOffer = {
  productName: "",
  shortDescription: "",
  currentPrice: "",
  previousPrice: "",
  coupon: "",
  category: "Tecnologia",
  imageUrl: "",
  affiliateLink: "",
  platform: "Mercado Livre",
  extraText: "",
  status: "RASCUNHO",
  scheduledAt: "",
};

const statusLabels = {
  RASCUNHO: "Rascunho",
  APROVADO: "Aprovado",
  AGENDADO: "Agendado",
  PUBLICANDO: "Publicando",
  PUBLICADO: "Publicado",
  ERRO: "Erro",
  EXPIRADO: "Expirado",
};

const statusClasses = {
  RASCUNHO: "bg-white/10 text-white/55",
  APROVADO: "bg-blue-500/15 text-blue-300",
  AGENDADO: "bg-yellow-500/15 text-yellow-300",
  PUBLICANDO: "bg-purple-500/15 text-purple-300",
  PUBLICADO: "bg-[#168A55]/15 text-[#4ade80]",
  ERRO: "bg-red-500/15 text-red-300",
  EXPIRADO: "bg-white/10 text-white/35",
};

const chartColors = ["#FF6B35", "#168A55", "#3B82F6", "#EAB308", "#A855F7", "#EF4444", "#94A3B8"];

const toDatetimeLocal = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const fromDatetimeLocal = (value) => (value ? new Date(value).toISOString() : "");

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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
    if (raw.includes(",")) return raw.replace(/\\./g, "").replace(",", ".");
    const parts = raw.split(".");
    return parts.length > 2 ? parts.join("") : raw;
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
    platform,
  };
  navigator.clipboard.writeText(JSON.stringify(product, null, 2)).then(() => {
    console.log("Dados copiados para a area de transferencia:", product);
  });
})();`;

export default function AdminOffers() {
  const [offers, setOffers] = useState([]);
  const [form, setForm] = useState(emptyOffer);
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [activeView, setActiveView] = useState("dashboard");
  const [customCategories, setCustomCategories] = useState(loadCustomCategories);
  const [newCategory, setNewCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoFilling, setAutoFilling] = useState(false);
  const [message, setMessage] = useState("");

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
      averageDiscount: discounts.length ? Math.round(discounts.reduce((a, b) => a + b, 0) / discounts.length) : 0,
      averageTicket: published.length ? totalValue / published.length : 0,
      nextScheduled: scheduled
        .filter((offer) => offer.scheduledAt)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
        .slice(0, 4),
    };
  }, [offers, categories]);

  const showMessage = (value) => {
    setMessage(value);
    setTimeout(() => setMessage(""), 3500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await telegramOffersApi.list();
      setOffers(data.offers || []);
    } catch (error) {
      showMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const persistCustomCategories = (items) => {
    setCustomCategories(items);
    localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(items));
  };

  const addCategory = () => {
    const name = newCategory.trim();
    if (!name) return;
    if (categories.some((item) => item.toLowerCase() === name.toLowerCase())) {
      showMessage("Categoria ja existe.");
      return;
    }
    persistCustomCategories([...customCategories, { name, slug: slugify(name) }]);
    setNewCategory("");
    showMessage("Categoria adicionada.");
  };

  const removeCategory = (name) => {
    persistCustomCategories(customCategories.filter((item) => item.name !== name));
    if (form.category === name) setForm((current) => ({ ...current, category: "Tecnologia" }));
    if (category === name) setCategory("");
    showMessage("Categoria removida.");
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
      category: offer.category || "Tecnologia",
      imageUrl: offer.imageUrl || "",
      affiliateLink: offer.affiliateLink || "",
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
        currentPrice: product.currentPrice || current.currentPrice,
        previousPrice: product.previousPrice || current.previousPrice,
        imageUrl: product.imageUrl || current.imageUrl,
        affiliateLink: product.affiliateLink || current.affiliateLink,
        platform: product.platform || current.platform,
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
      currentPrice: product.currentPrice || current.currentPrice,
      previousPrice: product.previousPrice || current.previousPrice,
      imageUrl: product.imageUrl || current.imageUrl,
      affiliateLink: product.affiliateLink || current.affiliateLink,
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
      showMessage("Nao encontrei uma captura valida na area de transferencia.");
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
      await telegramOffersApi.publish(offer.id);
      showMessage("Oferta enviada para o Telegram.");
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
      await telegramOffersApi.publish(offer.id);
      showMessage("Reenvio concluido.");
      await load();
    } catch (error) {
      showMessage(error.message);
      await load();
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
    <div className="min-h-screen bg-[#0D0D0D] text-white">
      <Header testTelegram={testTelegram} saving={saving} />

      <main className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid lg:grid-cols-[240px_minmax(0,1fr)] gap-6">
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-2">
              <NavButton icon={LayoutDashboard} label="Dashboard" active={activeView === "dashboard"} onClick={() => setActiveView("dashboard")} />
              <NavButton icon={ClipboardList} label="Ofertas" active={activeView === "offers"} onClick={() => setActiveView("offers")} />
              <NavButton icon={Plus} label={selected ? "Editar oferta" : "Nova oferta"} active={activeView === "editor"} onClick={() => setActiveView("editor")} />
              <NavButton icon={FolderKanban} label="Categorias" active={activeView === "categories"} onClick={() => setActiveView("categories")} />
            </div>

            <div className="mt-4 bg-white/5 border border-white/10 rounded-2xl p-4">
              <p className="text-xs text-white/40 mb-3">Resumo rapido</p>
              <div className="space-y-2 text-sm">
                <QuickLine label="Publicadas" value={analytics.published} />
                <QuickLine label="Agendadas" value={analytics.scheduled} />
                <QuickLine label="Com erro" value={analytics.errors} tone={analytics.errors ? "text-red-300" : "text-white"} />
              </div>
            </div>
          </aside>

          <section className="min-w-0">
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
          </section>
        </div>
      </main>

      {message && <div className="fixed bottom-6 right-6 bg-white text-[#111111] rounded-xl px-4 py-2 text-sm font-medium shadow-lg z-50">{message}</div>}
    </div>
  );
}

function Header({ testTelegram, saving }) {
  return (
    <div className="border-b border-white/10 sticky top-0 z-40 bg-[#0D0D0D]/90 backdrop-blur-md">
      <div className="max-w-[1500px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-[#FF6B35]" fill="currentColor" />
          </div>
          <span className="font-bold text-lg">{SITE_NAME} <span className="text-white/40 font-normal hidden sm:inline">/ Admin</span></span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={testTelegram} disabled={saving} className="hidden sm:flex px-4 py-2 bg-[#168A55] rounded-xl text-sm font-semibold disabled:opacity-50 items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Telegram
          </button>
          <Link to="/" className="text-sm text-white/60 hover:text-[#FF6B35] transition flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Site
          </Link>
          <button onClick={() => logoutAdmin().then(() => { window.location.href = "/admin/login"; })} className="text-sm text-white/60 hover:text-[#FF6B35] transition flex items-center gap-1">
            <LogOut className="w-4 h-4" /> Sair
          </button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ analytics, offers, loading, onNew, onEdit, onRefresh }) {
  const recent = offers.slice(0, 5);
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-white/45 text-sm">Painel administrativo</p>
          <h1 className="text-3xl font-bold mt-1">Visao geral</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={onRefresh} className="px-4 py-2.5 bg-white/10 rounded-xl font-semibold flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Atualizar</button>
          <button onClick={onNew} className="px-4 py-2.5 bg-[#FF6B35] rounded-xl font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> Nova oferta</button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric icon={ClipboardList} label="Ofertas cadastradas" value={analytics.total} hint={`${analytics.drafts} rascunhos`} />
        <Metric icon={Send} label="Publicadas" value={analytics.published} hint={`${analytics.totalClicks} cliques registrados`} />
        <Metric icon={CalendarClock} label="Agendadas" value={analytics.scheduled} hint={analytics.scheduled ? "Na fila de publicacao" : "Nenhuma pendente"} />
        <Metric icon={CircleDollarSign} label="Ticket medio" value={formatPrice(analytics.averageTicket)} hint={`${analytics.averageDiscount}% desconto medio`} />
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <Panel title="Distribuicao por status" icon={BarChart3}>
          <div className="h-72">
            {loading ? <LoadingBlock /> : analytics.byStatus.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={analytics.byStatus} dataKey="value" nameKey="name" innerRadius={64} outerRadius={94} paddingAngle={3}>
                    {analytics.byStatus.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyBlock label="Sem dados para exibir." />}
          </div>
        </Panel>

        <Panel title="Ofertas por categoria" icon={Tag}>
          <div className="h-72">
            {loading ? <LoadingBlock /> : analytics.byCategory.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.byCategory}>
                  <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "rgba(255,255,255,.55)", fontSize: 11 }} interval={0} angle={-15} height={64} />
                  <YAxis tick={{ fill: "rgba(255,255,255,.45)", fontSize: 12 }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,.05)" }} />
                  <Bar dataKey="ofertas" fill="#FF6B35" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyBlock label="Cadastre ofertas para montar o grafico." />}
          </div>
        </Panel>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <Panel title="Proximos agendamentos" icon={CalendarClock}>
          <div className="space-y-2">
            {analytics.nextScheduled.length ? analytics.nextScheduled.map((offer) => (
              <CompactOffer key={offer.id} offer={offer} onEdit={onEdit} />
            )) : <EmptyBlock label="Nenhuma oferta agendada." />}
          </div>
        </Panel>
        <Panel title="Ultimas ofertas" icon={ClipboardList}>
          <div className="space-y-2">
            {recent.length ? recent.map((offer) => (
              <CompactOffer key={offer.id} offer={offer} onEdit={onEdit} />
            )) : <EmptyBlock label="Nenhuma oferta cadastrada." />}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function OffersView({ offers, loading, search, setSearch, status, setStatus, category, setCategory, categories, onNew, onEdit, onRefresh, onRetry, onRemove }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-white/45 text-sm">Gestao de ofertas</p>
          <h1 className="text-3xl font-bold mt-1">Ofertas</h1>
        </div>
        <button onClick={onNew} className="px-4 py-2.5 bg-[#FF6B35] rounded-xl font-semibold flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Nova oferta</button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
        <div className="grid lg:grid-cols-[1fr_180px_220px_auto] gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} pl-10`} placeholder="Buscar por produto, loja ou categoria" />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
            <option value="">Todos os status</option>
            {telegramStatuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            <option value="">Todas as categorias</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button onClick={onRefresh} className="px-4 py-2.5 bg-white/10 rounded-xl font-semibold flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" /> Atualizar</button>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="hidden md:grid grid-cols-[minmax(0,1fr)_130px_150px_120px_96px] gap-4 px-4 py-3 text-xs uppercase tracking-wide text-white/35 border-b border-white/10">
          <span>Produto</span>
          <span>Status</span>
          <span>Preco</span>
          <span>Agenda</span>
          <span className="text-right">Acoes</span>
        </div>
        {loading ? (
          <div className="py-20"><LoadingBlock /></div>
        ) : offers.length === 0 ? (
          <div className="py-20"><EmptyBlock label="Nenhuma oferta encontrada." /></div>
        ) : (
          <div className="divide-y divide-white/10">
            {offers.map((offer) => (
              <OfferRow key={offer.id} offer={offer} onEdit={onEdit} onRetry={onRetry} onRemove={onRemove} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EditorView({ form, selected, categories, saving, autoFilling, set, startNew, autoFillFromLink, openBrowserCapture, importBrowserCapture, save, publishNow, schedule }) {
  const completion = [
    form.affiliateLink,
    form.productName,
    form.currentPrice,
    form.category,
    form.imageUrl,
  ].filter(Boolean).length;
  const completionPct = Math.round((completion / 5) * 100);

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-white/45 text-sm">Cadastro de oferta</p>
            <h1 className="text-3xl font-bold mt-1">{selected ? "Editar oferta" : "Nova oferta"}</h1>
          </div>
          <button onClick={startNew} className="px-4 py-2.5 bg-white/10 rounded-xl font-semibold flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Limpar</button>
        </div>

        <Panel title="1. Link e preenchimento" icon={Sparkles}>
          <Field label="Link oficial de afiliado *">
            <div className="grid sm:grid-cols-[1fr_auto] gap-2">
              <input value={form.affiliateLink} onChange={(e) => set("affiliateLink", e.target.value)} className={inputCls} placeholder="https://..." />
              <button type="button" onClick={autoFillFromLink} disabled={autoFilling || !form.affiliateLink} className="px-4 py-2.5 bg-white text-[#0D0D0D] rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
                {autoFilling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Servidor
              </button>
            </div>
          </Field>
          <div className="mt-3 grid sm:grid-cols-2 gap-2">
            <button type="button" onClick={openBrowserCapture} disabled={!form.affiliateLink} className="px-4 py-2.5 bg-white/10 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
              <ExternalLink className="w-4 h-4" />
              Abrir e copiar script
            </button>
            <button type="button" onClick={importBrowserCapture} className="px-4 py-2.5 bg-[#168A55] rounded-xl text-sm font-semibold flex items-center justify-center gap-2">
              <Clipboard className="w-4 h-4" />
              Importar captura
            </button>
          </div>
          <p className="mt-3 text-xs text-white/35">Para lojas que bloqueiam servidor, abra o produto, cole o script no console da pagina e volte para importar.</p>
        </Panel>

        <Panel title="2. Dados do produto" icon={Tag}>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Nome do produto *"><input value={form.productName} onChange={(e) => set("productName", e.target.value)} className={inputCls} /></Field>
            <Field label="Plataforma *">
              <select value={form.platform} onChange={(e) => set("platform", e.target.value)} className={inputCls}>
                <option>Mercado Livre</option>
                <option>Shopee</option>
                <option>Amazon</option>
                <option>Outra</option>
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Descricao curta"><textarea value={form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} rows={3} className={`${inputCls} resize-none`} /></Field>
            </div>
            <Field label="Categoria *">
              <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inputCls}>
                {categories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Cupom"><input value={form.coupon} onChange={(e) => set("coupon", e.target.value)} className={inputCls} /></Field>
            <Field label="Preco atual *"><input type="number" step="0.01" value={form.currentPrice} onChange={(e) => set("currentPrice", e.target.value)} className={inputCls} /></Field>
            <Field label="Preco anterior"><input type="number" step="0.01" value={form.previousPrice} onChange={(e) => set("previousPrice", e.target.value)} className={inputCls} /></Field>
            <div className="md:col-span-2">
              <Field label="URL da imagem"><input value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} className={inputCls} placeholder="https://..." /></Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Texto complementar"><textarea value={form.extraText} onChange={(e) => set("extraText", e.target.value)} rows={2} className={`${inputCls} resize-none`} /></Field>
            </div>
          </div>
        </Panel>

        <Panel title="3. Publicacao" icon={Send}>
          <div className="grid md:grid-cols-[1fr_auto] gap-4 md:items-end">
            <Field label="Data e horario do agendamento"><input type="datetime-local" value={form.scheduledAt} onChange={(e) => set("scheduledAt", e.target.value)} className={inputCls} /></Field>
            <div className="flex flex-wrap gap-2">
              <button disabled={saving} onClick={() => save({ status: "RASCUNHO" })} className="px-4 py-2.5 bg-white/10 rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" /> Rascunho</button>
              <button disabled={saving} onClick={schedule} className="px-4 py-2.5 bg-blue-500 rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50"><CalendarClock className="w-4 h-4" /> Agendar</button>
              <button disabled={saving} onClick={publishNow} className="px-4 py-2.5 bg-[#FF6B35] rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50"><Send className="w-4 h-4" /> Publicar</button>
            </div>
          </div>
        </Panel>
      </div>

      <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Panel title="Qualidade do cadastro" icon={CheckCircle2}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white/50">Completude</span>
            <span className="text-sm font-semibold">{completionPct}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-[#FF6B35]" style={{ width: `${completionPct}%` }} />
          </div>
          <p className="text-xs text-white/35 mt-3">Link, nome, preco, categoria e imagem deixam a oferta mais forte. A descricao e opcional.</p>
        </Panel>
        <OfferPreview form={form} />
        <Panel title="Previa Telegram" icon={Send}>
          <pre className="text-xs text-white/70 whitespace-pre-wrap font-sans leading-relaxed">{formatTelegramPreview(form)}</pre>
        </Panel>
      </div>
    </div>
  );
}

function CategoriesView({ baseCategories, customCategories, newCategory, setNewCategory, addCategory, removeCategory, offers }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-white/45 text-sm">Organizacao editorial</p>
        <h1 className="text-3xl font-bold mt-1">Categorias</h1>
      </div>

      <Panel title="Nova categoria" icon={Plus}>
        <div className="grid sm:grid-cols-[1fr_auto] gap-2">
          <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} className={inputCls} placeholder="Ex.: Games, Bebes, Supermercado" />
          <button onClick={addCategory} className="px-4 py-2.5 bg-[#FF6B35] rounded-xl font-semibold flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Adicionar</button>
        </div>
      </Panel>

      <div className="grid xl:grid-cols-2 gap-4">
        <Panel title="Categorias padrao" icon={FolderKanban}>
          <CategoryList items={baseCategories.map((name) => ({ name, fixed: true }))} offers={offers} />
        </Panel>
        <Panel title="Categorias personalizadas" icon={Sparkles}>
          {customCategories.length ? (
            <CategoryList items={customCategories} offers={offers} onRemove={removeCategory} />
          ) : <EmptyBlock label="Nenhuma categoria personalizada ainda." />}
        </Panel>
      </div>
    </div>
  );
}

function CategoryList({ items, offers, onRemove = (_name) => {} }) {
  return (
    <div className="space-y-2">
      {items.map((item) => {
        const count = offers.filter((offer) => offer.category === item.name).length;
        return (
          <div key={item.name} className="flex items-center justify-between gap-3 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{item.name}</p>
              <p className="text-xs text-white/35">{count} ofertas vinculadas</p>
            </div>
            {item.fixed ? (
              <span className="text-xs text-white/35">Padrao</span>
            ) : (
              <button onClick={() => onRemove(item.name)} className="p-2 text-white/45 hover:text-red-300" title="Remover categoria"><Trash2 className="w-4 h-4" /></button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OfferRow({ offer, onEdit, onRetry, onRemove }) {
  return (
    <div className="grid md:grid-cols-[minmax(0,1fr)_130px_150px_120px_96px] gap-4 p-4 items-center hover:bg-white/[0.03]">
      <button onClick={() => onEdit(offer)} className="flex items-center gap-3 min-w-0 text-left">
        <div className="w-14 h-14 bg-white/10 rounded-xl overflow-hidden shrink-0">
          {offer.imageUrl && <img src={offer.imageUrl} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate">{offer.productName}</p>
          <p className="text-white/35 text-xs truncate">{offer.platform} / {offer.category}</p>
          {offer.errorMessage && <p className="text-red-300 text-xs truncate">Erro: {offer.errorMessage}</p>}
        </div>
      </button>
      <span className={`w-max px-2.5 py-1 rounded-full text-xs font-semibold ${statusClasses[offer.status] || statusClasses.RASCUNHO}`}>{statusLabels[offer.status] || offer.status}</span>
      <div>
        <p className="font-semibold">{formatPrice(number(offer.currentPrice))}</p>
        {offer.previousPrice && <p className="text-xs text-white/35 line-through">{formatPrice(number(offer.previousPrice))}</p>}
      </div>
      <p className="text-xs text-white/40">{offer.scheduledAt ? new Date(offer.scheduledAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-"}</p>
      <div className="flex justify-end gap-1">
        {offer.status === "ERRO" && <button onClick={() => onRetry(offer)} title="Reenviar" className="p-2 text-white/50 hover:text-[#FF6B35]"><RefreshCw className="w-4 h-4" /></button>}
        <button onClick={() => onRemove(offer)} title="Excluir" className="p-2 text-white/50 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

function CompactOffer({ offer, onEdit }) {
  return (
    <button onClick={() => onEdit(offer)} className="w-full flex items-center justify-between gap-3 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-3 text-left hover:bg-white/[0.07]">
      <div className="min-w-0">
        <p className="font-medium truncate">{offer.productName}</p>
        <p className="text-xs text-white/35 truncate">{offer.category} / {formatPrice(number(offer.currentPrice))}</p>
      </div>
      <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${statusClasses[offer.status] || statusClasses.RASCUNHO}`}>{statusLabels[offer.status] || offer.status}</span>
    </button>
  );
}

function OfferPreview({ form }) {
  return (
    <div className="bg-white text-[#111111] rounded-2xl overflow-hidden">
      <div className="aspect-[4/3] bg-[#F5F2EB]">{form.imageUrl && <img src={form.imageUrl} alt="" className="w-full h-full object-cover" />}</div>
      <div className="p-4">
        <p className="text-xs text-[#111111]/50 mb-1">{form.category || "Categoria"}</p>
        <h3 className="font-bold leading-snug">{form.productName || "Nome do produto"}</h3>
        <p className="text-sm text-[#111111]/60 mt-2 line-clamp-3">{form.shortDescription || "Descricao curta da oferta"}</p>
        <div className="mt-3 flex items-end gap-2">
          <p className="font-bold text-xl">{form.currentPrice ? formatPrice(number(form.currentPrice)) : "R$ 0,00"}</p>
          {form.previousPrice && <p className="text-sm text-[#111111]/35 line-through mb-0.5">{formatPrice(number(form.previousPrice))}</p>}
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, hint }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-white/45 text-sm">{label}</p>
          <p className="text-2xl font-bold mt-2">{value}</p>
          <p className="text-xs text-white/35 mt-2">{hint}</p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-[#FF6B35]/15 text-[#FF6B35] flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, children }) {
  return (
    <section className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-[#FF6B35]" />
        <h2 className="font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function NavButton({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${active ? "bg-[#FF6B35] text-white" : "text-white/60 hover:text-white hover:bg-white/10"}`}>
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs text-white/50 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function QuickLine({ label, value, tone = "text-white" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/45">{label}</span>
      <span className={`font-semibold ${tone}`}>{value}</span>
    </div>
  );
}

function LoadingBlock() {
  return <div className="h-full min-h-28 flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-white/35" /></div>;
}

function EmptyBlock({ label }) {
  return <div className="min-h-28 flex items-center justify-center text-center text-white/35 text-sm">{label}</div>;
}

const tooltipStyle = {
  background: "#171717",
  border: "1px solid rgba(255,255,255,.12)",
  borderRadius: 12,
  color: "#fff",
};

const inputCls = "w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#FF6B35]/50";
