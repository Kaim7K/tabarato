import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import OfferCard from "@/components/OfferCard";
import Footer from "@/components/Footer";
import { Loader2 } from "lucide-react";
import { categoryNameBySlug } from "@/lib/catalog";
import { listPublicOffers } from "@/lib/offersApi";

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
  const [activeFilter, setActiveFilter] = useState("recent");
  const [platformFilter, setPlatformFilter] = useState("all");

  useEffect(() => {
    setLoading(true);
    listPublicOffers({ limit: 200 })
      .then(setOffers)
      .catch(() => {})
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

  return (
    <div className="bg-[#F5F2EB] min-h-screen">
      <section className="border-b border-[#111111]/8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <p className="text-[#FF6B35] text-sm font-semibold uppercase tracking-widest mb-2">Categoria</p>
          <h1 className="text-3xl sm:text-5xl font-bold text-[#111111] tracking-tight">{title}</h1>
          <p className="text-[#111111]/50 text-base mt-3">{filtered.length} {filtered.length === 1 ? "achado encontrado" : "achados encontrados"}</p>
        </div>
      </section>
      <section className="sticky top-16 sm:top-20 z-30 bg-[#F5F2EB]/85 backdrop-blur-md border-b border-[#111111]/8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setActiveFilter(f.key)} className={`px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap transition ${activeFilter === f.key ? "bg-[#111111] text-white" : "bg-white text-[#111111]/60 hover:bg-white/80 border border-[#111111]/8"}`}>
                {f.label}
              </button>
            ))}
            {platforms.length > 0 && (
              <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} className="px-4 py-2 text-sm font-medium rounded-full bg-white text-[#111111]/60 border border-[#111111]/8 focus:outline-none cursor-pointer">
                <option value="all">Todas as plataformas</option>
                {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            )}
          </div>
        </div>
      </section>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {loading ? <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-[#111111]/30 animate-spin" /></div>
          : filtered.length === 0 ? <div className="text-center py-20"><p className="text-[#111111]/40 text-lg">Nenhum achado nesta categoria ainda.</p></div>
          : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">{filtered.map((offer) => <OfferCard key={offer.id} offer={offer} />)}</div>}
      </section>
      <Footer />
    </div>
  );
}

