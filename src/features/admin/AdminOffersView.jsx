import { Plus, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import { formatPrice } from "@/lib/catalog";
import { telegramStatuses } from "@/lib/telegramOffersApi";
import { EmptyBlock, Field, inputCls, LoadingBlock } from "@/features/admin/AdminUi";
import { number, statusClasses, statusLabels } from "@/features/admin/adminOfferConfig";

export function OffersView({
  offers,
  loading,
  search,
  setSearch,
  status,
  setStatus,
  category,
  setCategory,
  categories,
  onNew,
  onEdit,
  onRefresh,
  onRetry,
  onRemove,
  selectedIds,
  toggleSelected,
  toggleAllVisible,
  clearSelection,
  bulkStatus,
  setBulkStatus,
  bulkCategory,
  setBulkCategory,
  bulkUpdate,
  bulkRemove,
  bulkBusy,
}) {
  const allVisibleSelected = offers.length > 0 && offers.every((offer) => selectedIds.includes(offer.id));
  const selectedCount = selectedIds.length;

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
            <label className="sr-only" htmlFor="admin-offer-search">Buscar ofertas</label>
            <input id="admin-offer-search" value={search} onChange={(e) => setSearch(e.target.value)} className={`${inputCls} pl-10`} placeholder="Buscar por produto, loja ou categoria" />
          </div>
          <select aria-label="Filtrar por status" value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
            <option value="">Todos os status</option>
            {telegramStatuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
          </select>
          <select aria-label="Filtrar por categoria" value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            <option value="">Todas as categorias</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button onClick={onRefresh} className="px-4 py-2.5 bg-white/10 rounded-xl font-semibold flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4" /> Atualizar</button>
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="bg-[#FF6B35]/10 border border-[#FF6B35]/30 rounded-2xl p-4">
          <div className="flex flex-col xl:flex-row xl:items-end gap-3">
            <div className="xl:w-48">
              <p className="text-sm font-semibold">{selectedCount} selecionada(s)</p>
              <button onClick={clearSelection} className="text-xs text-white/45 hover:text-white mt-1">Limpar selecao</button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 flex-1">
              <Field label="Alterar status">
                <select aria-label="Status para as ofertas selecionadas" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} className={inputCls}>
                  <option value="">Manter status</option>
                  {telegramStatuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
                </select>
              </Field>
              <Field label="Alterar categoria">
                <select aria-label="Categoria para as ofertas selecionadas" value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} className={inputCls}>
                  <option value="">Manter categoria</option>
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={bulkBusy} onClick={bulkUpdate} className="min-h-10 px-4 py-2.5 bg-white text-[#111111] rounded-xl font-semibold disabled:opacity-50 flex items-center gap-2"><Save className="w-4 h-4" /> Aplicar</button>
              <button disabled={bulkBusy} onClick={bulkRemove} className="min-h-10 px-4 py-2.5 bg-red-500 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center gap-2"><Trash2 className="w-4 h-4" /> Excluir</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="hidden md:grid grid-cols-[32px_minmax(0,1fr)_130px_150px_120px_96px] gap-4 px-4 py-3 text-xs uppercase tracking-wide text-white/35 border-b border-white/10">
          <input type="checkbox" checked={allVisibleSelected} onChange={() => toggleAllVisible(offers)} className="w-4 h-4 accent-[#FF6B35]" aria-label="Selecionar ofertas visiveis" />
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
              <OfferRow
                key={offer.id}
                offer={offer}
                selected={selectedIds.includes(offer.id)}
                onToggleSelected={toggleSelected}
                onEdit={onEdit}
                onRetry={onRetry}
                onRemove={onRemove}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OfferRow({ offer, selected, onToggleSelected, onEdit, onRetry, onRemove }) {
  return (
    <div className={`grid md:grid-cols-[32px_minmax(0,1fr)_130px_150px_120px_96px] gap-4 p-4 items-start md:items-center hover:bg-white/[0.03] ${selected ? "bg-[#FF6B35]/10" : ""}`}>
      <input type="checkbox" checked={selected} onChange={() => onToggleSelected(offer.id)} className="w-4 h-4 mt-5 md:mt-0 accent-[#FF6B35]" aria-label={`Selecionar ${offer.productName}`} />
      <button onClick={() => onEdit(offer)} className="flex items-center gap-3 min-w-0 text-left">
        <div className="w-14 h-14 bg-white rounded-xl overflow-hidden shrink-0">
          {offer.imageUrl && <img src={offer.imageUrl} alt="" className="w-full h-full object-contain" />}
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate">{offer.productName}</p>
          <p className="text-white/35 text-xs truncate">{offer.platform} / {offer.category}</p>
          {offer.errorMessage && <p className="text-red-300 text-xs truncate">Erro: {offer.errorMessage}</p>}
        </div>
      </button>
      <span className={`w-max px-2.5 py-1 rounded-full text-xs font-semibold ${statusClasses[offer.status] || statusClasses.RASCUNHO}`}>{statusLabels[offer.status] || offer.status}</span>
      <div className="md:block flex items-end gap-2">
        <p className="font-semibold">{formatPrice(number(offer.currentPrice))}</p>
        {offer.previousPrice && <p className="text-xs text-white/35 line-through">{formatPrice(number(offer.previousPrice))}</p>}
      </div>
      <p className="text-xs text-white/40 md:block">{offer.scheduledAt ? new Date(offer.scheduledAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "Sem agenda"}</p>
      <div className="flex md:justify-end gap-1">
        {offer.status === "ERRO" && <button onClick={() => onRetry(offer)} title="Reenviar" aria-label={`Reenviar ${offer.productName}`} className="min-h-10 min-w-10 p-2 text-white/50 hover:text-[#FF6B35]"><RefreshCw className="w-4 h-4" /></button>}
        <button onClick={() => onRemove(offer)} title="Excluir" aria-label={`Excluir ${offer.productName}`} className="min-h-10 min-w-10 p-2 text-white/50 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
      </div>
    </div>
  );
}
