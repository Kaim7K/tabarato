import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Plus, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import { formatPrice } from "@/lib/catalog";
import { telegramStatuses } from "@/lib/telegramOffersApi";
import { EmptyBlock, Field, inputCls, LoadingBlock } from "@/features/admin/AdminUi";
import { number, statusClasses, statusLabels } from "@/features/admin/adminOfferConfig";

const PAGE_SIZE = 15;
const SORT_KEY = "tb_admin_offer_sort";

function readInitialSort() {
  try {
    return sessionStorage.getItem(SORT_KEY) || "recent";
  } catch {
    return "recent";
  }
}

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
  const [sortBy, setSortBy] = useState(readInitialSort);
  const [page, setPage] = useState(1);

  const sortedOffers = useMemo(() => {
    const items = [...offers];
    if (sortBy === "oldest") return items.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
    if (sortBy === "price_high") return items.sort((a, b) => number(b.currentPrice) - number(a.currentPrice));
    if (sortBy === "price_low") return items.sort((a, b) => number(a.currentPrice) - number(b.currentPrice));
    if (sortBy === "name") return items.sort((a, b) => a.productName.localeCompare(b.productName, "pt-BR"));
    return items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [offers, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedOffers.length / PAGE_SIZE));
  const pageOffers = sortedOffers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allVisibleSelected = pageOffers.length > 0 && pageOffers.every((offer) => selectedIds.includes(offer.id));
  const selectedCount = selectedIds.length;

  useEffect(() => {
    setPage(1);
  }, [category, search, sortBy, status]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SORT_KEY, sortBy);
    } catch {
      // Session storage may be unavailable in restricted browsers.
    }
  }, [sortBy]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-white/45 text-sm">Gestao de ofertas</p>
          <h1 className="text-2xl sm:text-3xl font-semibold mt-1">Ofertas</h1>
        </div>
        <button onClick={onNew} className="min-h-11 px-4 py-2.5 bg-[#FF6B35] rounded-lg font-semibold flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Nova oferta</button>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-lg p-4">
        <div className="grid md:grid-cols-2 xl:grid-cols-[minmax(15rem,1fr)_11rem_13rem_11rem_auto] gap-3">
          <div className="relative md:col-span-2 xl:col-span-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" aria-hidden="true" />
            <label className="sr-only" htmlFor="admin-offer-search">Buscar ofertas</label>
            <input id="admin-offer-search" value={search} onChange={(event) => setSearch(event.target.value)} className={`${inputCls} pl-10`} placeholder="Buscar por produto, loja ou categoria" />
          </div>
          <select aria-label="Filtrar por status" value={status} onChange={(event) => setStatus(event.target.value)} className={inputCls}>
            <option value="">Todos os status</option>
            {telegramStatuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
          </select>
          <select aria-label="Filtrar por categoria" value={category} onChange={(event) => setCategory(event.target.value)} className={inputCls}>
            <option value="">Todas as categorias</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select aria-label="Ordenar ofertas" value={sortBy} onChange={(event) => setSortBy(event.target.value)} className={inputCls}>
            <option value="recent">Mais recentes</option>
            <option value="oldest">Mais antigas</option>
            <option value="price_high">Maior preco</option>
            <option value="price_low">Menor preco</option>
            <option value="name">Nome A-Z</option>
          </select>
          <button onClick={onRefresh} disabled={loading} className="min-h-10 px-4 py-2.5 bg-white/10 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
        <p className="text-xs text-white/35 mt-3">{offers.length} oferta(s) encontrada(s)</p>
      </div>

      {selectedCount > 0 && (
        <div className="bg-[#FF6B35]/10 border border-[#FF6B35]/30 rounded-lg p-4">
          <div className="flex flex-col xl:flex-row xl:items-end gap-3">
            <div className="xl:w-48">
              <p className="text-sm font-semibold">{selectedCount} selecionada(s)</p>
              <button onClick={clearSelection} className="min-h-8 text-xs text-white/45 hover:text-white">Limpar selecao</button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 flex-1">
              <Field label="Alterar status">
                <select aria-label="Status para as ofertas selecionadas" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)} className={inputCls}>
                  <option value="">Manter status</option>
                  {telegramStatuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
                </select>
              </Field>
              <Field label="Alterar categoria">
                <select aria-label="Categoria para as ofertas selecionadas" value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)} className={inputCls}>
                  <option value="">Manter categoria</option>
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={bulkBusy} onClick={bulkUpdate} className="min-h-10 px-4 py-2.5 bg-white text-[#111111] rounded-lg font-semibold disabled:opacity-50 flex items-center gap-2"><Save className="w-4 h-4" /> Aplicar</button>
              <button disabled={bulkBusy} onClick={bulkRemove} className="min-h-10 px-4 py-2.5 bg-red-500 text-white rounded-lg font-semibold disabled:opacity-50 flex items-center gap-2"><Trash2 className="w-4 h-4" /> Excluir</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
        <div className="hidden md:grid sticky top-16 z-10 grid-cols-[32px_minmax(0,1fr)_120px_140px_120px_120px] gap-4 px-4 py-3 text-xs uppercase text-white/40 border-b border-white/10 bg-[#171717]">
          <input type="checkbox" checked={allVisibleSelected} onChange={() => toggleAllVisible(pageOffers)} className="w-4 h-4 accent-[#FF6B35]" aria-label="Selecionar ofertas desta pagina" />
          <span>Produto</span>
          <span>Status</span>
          <span>Preco</span>
          <span>Agenda</span>
          <span className="text-right">Acoes</span>
        </div>

        {loading ? (
          <div className="py-20"><LoadingBlock /></div>
        ) : sortedOffers.length === 0 ? (
          <div className="py-20"><EmptyBlock label="Nenhuma oferta encontrada." /></div>
        ) : (
          <div className="divide-y divide-white/10">
            {pageOffers.map((offer) => (
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

        {!loading && sortedOffers.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-white/10 bg-white/[0.02]">
            <p className="text-xs text-white/40">
              Pagina {page} de {totalPages} · {Math.min((page - 1) * PAGE_SIZE + 1, sortedOffers.length)}-{Math.min(page * PAGE_SIZE, sortedOffers.length)} de {sortedOffers.length}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg border border-white/10 text-white/65 hover:text-white disabled:opacity-30" aria-label="Pagina anterior">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages} className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg border border-white/10 text-white/65 hover:text-white disabled:opacity-30" aria-label="Proxima pagina">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OfferRow({ offer, selected, onToggleSelected, onEdit, onRetry, onRemove }) {
  const statusClass = statusClasses[offer.status] || statusClasses.RASCUNHO;
  const statusLabel = statusLabels[offer.status] || offer.status;
  const schedule = offer.scheduledAt
    ? new Date(offer.scheduledAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "Sem agenda";

  return (
    <>
      <article className={`md:hidden p-4 ${selected ? "bg-[#FF6B35]/10" : ""}`}>
        <div className="flex items-start gap-3">
          <input type="checkbox" checked={selected} onChange={() => onToggleSelected(offer.id)} className="w-5 h-5 mt-1 accent-[#FF6B35] shrink-0" aria-label={`Selecionar ${offer.productName}`} />
          <button onClick={() => onEdit(offer)} className="flex items-start gap-3 min-w-0 flex-1 text-left">
            <div className="w-16 h-16 bg-white rounded-lg overflow-hidden shrink-0">
              {offer.imageUrl && <img src={offer.imageUrl} alt="" loading="lazy" className="w-full h-full object-contain" />}
            </div>
            <div className="min-w-0">
              <h2 className="font-medium line-clamp-2">{offer.productName}</h2>
              <p className="text-white/40 text-xs mt-1 truncate">{offer.platform} · {offer.category}</p>
            </div>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
          <div>
            <p className="text-xs text-white/35 mb-1">Status</p>
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
          </div>
          <div>
            <p className="text-xs text-white/35 mb-1">Preco</p>
            <p className="font-semibold">{formatPrice(number(offer.currentPrice))}</p>
            {offer.previousPrice && <p className="text-xs text-white/35 line-through">{formatPrice(number(offer.previousPrice))}</p>}
          </div>
          <div className="col-span-2">
            <p className="text-xs text-white/35 mb-1">Agenda</p>
            <p className="text-xs text-white/60">{schedule}</p>
          </div>
        </div>
        {offer.errorMessage && <p role="alert" className="text-red-300 text-xs mt-3">Erro: {offer.errorMessage}</p>}
        <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-white/10">
          {offer.status === "ERRO" && <button onClick={() => onRetry(offer)} className="min-h-10 px-3 inline-flex items-center gap-2 rounded-lg bg-white/10 text-sm"><RefreshCw className="w-4 h-4" /> Reenviar</button>}
          <button onClick={() => onEdit(offer)} className="min-h-10 px-3 inline-flex items-center gap-2 rounded-lg bg-white/10 text-sm"><Pencil className="w-4 h-4" /> Editar</button>
          <button onClick={() => onRemove(offer)} className="min-h-10 min-w-10 inline-flex items-center justify-center rounded-lg text-red-300 hover:bg-red-500/10" aria-label={`Excluir ${offer.productName}`}><Trash2 className="w-4 h-4" /></button>
        </div>
      </article>

      <div className={`hidden md:grid grid-cols-[32px_minmax(0,1fr)_120px_140px_120px_120px] gap-4 p-4 items-center hover:bg-white/[0.03] ${selected ? "bg-[#FF6B35]/10" : ""}`}>
        <input type="checkbox" checked={selected} onChange={() => onToggleSelected(offer.id)} className="w-4 h-4 accent-[#FF6B35]" aria-label={`Selecionar ${offer.productName}`} />
        <button onClick={() => onEdit(offer)} className="flex items-center gap-3 min-w-0 text-left">
          <div className="w-14 h-14 bg-white rounded-lg overflow-hidden shrink-0">
            {offer.imageUrl && <img src={offer.imageUrl} alt="" loading="lazy" className="w-full h-full object-contain" />}
          </div>
          <div className="min-w-0">
            <p className="font-medium truncate">{offer.productName}</p>
            <p className="text-white/35 text-xs truncate">{offer.platform} · {offer.category}</p>
            {offer.errorMessage && <p className="text-red-300 text-xs truncate">Erro: {offer.errorMessage}</p>}
          </div>
        </button>
        <span className={`w-max px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
        <div>
          <p className="font-semibold">{formatPrice(number(offer.currentPrice))}</p>
          {offer.previousPrice && <p className="text-xs text-white/35 line-through">{formatPrice(number(offer.previousPrice))}</p>}
        </div>
        <p className="text-xs text-white/45">{schedule}</p>
        <div className="flex justify-end gap-1">
          {offer.status === "ERRO" && <button onClick={() => onRetry(offer)} title="Reenviar" aria-label={`Reenviar ${offer.productName}`} className="min-h-10 min-w-10 p-2 text-white/50 hover:text-[#FF6B35]"><RefreshCw className="w-4 h-4" /></button>}
          <button onClick={() => onEdit(offer)} title="Editar" aria-label={`Editar ${offer.productName}`} className="min-h-10 min-w-10 p-2 text-white/50 hover:text-white"><Pencil className="w-4 h-4" /></button>
          <button onClick={() => onRemove(offer)} title="Excluir" aria-label={`Excluir ${offer.productName}`} className="min-h-10 min-w-10 p-2 text-white/50 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
    </>
  );
}
