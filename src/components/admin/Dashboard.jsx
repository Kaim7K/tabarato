import { Check, Clock, Eye, AlertTriangle, BarChart3, TrendingUp, Package, Boxes } from "lucide-react";

export default function Dashboard({ offers, loading, onUpdateStatus }) {
  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-white/10 border-t-[#FF6B35] rounded-full animate-spin" /></div>;
  }

  const today = new Date().toDateString();
  const publishedToday = offers.filter((o) => o.published_date && new Date(o.published_date).toDateString() === today);
  const pending = offers.filter((o) => o.status === "pending" || o.status === "draft");
  const totalClicks = offers.reduce((sum, o) => sum + (o.clicks || 0), 0);
  const scheduled = offers.filter((o) => o.status === "scheduled");
  const needsReview = offers.filter((o) => {
    if (!o.published_date) return false;
    const diff = (Date.now() - new Date(o.published_date).getTime()) / (1000 * 60 * 60);
    return diff > 24;
  });
  const totalStock = offers.reduce((sum, o) => sum + (o.stock || 0), 0);
  const lowStock = offers.filter((o) => (o.stock || 0) > 0 && (o.stock || 0) <= 5);
  const outOfStock = offers.filter((o) => !o.stock || o.stock === 0);

  const stats = [
    { label: "Publicadas hoje", value: publishedToday.length, icon: Check, color: "#168A55" },
    { label: "Aguardando aprovação", value: pending.length, icon: Clock, color: "#FF6B35" },
    { label: "Cliques no site", value: totalClicks, icon: Eye, color: "#fff" },
    { label: "Agendadas", value: scheduled.length, icon: Clock, color: "#fff" },
    { label: "Em estoque", value: totalStock, icon: Boxes, color: "#fff" },
    { label: "Sem estoque", value: outOfStock.length, icon: Package, color: "#FF6B35" },
  ];

  const catCounts = {};
  offers.forEach((o) => { if (o.category) catCounts[o.category] = (catCounts[o.category] || 0) + 1; });
  const topCategories = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topClicked = [...offers].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-1">Dashboard</h2>
        <p className="text-white/40 text-sm">Visão geral do sistema</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white/5 rounded-2xl p-5 border border-white/10">
            <s.icon className="w-5 h-5 mb-3" style={{ color: s.color }} />
            <p className="text-3xl font-bold" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</p>
            <p className="text-white/40 text-sm mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
          <h3 className="font-semibold text-lg mb-5 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#FF6B35]" /> Categorias com mais acessos
          </h3>
          <div className="space-y-3">
            {topCategories.map(([cat, count]) => (
              <div key={cat} className="flex items-center justify-between">
                <span className="text-white/70 text-sm">{cat}</span>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-[#FF6B35] rounded-full" style={{ width: `${offers.length ? (count / offers.length) * 100 : 0}%` }} />
                  </div>
                  <span className="text-white/50 text-sm w-6 text-right" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{count}</span>
                </div>
              </div>
            ))}
            {topCategories.length === 0 && <p className="text-white/30 text-sm">Sem dados</p>}
          </div>
        </div>

        <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
          <h3 className="font-semibold text-lg mb-5 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#FF6B35]" /> Produtos mais clicados
          </h3>
          <div className="space-y-3">
            {topClicked.map((o, idx) => (
              <div key={o.id} className="flex items-center gap-3">
                <span className="text-white/30 text-sm w-6" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{String(idx + 1).padStart(2, "0")}</span>
                <span className="flex-1 text-white/70 text-sm truncate">{o.name}</span>
                <span className="text-white/50 text-sm" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{o.clicks || 0}</span>
              </div>
            ))}
            {topClicked.length === 0 && <p className="text-white/30 text-sm">Sem dados</p>}
          </div>
        </div>
      </div>

      {needsReview.length > 0 && (
        <div className="bg-[#FF6B35]/10 border border-[#FF6B35]/20 rounded-2xl p-6">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2 text-[#FF6B35]">
            <AlertTriangle className="w-5 h-5" /> Ofertas que precisam de revisão
          </h3>
          <div className="space-y-2">
            {needsReview.map((o) => (
              <div key={o.id} className="flex items-center justify-between bg-white/5 rounded-xl px-4 py-3">
                <span className="text-sm text-white/70 truncate">{o.name}</span>
                <button onClick={() => onUpdateStatus(o.id, "published")} className="text-xs text-[#168A55] hover:underline shrink-0 ml-4">
                  Confirmar que continua válida
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}