import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Search, AlertTriangle, Package, Save, Check, Loader2 } from "lucide-react";

export default function StockManager({ offers, reload }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState(null);
  const [toast, setToast] = useState("");

  const filters = [
    { key: "all", label: "Todos" },
    { key: "low", label: "Estoque baixo" },
    { key: "out", label: "Sem estoque" },
    { key: "in", label: "Em estoque" },
  ];

  const filtered = offers.filter((o) => {
    const q = search.toLowerCase();
    const matchesSearch = !q || o.name?.toLowerCase().includes(q) || o.barcode?.toLowerCase().includes(q) || o.internal_code?.toLowerCase().includes(q);
    const stock = o.stock || 0;
    const matchesFilter =
      filter === "all" ||
      (filter === "low" && stock > 0 && stock <= 5) ||
      (filter === "out" && stock === 0) ||
      (filter === "in" && stock > 5);
    return matchesSearch && matchesFilter;
  });

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(""), 2000); };

  const handleSave = async (offer) => {
    setSaving(offer.id);
    try {
      await base44.entities.Offer.update(offer.id, { stock: parseInt(editing[offer.id]) });
      delete editing[offer.id];
      reload();
      showToast("Estoque atualizado!");
    } catch (e) { showToast("Erro"); }
    setSaving(null);
  };

  const margin = (o) => {
    if (!o.cost) return null;
    const m = (o.price || 0) - o.cost;
    const pct = o.price ? (m / o.price) * 100 : 0;
    return { value: m, pct };
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Estoque</h2>
        <p className="text-white/40 text-sm">
          {offers.reduce((s, o) => s + (o.stock || 0), 0)} unidades em estoque · {offers.filter(o => (o.stock || 0) === 0).length} sem estoque · {offers.filter(o => (o.stock || 0) > 0 && (o.stock || 0) <= 5).length} com estoque baixo
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, código..." className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#FF6B35]/50" />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {filters.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`px-4 py-2.5 text-sm font-medium rounded-xl whitespace-nowrap transition ${filter === f.key ? "bg-white text-[#0D0D0D]" : "bg-white/5 text-white/50"}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-3 text-xs text-white/40 uppercase tracking-wide font-medium border-b border-white/10">
          <div className="col-span-4">Produto</div>
          <div className="col-span-2">Categoria</div>
          <div className="col-span-2 text-right">Preço / Custo</div>
          <div className="col-span-2 text-right">Margem</div>
          <div className="col-span-2 text-right">Estoque</div>
        </div>
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-white/30">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum produto encontrado</p>
          </div>
        ) : (
          filtered.map((o) => {
            const stock = o.stock || 0;
            const isLow = stock > 0 && stock <= 5;
            const isOut = stock === 0;
            const m = margin(o);
            const editValue = editing[o.id] != null ? editing[o.id] : stock;
            return (
              <div key={o.id} className="grid grid-cols-2 lg:grid-cols-12 gap-3 lg:gap-4 px-5 py-4 border-b border-white/5 last:border-0 hover:bg-white/[0.03] transition items-center">
                <div className="col-span-2 lg:col-span-4 flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/10 shrink-0 flex items-center justify-center">
                    {o.image ? <img src={o.image} alt="" className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-white/20" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{o.name}</p>
                    {o.internal_code && <p className="text-xs text-white/30 font-mono">{o.internal_code}</p>}
                  </div>
                </div>
                <div className="hidden lg:block lg:col-span-2 text-sm text-white/50">{o.category}</div>
                <div className="hidden lg:block lg:col-span-2 text-right text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  <span className="text-white">R$ {o.price?.toFixed(2).replace(".", ",")}</span>
                  {o.cost ? <span className="text-white/30 block text-xs">custo: R$ {o.cost.toFixed(2).replace(".", ",")}</span> : null}
                </div>
                <div className="hidden lg:block lg:col-span-2 text-right text-sm">
                  {m ? (
                    <span className="text-[#168A55] font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      R$ {m.value.toFixed(2).replace(".", ",")} <span className="text-xs opacity-60">({m.pct.toFixed(0)}%)</span>
                    </span>
                  ) : <span className="text-white/20">—</span>}
                </div>
                <div className="col-span-2 lg:col-span-2 flex items-center justify-end gap-2">
                  {isOut && <AlertTriangle className="w-4 h-4 text-[#FF6B35] shrink-0" />}
                  <input
                    type="number"
                    value={editValue}
                    onChange={(e) => setEditing({ ...editing, [o.id]: e.target.value })}
                    className={`w-16 lg:w-20 px-2 py-1.5 bg-white/5 border rounded-lg text-white text-sm text-center font-mono focus:outline-none transition ${
                      isOut ? "border-[#FF6B35]/50" : isLow ? "border-yellow-500/40" : "border-white/10 focus:border-[#FF6B35]/50"
                    }`}
                  />
                  {editing[o.id] != null && (
                    <button disabled={saving === o.id} onClick={() => handleSave(o)} className="p-1.5 text-[#168A55] hover:bg-[#168A55]/10 rounded-lg transition disabled:opacity-50">
                      {saving === o.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2 bg-white text-[#111111] rounded-xl text-sm font-medium shadow-lg flex items-center gap-2">
          <Check className="w-4 h-4 text-[#168A55]" /> {toast}
        </div>
      )}
    </div>
  );
}