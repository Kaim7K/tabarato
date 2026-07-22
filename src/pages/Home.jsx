import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  BadgeDollarSign,
  ChefHat,
  Flame,
  Home as HomeIcon,
  Laptop,
  PackageSearch,
  Paperclip,
  Search,
  Sparkles,
  UsersRound,
  Wrench,
} from "lucide-react";
import Footer from "@/components/Footer";
import { StoreBadge, TelegramIcon, WhatsAppIcon } from "@/components/BrandIcons";
import OfferCard from "@/components/OfferCard";
import { EmptyState, LoadingState, OfferGrid, SectionTitle } from "@/components/PublicUi";
import { DEFAULT_CATEGORIES, formatPrice, normalizeText, slugify } from "@/lib/catalog";
import { listPublicOffers, trackOfferClick } from "@/lib/offersApi";
import { TELEGRAM_CHANNEL_URL, WHATSAPP_GROUP_URL } from "@/lib/publicLinks";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";
import { useOfferTools } from "@/lib/OfferToolsContext";

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
  useDocumentMetadata("Tá Barato — Ofertas selecionadas");
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchParams] = useSearchParams();
  const { preferredCategories } = useOfferTools();
  const searchQuery = searchParams.get("q") || "";

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    listPublicOffers({ limit: 24 })
      .then((items) => { if (active) setOffers(items); })
      .catch((requestError) => { if (active) setError(requestError.message || "Não foi possível carregar as ofertas."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const normalizedQuery = normalizeText(searchQuery);
  const filteredOffers = normalizedQuery
    ? offers.filter((offer) => normalizeText(offer.name).includes(normalizedQuery) || normalizeText(offer.category).includes(normalizedQuery))
    : offers;
  const featured = filteredOffers[0] || null;
  const featuredCopy = featured?.benefit || featured?.description || "Oferta selecionada para comprar melhor sem perder tempo.";
  const recent = filteredOffers.filter((offer) => offer.id !== featured?.id).slice(0, 8);
  const personalized = preferredCategories.length
    ? filteredOffers.filter((offer) => preferredCategories.slice(0, 3).includes(offer.category) && offer.id !== featured?.id).slice(0, 4)
    : [];
  const mostClicked = [...filteredOffers].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, 5);
  const hasTelegramLink = Boolean(TELEGRAM_CHANNEL_URL);
  const hasWhatsAppLink = Boolean(WHATSAPP_GROUP_URL);

  return (
    <div className="bg-[#F4F5F6] min-h-screen">
      <section className="relative isolate overflow-hidden bg-[#111111] text-white border-b-4 border-[#FF6B35]">
        <img
          src="/brand/hero-marketplace-v1.jpg"
          alt=""
          aria-hidden="true"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 -z-20 h-full w-full object-cover object-[68%_center] sm:object-center"
        />
        <div className="absolute inset-0 -z-10 bg-[#090909]/55 sm:bg-[#090909]/42" aria-hidden="true" />
        <div className="max-w-7xl mx-auto min-h-[29rem] sm:min-h-[32rem] px-4 sm:px-6 lg:px-8 py-10 sm:py-14 flex items-center">
          <div className="max-w-3xl">
            <div className="max-w-2xl">
              <p className="inline-flex items-center gap-2 text-white/60 text-xs font-semibold uppercase mb-3">
                <UsersRound className="w-4 h-4 text-[#FF6B35]" />
                Comunidade Tá Barato
              </p>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold leading-[1.12] max-w-3xl">
                Receba os melhores achados direto no Telegram e WhatsApp.
              </h1>
              <p className="mt-5 text-white/75 text-sm sm:text-base leading-relaxed max-w-xl">
                Entre nos grupos oficiais do Tá Barato para acompanhar ofertas publicadas em tempo real, alertas rápidos e oportunidades antes que acabem.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 mt-7 max-w-2xl">
              {hasTelegramLink && (
                <a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="min-h-14 flex items-center justify-between gap-4 px-5 py-3.5 bg-[#229ED9] hover:bg-[#187FAF] rounded-lg shadow-[0_10px_28px_rgba(0,0,0,0.2)] transition-colors">
                  <span className="flex items-center gap-3">
                    <TelegramIcon />
                    <span>
                      <strong className="block text-sm">Entrar no Telegram</strong>
                      <span className="block text-xs text-white/75 mt-0.5">Canal no Telegram</span>
                    </span>
                  </span>
                  <ArrowUpRight className="w-5 h-5" />
                </a>
              )}
              {hasWhatsAppLink && (
                <a href={WHATSAPP_GROUP_URL} target="_blank" rel="noopener noreferrer" className="min-h-14 flex items-center justify-between gap-4 px-5 py-3.5 bg-[#25D366] text-[#073B2B] hover:bg-[#20BD5A] rounded-lg shadow-[0_10px_28px_rgba(0,0,0,0.2)] transition-colors">
                  <span className="flex items-center gap-3">
                    <WhatsAppIcon />
                    <span>
                      <strong className="block text-sm">Entrar no WhatsApp</strong>
                      <span className="block text-xs text-[#073B2B]/70 mt-0.5">Grupo no WhatsApp</span>
                    </span>
                  </span>
                  <ArrowUpRight className="w-5 h-5" />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-white border-b border-[#111111]/10 shadow-[0_1px_3px_rgba(17,17,17,0.04)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {DEFAULT_CATEGORIES.map((category) => {
              const Icon = categoryIcons[category.icon] || BadgeDollarSign;
              return (
                <Link key={category.slug} to={`/categoria/${category.slug}`} className="group min-h-20 px-2 py-3 flex flex-col items-center justify-center gap-2 text-center rounded-lg hover:bg-[#F4F5F6] transition-colors">
                  <Icon className="w-6 h-6 text-[#FF6B35]" aria-hidden="true" />
                  <span className="text-xs sm:text-sm leading-tight text-[#111111]/65 group-hover:text-[#111111]">{category.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 sm:py-9 space-y-10 sm:space-y-12">
        {searchQuery && (
          <div className="flex items-center gap-2 text-[#111111]/60 text-sm">
            <Search className="w-4 h-4" />
            Resultados para: <strong className="text-[#111111]">{searchQuery}</strong>
          </div>
        )}

        {loading ? (
          <LoadingState />
        ) : error ? (
          <EmptyState title="Não foi possível carregar as ofertas." description={error} />
        ) : featured ? (
          <>
            <section aria-labelledby="featured-title">
              <SectionTitle eyebrow="Selecionado hoje" title="Achado do dia" />
              <div className="bg-white border border-[#111111]/8 rounded-lg overflow-hidden shadow-[0_8px_30px_rgba(17,17,17,0.06)] grid md:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.15fr)]">
                <div className="relative min-h-64 md:min-h-80 bg-white border-b md:border-b-0 md:border-r border-[#111111]/8">
                  {featured.image ? (
                    <img src={featured.image} alt={featured.name} className="absolute inset-0 w-full h-full object-contain p-5 sm:p-7" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#F3F3F3]">
                      <PackageSearch className="w-12 h-12 text-[#111111]/15" />
                    </div>
                  )}
                  <span className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FF6B35] text-white text-xs font-semibold rounded-md">
                    <Flame className="w-4 h-4" /> Achado do dia
                  </span>
                  <StoreBadge platform={featured.platform} />
                </div>

                <div className="p-5 sm:p-7 lg:p-9 flex flex-col justify-center">
                  <div className="flex flex-wrap items-center gap-2 mb-3 text-xs text-[#111111]/45">
                    <Link to={`/categoria/${slugify(featured.category)}`} className="font-semibold text-[#FF6B35] hover:underline">
                      {featured.category}
                    </Link>
                    {featured.platform && <span>· {featured.platform}</span>}
                  </div>
                  <h2 id="featured-title" className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-[#111111] leading-tight line-clamp-3">
                    {featured.name}
                  </h2>
                  <p className="text-[#111111]/55 text-sm sm:text-base leading-relaxed mt-3 line-clamp-3">{featuredCopy}</p>
                  <div className="mt-6">
                    <p className="text-[#111111]/40 text-xs mb-1">Preço informado</p>
                    <p className="price-type text-3xl sm:text-4xl text-[#111111]">{formatPrice(featured.price)}</p>
                    {featured.previous_price && <p className="text-sm text-[#111111]/35 line-through mt-1">{formatPrice(Number(featured.previous_price))}</p>}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 mt-7">
                    <a href={featured.affiliate_link} target="_blank" rel="noopener noreferrer" onClick={() => trackOfferClick(featured.id)} className="min-h-12 inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#FF6B35] hover:bg-[#D95426] text-white font-semibold rounded-md transition">
                      Ver oferta <ArrowUpRight className="w-5 h-5" />
                    </a>
                    <Link to={`/oferta/${featured.id}`} className="min-h-12 inline-flex items-center justify-center px-6 py-3 bg-white text-[#111111] font-semibold rounded-md border border-[#111111]/15 hover:bg-[#F3F3F3] transition">
                      Ver detalhes
                    </Link>
                  </div>
                  <p className="mt-5 text-[#111111]/40 text-xs leading-relaxed">
                    Este site utiliza links de afiliado e pode receber comissão pelas compras, sem custo adicional para você.
                  </p>
                </div>
              </div>
            </section>

            <section aria-labelledby="recent-title">
              <SectionTitle eyebrow="Ofertas recentes" title="Selecionados para você" />
              {recent.length ? (
                <OfferGrid>
                  {recent.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
                </OfferGrid>
              ) : (
                <EmptyState title="Mais ofertas aparecem aqui em breve." />
              )}
            </section>
            {personalized.length > 0 && (
              <section aria-labelledby="personalized-title">
                <SectionTitle eyebrow="Com base nos seus interesses" title="Escolhidos para você" />
                <OfferGrid>{personalized.map((offer) => <OfferCard key={offer.id} offer={offer} />)}</OfferGrid>
              </section>
            )}
          </>
        ) : (
          <EmptyState title="Novos achados aparecem aqui." description="Assim que uma oferta for publicada, ela entra nesta vitrine automaticamente." />
        )}

        {mostClicked.length > 0 && !loading && !error && (
          <section aria-labelledby="popular-title">
            <SectionTitle eyebrow="Mais clicados" title="Ofertas em destaque" />
            <div className="bg-white rounded-lg border border-[#111111]/8 overflow-hidden shadow-[0_6px_24px_rgba(17,17,17,0.05)]">
              {mostClicked.map((offer, index) => (
                <Link key={offer.id} to={`/oferta/${offer.id}`} className="grid grid-cols-[2rem_3.5rem_minmax(0,1fr)_auto] sm:grid-cols-[2.5rem_4rem_minmax(0,1fr)_auto] items-center gap-3 sm:gap-5 px-4 sm:px-5 py-3.5 border-b border-[#111111]/8 last:border-0 hover:bg-[#F8F8F8] transition">
                  <span className="text-lg font-semibold text-[#111111]/20">{String(index + 1).padStart(2, "0")}</span>
                  <div className="relative w-14 h-14 sm:w-16 sm:h-16 bg-white border border-[#111111]/8 rounded-md overflow-hidden">
                    {offer.image && <img src={offer.image} alt="" loading="lazy" className="w-full h-full object-contain p-1" />}
                    <StoreBadge platform={offer.platform} compact />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-[#111111] text-sm sm:text-base truncate">{offer.name}</h3>
                    <p className="text-[#111111]/40 text-xs mt-1">{offer.clicks || 0} cliques</p>
                  </div>
                  <span className="price-type text-[#111111] text-sm sm:text-lg whitespace-nowrap">{formatPrice(offer.price)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
