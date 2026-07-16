import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import OfferCard from "@/components/OfferCard";
import Footer from "@/components/Footer";
import { categoryNameBySlug } from "@/lib/catalog";
import { listPublicOffers } from "@/lib/offersApi";
import { EmptyState, FilterChip, LoadingState, OfferGrid, PageShell, SectionHeader } from "@/components/PublicUi";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";

const FILTERS = [
  { key: "recent", label: "Mais recentes" },
  { key: "clicked", label: "Mais clicados" },
  { key: "price_low", label: "Menor preço" },
  { key: "under_50", label: "Abaixo de R$ 50" },
  { key: "under_100", label: "Abaixo de R$ 100" },
];

export default function CategoryPage() {
  const { slug } = useParams();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("recent");
  const [platformFilter, setPlatformFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    setError("");
    listPublicOffers({ limit: 200 })
      .then(setOffers)
      .catch((err) => setError(err.message || "Não foi possível carregar ofertas."))
      .finally(() => setLoading(false));
  }, []);

  let filtered = offers;
  if (slug === "abaixo-de-50") filtered = offers.filter((offer) => offer.price < 50);
  else if (slug === "abaixo-de-100") filtered = offers.filter((offer) => offer.price < 100);
  else {
    const catName = categoryNameBySlug(slug);
    if (catName) filtered = offers.filter((offer) => offer.category === catName);
  }

  if (platformFilter !== "all") filtered = filtered.filter((offer) => offer.platform === platformFilter);
  if (activeFilter === "clicked") filtered = [...filtered].sort((a, b) => (b.clicks || 0) - (a.clicks || 0));
  else if (activeFilter === "price_low") filtered = [...filtered].sort((a, b) => (a.price || 0) - (b.price || 0));
  else if (activeFilter === "under_50") filtered = filtered.filter((offer) => offer.price < 50);
  else if (activeFilter === "under_100") filtered = filtered.filter((offer) => offer.price < 100);
  else filtered = [...filtered].sort((a, b) => new Date(b.published_date || 0).getTime() - new Date(a.published_date || 0).getTime());

  const platforms = [...new Set(offers.map((offer) => offer.platform).filter(Boolean))];
  const title = categoryNameBySlug(slug) || (slug === "abaixo-de-50" ? "Produtos abaixo de R$ 50" : slug === "abaixo-de-100" ? "Produtos abaixo de R$ 100" : slug);
  useDocumentMetadata(`${title} | Tá Barato`, `Ofertas de ${title} selecionadas pelo Tá Barato.`);

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Categoria"
        title={title}
        description={`${filtered.length} ${filtered.length === 1 ? "achado encontrado" : "achados encontrados"}`}
      />
      <section className="sticky top-16 sm:top-20 z-30 bg-[#F5F2EB]/85 backdrop-blur-md border-b border-[#111111]/8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {FILTERS.map((f) => (
              <FilterChip key={f.key} active={activeFilter === f.key} onClick={() => setActiveFilter(f.key)}>
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
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {loading ? <LoadingState />
          : error ? <EmptyState title="Não foi possível carregar as ofertas." description={error} />
          : filtered.length === 0 ? <EmptyState title="Nenhum achado nesta categoria ainda." description="Novas ofertas aparecem aqui assim que forem publicadas." />
          : <OfferGrid>{filtered.map((offer) => <OfferCard key={offer.id} offer={offer} />)}</OfferGrid>}
      </section>
      <Footer />
    </PageShell>
  );
}
