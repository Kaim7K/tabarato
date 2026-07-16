import { Link } from "react-router-dom";
import { ArrowUpRight, Clock, Heart, Share2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useFavorites } from "@/lib/FavoritesContext";

export default function OfferCard({ offer }) {
  const { toggle, isFavorite } = useFavorites();
  const fav = isFavorite(offer.id);

  const handleShare = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const text = `🔥 ${offer.name}\n\nR$ ${offer.price?.toFixed(2).replace(".", ",")}\n${offer.benefit || ""}\n\n${offer.affiliate_link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const handleClick = () => {
    base44.entities.Offer.update(offer.id, { clicks: (offer.clicks || 0) + 1 }).catch(() => {});
  };

  return (
    <div className="group bg-white rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.04)] hover:shadow-[0_24px_60px_rgba(0,0,0,0.07)] transition-all duration-300 flex flex-col">
      {/* Image */}
      <Link to={`/oferta/${offer.id}`} className="block relative overflow-hidden aspect-square bg-[#F5F2EB]">
        <img
          src={offer.image}
          alt={offer.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <span className="absolute top-3 left-3 px-3 py-1 bg-white/90 backdrop-blur-sm text-[#111111] text-xs font-medium rounded-full">
          {offer.category}
        </span>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggle(offer.id); }}
          className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-sm transition ${
            fav ? "bg-[#FF6B35] text-white" : "bg-white/90 text-[#111111]/60 hover:text-[#FF6B35]"
          }`}
          title={fav ? "Remover dos favoritos" : "Salvar nos favoritos"}
        >
          <Heart className="w-4 h-4" fill={fav ? "currentColor" : "none"} />
        </button>
      </Link>

      {/* Content */}
      <div className="p-5 flex flex-col flex-1">
        <Link to={`/oferta/${offer.id}`}>
          <h3 className="font-semibold text-[#111111] text-base leading-snug mb-2 group-hover:text-[#FF6B35] transition">
            {offer.name}
          </h3>
        </Link>
        <p className="text-[#111111]/60 text-sm leading-relaxed mb-4 flex-1 italic border-l-2 border-[#FF6B35]/30 pl-3">
          {offer.benefit}
        </p>

        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-[#111111]/40 text-xs uppercase tracking-wide mb-0.5">Preço</p>
            <p className="font-bold text-[#111111] text-xl tracking-tight" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              R$ {offer.price?.toFixed(2).replace(".", ",")}
            </p>
          </div>
          {offer.time_label && (
            <span className="flex items-center gap-1 text-[#111111]/40 text-xs">
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
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}