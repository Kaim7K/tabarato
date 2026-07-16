import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Edit, Trash2, ExternalLink, Package, Loader2 } from "lucide-react";
import ProductForm from "./ProductForm";

const statusColors = {
  published: "bg-[#168A55]/15 text-[#168A55]",
  draft: "bg-white/10 text-white/40",
  pending: "bg-[#FF6B35]/15 text-[#FF6B35]",
  scheduled: "bg-blue-500/15 text-blue-400",
  hidden: "bg-white/10 text-white/30",
  removed: "bg-red-500/15 text-red-400",
};
const statusLabels = {
  published: "Publicada", draft: "Rascunho", pending: "Pendente",
  scheduled: "Agendada", hidden: "Oculta", removed: "Removida",
};
const filters = [
  { key: "all", label: "Todas" },
  { key: "published", label: "Publicadas" },
  { key: "pending", label: "Pendentes" },
  { key: "draft", label: "Rascunhos" },
];

export default function ProductManager({ offers, reload }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = offers.filter((o) => {
    const q = search.toLowerCase();
    const matchesSearch = !q ||
      o.name?.toLowerCase().includes(q) ||
      o.barcode?.toLowerCase().includes(q) ||
      o.internal_code?.toLowerCase().includes(q) ||
      o.category?.toLowerCase().includes(q);
    const matchesFilter = filter === "all" || o.status === filter;
    return matchesSearch && matchesFilter;
  });

  const handleEdit = (offer) => { setEditing(offer); setFormOpen(true); };
  const handleNew = () => { setEditing(null); setFormOpen(true); };
  const handleClose = () => { setFormOpen(false); setEditing(null); };
  const handleSaved = () => { handleClose(); reload(); };

  const handleDelete = async (id) => {
    setDeleting(true);
    try { await base44Delete(id); reload(); setConfirmDelete(null); }
    catch (e) {}
    setDeleting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold mb-1">Produtos</h2>
          <p className="text-white/40 text-sm">{offers.length} itens cadastrados · {offers.filter(o => o.status === "published").length} publicados</p>
        </div>
        <button onClick={handleNew} className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#FF6B35] hover:bg-[#D95426] text-white font-semibold rounded-xl transition">
          <Plus className="w-4 h-4" /> Novo produto
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, código de barras, código interno, categoria..."
            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#FF6B35]/50"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2.5 text-sm font-medium rounded-xl whitespace-nowrap transition ${
                filter === f.key ? "bg-white text-[#0D0D0D]" : "bg-white/5 text-white/50 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 bg-white/5 rounded-2xl border border-white/10">
          <Package className="w-12 h-12 text-white/10 mx-auto mb-4" />
          <p className="text-white/30 text-lg">Nenhum produto encontrado</p>
          <button onClick={handleNew} className="mt-4 text-[#FF6B35] font-medium hover:underline">
            Cadastrar primeiro produto →
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((o) => (
            <div key={o.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 hover:bg-white/[0.07] transition">
              <div className="w-14 h-14 rounded-xl overflow-hidden bg-white/10 shrink-0 flex items-center justify-center">
                {o.image ? <img src={o.image} alt="" className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-white/20" />}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium text-white truncate">{o.name}</h4>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="text-white/40 text-xs">{o.category}</span>
                  {o.barcode && <span className="text-white/30 text-xs font-mono"> barcode: {o.barcode}</span>}
                  {o.internal_code && <span className="text-white/30 text-xs font-mono">cód: {o.internal_code}</span>}
                  <span className="text-white/60 text-xs font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>R$ {o.price?.toFixed(2).replace(".", ",")}</span>
                  <span className="text-white/30 text-xs">estoque: {o.stock || 0}</span>
                  <span className="text-white/30 text-xs">{o.clicks || 0} cliques</span>
                </div>
              </div>
              <span className={`px-2.5 py-1 text-xs font-semibold rounded-full shrink-0 ${statusColors[o.status] || statusColors.draft}`}>
                {statusLabels[o.status] || o.status}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleEdit(o)} className="p-2 text-white/40 hover:text-[#FF6B35] transition rounded-lg hover:bg-white/5" title="Editar">
                  <Edit className="w-4 h-4" />
                </button>
                <Link to={`/oferta/${o.id}`} className="p-2 text-white/40 hover:text-white transition rounded-lg hover:bg-white/5" title="Ver no site">
                  <ExternalLink className="w-4 h-4" />
                </Link>
                <button onClick={() => setConfirmDelete(o)} className="p-2 text-white/40 hover:text-red-400 transition rounded-lg hover:bg-white/5" title="Excluir">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Product form drawer */}
      {formOpen && <ProductForm offer={editing} onClose={handleClose} onSaved={handleSaved} />}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <Trash2 className="w-8 h-8 text-red-400 mb-3" />
            <h3 className="font-bold text-lg mb-1">Excluir produto?</h3>
            <p className="text-white/50 text-sm mb-5">"{confirmDelete.name}" será removido permanentemente. Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 px-4 py-2.5 bg-white/10 text-white font-medium rounded-xl hover:bg-white/15 transition">
                Cancelar
              </button>
              <button disabled={deleting} onClick={() => handleDelete(confirmDelete.id)} className="flex-1 px-4 py-2.5 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600 transition disabled:opacity-50">
                {deleting ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function base44Delete(id) {
  const { base44 } = await import("@/api/base44Client");
  await base44.entities.Offer.delete(id);
}