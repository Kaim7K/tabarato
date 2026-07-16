import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import OfferCard from "@/components/OfferCard";
import Footer from "@/components/Footer";
import SmartSearch from "@/components/SmartSearch";
import { Loader2, Package } from "lucide-react";

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState("all");
  const [priceFilter, setPriceFilter] = useState("all");

  useEffect(() => {
    Promise.all([
      base44.entities.Offer.filter({ status: "published" }, "-published_date", 100),
      base44.entities.Offer.filter({ status: "scheduled" }, "-published_date", 100),
    ])
      .then(([pub, sched]) => {
        const now = Date.now();
        const due = sched.filter((o) => o.published_date && new Date(o.published_date).getTime() <= now);
        setOffers([...pub, ...due]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const platforms = [...new Set(offers.map((o) => o.platform).filter(Boolean))];

  let results = offers;
  if (query.trim()) {
    const q = query.toLowerCase();
    results = results.filter(
      (o) =>
        o.name?.toLowerCase().includes(q) ||
        o.category?.toLowerCase().includes(q) ||
        o.barcode?.toLowerCase().includes(q) ||
        o.internal_code?.toLowerCase().includes(q) ||
        o.description?.toLowerCase().includes(q)
    );
  }
  if (platformFilter !== "all") results = results.filter((o) => o.platform === platformFilter);
  if (priceFilter === "under50") results = results.filter((o) => o.price < 50);
  else if (priceFilter === "under100") results = results.filter((o) => o.price < 100);
  else if (priceFilter === "100to300") results = results.filter((o) => o.price >= 100 && o.price < 300);
  else if (priceFilter === "over300") results = results.filter((o) => o.price >= 300);

  const priceFilters = [
    { key: "all", label: "Todos os preços" },
    { key: "under50", label: "Até R$ 50" },
    { key: "under100", label: "Até R$ 100" },
    { key: "100to300", label: "R$ 100 - R$ 300" },
    { key: "over300", label: "Acima de R$ 300" },
  ];

  return (
    <div className="bg-[#F5F2EB] min-h-screen">
      <section className="border-b border-[#111111]/8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <p className="text-[#FF6B35] text-sm font-semibold uppercase tracking-widest mb-2">Busca</p>
          <h1 className="text-3xl sm:text-5xl font-bold text-[#111111] tracking-tight mb-6">
            {query ? `Resultados para "${query}"` : "Buscar achados"}
          </h1>
          <div className="max-w-2xl">
            <SmartSearch placeholder="Buscar por nome, categoria, código..." />
          </div>
        </div>
      </section>

      <section className="sticky top-16 sm:top-20 z-30 bg-[#F5F2EB]/85 backdrop-blur-md border-b border-[#111111]/8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap gap-2">
          {priceFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setPriceFilter(f.key)}
              className={`px-4 py-2 text-sm font-medium rounded-full transition ${
                priceFilter === f.key ? "bg-[#111111] text-white" : "bg-white text-[#111111]/60 border border-[#111111]/8"
              }`}
            >
              {f.label}
            </button>
          ))}
          {platforms.length > 0 && (
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="px-4 py-2 text-sm font-medium rounded-full bg-white text-[#111111]/60 border border-[#111111]/8 focus:outline-none cursor-pointer"
            >
              <option value="all">Todas as plataformas</option>
              {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-[#111111]/30 animate-spin" /></div>
        ) : results.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-12 h-12 text-[#111111]/15 mx-auto mb-4" />
            <p className="text-[#111111]/40 text-lg">Nenhum resultado encontrado.</p>
            <p className="text-[#111111]/30 text-sm mt-2">Tente outros termos ou remova os filtros.</p>
          </div>
        ) : (
          <>
            <p className="text-[#111111]/50 text-sm mb-6">{results.length} resultado{results.length === 1 ? "" : "s"}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {results.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
            </div>
          </>
        )}
      </section>
      <Footer />
    </div>
  );
}