import { Link } from "react-router-dom";
import { ArrowUpRight, Clock, Heart, ImageOff, Scale } from "lucide-react";
import { StoreBadge, WhatsAppIcon } from "@/components/BrandIcons";
import { useFavorites } from "@/lib/FavoritesContext";
import { formatPrice, formatRelativeDate } from "@/lib/catalog";
import { trackOfferClick, trackOfferMetric } from "@/lib/offersApi";
import { useOfferTools } from "@/lib/OfferToolsContext";

export default function OfferCard({ offer, rank = 0 }) {
  const { toggle, isFavorite } = useFavorites();
  const { compareIds, isComparing, recordInterest, toggleCompare } = useOfferTools();
  const favorite = isFavorite(offer.id);
  const comparing = isComparing(offer.id);
  const summary = offer.benefit || offer.description || "Oferta selecionada pelo Tá Barato.";

  const shareOffer = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const text = `Oferta Tá Barato: ${offer.name}\n\n${formatPrice(offer.price)}\n${summary}\n\n${offer.affiliate_link}`;
    trackOfferMetric(offer.id, "share");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const toggleFavorite = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!favorite) trackOfferMetric(offer.id, "favorite");
    toggle(offer.id);
  };

  return (
    <article className="group bg-white rounded-lg overflow-hidden border border-[#111111]/8 shadow-[0_2px_12px_rgba(17,17,17,0.04)] hover:border-[#111111]/15 hover:shadow-[0_12px_30px_rgba(17,17,17,0.09)] transition-[border-color,box-shadow,transform] duration-200 flex flex-col h-full">
      <Link to={`/oferta/${offer.id}`} onClick={() => recordInterest(offer.category)} className="block relative overflow-hidden aspect-[4/3] bg-white border-b border-[#111111]/8">
        {offer.image ? (
          <img
            src={offer.image}
            alt={offer.name}
            loading="lazy"
            className="w-full h-full object-contain bg-white p-3 group-hover:scale-[1.025] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#F3F3F3] text-[#111111]/20">
            <ImageOff className="w-9 h-9" aria-hidden="true" />
          </div>
        )}
        <button
          type="button"
          onClick={toggleFavorite}
          className={`absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center border transition shadow-sm ${
            favorite
              ? "bg-[#FF6B35] border-[#FF6B35] text-white"
              : "bg-white/95 border-[#111111]/10 text-[#111111]/55 hover:text-[#FF6B35]"
          }`}
          title={favorite ? "Remover dos favoritos" : "Salvar nos favoritos"}
          aria-label={favorite ? "Remover dos favoritos" : "Salvar nos favoritos"}
        >
          <Heart className="w-4 h-4" fill={favorite ? "currentColor" : "none"} />
        </button>
        {offer.discount > 0 && <span className="absolute top-3 left-3 px-2.5 py-1.5 rounded-md bg-[#168A55] text-white text-xs font-bold">-{offer.discount}%</span>}
        {rank > 0 && <span className="absolute top-12 left-3 px-2 py-1 rounded-md bg-[#111111] text-white text-xs font-bold">#{rank} em alta</span>}
        <StoreBadge platform={offer.platform} />
      </Link>

      <div className="p-4 flex flex-col flex-1">
        <p className="text-[#111111]/45 text-xs mb-2 truncate">{offer.category}{offer.platform ? ` · ${offer.platform}` : ""}</p>
        <Link to={`/oferta/${offer.id}`} className="block">
          <h3 className="font-semibold text-[#111111] text-base leading-snug group-hover:text-[#FF6B35] transition line-clamp-2 min-h-[2.75rem]">
            {offer.name}
          </h3>
        </Link>

        <p className="text-[#111111]/55 text-sm leading-relaxed mt-2 line-clamp-2 min-h-10">
          {summary}
        </p>

        <div className="mt-5 mb-4">
          {offer.previous_price && offer.previous_price > offer.price && <p className="text-xs text-[#111111]/35 line-through mb-1">{formatPrice(offer.previous_price)}</p>}
          <p className="price-type text-[#111111] text-2xl leading-none">
            {formatPrice(offer.price)}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {offer.coupon && <span className="px-2 py-1 rounded bg-[#FF6B35]/10 text-[#D95426] text-xs font-semibold">Cupom: {offer.coupon}</span>}
          {offer.published_date && (
            <span className="flex items-center gap-1 text-[#111111]/40 text-xs">
              <Clock className="w-3 h-3" />
              Atualizado {formatRelativeDate(offer.published_date)}
            </span>
          )}
          </div>
        </div>

        <div className="flex gap-2 mt-auto">
          <a
            href={offer.affiliate_link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackOfferClick(offer.id)}
            className="min-h-11 flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#FF6B35] text-white text-sm font-semibold rounded-md hover:bg-[#D95426] transition"
          >
            Ver oferta
            <ArrowUpRight className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={shareOffer}
            className="min-h-11 min-w-11 flex items-center justify-center bg-white border border-[#25D366]/40 text-[#128C7E] rounded-md hover:bg-[#25D366] hover:text-[#073B2B] transition-colors"
            title="Compartilhar no WhatsApp"
            aria-label="Compartilhar no WhatsApp"
          >
            <WhatsAppIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => toggleCompare(offer.id)}
            disabled={!comparing && compareIds.length >= 3}
            className={`min-h-11 min-w-11 flex items-center justify-center border rounded-md transition-colors ${comparing ? "bg-[#111111] text-white border-[#111111]" : "bg-white text-[#111111]/55 border-[#111111]/10 hover:text-[#FF6B35]"}`}
            title={comparing ? "Remover da comparação" : compareIds.length >= 3 ? "Limite de três ofertas atingido" : "Adicionar à comparação"}
            aria-label={comparing ? "Remover da comparação" : compareIds.length >= 3 ? "Limite de três ofertas atingido" : "Adicionar à comparação"}
          >
            <Scale className="w-5 h-5" />
          </button>
        </div>
      </div>
    </article>
  );
}
