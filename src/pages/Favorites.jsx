import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import OfferCard from "@/components/OfferCard";
import Footer from "@/components/Footer";
import { useFavorites } from "@/lib/FavoritesContext";
import { Heart, Loader2 } from "lucide-react";

export default function Favorites() {
  const { favorites } = useFavorites();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Offer.filter({ status: "published" }, "-published_date", 100)
      .then((data) => setOffers(data.filter((o) => favorites.includes(o.id))))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [favorites]);

  return (
    <div className="bg-[#F5F2EB] min-h-screen">
      <section className="border-b border-[#111111]/8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <p className="text-[#FF6B35] text-sm font-semibold uppercase tracking-widest mb-2">Favoritos</p>
          <h1 className="text-3xl sm:text-5xl font-bold text-[#111111] tracking-tight">Seus achados salvos</h1>
          <p className="text-[#111111]/50 text-base mt-3">{offers.length} {offers.length === 1 ? "item salvo" : "itens salvos"}</p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-[#111111]/30 animate-spin" /></div>
        ) : offers.length === 0 ? (
          <div className="text-center py-20">
            <Heart className="w-12 h-12 text-[#111111]/15 mx-auto mb-4" />
            <p className="text-[#111111]/40 text-lg">Nenhum favorito ainda.</p>
            <p className="text-[#111111]/30 text-sm mt-2">Toque no coração nos achados para salvá-los aqui.</p>
            <Link to="/" className="mt-6 inline-block text-[#FF6B35] font-medium hover:underline">Ver ofertas →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {offers.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
          </div>
        )}
      </section>
      <Footer />
    </div>
  );
}
