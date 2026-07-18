import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, ArrowUpRight, BadgeCheck, X } from "lucide-react";
import Footer from "@/components/Footer";
import { StoreBadge } from "@/components/BrandIcons";
import { EmptyState, LoadingState, PageShell, SectionHeader } from "@/components/PublicUi";
import { formatPrice } from "@/lib/catalog";
import { useOfferTools } from "@/lib/OfferToolsContext";
import { listPublicOffersByIds } from "@/lib/offersApi";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";

export default function Compare() {
  useDocumentMetadata("Comparar ofertas | Tá Barato", undefined, "noindex, follow");
  const { compareIds, removeCompare } = useOfferTools();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    listPublicOffersByIds(compareIds, { signal: controller.signal })
      .then(setOffers)
      .catch(() => {})
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [compareIds]);

  const removeOffer = (id) => {
    setOffers((current) => current.filter((offer) => offer.id !== id));
    removeCompare(id);
  };

  const bestOfferId = findBestOffer(offers)?.id;

  return (
    <PageShell>
      <SectionHeader eyebrow="Comparador" title="Compare seus achados" description="Compare até três ofertas antes de escolher a melhor opção." />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {loading ? <LoadingState /> : !offers.length ? (
          <EmptyState icon={ArrowLeftRight} title="Nenhuma oferta para comparar." description="Use o botão de comparação nos cards para adicionar até três produtos." action={<Link to="/" className="inline-flex min-h-11 items-center px-5 bg-[#FF6B35] text-white font-semibold rounded-md">Explorar ofertas</Link>} />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[#111111]/10 bg-white shadow-[0_6px_24px_rgba(17,17,17,0.05)]">
            <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `11rem repeat(${offers.length}, minmax(12rem, 1fr))` }}>
              <CompareLabel />
              {offers.map((offer) => <ProductHeader key={offer.id} offer={offer} recommended={offer.id === bestOfferId} remove={() => removeOffer(offer.id)} />)}
              <CompareRow label="Preço" offers={offers} bestOfferId={bestOfferId}>{offers.map((offer) => <strong key={offer.id} className="price-type text-xl">{formatPrice(effectivePrice(offer))}</strong>)}</CompareRow>
              <CompareRow label="Economia" offers={offers} bestOfferId={bestOfferId}>{offers.map((offer) => <span key={offer.id}>{offer.savings > 0 ? formatPrice(offer.savings) : "Sem histórico"}</span>)}</CompareRow>
              <CompareRow label="Desconto" offers={offers} bestOfferId={bestOfferId}>{offers.map((offer) => <span key={offer.id}>{offer.discount ? `${offer.discount}%` : "-"}</span>)}</CompareRow>
              <CompareRow label="Loja" offers={offers} bestOfferId={bestOfferId}>{offers.map((offer) => <span key={offer.id}>{offer.platform}</span>)}</CompareRow>
              <CompareRow label="Cupom" offers={offers} bestOfferId={bestOfferId}>{offers.map((offer) => <span key={offer.id}>{offer.coupon || "Não informado"}</span>)}</CompareRow>
              <CompareRow label="Popularidade" offers={offers} bestOfferId={bestOfferId}>{offers.map((offer) => <span key={offer.id}>{offer.clicks || 0} cliques</span>)}</CompareRow>
              <CompareRow label="Comprar" offers={offers} bestOfferId={bestOfferId}>{offers.map((offer) => <a key={offer.id} href={offer.affiliate_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#FF6B35] font-semibold">Ver oferta <ArrowUpRight className="w-4 h-4" /></a>)}</CompareRow>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </PageShell>
  );
}

function CompareLabel() {
  return <div className="p-4 border-b border-r border-[#111111]/10 bg-[#F4F5F6]" />;
}

function ProductHeader({ offer, recommended, remove }) {
  return (
    <div className={`relative p-4 pt-10 border-b border-r last:border-r-0 border-[#111111]/10 ${recommended ? "bg-[#EAF8F1] ring-2 ring-inset ring-[#168A55]/40" : "bg-white"}`}>
      {recommended && <span className="absolute top-3 left-4 inline-flex items-center gap-1.5 text-xs font-bold text-[#116B43]"><BadgeCheck className="w-4 h-4" /> Melhor opção</span>}
      <button type="button" onClick={remove} className="absolute top-2 right-2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-white border border-[#111111]/10 text-[#111111]/65 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B35]" title="Remover da comparação" aria-label={`Remover ${offer.name} da comparação`}><X className="w-4 h-4" /></button>
      <div className="relative h-36 mb-3"><img src={offer.image} alt="" className="w-full h-full object-contain" /><StoreBadge platform={offer.platform} compact /></div>
      <Link to={`/oferta/${offer.id}`} className="font-semibold leading-snug line-clamp-2">{offer.name}</Link>
    </div>
  );
}

function CompareRow({ label, children, offers, bestOfferId }) {
  return <><div className="p-4 border-b border-r border-[#111111]/10 bg-[#F4F5F6] text-sm font-semibold">{label}</div>{children.map((child, index) => <div key={offers[index]?.id || index} className={`p-4 border-b border-r last:border-r-0 border-[#111111]/10 text-sm text-[#111111]/65 ${offers[index]?.id === bestOfferId ? "bg-[#EAF8F1] ring-2 ring-inset ring-[#168A55]/25" : "bg-white"}`}>{child}</div>)}</>;
}

function effectivePrice(offer) {
  const currentPrice = Number(offer.price);
  const couponPrice = Number(offer.final_price);
  return Number.isFinite(couponPrice) && couponPrice > 0 && couponPrice < currentPrice ? couponPrice : currentPrice;
}

export function findBestOffer(offers) {
  return [...offers].sort((first, second) => (
    effectivePrice(first) - effectivePrice(second)
    || Number(second.discount || 0) - Number(first.discount || 0)
    || Number(Boolean(second.coupon)) - Number(Boolean(first.coupon))
    || Number(second.savings || 0) - Number(first.savings || 0)
    || Number(second.clicks || 0) - Number(first.clicks || 0)
  ))[0];
}
