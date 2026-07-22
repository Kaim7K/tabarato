import { BarChart3, CalendarClock, CircleDollarSign, ClipboardList, MousePointerClick, Plus, RefreshCw, Repeat2, Send, Sparkles, Tag, Users } from "lucide-react";
import { formatPrice } from "@/lib/catalog";
import { EmptyBlock, LoadingBlock, Panel } from "@/features/admin/AdminUi";
import { number, statusClasses, statusLabels } from "@/features/admin/adminOfferConfig";

const chartColors = ["#FF6B35", "#168A55", "#3B82F6", "#EAB308", "#A855F7", "#EF4444", "#94A3B8"];

export function Dashboard({ analytics, offers, loading, onNew, onEdit, onRefresh }) {
  const recent = offers.slice(0, 5);
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-white/45 text-sm">Painel administrativo</p>
          <h1 className="text-3xl font-bold mt-1">Visao geral</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={onRefresh} className="px-4 py-2.5 bg-white/10 rounded-lg font-semibold flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Atualizar</button>
          <button onClick={onNew} className="px-4 py-2.5 bg-[#FF6B35] rounded-lg font-semibold flex items-center gap-2"><Plus className="w-4 h-4" /> Nova oferta</button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-4">
        <Metric icon={Users} label="Visitantes da /social" value={analytics.socialUniqueVisitors} hint={`${analytics.socialVisitsToday} hoje · ${analytics.socialVisits7d} nos ultimos 7 dias`} />
        <Metric icon={Users} label="Pessoas reais" value={analytics.uniqueVisitors} hint={`${analytics.visits} visitas unicas por dia`} />
        <Metric icon={ClipboardList} label="Ofertas cadastradas" value={analytics.total} hint={`${analytics.drafts} rascunhos`} />
        <Metric icon={Send} label="Publicadas" value={analytics.published} hint={`${analytics.totalClicks} cliques registrados`} />
        <Metric icon={CalendarClock} label="Agendadas" value={analytics.scheduled} hint={analytics.scheduled ? "Na fila de publicacao" : "Nenhuma pendente"} />
        <Metric icon={CircleDollarSign} label="Engajamento" value={analytics.totalShares + analytics.totalFavorites} hint={`${analytics.totalShares} compartilhamentos · ${analytics.totalFavorites} favoritos`} />
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric icon={CircleDollarSign} label="Ticket médio" value={formatPrice(analytics.averageTicket)} hint={`${analytics.averageDiscount}% de desconto médio`} />
        <Metric icon={Send} label="Publicações realizadas" value={analytics.publicationCount} hint="Histórico confirmado por canal" />
        <Metric icon={Repeat2} label="Vale republicar" value={analytics.republishCount} hint={`${analytics.cooldownHiddenCount} ocultas por 24h sem mudança`} />
        <Metric icon={MousePointerClick} label="Média de cliques" value={analytics.published ? Math.round(analytics.totalClicks / analytics.published) : 0} hint="Por oferta publicada" />
        <Metric icon={Tag} label="Plataformas ativas" value={analytics.byPlatform.length} hint="Origem das ofertas" />
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <Panel title="Radar de republicação" icon={Repeat2}>
          <div className="space-y-2">{analytics.republishCandidates.length ? analytics.republishCandidates.map((offer) => <CompactOffer key={offer.id} offer={offer} onEdit={onEdit} detail={(offer.republishReasons || [offer.queueReason])[0]} />) : <EmptyBlock label="Nenhuma oferta com mudança relevante agora." />}</div>
        </Panel>
        <Panel title="Fila inteligente" icon={Sparkles}>
          <div className="space-y-2">{analytics.reviewQueue.length ? analytics.reviewQueue.map((offer) => <CompactOffer key={offer.id} offer={offer} onEdit={onEdit} detail={`${offer.queueKind || "NORMAL"} · nota ${offer.queueScore || offer.qualityScore || 0}`} />) : <EmptyBlock label="Sem ofertas prontas para priorizar." />}</div>
        </Panel>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <Panel title="Mais clicadas" icon={MousePointerClick}>
          <div className="space-y-2">{analytics.topOffers.length ? analytics.topOffers.map((offer) => <CompactOffer key={offer.id} offer={offer} onEdit={onEdit} />) : <EmptyBlock label="Sem cliques registrados." />}</div>
        </Panel>
        <Panel title="Desempenho por plataforma" icon={BarChart3}>
          <div className="space-y-3">{analytics.byPlatform.length ? analytics.byPlatform.map((item) => <div key={item.name} className="flex items-center justify-between gap-3 border-b border-white/10 pb-3"><span className="text-sm text-white/65">{item.name}</span><span className="text-sm font-semibold">{item.clicks} cliques · {item.offers} ofertas</span></div>) : <EmptyBlock label="Sem dados por plataforma." />}</div>
        </Panel>
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <Panel title="Distribuicao por status" icon={BarChart3}>
          <div className="min-h-72">
            {loading ? <LoadingBlock /> : analytics.byStatus.length ? (
              <StatusChart items={analytics.byStatus} />
            ) : <EmptyBlock label="Sem dados para exibir." />}
          </div>
        </Panel>

        <Panel title="Ofertas por categoria" icon={Tag}>
          <div className="min-h-72">
            {loading ? <LoadingBlock /> : analytics.byCategory.length ? (
              <CategoryChart items={analytics.byCategory} />
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

function StatusChart({ items }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="space-y-4 py-2" role="img" aria-label="Distribuicao das ofertas por status">
      {items.map((item, index) => (
        <div key={item.status}>
          <div className="flex items-center justify-between gap-3 text-sm mb-1.5">
            <span className="text-white/65">{item.name}</span>
            <span className="font-semibold">{item.value}</span>
          </div>
          <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(item.value / max) * 100}%`, backgroundColor: chartColors[index % chartColors.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryChart({ items }) {
  const max = Math.max(...items.map((item) => item.ofertas), 1);
  return (
    <div className="space-y-4 py-2" role="img" aria-label="Quantidade de ofertas por categoria">
      {items.map((item) => (
        <div key={item.name} className="grid grid-cols-[minmax(7rem,0.45fr)_minmax(0,1fr)_2rem] items-center gap-3">
          <span className="text-sm text-white/60 truncate" title={item.name}>{item.name}</span>
          <div className="h-5 rounded bg-white/10 overflow-hidden">
            <div className="h-full rounded bg-[#FF6B35]" style={{ width: `${(item.ofertas / max) * 100}%` }} />
          </div>
          <span className="text-sm font-semibold text-right">{item.ofertas}</span>
        </div>
      ))}
    </div>
  );
}

function CompactOffer({ offer, onEdit, detail = "" }) {
  return (
    <button onClick={() => onEdit(offer)} className="w-full flex items-center justify-between gap-3 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-3 text-left hover:bg-white/[0.07]">
      <div className="min-w-0">
        <p className="font-medium truncate">{offer.productName}</p>
        <p className="text-xs text-white/35 truncate">{detail || `${offer.category} / ${formatPrice(number(offer.currentPrice))}`}</p>
      </div>
      <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${statusClasses[offer.status] || statusClasses.RASCUNHO}`}>{statusLabels[offer.status] || offer.status}</span>
    </button>
  );
}

function Metric({ icon: Icon, label, value, hint }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-white/45 text-sm">{label}</p>
          <p className="text-2xl font-bold mt-2">{value}</p>
          <p className="text-xs text-white/35 mt-2">{hint}</p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-[#FF6B35]/15 text-[#FF6B35] flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
