import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import OfferCard from "@/components/OfferCard";
import Footer from "@/components/Footer";
import { ArrowUpRight, Flame, TrendingUp, Search, Send, Loader2, Home as HomeIcon, Laptop, Paperclip, Wrench, ChefHat, Sparkles, BadgeDollarSign } from "lucide-react";
import { DEFAULT_CATEGORIES, formatPrice, normalizeText } from "@/lib/catalog";
import { listPublicOffers } from "@/lib/offersApi";

const categoryIcons = {
  Casa: HomeIcon,
  Notebook: Laptop,
  Paperclip,
  Wrench,
  ChefHat,
  Sparkles,
  BadgeDollarSign,
};

export default function Home() {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") || "";

  useEffect(() => {
    listPublicOffers({ limit: 100 })
      .then(setOffers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const q = normalizeText(searchQuery);
  const filtered = q ? offers.filter((offer) => normalizeText(offer.name).includes(q) || normalizeText(offer.category).includes(q)) : offers;
  const featured = filtered[0] || null;
  const recent = filtered.filter((offer) => offer.id !== featured?.id);
  const mostClicked = [...filtered].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, 5);

  return (
    <div className="bg-[#F5F2EB]">
      {featured && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12">
          <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            <div className="lg:col-span-7 relative">
              <div className="relative aspect-[4/3] sm:aspect-[16/10] rounded-3xl overflow-hidden bg-white shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
                <img src={featured.image} alt={featured.name} className="w-full h-full object-cover" />
              </div>
              <div className="absolute top-4 left-4 px-4 py-2 bg-[#FF6B35] text-white text-xs font-bold uppercase tracking-widest rounded-full shadow-lg flex items-center gap-1.5">
                <Flame className="w-4 h-4" />
                Achado do dia
              </div>
            </div>
            <div className="lg:col-span-5">
              <p className="text-[#111111]/40 text-xs font-medium uppercase tracking-widest mb-3">{featured.category}</p>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#111111] tracking-tight leading-[1.1] mb-5">{featured.name}</h1>
              <p className="text-[#111111]/60 text-lg leading-relaxed mb-6 max-w-md">{featured.benefit}</p>
              <div className="mb-8">
                <p className="text-[#111111]/40 text-xs uppercase tracking-wide mb-1">Preço informado</p>
                <p className="text-4xl sm:text-5xl font-bold text-[#111111] tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatPrice(featured.price)}</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <a href={featured.affiliate_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#FF6B35] hover:bg-[#D95426] text-white font-semibold rounded-full transition shadow-lg text-base">
                  Ver oferta <ArrowUpRight className="w-5 h-5" />
                </a>
                <Link to={`/oferta/${featured.id}`} className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-[#111111] font-semibold rounded-full hover:bg-[#F5F2EB] transition border border-[#111111]/10 text-base">
                  Ver detalhes
                </Link>
              </div>
              <p className="mt-6 text-[#111111]/40 text-xs leading-relaxed max-w-md">
                Publicidade: este site utiliza links de afiliado e pode receber comissão pelas compras, sem custo adicional para você.
              </p>
            </div>
          </div>
        </section>
      )}

      {searchQuery && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10">
          <p className="text-[#111111]/60 text-sm flex items-center gap-2">
            <Search className="w-4 h-4" />
            Resultados para: <strong className="text-[#111111]">{searchQuery}</strong>
          </p>
        </div>
      )}

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-20 sm:mt-28">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="text-[#FF6B35] text-sm font-semibold uppercase tracking-widest mb-2">Selecionados hoje</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#111111] tracking-tight">Ofertas recentes</h2>
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-[#111111]/30 animate-spin" /></div>
        ) : recent.length === 0 ? (
          <div className="text-center py-20 text-[#111111]/40">
            <p className="text-lg">Nenhum achado publicado ainda.</p>
            <Link to="/admin/ofertas" className="mt-4 inline-block text-[#FF6B35] font-medium hover:underline">Cadastre a primeira oferta →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">{recent.map((offer) => <OfferCard key={offer.id} offer={offer} />)}</div>
        )}
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-24 sm:mt-32">
        <div className="mb-10">
          <p className="text-[#FF6B35] text-sm font-semibold uppercase tracking-widest mb-2">Explore por tema</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#111111] tracking-tight">Categorias</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {DEFAULT_CATEGORIES.map((cat) => {
            const Icon = categoryIcons[cat.icon] || BadgeDollarSign;
            return (
              <Link key={cat.slug} to={`/categoria/${cat.slug}`} className="group bg-white rounded-2xl p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.03)] hover:shadow-[0_24px_60px_rgba(0,0,0,0.06)] transition-all duration-300">
                <Icon className="w-7 h-7 text-[#FF6B35] mb-3" />
                <h3 className="font-semibold text-[#111111] text-base group-hover:text-[#FF6B35] transition flex items-center gap-1">
                  {cat.name}<ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition" />
                </h3>
              </Link>
            );
          })}
        </div>
      </section>

      {mostClicked.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-24 sm:mt-32">
          <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-[0_20px_50px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-2 mb-8">
              <TrendingUp className="w-5 h-5 text-[#FF6B35]" />
              <h2 className="text-2xl sm:text-3xl font-bold text-[#111111] tracking-tight">Mais clicados</h2>
            </div>
            <div className="space-y-1">
              {mostClicked.map((offer, idx) => (
                <Link key={offer.id} to={`/oferta/${offer.id}`} className="flex items-center gap-4 sm:gap-6 py-4 border-b border-[#111111]/8 last:border-0 group">
                  <span className="text-2xl font-bold text-[#111111]/20 w-8" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{String(idx + 1).padStart(2, "0")}</span>
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-[#F5F2EB] shrink-0"><img src={offer.image} alt={offer.name} className="w-full h-full object-cover" /></div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-[#111111] text-sm sm:text-base truncate group-hover:text-[#FF6B35] transition">{offer.name}</h3>
                    <p className="text-[#111111]/40 text-xs sm:text-sm">{offer.clicks || 0} cliques</p>
                  </div>
                  <span className="font-bold text-[#111111] text-base sm:text-lg shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatPrice(offer.price)}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-24 sm:mt-32">
        <div className="bg-white rounded-3xl p-8 sm:p-16 shadow-[0_20px_50px_rgba(0,0,0,0.04)] text-center">
          <Flame className="w-10 h-10 text-[#FF6B35] mx-auto mb-6" />
          <h2 className="text-3xl sm:text-4xl font-bold text-[#111111] tracking-tight mb-4">Receba os melhores achados no celular</h2>
          <p className="text-[#111111]/60 text-lg max-w-xl mx-auto mb-8">A gente filtra. Você encontra. Acompanhe o canal para receber ofertas selecionadas em primeira mão.</p>
          <a href="https://t.me/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#111111] text-white font-semibold rounded-full hover:bg-[#111111]/90 transition shadow-lg">
            <Send className="w-5 h-5" /> Seguir no Telegram
          </a>
        </div>
      </section>
      <Footer />
    </div>
  );
}

