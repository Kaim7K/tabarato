import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import OfferCard from "@/components/OfferCard";
import Footer from "@/components/Footer";
import { useFavorites } from "@/lib/FavoritesContext";
import { Download, Heart, Upload } from "lucide-react";
import { listPublicOffersByIds } from "@/lib/offersApi";
import { EmptyState, LoadingState, OfferGrid, PageShell, SectionHeader } from "@/components/PublicUi";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";

export default function Favorites() {
  useDocumentMetadata("Favoritos | Tá Barato", "Seus achados salvos no Tá Barato.", "noindex, nofollow");
  const { favorites, replaceFavorites } = useFavorites();
  const importRef = useRef(null);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    listPublicOffersByIds(favorites, { signal: controller.signal })
      .then(setOffers)
      .catch((err) => {
        if (err?.name !== "AbortError") setError(err.message || "Não foi possível carregar favoritos.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [favorites]);

  return (
    <PageShell>
      <SectionHeader eyebrow="Favoritos" title="Seus achados salvos" description={`${offers.length} ${offers.length === 1 ? "item salvo" : "itens salvos"}`}>
        <div className="flex gap-2">
          <button type="button" onClick={() => { const blob = new Blob([JSON.stringify({ favorites }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "ta-barato-favoritos.json"; link.click(); URL.revokeObjectURL(url); }} className="min-h-11 px-4 inline-flex items-center gap-2 bg-white border border-[#111111]/10 rounded-md text-sm font-semibold"><Download className="w-4 h-4" /> Exportar</button>
          <button type="button" onClick={() => importRef.current?.click()} className="min-h-11 px-4 inline-flex items-center gap-2 bg-[#111111] text-white rounded-md text-sm font-semibold"><Upload className="w-4 h-4" /> Importar</button>
          <input ref={importRef} type="file" accept="application/json" className="sr-only" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const data = JSON.parse(await file.text()); replaceFavorites(Array.isArray(data.favorites) ? data.favorites : []); } catch { event.target.value = ""; } }} />
        </div>
      </SectionHeader>
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
