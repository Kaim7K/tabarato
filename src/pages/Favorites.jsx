import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import OfferCard from "@/components/OfferCard";
import Footer from "@/components/Footer";
import { useFavorites } from "@/lib/FavoritesContext";
import { Heart } from "lucide-react";
import { listPublicOffers } from "@/lib/offersApi";
import { EmptyState, LoadingState, OfferGrid, PageShell, SectionHeader } from "@/components/PublicUi";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";

export default function Favorites() {
  useDocumentMetadata("Favoritos | Tá Barato", "Seus achados salvos no Tá Barato.", "noindex, nofollow");
  const { favorites } = useFavorites();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    listPublicOffers({ limit: 200 })
      .then((data) => setOffers(data.filter((offer) => favorites.includes(offer.id))))
      .catch((err) => setError(err.message || "Não foi possível carregar favoritos."))
      .finally(() => setLoading(false));
  }, [favorites]);

  return (
    <PageShell>
      <SectionHeader eyebrow="Favoritos" title="Seus achados salvos" description={`${offers.length} ${offers.length === 1 ? "item salvo" : "itens salvos"}`} />
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {loading ? (
          <LoadingState label="Carregando favoritos..." />
        ) : error ? (
          <EmptyState icon={Heart} title="Não foi possível carregar seus favoritos." description={error} />
        ) : offers.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="Nenhum favorito ainda."
            description="Toque no coração nos achados para salvá-los aqui."
            action={<Link to="/" className="min-h-11 inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold text-white bg-[#FF6B35] rounded-md hover:bg-[#D95426] transition">Ver ofertas</Link>}
          />
        ) : (
          <OfferGrid>
            {offers.map((offer) => <OfferCard key={offer.id} offer={offer} />)}
          </OfferGrid>
        )}
      </section>
      <Footer />
    </PageShell>
  );
}
