import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowLeftRight, ArrowUpRight, Bell, Check, Heart, ImageDown, ImageOff, Pencil, TrendingDown } from "lucide-react";
import Footer from "@/components/Footer";
import { StoreBadge, WhatsAppIcon } from "@/components/BrandIcons";
import OfferCard from "@/components/OfferCard";
import { EmptyState, LoadingState, OfferGrid, SectionTitle } from "@/components/PublicUi";
import { useFavorites } from "@/lib/FavoritesContext";
import { formatPrice, slugify } from "@/lib/catalog";
import { getPublicOffer, listPublicOffers, trackOfferClick, trackOfferMetric } from "@/lib/offersApi";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";
import { useOfferTools } from "@/lib/OfferToolsContext";
import { shareOfferCard } from "@/lib/shareCard";
import { validateAdminSession } from "@/lib/adminAuth";

export default function OfferDetail() {
  const { id } = useParams();
  const [offer, setOffer] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [targetPrice, setTargetPrice] = useState("");
  const [alertSaved, setAlertSaved] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const { toggle, isFavorite } = useFavorites();
  const { compareIds, createAlert, isComparing, recordInterest, toggleCompare } = useOfferTools();
  useDocumentMetadata(offer ? `${offer.name} | Tá Barato` : "Oferta | Tá Barato", offer?.description || undefined);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setRelated([]);
    getPublicOffer(id, { signal: controller.signal })
      .then((currentOffer) => {
        if (controller.signal.aborted) return;
        setOffer(currentOffer);
        setLoading(false);
        listPublicOffers({ category: currentOffer.category, limit: 5 }, { signal: controller.signal })
          .then((items) => {
            if (!controller.signal.aborted) setRelated(items.filter((item) => item.id !== id).slice(0, 4));
          })
          .catch(() => {});
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setOffer(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id]);

  useEffect(() => {
    if (offer?.category) recordInterest(offer.category);
  }, [offer?.category, recordInterest]);

  useEffect(() => {
    const extensionAdmin = () => document.documentElement.dataset.tabaratoExtensionAdmin === "true";
    const updateFromExtension = (event) => setAdminMode(Boolean(event.detail?.active) || extensionAdmin());
    if (extensionAdmin()) setAdminMode(true);
    validateAdminSession().then((valid) => setAdminMode(valid || extensionAdmin())).catch(() => setAdminMode(extensionAdmin()));
    window.addEventListener("tabarato:admin-extension", updateFromExtension);
    return () => window.removeEventListener("tabarato:admin-extension", updateFromExtension);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F3F3F3] px-4 py-10">
        <div className="max-w-7xl mx-auto"><LoadingState label="Carregando oferta..." /></div>
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="min-h-screen bg-[#F3F3F3] px-4 py-10">
        <div className="max-w-3xl mx-auto">
          <EmptyState
            icon={AlertCircle}
            title="Oferta não encontrada."
            action={<Link to="/" className="min-h-11 inline-flex items-center px-5 py-2.5 text-sm font-semibold text-white bg-[#FF6B35] rounded-md hover:bg-[#D95426] transition">Voltar ao início</Link>}
          />
        </div>
      </div>
    );
  }

  const reasons = (offer.reason || "").split("\n").filter(Boolean);
  const favorite = isFavorite(offer.id);
  const comparing = isComparing(offer.id);
  const shareText = `Oferta Tá Barato: ${offer.name}\n\n${formatPrice(offer.price)}\n${offer.benefit || ""}\n\n${offer.affiliate_link}`;

  return (
    <div className="bg-[#F3F3F3] min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <Link to="/" className="min-h-10 inline-flex items-center gap-1.5 text-[#111111]/55 text-sm hover:text-[#FF6B35] transition">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        <section className="bg-white border border-[#111111]/8 rounded-lg overflow-hidden grid lg:grid-cols-2">
          <div className="min-h-80 lg:min-h-[34rem] bg-white border-b lg:border-b-0 lg:border-r border-[#111111]/8 relative">
            {offer.image ? (
              <img src={offer.image} alt={offer.name} className="absolute inset-0 w-full h-full object-contain p-5 sm:p-8" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-[#F3F3F3]">
                <ImageOff className="w-12 h-12 text-[#111111]/15" />
              </div>
            )}
            <StoreBadge platform={offer.platform} />
          </div>

          <div className="p-5 sm:p-7 lg:p-9">
            <div className="flex items-center justify-between gap-3">
              <Link to={`/categoria/${slugify(offer.category)}`} className="min-w-0 text-[#FF6B35] text-xs font-semibold uppercase hover:underline">{offer.category}</Link>
              {adminMode && (
                <a href={`/admin/ofertas?edit=${encodeURIComponent(offer.id)}`} target="_blank" rel="noopener noreferrer" className="shrink-0 min-h-9 inline-flex items-center gap-1.5 px-3 rounded-md border border-[#111111]/12 bg-[#F4F5F6] text-[#111111]/70 text-xs font-semibold hover:bg-[#111111] hover:text-white transition-colors" title="Editar produto no painel">
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </a>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-[#111111] leading-tight mt-3">{offer.name}</h1>

            <div className="mt-7 pb-7 border-b border-[#111111]/8">
              <p className="text-[#111111]/40 text-xs mb-1">Preço no momento da publicação</p>
              <p className="price-type text-3xl sm:text-4xl text-[#111111]">{formatPrice(offer.price)}</p>
              {offer.final_price < offer.price && <p className="mt-2 text-lg font-semibold text-[#168A55]">Preço final com cupom: {formatPrice(offer.final_price)}</p>}
              {offer.previous_price > offer.price && <p className="text-sm text-[#111111]/40 mt-2"><span className="line-through">{formatPrice(offer.previous_price)}</span> <strong className="ml-2 text-[#168A55]">Economize {formatPrice(offer.savings)}</strong></p>}
              {offer.coupon && <span className="inline-flex mt-3 px-3 py-2 rounded-md bg-[#FF6B35]/10 text-[#D95426] text-sm font-semibold">Cupom: {offer.coupon}</span>}
            </div>

            <a href={offer.affiliate_link} target="_blank" rel="noopener noreferrer" onClick={() => trackOfferClick(offer.id)} className="mt-6 min-h-12 w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#FF6B35] hover:bg-[#D95426] text-white font-semibold rounded-md transition">
              Ver oferta <ArrowUpRight className="w-5 h-5" />
            </a>

            <PriceHistory history={offer.price_history || []} currentPrice={offer.price} />

            {offer.description && (
              <div className="py-6 border-b border-[#111111]/8">
                <h2 className="text-sm font-semibold text-[#111111] mb-2">Descrição</h2>
                <p className="text-[#111111]/65 text-base leading-relaxed">{offer.description}</p>
              </div>
            )}

            {reasons.length > 0 && (
              <div className="py-6 border-b border-[#111111]/8">
                <h2 className="text-sm font-semibold text-[#111111] mb-3">Por que selecionamos?</h2>
                <ul className="space-y-2.5">
                  {reasons.map((reason) => (
                    <li key={reason} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-[#168A55]/10 flex items-center justify-center shrink-0 mt-0.5"><Check className="w-3 h-3 text-[#168A55]" /></span>
                      <span className="text-[#111111]/65 text-sm leading-relaxed">{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2 py-5 text-xs text-[#111111]/50">
              {offer.platform && <span className="px-3 py-2 bg-[#F3F3F3] rounded-md">Plataforma: {offer.platform}</span>}
              {offer.time_label && <span className="px-3 py-2 bg-[#F3F3F3] rounded-md">Publicado às {offer.time_label}</span>}
            </div>

            <div className="grid sm:grid-cols-3 gap-2 mt-2">
              <button type="button" onClick={() => { if (!favorite) trackOfferMetric(offer.id, "favorite"); toggle(offer.id); }} className={`min-h-11 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-semibold text-sm transition border ${favorite ? "bg-[#FF6B35] border-[#FF6B35] text-white" : "bg-white text-[#111111] border-[#111111]/12 hover:bg-[#F3F3F3]"}`}>
                <Heart className="w-4 h-4" fill={favorite ? "currentColor" : "none"} /> {favorite ? "Salvo" : "Salvar"}
              </button>
              <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} onClick={() => trackOfferMetric(offer.id, "share")} target="_blank" rel="noopener noreferrer" className="min-h-11 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#25D366]/15 text-[#128C7E] font-semibold rounded-md hover:bg-[#25D366] hover:text-[#073B2B] transition-colors text-sm">
                <WhatsAppIcon className="w-5 h-5" /> Compartilhar
              </a>
              <button type="button" disabled={!comparing && compareIds.length >= 3} onClick={() => toggleCompare(offer.id)} className={`min-h-11 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md font-semibold text-sm border transition-colors ${comparing ? "bg-[#111111] text-white border-[#111111]" : "bg-white text-[#111111] border-[#111111]/12"}`}><ArrowLeftRight className="w-4 h-4" /> {comparing ? "Comparando" : compareIds.length >= 3 ? "Limite atingido" : "Comparar"}</button>
            </div>
            <button type="button" onClick={() => { trackOfferMetric(offer.id, "share"); shareOfferCard(offer).catch(() => {}); }} className="mt-2 min-h-11 w-full flex items-center justify-center gap-2 px-4 rounded-md border border-[#111111]/12 bg-white text-[#111111] font-semibold text-sm hover:bg-[#F4F5F6]"><ImageDown className="w-4 h-4" /> Compartilhar card da oferta</button>
            <div className="mt-3 p-4 bg-[#F4F5F6] rounded-lg border border-[#111111]/8">
              <label htmlFor="target-price" className="block text-sm font-semibold text-[#111111] mb-2">Avise quando o preço baixar para</label>
              <div className="grid sm:grid-cols-[1fr_auto] gap-2">
                <input id="target-price" type="number" min="0.01" step="0.01" value={targetPrice} onChange={(event) => { setTargetPrice(event.target.value); setAlertSaved(false); }} placeholder={String(Math.max(1, Math.floor(offer.price * 0.9)))} className="min-h-11 px-3.5 rounded-md border border-[#111111]/15 bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B35]/30" />
                <button type="button" onClick={() => { const saved = createAlert(offer, targetPrice || offer.price * 0.9); setAlertSaved(saved); }} className="min-h-11 inline-flex items-center justify-center gap-2 px-4 bg-[#111111] text-white rounded-md font-semibold text-sm"><Bell className="w-4 h-4" /> Criar alerta</button>
              </div>
              {alertSaved && <p className="mt-2 text-sm text-[#168A55]" role="status">Alerta salvo. Você pode acompanhá-lo na central de alertas.</p>}
            </div>
            <p className="text-[#111111]/40 text-xs leading-relaxed mt-4">
              Este site pode receber comissão pela compra, sem custo adicional para você. Preço e disponibilidade podem mudar no site da loja.
            </p>
          </div>
        </section>

        {related.length > 0 && (
          <section className="mt-10">
            <SectionTitle title="Produtos relacionados" />
            <OfferGrid>{related.map((item) => <OfferCard key={item.id} offer={item} />)}</OfferGrid>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}

function PriceHistory({ history, currentPrice }) {
  const points = history.length ? history : [{ price: currentPrice, date: new Date().toISOString() }];
  const prices = points.map((item) => item.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const average = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  const range = Math.max(max - min, 1);
  return (
    <section className="py-6 border-b border-[#111111]/8" aria-labelledby="price-history-title">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div><h2 id="price-history-title" className="text-sm font-semibold text-[#111111]">Histórico de preços</h2><p className="text-xs text-[#111111]/40 mt-1">{points.length} registro{points.length === 1 ? "" : "s"}</p></div>
        <TrendingDown className="w-5 h-5 text-[#168A55]" />
      </div>
      <div className="h-24 flex items-end gap-1.5" role="img" aria-label={`Preço mínimo ${formatPrice(min)}, preço médio ${formatPrice(average)}`}>
        {points.slice(-24).map((item, index) => <div key={`${item.date}-${index}`} className="flex-1 min-w-1 rounded-t bg-[#FF6B35]/70" style={{ height: `${30 + ((item.price - min) / range) * 70}%` }} title={`${formatPrice(item.price)} em ${new Date(item.date).toLocaleDateString("pt-BR")}`} />)}
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3 text-xs"><span className="text-[#111111]/45">Menor preço <strong className="block text-[#168A55] text-sm mt-1">{formatPrice(min)}</strong></span><span className="text-[#111111]/45">Preço médio <strong className="block text-[#111111] text-sm mt-1">{formatPrice(average)}</strong></span></div>
    </section>
  );
}
