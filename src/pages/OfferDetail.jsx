import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowUpRight, Check, Heart, ImageOff, Share2 } from "lucide-react";
import Footer from "@/components/Footer";
import OfferCard from "@/components/OfferCard";
import { EmptyState, LoadingState, OfferGrid, SectionTitle } from "@/components/PublicUi";
import { useFavorites } from "@/lib/FavoritesContext";
import { formatPrice, slugify } from "@/lib/catalog";
import { getPublicOffer, listPublicOffers, trackOfferClick } from "@/lib/offersApi";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";

export default function OfferDetail() {
  const { id } = useParams();
  const [offer, setOffer] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toggle, isFavorite } = useFavorites();
  useDocumentMetadata(offer ? `${offer.name} | Tá Barato` : "Oferta | Tá Barato", offer?.description || undefined);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      getPublicOffer(id),
      listPublicOffers({ limit: 50 }),
    ])
      .then(([currentOffer, allOffers]) => {
        if (!active) return;
        setOffer(currentOffer);
        setRelated(allOffers.filter((item) => item.id !== id && item.category === currentOffer.category).slice(0, 4));
      })
      .catch(() => {
        if (active) setOffer(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F3F3F3] px-4 py-10">
        <div className="max-w-7xl mx-auto"><LoadingState label="Carregando oferta..." /></div>
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="min-h-screen bg-[#F3F3F3] px-4 py-10">
        <div className="max-w-3xl mx-auto">
          <EmptyState
            icon={AlertCircle}
            title="Oferta não encontrada."
            action={<Link to="/" className="min-h-11 inline-flex items-center px-5 py-2.5 text-sm font-semibold text-white bg-[#FF6B35] rounded-md hover:bg-[#D95426] transition">Voltar ao início</Link>}
          />
        </div>
      </div>
    );
  }

  const reasons = (offer.reason || "").split("\n").filter(Boolean);
  const favorite = isFavorite(offer.id);
  const shareText = `Oferta Tá Barato: ${offer.name}\n\n${formatPrice(offer.price)}\n${offer.benefit || ""}\n\n${offer.affiliate_link}`;

  return (
    <div className="bg-[#F3F3F3] min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <Link to="/" className="min-h-10 inline-flex items-center gap-1.5 text-[#111111]/55 text-sm hover:text-[#FF6B35] transition">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        <section className="bg-white border border-[#111111]/8 rounded-lg overflow-hidden grid lg:grid-cols-2">
          <div className="min-h-80 lg:min-h-[34rem] bg-white border-b lg:border-b-0 lg:border-r border-[#111111]/8 relative">
            {offer.image ? (
              <img src={offer.image} alt={offer.name} fetchPriority="high" className="absolute inset-0 w-full h-full object-contain p-5 sm:p-8" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-[#F3F3F3]">
                <ImageOff className="w-12 h-12 text-[#111111]/15" />
              </div>
            )}
          </div>

          <div className="p-5 sm:p-7 lg:p-9">
            <Link to={`/categoria/${slugify(offer.category)}`} className="text-[#FF6B35] text-xs font-semibold uppercase hover:underline">{offer.category}</Link>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-[#111111] leading-tight mt-3">{offer.name}</h1>

            <div className="mt-7 pb-7 border-b border-[#111111]/8">
              <p className="text-[#111111]/40 text-xs mb-1">Preço no momento da publicação</p>
              <p className="text-3xl sm:text-4xl font-semibold text-[#111111]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatPrice(offer.price)}</p>
            </div>

            {offer.description && (
              <div className="py-6 border-b border-[#111111]/8">
                <h2 className="text-sm font-semibold text-[#111111] mb-2">Descrição</h2>
                <p className="text-[#111111]/65 text-base leading-relaxed">{offer.description}</p>
              </div>
            )}

            {reasons.length > 0 && (
              <div className="py-6 border-b border-[#111111]/8">
                <h2 className="text-sm font-semibold text-[#111111] mb-3">Por que selecionamos?</h2>
                <ul className="space-y-2.5">
                  {reasons.map((reason) => (
                    <li key={reason} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-[#168A55]/10 flex items-center justify-center shrink-0 mt-0.5"><Check className="w-3 h-3 text-[#168A55]" /></span>
                      <span className="text-[#111111]/65 text-sm leading-relaxed">{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2 py-5 text-xs text-[#111111]/50">
              {offer.platform && <span className="px-3 py-2 bg-[#F3F3F3] rounded-md">Plataforma: {offer.platform}</span>}
              {offer.time_label && <span className="px-3 py-2 bg-[#F3F3F3] rounded-md">Publicado às {offer.time_label}</span>}
            </div>

            <a href={offer.affiliate_link} target="_blank" rel="noopener noreferrer" onClick={() => trackOfferClick(offer.id)} className="min-h-12 w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#FF6B35] hover:bg-[#D95426] text-white font-semibold rounded-md transition">
              Ver oferta <ArrowUpRight className="w-5 h-5" />
            </a>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button type="button" onClick={() => toggle(offer.id)} className={`min-h-11 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-semibold text-sm transition border ${favorite ? "bg-[#FF6B35] border-[#FF6B35] text-white" : "bg-white text-[#111111] border-[#111111]/12 hover:bg-[#F3F3F3]"}`}>
                <Heart className="w-4 h-4" fill={favorite ? "currentColor" : "none"} /> {favorite ? "Salvo" : "Salvar"}
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="min-h-11 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#168A55]/10 text-[#168A55] font-semibold rounded-md hover:bg-[#168A55] hover:text-white transition text-sm">
                <Share2 className="w-4 h-4" /> Compartilhar
              </a>
            </div>
            <p className="text-[#111111]/40 text-xs leading-relaxed mt-4">
              Publicidade | Link de afiliado — Este site pode receber comissão pela compra, sem custo adicional para você. Preço e disponibilidade podem mudar no site da loja.
            </p>
          </div>
        </section>

        {related.length > 0 && (
          <section className="mt-10">
            <SectionTitle title="Produtos relacionados" />
            <OfferGrid>{related.map((item) => <OfferCard key={item.id} offer={item} />)}</OfferGrid>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
