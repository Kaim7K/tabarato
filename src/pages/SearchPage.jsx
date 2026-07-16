import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import OfferCard from "@/components/OfferCard";
import Footer from "@/components/Footer";
import SmartSearch from "@/components/SmartSearch";
import { BellPlus, Package } from "lucide-react";
import { normalizeText } from "@/lib/catalog";
import { listPublicOffersPage } from "@/lib/offersApi";
import { EmptyState, FilterChip, LoadingState, OfferGrid, PageShell, SectionHeader } from "@/components/PublicUi";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";
import { useOfferTools } from "@/lib/OfferToolsContext";

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  useDocumentMetadata(query ? `Busca por ${query} | Tá Barato` : "Buscar ofertas | Tá Barato", undefined, "noindex, follow");
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState("all");
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [searchSaved, setSearchSaved] = useState(false);
  const { createSearchAlert } = useOfferTools();

  useEffect(() => {
    setLoading(true);
    setError("");
    const ranges = { under50: { maxPrice: 50 }, under100: { maxPrice: 100 }, "100to300": { minPrice: 100, maxPrice: 300 }, over300: { minPrice: 300 } };
    listPublicOffersPage({ search: query, platform: platformFilter === "all" ? "" : platformFilter, sort, page, limit: 24, ...(ranges[priceFilter] || {}) })
      .then((payload) => { setOffers(payload.offers || []); setPagination(payload.pagination || { page: 1, pages: 1, total: 0 }); })
      .catch((err) => setError(err.message || "Não foi possível carregar a busca."))
      .finally(() => setLoading(false));
  }, [page, platformFilter, priceFilter, query, sort]);

  const platforms = ["Mercado Livre", "Shopee", "Amazon"];
  const q = normalizeText(query);
  let results = q
    ? offers.filter((offer) => normalizeText(offer.name).includes(q) || normalizeText(offer.category).includes(q) || normalizeText(offer.description).includes(q) || normalizeText(offer.platform).includes(q))
    : offers;


  const priceFilters = [
    { key: "all", label: "Todos os preços" },
    { key: "under50", label: "Até R$ 50" },
    { key: "under100", label: "Até R$ 100" },
    { key: "100to300", label: "R$ 100 - R$ 300" },
    { key: "over300", label: "Acima de R$ 300" },
  ];

  return (
    <PageShell>
      <SectionHeader eyebrow="Busca" title={query ? `Resultados para "${query}"` : "Buscar achados"}>
        <div className="flex flex-col sm:flex-row gap-2"><SmartSearch placeholder="Buscar por nome ou categoria..." />{query && <button type="button" onClick={() => { createSearchAlert({ query, platform: platformFilter === "all" ? "" : platformFilter, priceFilter }); setSearchSaved(true); }} className="min-h-11 shrink-0 inline-flex items-center justify-center gap-2 px-4 bg-[#111111] text-white rounded-md text-sm font-semibold"><BellPlus className="w-4 h-4" /> {searchSaved ? "Busca salva" : "Salvar busca"}</button>}</div>
      </SectionHeader>
      <section className="bg-white border-b border-[#111111]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex gap-2 overflow-x-auto no-scrollbar">
          {priceFilters.map((f) => (
            <FilterChip key={f.key} active={priceFilter === f.key} onClick={() => { setPriceFilter(f.key); setPage(1); }}>
              {f.label}
            </FilterChip>
          ))}
          {platforms.length > 0 && (
            <select aria-label="Filtrar por plataforma" value={platformFilter} onChange={(e) => { setPlatformFilter(e.target.value); setPage(1); }} className="min-h-10 px-4 py-2 text-sm font-medium rounded-md bg-white text-[#111111]/65 border border-[#111111]/10 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/35 cursor-pointer">
              <option value="all">Todas as plataformas</option>
              {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <select aria-label="Ordenar resultados" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} className="min-h-10 px-4 py-2 text-sm font-medium rounded-md bg-white text-[#111111]/65 border border-[#111111]/10">
            <option value="recent">Mais recentes</option><option value="discount">Maior desconto</option><option value="clicked">Mais clicados</option><option value="price_low">Menor preço</option><option value="price_high">Maior preço</option>
          </select>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <EmptyState icon={Package} title="Não foi possível carregar os resultados." description={error} />
        ) : results.length === 0 ? (
          <EmptyState icon={Package} title="Nenhum resultado encontrado." description="Tente outros termos ou remova os filtros." />
        ) : (
          <>
            <p className="text-[#111111]/50 text-sm mb-6">{pagination.total} resultado{pagination.total === 1 ? "" : "s"}</p>
            <OfferGrid>
              {results.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
            </OfferGrid>
            {pagination.pages > 1 && <div className="flex items-center justify-center gap-3 mt-8"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="min-h-11 px-4 rounded-md border border-[#111111]/10 bg-white disabled:opacity-40">Anterior</button><span className="text-sm text-[#111111]/50">Página {page} de {pagination.pages}</span><button disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)} className="min-h-11 px-4 rounded-md border border-[#111111]/10 bg-white disabled:opacity-40">Próxima</button></div>}
          </>
        )}
      </section>
      <Footer />
    </PageShell>
  );
}
