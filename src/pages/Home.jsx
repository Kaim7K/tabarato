import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import OfferCard from "@/components/OfferCard";
import Footer from "@/components/Footer";
import {
  ArrowUpRight,
  BadgeDollarSign,
  ChefHat,
  Flame,
  Home as HomeIcon,
  Laptop,
  Loader2,
  MessageCircle,
  PackageSearch,
  Paperclip,
  Search,
  Send,
  Sparkles,
  TrendingUp,
  UsersRound,
  Wrench,
} from "lucide-react";
import { DEFAULT_CATEGORIES, formatPrice, normalizeText } from "@/lib/catalog";
import { listPublicOffers } from "@/lib/offersApi";
import { TELEGRAM_CHANNEL_URL, WHATSAPP_GROUP_URL } from "@/lib/publicLinks";

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
  const filtered = q
    ? offers.filter((offer) => normalizeText(offer.name).includes(q) || normalizeText(offer.category).includes(q))
    : offers;
  const featured = filtered[0] || null;
  const featuredCopy = featured?.benefit || featured?.description || "Oferta selecionada para comprar melhor sem perder tempo.";
  const recent = filtered.filter((offer) => offer.id !== featured?.id);
  const mostClicked = [...filtered].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, 5);
  const hasTelegramLink = Boolean(TELEGRAM_CHANNEL_URL);
  const hasWhatsAppLink = Boolean(WHATSAPP_GROUP_URL);

  return (
    <div className="bg-[#F5F2EB] min-h-screen">
      <section className="border-b border-[#111111]/8 bg-[#111111] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20">
          <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-9 lg:gap-14 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/10 text-white/70 text-xs font-bold uppercase tracking-widest mb-5">
                <UsersRound className="w-4 h-4 text-[#FF6B35]" />
                Comunidade Tá Barato
              </div>
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.03] max-w-3xl">
                Receba os melhores achados direto no Telegram e WhatsApp.
              </h1>
              <p className="mt-5 text-white/65 text-base sm:text-lg leading-relaxed max-w-2xl">
                Entre nos grupos oficiais do Tá Barato para acompanhar ofertas publicadas em tempo real, alertas rápidos e oportunidades antes que acabem.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                {hasTelegramLink && (
                  <a
                    href={TELEGRAM_CHANNEL_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-[#FF6B35] hover:bg-[#D95426] text-white font-semibold rounded-full transition shadow-lg text-base"
                  >
                    Entrar no Telegram <Send className="w-5 h-5" />
                  </a>
                )}
                {hasWhatsAppLink && (
                  <a
                    href={WHATSAPP_GROUP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-7 py-4 bg-[#168A55] hover:bg-[#137247] text-white font-semibold rounded-full transition shadow-lg text-base"
                  >
                    Entrar no WhatsApp <MessageCircle className="w-5 h-5" />
                  </a>
                )}
              </div>
              {!hasTelegramLink && !hasWhatsAppLink && (
                <p className="mt-6 text-white/45 text-sm">
                  Configure os links dos grupos nas variáveis públicas para ativar os botões.
                </p>
              )}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 sm:p-6">
                <div className="w-11 h-11 rounded-full bg-[#FF6B35]/15 text-[#FF6B35] flex items-center justify-center mb-5">
                  <Send className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold mb-2">Canal no Telegram</h2>
                <p className="text-white/55 text-sm leading-relaxed">
                  Receba publicações organizadas, chamadas rápidas e links diretos para aproveitar cada oferta.
                </p>
              </div>
              <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 sm:p-6">
                <div className="w-11 h-11 rounded-full bg-[#168A55]/15 text-[#4ade80] flex items-center justify-center mb-5">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold mb-2">Grupo no WhatsApp</h2>
                <p className="text-white/55 text-sm leading-relaxed">
                  Acompanhe avisos no celular, compartilhe achados e veja oportunidades enquanto ainda estão disponíveis.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {featured ? (
        <section className="border-b border-[#111111]/8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
            <div className="grid lg:grid-cols-[1.02fr_0.98fr] gap-8 lg:gap-14 items-center">
              <div className="relative order-2 lg:order-1">
                <div className="relative aspect-[4/3] sm:aspect-[16/10] rounded-[1.75rem] overflow-hidden bg-white shadow-[0_24px_70px_rgba(17,17,17,0.08)] ring-1 ring-[#111111]/5">
                  <img src={featured.image} alt={featured.name} className="w-full h-full object-contain bg-white p-2 sm:p-4" />
                </div>
                <div className="absolute top-4 left-4 px-4 py-2 bg-[#FF6B35] text-white text-xs font-bold uppercase tracking-widest rounded-full shadow-lg flex items-center gap-1.5">
                  <Flame className="w-4 h-4" />
                  Achado do dia
                </div>
              </div>

              <div className="order-1 lg:order-2">
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="px-3 py-1 rounded-full bg-white text-[#FF6B35] text-xs font-bold uppercase tracking-widest border border-[#FF6B35]/15">
                    {featured.category}
                  </span>
                  {featured.platform && (
                    <span className="px-3 py-1 rounded-full bg-white text-[#111111]/50 text-xs font-semibold border border-[#111111]/8">
                      {featured.platform}
                    </span>
                  )}
                </div>

                <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold text-[#111111] tracking-tight leading-[1.03] mb-5 line-clamp-3">
                  {featured.name}
                </h1>
                <p className="text-[#111111]/60 text-base sm:text-lg leading-relaxed mb-7 max-w-2xl line-clamp-4">
                  {featuredCopy}
                </p>

                <div className="flex flex-col sm:flex-row sm:items-end gap-5 sm:gap-8 mb-8">
                  <div>
                    <p className="text-[#111111]/40 text-xs uppercase tracking-wide mb-1">Preço informado</p>
                    <p className="text-4xl sm:text-5xl font-bold text-[#111111] tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {formatPrice(featured.price)}
                    </p>
                  </div>
                  {featured.previousPrice && (
                    <div className="pb-1">
                      <p className="text-[#111111]/35 text-xs uppercase tracking-wide mb-1">Antes</p>
                      <p className="text-xl text-[#111111]/45 line-through" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {formatPrice(Number(featured.previousPrice))}
                      </p>
                    </div>
                  )}
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
          </div>
        </section>
      ) : (
        !loading && (
          <section className="border-b border-[#111111]/8">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24 text-center">
              <PackageSearch className="w-12 h-12 text-[#FF6B35] mx-auto mb-5" />
              <p className="text-[#FF6B35] text-sm font-semibold uppercase tracking-widest mb-3">Tá Barato</p>
              <h1 className="text-3xl sm:text-5xl font-bold text-[#111111] tracking-tight mb-4">Novos achados aparecem aqui.</h1>
              <p className="text-[#111111]/55 text-lg max-w-xl mx-auto">Assim que uma oferta for publicada, ela entra nesta vitrine automaticamente.</p>
            </div>
          </section>
        )
      )}

      {searchQuery && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
          <p className="text-[#111111]/60 text-sm flex items-center gap-2">
            <Search className="w-4 h-4" />
            Resultados para: <strong className="text-[#111111]">{searchQuery}</strong>
          </p>
        </div>
      )}

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-14 sm:mt-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-[#FF6B35] text-sm font-semibold uppercase tracking-widest mb-2">Selecionados hoje</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-[#111111] tracking-tight">Ofertas recentes</h2>
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-[#111111]/30 animate-spin" /></div>
        ) : recent.length === 0 ? (
          <div className="text-center py-16 text-[#111111]/40">
            <p className="text-lg">{featured ? "Mais ofertas aparecem aqui em breve." : "Nenhum achado publicado ainda."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {recent.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
          </div>
        )}
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-20 sm:mt-24">
        <div className="mb-8">
          <p className="text-[#FF6B35] text-sm font-semibold uppercase tracking-widest mb-2">Explore por tema</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#111111] tracking-tight">Categorias</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {DEFAULT_CATEGORIES.map((cat) => {
            const Icon = categoryIcons[cat.icon] || BadgeDollarSign;
            return (
              <Link key={cat.slug} to={`/categoria/${cat.slug}`} className="group bg-white rounded-2xl p-5 sm:p-6 shadow-[0_18px_45px_rgba(0,0,0,0.035)] hover:shadow-[0_24px_60px_rgba(0,0,0,0.07)] transition-all duration-300 border border-[#111111]/5">
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
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-20 sm:mt-24">
          <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.04)] border border-[#111111]/5">
            <div className="flex items-center gap-2 mb-6">
              <TrendingUp className="w-5 h-5 text-[#FF6B35]" />
              <h2 className="text-2xl sm:text-3xl font-bold text-[#111111] tracking-tight">Mais clicados</h2>
            </div>
            <div className="space-y-1">
              {mostClicked.map((offer, idx) => (
                <Link key={offer.id} to={`/oferta/${offer.id}`} className="flex items-center gap-4 sm:gap-6 py-4 border-b border-[#111111]/8 last:border-0 group">
                  <span className="text-2xl font-bold text-[#111111]/20 w-8" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{String(idx + 1).padStart(2, "0")}</span>
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-white shrink-0 border border-[#111111]/5">
                    <img src={offer.image} alt={offer.name} className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-[#111111] text-sm sm:text-base line-clamp-1 group-hover:text-[#FF6B35] transition">{offer.name}</h3>
                    <p className="text-[#111111]/40 text-xs sm:text-sm">{offer.clicks || 0} cliques</p>
                  </div>
                  <span className="font-bold text-[#111111] text-base sm:text-lg shrink-0" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatPrice(offer.price)}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}
