import { Link } from "react-router-dom";
import { ArrowUpRight, Clock, Heart, ImageOff, Share2 } from "lucide-react";
import { useFavorites } from "@/lib/FavoritesContext";
import { formatPrice } from "@/lib/catalog";
import { trackOfferClick } from "@/lib/offersApi";

export default function OfferCard({ offer }) {
  const { toggle, isFavorite } = useFavorites();
  const favorite = isFavorite(offer.id);
  const summary = offer.benefit || offer.description || "Oferta selecionada pelo Tá Barato.";

  const shareOffer = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const text = `Oferta Tá Barato: ${offer.name}\n\n${formatPrice(offer.price)}\n${summary}\n\n${offer.affiliate_link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <article className="group bg-white rounded-lg overflow-hidden border border-[#111111]/8 shadow-[0_2px_12px_rgba(17,17,17,0.04)] hover:border-[#111111]/15 hover:shadow-[0_12px_30px_rgba(17,17,17,0.09)] transition-[border-color,box-shadow,transform] duration-200 flex flex-col h-full">
      <Link to={`/oferta/${offer.id}`} className="block relative overflow-hidden aspect-[4/3] bg-white border-b border-[#111111]/8">
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
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            toggle(offer.id);
          }}
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
          <p className="font-semibold text-[#111111] text-2xl leading-none" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            {formatPrice(offer.price)}
          </p>
          {offer.time_label && (
            <span className="mt-2 flex items-center gap-1 text-[#111111]/40 text-xs">
              <Clock className="w-3 h-3" />
              {offer.time_label}
            </span>
          )}
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
            className="min-h-11 min-w-11 flex items-center justify-center bg-white border border-[#111111]/10 text-[#168A55] rounded-md hover:bg-[#168A55] hover:text-white transition"
            title="Compartilhar no WhatsApp"
            aria-label="Compartilhar no WhatsApp"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </article>
  );
}
