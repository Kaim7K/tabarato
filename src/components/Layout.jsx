import { Link, Outlet } from "react-router-dom";
import { useState } from "react";
import { Menu, X, Zap, Heart } from "lucide-react";
import SmartSearch from "@/components/SmartSearch";
import { SettingsProvider, useSettings } from "@/lib/SettingsContext";
import { FavoritesProvider } from "@/lib/FavoritesContext";
import { DEFAULT_CATEGORIES, SITE_NAME } from "@/lib/catalog";

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const settings = useSettings();
  const siteName = settings.site_name || SITE_NAME;
  const [firstWord, ...rest] = siteName.split(" ");
  const restName = rest.join(" ");
  const whatsappLink = settings.whatsapp_link || "https://chat.whatsapp.com/";

  return (
    <header className="sticky top-0 z-50 bg-[#F5F2EB]/85 backdrop-blur-md border-b border-[#111111]/8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-[#111111] rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-[#FF6B35]" fill="currentColor" />
            </div>
            <span className="font-bold text-[#111111] text-lg sm:text-xl tracking-tight">
              {firstWord} {restName && <span className="text-[#FF6B35]">{restName}</span>}
            </span>
          </Link>

          <div className="hidden md:flex flex-1 max-w-md mx-8">
            <SmartSearch />
          </div>

          <nav className="hidden lg:flex items-center gap-7">
            <div className="relative group">
              <button className="text-sm font-medium text-[#111111] hover:text-[#FF6B35] transition">
                Categorias
              </button>
              <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.08)] p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                {DEFAULT_CATEGORIES.map((cat) => (
                  <Link key={cat.slug} to={`/categoria/${cat.slug}`} className="block px-4 py-2.5 text-sm text-[#111111] hover:bg-[#F5F2EB] rounded-xl transition">
                    {cat.name}
                  </Link>
                ))}
              </div>
            </div>
            <Link to="/" className="text-sm font-medium text-[#111111] hover:text-[#FF6B35] transition flex items-center gap-2">
              Ofertas recentes
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#168A55] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#168A55]"></span>
              </span>
            </Link>
            <Link to="/favoritos" className="text-sm font-medium text-[#111111] hover:text-[#FF6B35] transition flex items-center gap-1.5">
              <Heart className="w-4 h-4" />
              Favoritos
            </Link>
            <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="px-5 py-2.5 bg-[#FF6B35] hover:bg-[#D95426] text-white text-sm font-semibold rounded-full transition shadow-sm">
              Entrar no grupo
            </a>
          </nav>

          <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden p-2 text-[#111111]" aria-label="Abrir menu">
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-[#111111]/8 bg-[#F5F2EB] px-4 py-4 space-y-4">
          <SmartSearch placeholder="Buscar achados..." />
          <div className="grid grid-cols-2 gap-2">
            {DEFAULT_CATEGORIES.map((cat) => (
              <Link key={cat.slug} to={`/categoria/${cat.slug}`} onClick={() => setMobileOpen(false)} className="px-4 py-2.5 text-sm text-[#111111] bg-white rounded-xl">
                {cat.name}
              </Link>
            ))}
          </div>
          <Link to="/favoritos" onClick={() => setMobileOpen(false)} className="text-center px-5 py-3 bg-white text-[#111111] text-sm font-semibold rounded-full flex items-center justify-center gap-2">
            <Heart className="w-4 h-4" /> Meus favoritos
          </Link>
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer" onClick={() => setMobileOpen(false)} className="block text-center px-5 py-3 bg-[#FF6B35] text-white text-sm font-semibold rounded-full">
            Entrar no grupo
          </a>
        </div>
      )}
    </header>
  );
}

export default function Layout() {
  return (
    <SettingsProvider>
      <FavoritesProvider>
        <div className="min-h-screen bg-[#F5F2EB] flex flex-col">
          <Header />
          <main className="flex-1">
            <Outlet />
          </main>
        </div>
      </FavoritesProvider>
    </SettingsProvider>
  );
}
