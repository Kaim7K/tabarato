import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import Footer from "@/components/Footer";
import OfferCard from "@/components/OfferCard";
import { EmptyState, LoadingState, OfferGrid, PageShell, SectionHeader } from "@/components/PublicUi";
import { listPublicOffers } from "@/lib/offersApi";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";

export default function Radar() {
  useDocumentMetadata("Radar de ofertas | Tá Barato", "Ofertas em alta agora no Tá Barato.");
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setError("");
    listPublicOffers({ sort: "trending", limit: 48 })
      .then((items) => { if (active) setOffers(items); })
      .catch((requestError) => { if (active) setError(requestError.message || "Não foi possível carregar o radar."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <PageShell>
      <SectionHeader eyebrow="Radar" title="Ofertas em alta" description="Achados ganhando atenção agora, ordenados por cliques, favoritos e compartilhamentos." />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {loading ? <LoadingState /> : error ? (
          <EmptyState icon={TrendingUp} title="Não foi possível carregar o radar." description={error} />
        ) : offers.length ? (
          <OfferGrid>{offers.map((offer, index) => <OfferCard key={offer.id} offer={offer} rank={index + 1} />)}</OfferGrid>
        ) : <EmptyState icon={TrendingUp} title="O radar está aquecendo." description="As ofertas aparecem aqui assim que começam a ganhar destaque." />}
      </main>
      <Footer />
    </PageShell>
  );
}
