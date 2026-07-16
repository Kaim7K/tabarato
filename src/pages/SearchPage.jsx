import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import OfferCard from "@/components/OfferCard";
import Footer from "@/components/Footer";
import SmartSearch from "@/components/SmartSearch";
import { Package } from "lucide-react";
import { normalizeText } from "@/lib/catalog";
import { listPublicOffers } from "@/lib/offersApi";
import { EmptyState, FilterChip, LoadingState, OfferGrid, PageShell, SectionHeader } from "@/components/PublicUi";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  useDocumentMetadata(query ? `Busca por ${query} | Tá Barato` : "Buscar ofertas | Tá Barato", undefined, "noindex, follow");
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    setError("");
    listPublicOffers({ limit: 200 })
      .then(setOffers)
      .catch((err) => setError(err.message || "Não foi possível carregar a busca."))
      .finally(() => setLoading(false));
  }, []);

  const platforms = [...new Set(offers.map((offer) => offer.platform).filter(Boolean))];
  const q = normalizeText(query);
  let results = q
    ? offers.filter((offer) => normalizeText(offer.name).includes(q) || normalizeText(offer.category).includes(q) || normalizeText(offer.description).includes(q))
    : offers;

  if (platformFilter !== "all") results = results.filter((offer) => offer.platform === platformFilter);
  if (priceFilter === "under50") results = results.filter((offer) => offer.price < 50);
  else if (priceFilter === "under100") results = results.filter((offer) => offer.price < 100);
  else if (priceFilter === "100to300") results = results.filter((offer) => offer.price >= 100 && offer.price < 300);
  else if (priceFilter === "over300") results = results.filter((offer) => offer.price >= 300);

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
        <SmartSearch placeholder="Buscar por nome ou categoria..." />
      </SectionHeader>
      <section className="sticky top-16 sm:top-20 z-30 bg-[#F5F2EB]/85 backdrop-blur-md border-b border-[#111111]/8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex gap-2 overflow-x-auto no-scrollbar">
          {priceFilters.map((f) => (
            <FilterChip key={f.key} active={priceFilter === f.key} onClick={() => setPriceFilter(f.key)}>
              {f.label}
            </FilterChip>
          ))}
          {platforms.length > 0 && (
            <select aria-label="Filtrar por plataforma" value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} className="min-h-10 px-4 py-2 text-sm font-medium rounded-full bg-white text-[#111111]/65 border border-[#111111]/8 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/35 cursor-pointer">
              <option value="all">Todas as plataformas</option>
              {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <EmptyState icon={Package} title="Não foi possível carregar os resultados." description={error} />
        ) : results.length === 0 ? (
          <EmptyState icon={Package} title="Nenhum resultado encontrado." description="Tente outros termos ou remova os filtros." />
        ) : (
          <>
            <p className="text-[#111111]/50 text-sm mb-6">{results.length} resultado{results.length === 1 ? "" : "s"}</p>
            <OfferGrid>
              {results.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
            </OfferGrid>
          </>
        )}
      </section>
      <Footer />
    </PageShell>
  );
}
