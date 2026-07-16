import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CalendarClock, CheckCircle2, Loader2, RefreshCw, Save, Search, Send, Trash2, Zap } from "lucide-react";
import { DEFAULT_CATEGORIES, formatPrice, SITE_NAME } from "@/lib/catalog";
import { formatTelegramPreview, getAdminKey, setAdminKey, telegramOffersApi, telegramStatuses } from "@/lib/telegramOffersApi";

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

const statusClasses = {
  RASCUNHO: "bg-white/10 text-white/50",
  APROVADO: "bg-blue-500/15 text-blue-300",
  AGENDADO: "bg-yellow-500/15 text-yellow-300",
  PUBLICANDO: "bg-purple-500/15 text-purple-300",
  PUBLICADO: "bg-[#168A55]/15 text-[#168A55]",
  ERRO: "bg-red-500/15 text-red-300",
  EXPIRADO: "bg-white/10 text-white/30",
};

const toDatetimeLocal = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const fromDatetimeLocal = (value) => value ? new Date(value).toISOString() : "";

export default function AdminOffers() {
  const [adminKey, setAdminKeyState] = useState(getAdminKey());
  const [offers, setOffers] = useState([]);
  const [form, setForm] = useState(emptyOffer);
  const [editingId, setEditingId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selected = useMemo(() => offers.find((offer) => offer.id === editingId), [offers, editingId]);
  const categories = DEFAULT_CATEGORIES.filter((category) => !category.virtual).map((category) => category.name);

  const showMessage = (value) => {
    setMessage(value);
    setTimeout(() => setMessage(""), 3500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await telegramOffersApi.list({ search, status, category });
      setOffers(data.offers || []);
    } catch (error) {
      showMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const persistKey = () => {
    setAdminKey(adminKey);
    showMessage("Chave administrativa salva neste navegador.");
    load();
  };

  const startNew = () => {
    setEditingId("");
    setForm(emptyOffer);
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
  };

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const validateClient = () => {
    const missing = [];
    if (!form.productName) missing.push("nome");
    if (!form.shortDescription) missing.push("descrição");
    if (!form.currentPrice) missing.push("preço");
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
      showMessage(`Faltam informações: ${missing.join(", ")}.`);
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
      showMessage("Informe data e horário para agendar.");
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
      showMessage("Oferta excluída.");
      await load();
      if (editingId === offer.id) startNew();
    } catch (error) {
      showMessage(error.message);
    }
  };

  const retry = async (offer) => {
    try {
      await telegramOffersApi.publish(offer.id);
      showMessage("Reenvio concluído.");
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
      <div className="border-b border-white/10 sticky top-0 z-40 bg-[#0D0D0D]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-[#FF6B35]" fill="currentColor" />
            </div>
            <span className="font-bold text-lg">{SITE_NAME} <span className="text-white/40 font-normal hidden sm:inline">· Ofertas Telegram</span></span>
          </div>
          <Link to="/admin" className="text-sm text-white/60 hover:text-[#FF6B35] transition flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <section className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
            <div className="flex-1">
              <label className="block text-xs text-white/50 mb-1.5">Chave administrativa</label>
              <input value={adminKey} onChange={(e) => setAdminKeyState(e.target.value)} type="password" className={inputCls} placeholder="ADMIN_API_KEY" />
            </div>
            <button onClick={persistKey} className="px-5 py-2.5 bg-white text-[#0D0D0D] rounded-xl font-semibold">Salvar chave</button>
            <button onClick={testTelegram} disabled={saving} className="px-5 py-2.5 bg-[#168A55] rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Testar conexão com Telegram
            </button>
          </div>
        </section>

        <section className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} className={`${inputCls} pl-10`} placeholder="Pesquisar por nome" />
              </div>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
                <option value="">Todos os status</option>
                {telegramStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
                <option value="">Todas as categorias</option>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <button onClick={load} className="px-5 py-2.5 bg-white/10 rounded-xl font-semibold">Filtrar</button>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-4 flex items-center justify-between">
                <h2 className="font-bold text-lg">Ofertas</h2>
                <button onClick={startNew} className="px-4 py-2 bg-[#FF6B35] rounded-xl text-sm font-semibold">Nova oferta</button>
              </div>
              {loading ? (
                <div className="py-16 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-white/30" /></div>
              ) : offers.length === 0 ? (
                <div className="py-16 text-center text-white/35">Nenhuma oferta encontrada.</div>
              ) : (
                <div className="divide-y divide-white/10">
                  {offers.map((offer) => (
                    <div key={offer.id} className="p-4 flex gap-4 items-center hover:bg-white/[0.03]">
                      <div className="w-14 h-14 bg-white/10 rounded-xl overflow-hidden shrink-0">
                        {offer.imageUrl && <img src={offer.imageUrl} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <button onClick={() => edit(offer)} className="text-left flex-1 min-w-0">
                        <p className="font-medium truncate">{offer.productName}</p>
                        <p className="text-white/35 text-xs truncate">{offer.platform} · {offer.category} · {formatPrice(Number(offer.currentPrice))}</p>
                        <p className="text-white/30 text-xs">
                          Agendamento: {offer.scheduledAt ? new Date(offer.scheduledAt).toLocaleString("pt-BR") : "-"} · Publicado: {offer.publishedAt ? new Date(offer.publishedAt).toLocaleString("pt-BR") : "-"}
                        </p>
                        {offer.errorMessage && <p className="text-red-300 text-xs truncate">Erro: {offer.errorMessage}</p>}
                        {offer.telegramMessageId && <p className="text-[#168A55] text-xs">Telegram ID: {offer.telegramMessageId}</p>}
                      </button>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusClasses[offer.status] || statusClasses.RASCUNHO}`}>{offer.status}</span>
                      <div className="flex gap-1">
                        {offer.status === "ERRO" && <button onClick={() => retry(offer)} title="Reenviar" className="p-2 text-white/50 hover:text-[#FF6B35]"><RefreshCw className="w-4 h-4" /></button>}
                        <button onClick={() => remove(offer)} title="Excluir" className="p-2 text-white/50 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
              <div>
                <h2 className="font-bold text-lg">{selected ? "Editar oferta" : "Nova oferta"}</h2>
                <p className="text-white/35 text-sm">Salve, publique agora ou agende sem recarregar a página.</p>
              </div>
              <Field label="Nome do produto *"><input value={form.productName} onChange={(e) => set("productName", e.target.value)} className={inputCls} /></Field>
              <Field label="Descrição curta *"><textarea value={form.shortDescription} onChange={(e) => set("shortDescription", e.target.value)} rows={2} className={`${inputCls} resize-none`} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Preço atual *"><input type="number" step="0.01" value={form.currentPrice} onChange={(e) => set("currentPrice", e.target.value)} className={inputCls} /></Field>
                <Field label="Preço anterior"><input type="number" step="0.01" value={form.previousPrice} onChange={(e) => set("previousPrice", e.target.value)} className={inputCls} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cupom"><input value={form.coupon} onChange={(e) => set("coupon", e.target.value)} className={inputCls} /></Field>
                <Field label="Plataforma *">
                  <select value={form.platform} onChange={(e) => set("platform", e.target.value)} className={inputCls}>
                    <option>Mercado Livre</option>
                    <option>Shopee</option>
                    <option>Amazon</option>
                    <option>Outra</option>
                  </select>
                </Field>
              </div>
              <Field label="Categoria *">
                <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inputCls}>
                  {categories.map((item) => <option key={item}>{item}</option>)}
                </select>
              </Field>
              <Field label="URL da imagem"><input value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} className={inputCls} placeholder="https://..." /></Field>
              <Field label="Link oficial de afiliado *"><input value={form.affiliateLink} onChange={(e) => set("affiliateLink", e.target.value)} className={inputCls} placeholder="https://..." /></Field>
              <Field label="Texto complementar"><textarea value={form.extraText} onChange={(e) => set("extraText", e.target.value)} rows={2} className={`${inputCls} resize-none`} /></Field>
              <Field label="Data e horário do agendamento"><input type="datetime-local" value={form.scheduledAt} onChange={(e) => set("scheduledAt", e.target.value)} className={inputCls} /></Field>

              <div className="flex flex-wrap gap-2">
                <button disabled={saving} onClick={() => save({ status: "RASCUNHO" })} className="px-4 py-2.5 bg-white/10 rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" /> Rascunho</button>
                <button disabled={saving} onClick={publishNow} className="px-4 py-2.5 bg-[#FF6B35] rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50"><Send className="w-4 h-4" /> Publicar agora</button>
                <button disabled={saving} onClick={schedule} className="px-4 py-2.5 bg-blue-500 rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50"><CalendarClock className="w-4 h-4" /> Agendar</button>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="bg-white text-[#111111] rounded-2xl overflow-hidden">
                <div className="aspect-square bg-[#F5F2EB]">{form.imageUrl && <img src={form.imageUrl} alt="" className="w-full h-full object-cover" />}</div>
                <div className="p-4">
                  <p className="text-xs text-[#111111]/50 mb-1">{form.category}</p>
                  <h3 className="font-bold">{form.productName || "Nome do produto"}</h3>
                  <p className="text-sm text-[#111111]/60 mt-2">{form.shortDescription || "Descrição curta da oferta"}</p>
                  <p className="font-bold text-xl mt-3">{form.currentPrice ? formatPrice(Number(form.currentPrice)) : "R$ 0,00"}</p>
                </div>
              </div>
              <pre className="bg-white/5 border border-white/10 rounded-2xl p-4 text-xs text-white/70 whitespace-pre-wrap font-sans">{formatTelegramPreview(form)}</pre>
            </div>
          </div>
        </section>
      </main>
      {message && <div className="fixed bottom-6 right-6 bg-white text-[#111111] rounded-xl px-4 py-2 text-sm font-medium shadow-lg">{message}</div>}
    </div>
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

const inputCls = "w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#FF6B35]/50";
