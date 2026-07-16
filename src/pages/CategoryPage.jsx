import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BellPlus } from "lucide-react";
import OfferCard from "@/components/OfferCard";
import Footer from "@/components/Footer";
import { categoryNameBySlug } from "@/lib/catalog";
import { listPublicCategories, listPublicOffersPage } from "@/lib/offersApi";
import { EmptyState, FilterChip, LoadingState, OfferGrid, PageShell, SectionHeader } from "@/components/PublicUi";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";
import { useOfferTools } from "@/lib/OfferToolsContext";

const FILTERS = [
  { key: "recent", label: "Mais recentes" },
  { key: "clicked", label: "Mais clicados" },
  { key: "price_low", label: "Menor preço" },
  { key: "under_50", label: "Abaixo de R$ 50" },
  { key: "under_100", label: "Abaixo de R$ 100" },
];

export default function CategoryPage() {
  const { slug } = useParams();
  const staticCategoryName = categoryNameBySlug(slug);
  const [categoryName, setCategoryName] = useState(staticCategoryName || "");
  const [categoryReady, setCategoryReady] = useState(Boolean(staticCategoryName));
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("recent");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [alertSaved, setAlertSaved] = useState(false);
  const { createSearchAlert } = useOfferTools();

  useEffect(() => {
    const knownName = categoryNameBySlug(slug);
    if (knownName) {
      setCategoryName(knownName);
      setCategoryReady(true);
      return;
    }
    setCategoryReady(false);
    listPublicCategories()
      .then((items) => setCategoryName(items.find((item) => item.slug === slug)?.name || ""))
      .catch(() => setCategoryName(""))
      .finally(() => setCategoryReady(true));
  }, [slug]);

  useEffect(() => {
    if (!categoryReady) return;
    setLoading(true);
    setError("");
    const params = {
      category: categoryName && !categoryName.startsWith("Abaixo de") ? categoryName : slug.startsWith("abaixo-de-") ? "" : "__categoria_inexistente__",
      platform: platformFilter === "all" ? "" : platformFilter,
      sort: activeFilter === "under_50" || activeFilter === "under_100" ? "recent" : activeFilter,
      maxPrice: slug === "abaixo-de-50" || activeFilter === "under_50" ? 50 : slug === "abaixo-de-100" || activeFilter === "under_100" ? 100 : "",
      page,
      limit: 24,
    };
    listPublicOffersPage(params)
      .then((payload) => { setOffers(payload.offers || []); setPagination(payload.pagination || { page: 1, pages: 1, total: 0 }); })
      .catch((err) => setError(err.message || "Não foi possível carregar ofertas."))
      .finally(() => setLoading(false));
  }, [activeFilter, categoryName, categoryReady, page, platformFilter, slug]);

  let filtered = offers;
  if (categoryName && !categoryName.startsWith("Abaixo de")) filtered = offers.filter((offer) => offer.category === categoryName);

  const platforms = ["Mercado Livre", "Shopee", "Amazon"];
  const title = categoryName || (slug === "abaixo-de-50" ? "Produtos abaixo de R$ 50" : slug === "abaixo-de-100" ? "Produtos abaixo de R$ 100" : slug);
  useDocumentMetadata(`${title} | Tá Barato`, `Ofertas de ${title} selecionadas pelo Tá Barato.`);

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Categoria"
        title={title}
        description={`${pagination.total} ${pagination.total === 1 ? "achado encontrado" : "achados encontrados"}`}
      ><button type="button" onClick={() => { createSearchAlert({ category: title, platform: platformFilter === "all" ? "" : platformFilter }); setAlertSaved(true); }} className="min-h-11 inline-flex items-center justify-center gap-2 px-4 bg-[#111111] text-white rounded-md text-sm font-semibold"><BellPlus className="w-4 h-4" /> {alertSaved ? "Alerta salvo" : "Acompanhar categoria"}</button></SectionHeader>
      <section className="bg-white border-b border-[#111111]/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {FILTERS.map((f) => (
              <FilterChip key={f.key} active={activeFilter === f.key} onClick={() => { setActiveFilter(f.key); setPage(1); }}>
                {f.label}
              </FilterChip>
            ))}
            {platforms.length > 0 && (
              <select aria-label="Filtrar por plataforma" value={platformFilter} onChange={(e) => { setPlatformFilter(e.target.value); setPage(1); }} className="min-h-10 px-4 py-2 text-sm font-medium rounded-md bg-white text-[#111111]/65 border border-[#111111]/10 focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/35 cursor-pointer">
                <option value="all">Todas as plataformas</option>
                {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {loading ? <LoadingState />
          : error ? <EmptyState title="Não foi possível carregar as ofertas." description={error} />
          : filtered.length === 0 ? <EmptyState title="Nenhum achado nesta categoria ainda." description="Novas ofertas aparecem aqui assim que forem publicadas." />
          : <><OfferGrid>{filtered.map((offer) => <OfferCard key={offer.id} offer={offer} />)}</OfferGrid>{pagination.pages > 1 && <div className="flex items-center justify-center gap-3 mt-8"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="min-h-11 px-4 rounded-md border border-[#111111]/10 bg-white disabled:opacity-40">Anterior</button><span className="text-sm text-[#111111]/50">Página {page} de {pagination.pages}</span><button disabled={page >= pagination.pages} onClick={() => setPage((value) => value + 1)} className="min-h-11 px-4 rounded-md border border-[#111111]/10 bg-white disabled:opacity-40">Próxima</button></div>}</>}
      </section>
      <Footer />
    </PageShell>
  );
}
