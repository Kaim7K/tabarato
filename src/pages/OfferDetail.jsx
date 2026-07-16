import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Footer from "@/components/Footer";
import OfferCard from "@/components/OfferCard";
import { ArrowUpRight, ArrowLeft, Check, Loader2, AlertCircle, Heart, Share2 } from "lucide-react";
import { useFavorites } from "@/lib/FavoritesContext";
import { formatPrice, slugify } from "@/lib/catalog";
import { getPublicOffer, listPublicOffers, trackOfferClick } from "@/lib/offersApi";

export default function OfferDetail() {
  const { id } = useParams();
  const [offer, setOffer] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toggle, isFavorite } = useFavorites();

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await getPublicOffer(id);
        const all = await listPublicOffers({ limit: 50 });
        if (!active) return;
        setOffer(data);
        setRelated(all.filter((item) => item.id !== id && item.category === data.category).slice(0, 3));
      } catch {
        if (active) setOffer(null);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [id]);

  if (loading) {
    return <div className="min-h-screen bg-[#F5F2EB] flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#111111]/30 animate-spin" /></div>;
  }

  if (!offer) {
    return (
      <div className="min-h-screen bg-[#F5F2EB] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-[#111111]/20 mx-auto mb-4" />
          <p className="text-[#111111]/40 text-lg">Oferta não encontrada.</p>
          <Link to="/" className="mt-4 inline-block text-[#FF6B35] font-medium hover:underline">← Voltar ao início</Link>
        </div>
      </div>
    );
  }

  const reasons = (offer.reason || "").split("\n").filter(Boolean);
  const isFav = isFavorite(offer.id);
  const shareText = `Oferta Tá Barato: ${offer.name}\n\n${formatPrice(offer.price)}\n${offer.benefit || ""}\n\n${offer.affiliate_link}`;

  return (
    <div className="bg-[#F5F2EB] min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <Link to="/" className="inline-flex items-center gap-1.5 text-[#111111]/50 text-sm hover:text-[#FF6B35] transition">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
      </div>
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-16">
          <div className="lg:col-span-6">
            <div className="lg:sticky lg:top-28">
              <div className="aspect-square rounded-3xl overflow-hidden bg-white shadow-[0_20px_60px_rgba(0,0,0,0.06)] mb-6">
                <img src={offer.image} alt={offer.name} className="w-full h-full object-cover" />
              </div>
              <div className="mt-4 bg-[#111111]/5 border border-[#111111]/8 rounded-xl px-4 py-3">
                <p className="text-[#111111]/50 text-xs leading-relaxed" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  Preço e disponibilidade podem mudar no site da loja.
                </p>
              </div>
            </div>
          </div>
          <div className="lg:col-span-6">
            <Link to={`/categoria/${slugify(offer.category)}`} className="text-[#FF6B35] text-sm font-semibold uppercase tracking-widest">{offer.category}</Link>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-[#111111] tracking-tight leading-[1.1] mt-3 mb-6">{offer.name}</h1>
            <div className="mb-8">
              <p className="text-[#111111]/40 text-xs uppercase tracking-wide mb-1">Preço no momento da publicação</p>
              <p className="text-4xl sm:text-5xl font-bold text-[#111111] tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{formatPrice(offer.price)}</p>
            </div>
            {offer.description && (
              <div className="mb-8">
                <h2 className="text-sm font-bold text-[#111111] uppercase tracking-wide mb-3">Descrição</h2>
                <p className="text-[#111111]/70 text-lg leading-relaxed">{offer.description}</p>
              </div>
            )}
            {reasons.length > 0 && (
              <div className="mb-8">
                <h2 className="text-sm font-bold text-[#111111] uppercase tracking-wide mb-4">Por que selecionamos?</h2>
                <ul className="space-y-3">
                  {reasons.map((reason, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-[#168A55]/10 flex items-center justify-center shrink-0 mt-0.5"><Check className="w-3 h-3 text-[#168A55]" /></div>
                      <span className="text-[#111111]/70 leading-relaxed">{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mb-8 flex flex-wrap gap-3">
              {offer.platform && <span className="px-4 py-2 bg-white text-[#111111]/60 text-sm rounded-full border border-[#111111]/8">Plataforma: {offer.platform}</span>}
              {offer.time_label && <span className="px-4 py-2 bg-white text-[#111111]/60 text-sm rounded-full border border-[#111111]/8">Publicado às {offer.time_label}</span>}
            </div>
            <a href={offer.affiliate_link} target="_blank" rel="noopener noreferrer" onClick={() => trackOfferClick(offer.id)} className="w-full flex items-center justify-center gap-2 px-8 py-5 bg-[#FF6B35] hover:bg-[#D95426] text-white font-bold rounded-full transition shadow-lg text-lg mb-3">
              Ver oferta <ArrowUpRight className="w-5 h-5" />
            </a>
            <div className="flex gap-3 mb-4">
              <button onClick={() => toggle(offer.id)} className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-full font-semibold transition text-sm ${isFav ? "bg-[#FF6B35] text-white" : "bg-white text-[#111111] border border-[#111111]/10 hover:bg-[#F5F2EB]"}`}>
                <Heart className="w-4 h-4" fill={isFav ? "currentColor" : "none"} /> {isFav ? "Salvo" : "Salvar"}
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-[#168A55]/10 text-[#168A55] font-semibold rounded-full hover:bg-[#168A55] hover:text-white transition text-sm">
                <Share2 className="w-4 h-4" /> Compartilhar
              </a>
            </div>
            <p className="text-[#111111]/40 text-xs leading-relaxed">
              Publicidade | Link de afiliado — Este site pode receber comissão pela compra, sem custo adicional para você. Preço e disponibilidade podem mudar no site da loja.
            </p>
          </div>
        </div>
      </section>
      {related.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-[#111111] tracking-tight mb-8">Produtos relacionados</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">{related.map((item) => <OfferCard key={item.id} offer={item} />)}</div>
        </section>
      )}
      <Footer />
    </div>
  );
}

