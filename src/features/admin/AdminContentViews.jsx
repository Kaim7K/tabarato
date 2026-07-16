import { FolderKanban, Loader2, MessageSquareText, Plus, Save, Send, Sparkles, Trash2 } from "lucide-react";
import { EmptyBlock, Field, inputCls, Panel } from "@/features/admin/AdminUi";

export function MessagesView({ messages, form, setForm, editingId, setEditingId, edit, save, remove, sendNow, reset, saving, sendingMessageId }) {
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const sorted = [...messages].sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_420px] gap-5">
      <div className="space-y-4">
        <div>
          <p className="text-white/45 text-sm">Disparos automaticos</p>
          <h1 className="text-3xl font-bold mt-1">Mensagens recorrentes</h1>
        </div>

        <Panel title="Mensagens cadastradas" icon={MessageSquareText}>
          {sorted.length ? (
            <div className="space-y-3">
              {sorted.map((item) => (
                <div key={item.id} className="bg-white/[0.04] border border-white/10 rounded-2xl p-4">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <button onClick={() => edit(item)} className="text-left min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${item.isActive ? "bg-[#168A55]/15 text-[#4ade80]" : "bg-white/10 text-white/40"}`}>
                          {item.isActive ? "Ativa" : "Inativa"}
                        </span>
                        <span className="text-xs text-white/35">Ordem {item.sortOrder}</span>
                      </div>
                      <h3 className="font-semibold truncate">{item.title}</h3>
                      <p className="text-sm text-white/50 mt-1 line-clamp-2 whitespace-pre-wrap">{item.message}</p>
                      <p className="text-xs text-white/35 mt-2">
                        A cada {item.intervalMinutes} min / Proximo: {item.nextSendAt ? new Date(item.nextSendAt).toLocaleString("pt-BR") : "-"} / Envios: {item.sendCount || 0}
                      </p>
                      {item.errorMessage && <p className="text-xs text-red-300 mt-1">Erro: {item.errorMessage}</p>}
                    </button>
                    <div className="flex flex-wrap gap-1 md:justify-end">
                      <button
                        onClick={() => sendNow(item)}
                        disabled={saving || sendingMessageId === item.id}
                        className="px-3 py-2 bg-[#168A55] hover:bg-[#137247] rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center gap-2"
                      >
                        {sendingMessageId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Enviar agora
                      </button>
                      <button onClick={() => edit(item)} className="px-3 py-2 bg-white/10 rounded-xl text-sm font-semibold">Editar</button>
                      <button onClick={() => remove(item)} className="p-2 text-white/50 hover:text-red-300" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyBlock label="Nenhuma mensagem automatica cadastrada." />
          )}
        </Panel>
      </div>

      <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Panel title={editingId ? "Editar mensagem" : "Nova mensagem"} icon={MessageSquareText}>
          <div className="space-y-4">
            <Field label="Titulo interno *">
              <input value={form.title} onChange={(e) => set("title", e.target.value)} className={inputCls} placeholder="Ex.: Aviso grupo WhatsApp" />
            </Field>
            <Field label="Mensagem para o Telegram *">
              <textarea value={form.message} onChange={(e) => set("message", e.target.value)} rows={7} className={`${inputCls} resize-none`} placeholder="Escreva exatamente como quer enviar no Telegram." />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Periodo">
                <select value={form.intervalMinutes} onChange={(e) => set("intervalMinutes", Number(e.target.value))} className={inputCls}>
                  <option value={30}>A cada 30 minutos</option>
                  <option value={60}>A cada 1 hora</option>
                  <option value={180}>A cada 3 horas</option>
                  <option value={360}>A cada 6 horas</option>
                  <option value={720}>A cada 12 horas</option>
                  <option value={1440}>A cada 1 dia</option>
                  <option value={10080}>A cada 7 dias</option>
                </select>
              </Field>
              <Field label="Ordem">
                <input type="number" value={form.sortOrder} onChange={(e) => set("sortOrder", e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="Proximo envio">
              <input type="datetime-local" value={form.nextSendAt} onChange={(e) => set("nextSendAt", e.target.value)} className={inputCls} />
            </Field>
            <label className="flex items-center gap-3 text-sm text-white/70">
              <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} className="w-4 h-4 accent-[#FF6B35]" />
              Mensagem ativa
            </label>
            <div className="flex flex-wrap gap-2">
              <button disabled={saving} onClick={save} className="px-4 py-2.5 bg-[#FF6B35] rounded-xl font-semibold disabled:opacity-50 flex items-center gap-2"><Save className="w-4 h-4" /> Salvar</button>
              <button onClick={() => { setEditingId(""); reset(); }} className="px-4 py-2.5 bg-white/10 rounded-xl font-semibold">Limpar</button>
            </div>
          </div>
        </Panel>

        <Panel title="Previa" icon={Send}>
          <pre className="text-sm text-white/75 whitespace-pre-wrap font-sans leading-relaxed">{form.message || "Sua mensagem aparecera aqui."}</pre>
        </Panel>
      </div>
    </div>
  );
}

export function CategoriesView({ baseCategories, customCategories, newCategory, setNewCategory, addCategory, removeCategory, offers }) {
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

