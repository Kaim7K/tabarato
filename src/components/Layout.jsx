import { Link, Outlet } from "react-router-dom";
import { useState } from "react";
import { Menu, X, Heart, MessageCircle } from "lucide-react";
import SmartSearch from "@/components/SmartSearch";
import { FavoritesProvider } from "@/lib/FavoritesContext";
import { DEFAULT_CATEGORIES } from "@/lib/catalog";
import { WHATSAPP_GROUP_URL } from "@/lib/publicLinks";
import { BRAND_LOGO } from "@/lib/brand";

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-[#F5F2EB]/85 backdrop-blur-md border-b border-[#111111]/8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-4">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <img src={BRAND_LOGO} alt="Tá Barato" className="h-11 sm:h-14 w-auto object-contain" />
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
            <Link to="/" className="text-sm font-medium text-[#111111] hover:text-[#FF6B35] transition">Ofertas recentes</Link>
            <Link to="/favoritos" className="text-sm font-medium text-[#111111] hover:text-[#FF6B35] transition flex items-center gap-1.5">
              <Heart className="w-4 h-4" />
              Favoritos
            </Link>
            {WHATSAPP_GROUP_URL && (
              <a href={WHATSAPP_GROUP_URL} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-[#111111] hover:text-[#168A55] transition flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </a>
            )}
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
          {WHATSAPP_GROUP_URL && (
            <a href={WHATSAPP_GROUP_URL} target="_blank" rel="noopener noreferrer" onClick={() => setMobileOpen(false)} className="text-center px-5 py-3 bg-[#168A55] text-white text-sm font-semibold rounded-full flex items-center justify-center gap-2">
              <MessageCircle className="w-4 h-4" /> Grupo no WhatsApp
            </a>
          )}
        </div>
      )}
    </header>
  );
}

export default function Layout() {
  return (
    <FavoritesProvider>
      <div className="min-h-screen bg-[#F5F2EB] flex flex-col">
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </FavoritesProvider>
  );
}
