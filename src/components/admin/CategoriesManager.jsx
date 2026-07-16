import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Edit, Trash2, Tag, Loader2, Check, Package } from "lucide-react";
import { slugify } from "@/lib/catalog";

export default function CategoriesManager({ offers }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", slug: "", icon: "" });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState("");

  const load = () => {
    base44.entities.Category.list("sort_order", 50)
      .then(setCategories)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(""), 2500); };

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const data = { ...form, slug: form.slug || slugify(form.name) };
      if (editing) {
        await base44.entities.Category.update(editing.id, data);
      } else {
        await base44.entities.Category.create({ ...data, sort_order: categories.length });
      }
      setForm({ name: "", slug: "", icon: "" });
      setEditing(null);
      load();
      showToast("Categoria salva!");
    } catch {
      showToast("Erro ao salvar.");
    }
    setSaving(false);
  };

  const handleEdit = (cat) => {
    setEditing(cat);
    setForm({ name: cat.name, slug: cat.slug, icon: cat.icon || "" });
  };

  const handleDelete = async (id) => {
    try {
      await base44.entities.Category.delete(id);
      load();
      setConfirmDelete(null);
      showToast("Categoria removida.");
    } catch {
      showToast("Erro ao remover.");
    }
  };

  const offerCount = (catName) => offers.filter((o) => o.category === catName).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Categorias</h2>
        <p className="text-white/40 text-sm">{categories.length} categorias cadastradas</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <Tag className="w-4 h-4 text-[#FF6B35]" />
          {editing ? "Editar categoria" : "Nova categoria"}
        </h3>
        <div className="grid sm:grid-cols-3 gap-3">
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome (ex: Tecnologia)" className={inputCls} />
          <input type="text" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Slug (auto se vazio)" className={inputCls} />
          <input type="text" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="Nome do ícone ou símbolo" className={inputCls} />
        </div>
        <div className="flex gap-3 mt-3">
          <button disabled={saving} onClick={handleSave} className="px-5 py-2.5 bg-[#FF6B35] hover:bg-[#D95426] text-white font-semibold rounded-xl transition disabled:opacity-50 flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {editing ? "Salvar" : "Adicionar"}
          </button>
          {editing && (
            <button onClick={() => { setEditing(null); setForm({ name: "", slug: "", icon: "" }); }} className="px-5 py-2.5 bg-white/10 text-white/60 font-medium rounded-xl hover:bg-white/15 transition">
              Cancelar
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 text-white/20 animate-spin" /></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {categories.map((cat) => (
            <div key={cat.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-xl">
                    {cat.icon || <Package className="w-5 h-5 text-white/40" />}
                  </div>
                  <div>
                    <h4 className="font-medium text-sm">{cat.name}</h4>
                    <p className="text-white/30 text-xs font-mono">/{cat.slug}</p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => handleEdit(cat)} className="p-1.5 text-white/40 hover:text-[#FF6B35] transition"><Edit className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setConfirmDelete(cat)} className="p-1.5 text-white/40 hover:text-red-400 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <p className="text-white/40 text-xs mt-3">{offerCount(cat.name)} produto{offerCount(cat.name) === 1 ? "" : "s"}</p>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-[#1a1a1a] border border-white/10 rounded-2xl p-6 max-w-sm w-full">
            <Trash2 className="w-8 h-8 text-red-400 mb-3" />
            <h3 className="font-bold text-lg mb-1">Excluir categoria?</h3>
            <p className="text-white/50 text-sm mb-5">"{confirmDelete.name}" será removida. Produtos nesta categoria não serão excluídos.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 px-4 py-2.5 bg-white/10 text-white font-medium rounded-xl hover:bg-white/15">Cancelar</button>
              <button onClick={() => handleDelete(confirmDelete.id)} className="flex-1 px-4 py-2.5 bg-red-500 text-white font-semibold rounded-xl hover:bg-red-600">Excluir</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2 bg-white text-[#111111] rounded-xl text-sm font-medium shadow-lg flex items-center gap-2">
          <Check className="w-4 h-4 text-[#168A55]" /> {toast}
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-[#FF6B35]/50";
