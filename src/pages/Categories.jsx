import { useEffect, useMemo, useState } from "react";
import { ArrowRight, FolderOpen } from "lucide-react";
import { Link } from "react-router-dom";
import Footer from "@/components/Footer";
import OfferCard from "@/components/OfferCard";
import { EmptyState, LoadingState, PageShell, SectionHeader } from "@/components/PublicUi";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";
import { normalizeText, visibleCategories } from "@/lib/catalog";
import { listPublicCategoryHighlights } from "@/lib/offersApi";

const OFFERS_PER_CATEGORY = 4;

export default function Categories() {
  useDocumentMetadata("Categorias | Tá Barato", "Encontre as ofertas mais recentes em cada categoria do Tá Barato.");
  const [categories, setCategories] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    listPublicCategoryHighlights()
      .then(({ categories: categoryItems, offers: offerItems }) => {
        setCategories(categoryItems.length > 0 ? categoryItems : visibleCategories);
        setOffers(offerItems);
      })
      .catch((requestError) => setError(requestError.message || "Não foi possível carregar as categorias."))
      .finally(() => setLoading(false));
  }, []);

  const sections = useMemo(() => categories.map((category) => ({
    ...category,
    offers: offers
      .filter((offer) => normalizeText(offer.category) === normalizeText(category.name))
      .slice(0, OFFERS_PER_CATEGORY),
  })), [categories, offers]);

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Explore por categoria"
        title="Todas as categorias"
        description="Veja os achados mais recentes de cada seção."
      />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {loading ? <LoadingState label="Carregando categorias..." /> : error ? (
          <EmptyState title="Não foi possível carregar as categorias." description={error} />
        ) : sections.length === 0 ? (
          <EmptyState icon={FolderOpen} title="Nenhuma categoria disponível." description="As categorias publicadas aparecerão aqui." />
        ) : (
          <div className="space-y-10 sm:space-y-12">
            {sections.map((category) => (
              <section key={category.slug} aria-labelledby={`category-${category.slug}`}>
                <div className="flex items-center justify-between gap-4 mb-5 pb-3 border-b border-[#111111]/10">
                  <h2 id={`category-${category.slug}`} className="text-xl sm:text-2xl font-semibold text-[#111111]">{category.name}</h2>
                  <Link to={`/categoria/${category.slug}`} className="min-h-11 shrink-0 inline-flex items-center gap-1.5 px-3 text-sm font-semibold text-[#FF6B35] hover:text-[#D95426] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B35]/40 rounded-md">
                    Ver mais produtos <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </Link>
                </div>
                {category.offers.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {category.offers.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
                  </div>
                ) : (
                  <div className="min-h-24 flex items-center justify-between gap-4 px-4 sm:px-5 bg-white border border-[#111111]/8 rounded-lg">
                    <p className="text-sm text-[#111111]/50">Ainda não há ofertas publicadas nesta categoria.</p>
                    <Link to={`/categoria/${category.slug}`} className="shrink-0 text-sm font-semibold text-[#FF6B35]">Abrir categoria</Link>
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </PageShell>
  );
}
