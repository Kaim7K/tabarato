import { Link } from "react-router-dom";
import { ArrowUpRight, Clock, Heart, ImageOff, Share2 } from "lucide-react";
import { useFavorites } from "@/lib/FavoritesContext";
import { formatPrice } from "@/lib/catalog";
import { trackOfferClick } from "@/lib/offersApi";

export default function OfferCard({ offer }) {
  const { toggle, isFavorite } = useFavorites();
  const fav = isFavorite(offer.id);
  const summary = offer.benefit || offer.description || "Oferta selecionada pelo Tá Barato.";

  const handleShare = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = `Oferta Tá Barato: ${offer.name}\n\n${formatPrice(offer.price)}\n${summary}\n\n${offer.affiliate_link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const handleClick = () => {
    trackOfferClick(offer.id);
  };

  return (
    <article className="group bg-white rounded-2xl overflow-hidden shadow-[0_18px_45px_rgba(0,0,0,0.04)] hover:shadow-[0_24px_65px_rgba(0,0,0,0.08)] transition-all duration-300 flex flex-col h-full border border-[#111111]/5">
      <Link to={`/oferta/${offer.id}`} className="block relative overflow-hidden aspect-[4/3] bg-white">
        {offer.image ? (
          <img
            src={offer.image}
            alt={offer.name}
            loading="lazy"
            className="w-full h-full object-contain group-hover:scale-[1.03] transition-transform duration-500 bg-white p-2"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#F5F2EB] text-[#111111]/25">
            <ImageOff className="w-10 h-10" aria-hidden="true" />
          </div>
        )}
        <span className="absolute top-3 left-3 max-w-[72%] px-3 py-1 bg-white/95 backdrop-blur-sm text-[#111111] text-xs font-medium rounded-full truncate shadow-sm">
          {offer.category}
        </span>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(offer.id); }}
          className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-sm transition shadow-sm ${
            fav ? "bg-[#FF6B35] text-white" : "bg-white/95 text-[#111111]/60 hover:text-[#FF6B35]"
          }`}
          title={fav ? "Remover dos favoritos" : "Salvar nos favoritos"}
          aria-label={fav ? "Remover dos favoritos" : "Salvar nos favoritos"}
        >
          <Heart className="w-4 h-4" fill={fav ? "currentColor" : "none"} />
        </button>
      </Link>

      <div className="p-5 flex flex-col flex-1">
        <Link to={`/oferta/${offer.id}`} className="block">
          <h3 className="font-bold text-[#111111] text-base leading-snug mb-2 group-hover:text-[#FF6B35] transition line-clamp-2 min-h-[2.75rem]">
            {offer.name}
          </h3>
        </Link>

        <p className="text-[#111111]/60 text-sm leading-relaxed mb-5 line-clamp-3 min-h-[3.95rem]">
          {summary}
        </p>

        <div className="flex items-end justify-between gap-3 mb-4 mt-auto">
          <div className="min-w-0">
            <p className="text-[#111111]/40 text-xs uppercase tracking-wide mb-0.5">Preço</p>
            <p className="font-bold text-[#111111] text-xl tracking-tight truncate" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              {formatPrice(offer.price)}
            </p>
          </div>
          {offer.time_label && (
            <span className="flex items-center gap-1 text-[#111111]/40 text-xs shrink-0">
              <Clock className="w-3 h-3" />
              {offer.time_label}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <a
            href={offer.affiliate_link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleClick}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 bg-[#111111] text-white text-sm font-semibold rounded-full hover:bg-[#FF6B35] transition group-hover:bg-[#FF6B35]"
          >
            Ver oferta
            <ArrowUpRight className="w-4 h-4" />
          </a>
          <button
            onClick={handleShare}
            className="w-12 flex items-center justify-center px-3 py-3 bg-[#168A55]/10 text-[#168A55] text-sm font-semibold rounded-full hover:bg-[#168A55] hover:text-white transition"
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
