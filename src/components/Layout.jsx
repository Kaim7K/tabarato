import { Link, NavLink, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeftRight, Bell, ChevronDown, Flame, Heart, Home, Menu, Search, X } from "lucide-react";
import SmartSearch from "@/components/SmartSearch";
import { TelegramIcon, WhatsAppIcon } from "@/components/BrandIcons";
import { FavoritesProvider } from "@/lib/FavoritesContext";
import { OfferToolsProvider, useOfferTools } from "@/lib/OfferToolsContext";
import { DEFAULT_CATEGORIES } from "@/lib/catalog";
import { listPublicCategories } from "@/lib/offersApi";
import { TELEGRAM_CHANNEL_URL, WHATSAPP_GROUP_URL } from "@/lib/publicLinks";
import { BRAND_LOGO } from "@/lib/brand";

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const { compareIds } = useOfferTools();

  useEffect(() => {
    listPublicCategories()
      .then((items) => {
        const virtualCategories = DEFAULT_CATEGORIES.filter((category) => category.virtual);
        setCategories([...items, ...virtualCategories]);
      })
      .catch(() => {});
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#111111]/10 shadow-[0_1px_0_rgba(0,0,0,0.04)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 md:gap-6 py-3">
          <Link to="/" className="flex items-center shrink-0" aria-label="Ir para a página inicial">
            <img src={BRAND_LOGO} alt="Tá Barato" className="h-10 sm:h-12 w-auto object-contain" />
          </Link>

          <div className="hidden md:block w-full max-w-2xl justify-self-center">
            <SmartSearch placeholder="Buscar produtos, categorias e ofertas..." />
          </div>

          <div className="flex items-center justify-end gap-1 sm:gap-2">
            <Link to="/comparar" className="relative min-h-11 min-w-11 px-2 sm:px-3 inline-flex items-center justify-center gap-2 text-[#111111]/70 hover:text-[#FF6B35] transition" aria-label={`Comparar ofertas: ${compareIds.length} selecionadas`}>
              <ArrowLeftRight className="w-5 h-5" />
              {compareIds.length > 0 && <span className="absolute top-1 right-0 min-w-5 h-5 px-1 rounded-full bg-[#FF6B35] text-white text-[10px] font-bold flex items-center justify-center">{compareIds.length}</span>}
              <span className="hidden xl:inline text-sm font-medium">Comparar</span>
            </Link>
            <Link to="/favoritos" className="min-h-11 min-w-11 px-2 sm:px-3 inline-flex items-center justify-center gap-2 text-[#111111]/70 hover:text-[#FF6B35] transition" aria-label="Abrir favoritos">
              <Heart className="w-5 h-5" />
              <span className="hidden xl:inline text-sm font-medium">Favoritos</span>
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen((current) => !current)}
              className="lg:hidden min-h-11 min-w-11 inline-flex items-center justify-center text-[#111111]"
              aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
              aria-expanded={mobileOpen}
              aria-controls="mobile-navigation"
            >
              {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          <div className="md:hidden col-span-3">
            <SmartSearch placeholder="Buscar produtos e ofertas..." />
          </div>
        </div>

        <div className="hidden lg:flex min-h-10 items-center justify-between border-t border-[#111111]/8">
          <nav className="flex items-center gap-7" aria-label="Navegação principal">
            <div className="relative group">
              <Link to="/categorias" className="min-h-10 inline-flex items-center gap-1 text-sm text-[#111111]/65 hover:text-[#111111] transition" aria-haspopup="true">
                Categorias <ChevronDown className="w-4 h-4" />
              </Link>
              <div className="absolute top-full left-0 w-72 max-h-[70vh] overflow-y-auto bg-white border border-[#111111]/10 rounded-lg shadow-[0_12px_32px_rgba(0,0,0,0.12)] p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition z-50">
                <Link to="/categorias" className="block px-3 py-2.5 text-sm font-semibold text-[#FF6B35] hover:bg-[#FFF3EE] rounded-md transition">
                  Ver todas as categorias
                </Link>
                <div className="h-px bg-[#111111]/8 my-1" />
                {categories.map((category) => (
                  <Link key={category.slug} to={`/categoria/${category.slug}`} className="block px-3 py-2.5 text-sm text-[#111111]/70 hover:text-[#111111] hover:bg-[#F3F3F3] rounded-md transition">
                    {category.name}
                  </Link>
                ))}
              </div>
            </div>
            <Link to="/" className="min-h-10 inline-flex items-center text-sm text-[#111111]/65 hover:text-[#111111] transition">Ofertas recentes</Link>
            <Link to="/radar" className="min-h-10 inline-flex items-center gap-1.5 text-sm text-[#111111]/65 hover:text-[#FF6B35] transition"><Flame className="w-4 h-4" /> Radar</Link>
            <Link to="/categoria/abaixo-de-50" className="min-h-10 inline-flex items-center text-sm text-[#111111]/65 hover:text-[#111111] transition">Abaixo de R$ 50</Link>
            <Link to="/categoria/abaixo-de-100" className="min-h-10 inline-flex items-center text-sm text-[#111111]/65 hover:text-[#111111] transition">Abaixo de R$ 100</Link>
          </nav>
          <div className="flex items-center gap-5">
            {TELEGRAM_CHANNEL_URL && (
              <a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="min-h-10 inline-flex items-center gap-1.5 text-sm font-medium text-[#229ED9] hover:text-[#187FAF] transition-colors">
                <TelegramIcon className="w-4 h-4" /> Telegram
              </a>
            )}
            {WHATSAPP_GROUP_URL && (
              <a href={WHATSAPP_GROUP_URL} target="_blank" rel="noopener noreferrer" className="min-h-10 inline-flex items-center gap-1.5 text-sm font-medium text-[#128C7E] hover:text-[#0D6F64] transition-colors">
                <WhatsAppIcon className="w-4 h-4 text-[#25D366]" /> WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>

      {mobileOpen && (
        <nav id="mobile-navigation" aria-label="Navegação mobile" className="lg:hidden border-t border-[#111111]/10 bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase text-[#111111]/40 mb-2">Categorias</p>
          <Link to="/categorias" onClick={() => setMobileOpen(false)} className="min-h-11 mb-2 px-3 py-2.5 flex items-center justify-between text-sm font-semibold text-[#FF6B35] border border-[#FF6B35]/20 rounded-md">
            Ver todas <ChevronDown className="w-4 h-4 -rotate-90" />
          </Link>
          <div className="grid grid-cols-2 gap-2">
            {categories.map((category) => (
              <Link key={category.slug} to={`/categoria/${category.slug}`} onClick={() => setMobileOpen(false)} className="min-h-11 px-3 py-2.5 flex items-center text-sm text-[#111111]/75 bg-[#F3F3F3] rounded-md">
                {category.name}
              </Link>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-2 mt-4">
            {TELEGRAM_CHANNEL_URL && (
              <a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer" onClick={() => setMobileOpen(false)} className="min-h-11 px-4 py-2.5 flex items-center justify-center gap-2 bg-[#229ED9] text-white text-sm font-semibold rounded-md hover:bg-[#187FAF] transition-colors">
                <TelegramIcon className="w-4 h-4" /> Telegram
              </a>
            )}
            {WHATSAPP_GROUP_URL && (
              <a href={WHATSAPP_GROUP_URL} target="_blank" rel="noopener noreferrer" onClick={() => setMobileOpen(false)} className="min-h-11 px-4 py-2.5 flex items-center justify-center gap-2 bg-[#25D366] text-[#073B2B] text-sm font-semibold rounded-md hover:bg-[#20BD5A] transition-colors">
                <WhatsAppIcon className="w-4 h-4" /> WhatsApp
              </a>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

export default function Layout() {
  return (
    <FavoritesProvider>
      <OfferToolsProvider>
        <div className="min-h-screen bg-[#F3F3F3] flex flex-col pb-16 lg:pb-0">
          <Header />
          <main className="flex-1">
            <Outlet />
          </main>
          <MobileDock />
        </div>
      </OfferToolsProvider>
    </FavoritesProvider>
  );
}

function MobileDock() {
  const items = [
    { to: "/", label: "Início", icon: Home, end: true },
    { to: "/buscar", label: "Buscar", icon: Search },
    { to: "/radar", label: "Radar", icon: Flame },
    { to: "/favoritos", label: "Favoritos", icon: Heart },
    { to: "/alertas", label: "Alertas", icon: Bell },
  ];
  return (
    <nav className="lg:hidden fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 bg-white border-t border-[#111111]/10 shadow-[0_-6px_24px_rgba(17,17,17,0.08)] pb-[env(safe-area-inset-bottom)]" aria-label="Navegação rápida">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `min-h-16 flex flex-col items-center justify-center gap-1 text-[10px] font-medium ${isActive ? "text-[#FF6B35]" : "text-[#111111]/50"}`}>
          <Icon className="w-5 h-5" /> {label}
        </NavLink>
      ))}
    </nav>
  );
}
