import { useEffect, useMemo, useState } from "react";
import { Bell, BellRing, Trash2 } from "lucide-react";
import Footer from "@/components/Footer";
import { EmptyState, LoadingState, PageShell, SectionHeader } from "@/components/PublicUi";
import { formatPrice } from "@/lib/catalog";
import { useOfferTools } from "@/lib/OfferToolsContext";
import { listPublicOffers } from "@/lib/offersApi";
import { useDocumentMetadata } from "@/hooks/useDocumentMetadata";

export default function Alerts() {
  useDocumentMetadata("Alertas de preço | Tá Barato", undefined, "noindex, nofollow");
  const { alerts, removeAlert } = useOfferTools();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const refresh = () => listPublicOffers({ limit: 100 })
      .then((items) => { if (active) setOffers(items); })
      .finally(() => { if (active) setLoading(false); });
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { active = false; window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  const rows = useMemo(() => alerts.map((alert) => ({ ...alert, offer: offers.find((item) => item.id === alert.offerId) })), [alerts, offers]);

  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    rows.filter((item) => item.type !== "search" && item.offer?.price <= item.targetPrice).forEach((item) => {
      const key = `tb_alert_notified_${item.id}_${item.offer.price}`;
      if (localStorage.getItem(key)) return;
      new Notification("Preço atingido no Tá Barato", { body: `${item.name} chegou a ${formatPrice(item.offer.price)}.`, icon: "/brand/favicon.png" });
      localStorage.setItem(key, "1");
    });
  }, [rows]);

  const enableNotifications = async () => {
    if ("Notification" in window) await Notification.requestPermission();
  };

  return (
    <PageShell>
      <SectionHeader eyebrow="Monitoramento" title="Alertas de preço" description="Acompanhe seus produtos e veja quando atingirem o valor desejado.">
        <button type="button" onClick={enableNotifications} className="min-h-11 inline-flex items-center justify-center gap-2 px-4 bg-[#111111] text-white rounded-md font-semibold text-sm"><BellRing className="w-4 h-4" /> Ativar notificações</button>
      </SectionHeader>
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {loading ? <LoadingState /> : !rows.length ? <EmptyState icon={Bell} title="Nenhum alerta criado." description="Abra uma oferta e defina o preço que deseja acompanhar." /> : (
          <div className="bg-white border border-[#111111]/10 rounded-lg overflow-hidden">
            {rows.map((item) => {
              if (item.type === "search") return (
                <div key={item.id} className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-4 p-4 border-b last:border-0 border-[#111111]/8">
                  <div className="w-11 h-11 rounded-md bg-[#FF6B35]/10 text-[#FF6B35] flex items-center justify-center"><Bell className="w-5 h-5" /></div>
                  <div className="min-w-0"><p className="font-semibold truncate">{item.query ? `Busca: ${item.query}` : `Categoria: ${item.category}`}</p><p className="text-sm text-[#111111]/50 mt-1">{item.platform || "Todas as lojas"}</p></div>
                  <button type="button" onClick={() => removeAlert(item.id)} className="w-10 h-10 flex items-center justify-center rounded-md border border-[#111111]/10 text-red-600" aria-label="Excluir alerta"><Trash2 className="w-4 h-4" /></button>
                </div>
              );
              const reached = item.offer && item.offer.price <= item.targetPrice;
              return (
                <div key={item.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-4 p-4 border-b last:border-0 border-[#111111]/8">
                  <img src={item.offer?.image || item.image} alt="" className="w-14 h-14 object-contain rounded-md border border-[#111111]/8" />
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{item.name}</p>
                    <p className="text-sm text-[#111111]/50 mt-1">Alvo: {formatPrice(item.targetPrice)} {item.offer && `• Atual: ${formatPrice(item.offer.price)}`}</p>
                    <span className={`inline-flex mt-2 px-2 py-1 rounded text-xs font-semibold ${reached ? "bg-[#25D366]/15 text-[#128C7E]" : "bg-[#111111]/5 text-[#111111]/50"}`}>{reached ? "Preço atingido" : "Monitorando"}</span>
                  </div>
                  <button type="button" onClick={() => removeAlert(item.id)} className="w-10 h-10 flex items-center justify-center rounded-md border border-[#111111]/10 text-red-600" aria-label={`Excluir alerta de ${item.name}`}><Trash2 className="w-4 h-4" /></button>
                </div>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </PageShell>
  );
}
