import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import Dashboard from "@/components/admin/Dashboard";
import ProductManager from "@/components/admin/ProductManager";
import CategoriesManager from "@/components/admin/CategoriesManager";
import StockManager from "@/components/admin/StockManager";
import SettingsPanel from "@/components/admin/SettingsPanel";
import { BarChart3, Package, Tag, Boxes, Settings as SettingsIcon, ArrowLeft, Zap, Send } from "lucide-react";
import { SITE_NAME } from "@/lib/catalog";

export default function Admin() {
  const [section, setSection] = useState("dashboard");
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadOffers = () => {
    base44.entities.Offer.list("-created_date", 200)
      .then(setOffers)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadOffers(); }, []);

  const updateStatus = async (id, status) => {
    await base44.entities.Offer.update(id, {
      status,
      published_date: status === "published" ? new Date().toISOString() : undefined,
    });
    loadOffers();
  };

  const sections = [
    { key: "dashboard", label: "Dashboard", icon: BarChart3 },
    { key: "products", label: "Produtos", icon: Package },
    { key: "categories", label: "Categorias", icon: Tag },
    { key: "stock", label: "Estoque", icon: Boxes },
    { key: "settings", label: "Configurações", icon: SettingsIcon },
  ];

  return (
    <div className="bg-[#0D0D0D] min-h-screen text-white">
      <div className="border-b border-white/10 sticky top-0 z-50 bg-[#0D0D0D]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-[#FF6B35]" fill="currentColor" />
            </div>
            <span className="font-bold text-lg">{SITE_NAME} <span className="text-white/40 font-normal hidden sm:inline">· Painel administrativo</span></span>
          </div>
          <Link to="/" className="text-sm text-white/60 hover:text-[#FF6B35] transition flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> <span className="hidden sm:inline">Ver site</span>
          </Link>
        </div>
      </div>

      <div className="max-w-7xl mx-auto flex">
        <aside className="hidden lg:block w-56 shrink-0 border-r border-white/10 min-h-[calc(100vh-4rem)] sticky top-16">
          <nav className="p-3 space-y-1">
            <Link
              to="/admin/ofertas"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition text-white/50 hover:bg-white/5 hover:text-white"
            >
              <Send className="w-4 h-4" /> Ofertas Telegram
            </Link>
            {sections.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                  section === s.key ? "bg-[#FF6B35] text-white" : "text-white/50 hover:bg-white/5 hover:text-white"
                }`}
              >
                <s.icon className="w-4 h-4" /> {s.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="lg:hidden border-b border-white/10 overflow-x-auto no-scrollbar sticky top-16 z-40 bg-[#0D0D0D] w-full">
          <div className="flex gap-1 px-3 py-3">
            <Link to="/admin/ofertas" className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition bg-white/5 text-white/50">
              <Send className="w-4 h-4" /> Telegram
            </Link>
            {sections.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition ${
                  section === s.key ? "bg-[#FF6B35] text-white" : "bg-white/5 text-white/50"
                }`}
              >
                <s.icon className="w-4 h-4" /> {s.label}
              </button>
            ))}
          </div>
        </div>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
          {section === "dashboard" && <Dashboard offers={offers} loading={loading} onUpdateStatus={updateStatus} />}
          {section === "products" && <ProductManager offers={offers} reload={loadOffers} />}
          {section === "categories" && <CategoriesManager offers={offers} />}
          {section === "stock" && <StockManager offers={offers} reload={loadOffers} />}
          {section === "settings" && <SettingsPanel />}
        </main>
      </div>
    </div>
  );
}
