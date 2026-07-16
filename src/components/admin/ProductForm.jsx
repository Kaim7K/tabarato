import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { X, Save, Loader2, Star, Wand2 } from "lucide-react";
import { visibleCategories } from "@/lib/catalog";
import { importProductFromAffiliateLink } from "@/lib/productImport";

export default function ProductForm({ offer, onClose, onSaved }) {
  const isEdit = !!offer?.id;
  const [form, setForm] = useState({
    name: offer?.name || "",
    description: offer?.description || "",
    category: offer?.category || "Tecnologia",
    barcode: offer?.barcode || "",
    internal_code: offer?.internal_code || "",
    affiliate_link: offer?.affiliate_link || "",
    platform: offer?.platform || "",
    image: offer?.image || "",
    price: offer?.price != null ? String(offer.price) : "",
    cost: offer?.cost != null ? String(offer.cost) : "",
    stock: offer?.stock != null ? String(offer.stock) : "0",
    benefit: offer?.benefit || "",
    reason: offer?.reason || "",
    status: offer?.status || "draft",
    is_featured: offer?.is_featured || false,
    schedule_slot: offer?.time_label || "08:00",
  });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState("");

  const TIME_SLOTS = [
    { value: "08:00", label: "08:00 — Manhã" },
    { value: "11:30", label: "11:30 — Pré-almoço" },
    { value: "14:00", label: "14:00 — Tarde" },
    { value: "17:30", label: "17:30 — Fim de tarde" },
    { value: "20:00", label: "20:00 — Noite" },
  ];
  const statusOptions = [
    { value: "draft", label: "Rascunho" },
    { value: "pending", label: "Pendente" },
    { value: "published", label: "Publicada" },
    { value: "scheduled", label: "Agendada" },
    { value: "hidden", label: "Oculta" },
  ];

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 3500);
  };

  const calcScore = () => {
    let s = 0;
    if (form.name) s += 10;
    if (form.category) s += 5;
    if (form.affiliate_link) s += 10;
    if (form.image) s += 10;
    if (form.price) s += 15;
    if (form.benefit) s += 15;
    if (form.reason) s += 15;
    if (form.platform) s += 10;
    if (form.description) s += 5;
    if (form.barcode || form.internal_code) s += 5;
    return Math.min(s, 100);
  };
  const score = calcScore();
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleImport = async () => {
    if (!form.affiliate_link) {
      showToast("Cole o link de afiliado primeiro.");
      return;
    }
    setImporting(true);
    try {
      const imported = await importProductFromAffiliateLink(form.affiliate_link);
      setForm((current) => ({
        ...current,
        name: imported.name || current.name,
        description: imported.description || current.description,
        benefit: current.benefit || imported.description || "",
        image: imported.image || current.image,
        price: imported.price || current.price,
        platform: imported.platform || current.platform,
      }));
      showToast(imported.price ? "Dados importados. Confira antes de publicar." : "Dados importados. Confira o preço manualmente.");
    } catch (error) {
      showToast(error.message || "Não foi possível importar dados desse link.");
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async (overrideStatus) => {
    if (!form.name || !form.affiliate_link || !form.price) {
      showToast("Preencha nome, link e preço.");
      return;
    }
    setSaving(true);
    const status = overrideStatus || form.status;
    const data = {
      ...form,
      price: parseFloat(form.price) || 0,
      cost: parseFloat(form.cost) || 0,
      stock: parseInt(form.stock) || 0,
      score,
      status,
      published_date: status === "published" && !offer?.published_date ? new Date().toISOString() : offer?.published_date,
      time_label: status === "published" && !offer?.published_date ? new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : offer?.time_label,
    };
    if (status === "scheduled" && form.schedule_slot) {
      const now = new Date();
      const [h, m] = form.schedule_slot.split(":");
      const scheduled = new Date(now);
      scheduled.setHours(parseInt(h), parseInt(m), 0, 0);
      if (scheduled <= now) scheduled.setDate(scheduled.getDate() + 1);
      data.published_date = scheduled.toISOString();
      data.time_label = form.schedule_slot;
    }
    try {
      if (isEdit) {
        await base44.entities.Offer.update(offer.id, data);
      } else {
        await base44.entities.Offer.create({ ...data, clicks: 0 });
      }
      onSaved();
    } catch {
      showToast("Erro ao salvar.");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#0D0D0D] border-l border-white/10 h-full overflow-y-auto">
        <div className="sticky top-0 bg-[#0D0D0D]/95 backdrop-blur-md border-b border-white/10 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="font-bold text-lg">{isEdit ? "Editar produto" : "Novo produto"}</h2>
            <p className="text-white/40 text-xs">{isEdit ? offer.name : "Cadastre um novo item"}</p>
          </div>
          <button onClick={onClose} className="p-2 text-white/40 hover:text-white transition rounded-lg hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="bg-[#FF6B35]/10 border border-[#FF6B35]/20 rounded-xl p-4">
            <Field label="Link oficial de afiliado *">
              <div className="flex gap-2">
                <input type="url" value={form.affiliate_link} onChange={(e) => set("affiliate_link", e.target.value)} placeholder="https://..." className={inputCls} />
                <button
                  type="button"
                  disabled={importing}
                  onClick={handleImport}
                  className="px-4 py-2.5 bg-[#FF6B35] hover:bg-[#D95426] text-white font-semibold rounded-xl transition disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  Preencher
                </button>
              </div>
              <p className="text-white/35 text-xs mt-2">
                Tenta importar nome, foto, descrição, preço e loja a partir dos metadados originais da página.
              </p>
            </Field>
          </div>

          <div className="flex items-center justify-between bg-white/5 rounded-xl p-4 border border-white/10">
            <div>
              <p className="text-white/40 text-xs uppercase tracking-wide">Pontuação</p>
              <p className="text-2xl font-bold" style={{ fontFamily: "'JetBrains Mono', monospace", color: score >= 80 ? "#168A55" : score >= 65 ? "#FF6B35" : "rgba(255,255,255,0.3)" }}>
                {score}<span className="text-white/20 text-sm">/100</span>
              </p>
            </div>
            <span className="text-xs px-3 py-1 rounded-full font-semibold" style={{
              background: score >= 80 ? "rgba(22,138,85,0.15)" : score >= 65 ? "rgba(255,107,53,0.15)" : "rgba(255,255,255,0.05)",
              color: score >= 80 ? "#168A55" : score >= 65 ? "#FF6B35" : "rgba(255,255,255,0.4)",
            }}>
              {score >= 80 ? "Alta" : score >= 65 ? "Revisar" : "Rascunho"}
            </span>
          </div>

          <Field label="Nome *">
            <input type="text" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex: Suporte articulado para monitor" className={inputCls} />
          </Field>

          <Field label="Descrição">
            <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Descrição curta do produto" className={`${inputCls} resize-none`} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Categoria *">
              <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inputCls}>
                {visibleCategories.map((c) => <option key={c.slug} value={c.name} className="bg-[#0D0D0D]">{c.name}</option>)}
              </select>
            </Field>
            <Field label="Plataforma">
              <input type="text" value={form.platform} onChange={(e) => set("platform", e.target.value)} placeholder="Ex: Mercado Livre" className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Código de barras">
              <input type="text" value={form.barcode} onChange={(e) => set("barcode", e.target.value)} placeholder="7891234567890" className={`${inputCls} font-mono`} />
            </Field>
            <Field label="Código interno">
              <input type="text" value={form.internal_code} onChange={(e) => set("internal_code", e.target.value)} placeholder="TB-001" className={`${inputCls} font-mono`} />
            </Field>
          </div>

          <Field label="URL da imagem">
            <input type="url" value={form.image} onChange={(e) => set("image", e.target.value)} placeholder="https://..." className={inputCls} />
            {form.image && <img src={form.image} alt="" className="mt-2 w-20 h-20 rounded-xl object-cover" />}
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Preço *">
              <input type="number" step="0.01" value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="89.90" className={`${inputCls} font-mono`} />
            </Field>
            <Field label="Custo">
              <input type="number" step="0.01" value={form.cost} onChange={(e) => set("cost", e.target.value)} placeholder="0.00" className={`${inputCls} font-mono`} />
            </Field>
            <Field label="Estoque">
              <input type="number" value={form.stock} onChange={(e) => set("stock", e.target.value)} placeholder="0" className={`${inputCls} font-mono`} />
            </Field>
          </div>

          <Field label="Benefício principal">
            <textarea value={form.benefit} onChange={(e) => set("benefit", e.target.value)} rows={2} placeholder="Ajuda a liberar espaço na mesa..." className={`${inputCls} resize-none`} />
          </Field>

          <Field label="Por que selecionamos? (um motivo por linha)">
            <textarea value={form.reason} onChange={(e) => set("reason", e.target.value)} rows={4} placeholder={"Ajuda na organização\nPossui bom custo-benefício\nServe para uso diário"} className={`${inputCls} resize-none`} />
          </Field>

          <Field label="Status">
            <select value={form.status} onChange={(e) => set("status", e.target.value)} className={inputCls}>
              {statusOptions.map((s) => <option key={s.value} value={s.value} className="bg-[#0D0D0D]">{s.label}</option>)}
            </select>
          </Field>

          {form.status === "scheduled" && (
            <Field label="Horário de publicação automática">
              <select value={form.schedule_slot} onChange={(e) => set("schedule_slot", e.target.value)} className={inputCls}>
                {TIME_SLOTS.map((s) => <option key={s.value} value={s.value} className="bg-[#0D0D0D]">{s.label}</option>)}
              </select>
              <p className="text-white/30 text-xs mt-1.5">A oferta aparece no site automaticamente no horário escolhido.</p>
            </Field>
          )}

          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              onClick={() => set("is_featured", !form.is_featured)}
              className={`w-11 h-6 rounded-full transition relative ${form.is_featured ? "bg-[#FF6B35]" : "bg-white/10"}`}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${form.is_featured ? "left-[22px]" : "left-0.5"}`} />
            </button>
            <span className="text-sm text-white/70 flex items-center gap-1.5">
              <Star className="w-4 h-4 text-[#FF6B35]" fill={form.is_featured ? "currentColor" : "none"} />
              Destacar como "Achado do dia"
            </span>
          </label>
        </div>

        <div className="sticky bottom-0 bg-[#0D0D0D]/95 backdrop-blur-md border-t border-white/10 px-6 py-4 flex flex-wrap gap-3">
          <button disabled={saving} onClick={() => handleSave("published")} className="px-5 py-2.5 bg-[#FF6B35] hover:bg-[#D95426] text-white font-semibold rounded-xl transition disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEdit ? "Salvar e publicar" : "Publicar agora"}
          </button>
          <button disabled={saving} onClick={() => handleSave()} className="px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl transition disabled:opacity-50">
            Salvar
          </button>
          {!isEdit && (
            <button disabled={saving} onClick={() => handleSave("draft")} className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 font-semibold rounded-xl transition border border-white/10 disabled:opacity-50">
              Rascunho
            </button>
          )}
        </div>

        {toast && (
          <div className="fixed bottom-20 right-6 px-4 py-2 bg-white text-[#111111] rounded-xl text-sm font-medium shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls = "w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-white/30 focus:outline-none focus:border-[#FF6B35]/50 transition text-sm";

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-white/50 mb-1.5 font-medium">{label}</label>
      {children}
    </div>
  );
}
