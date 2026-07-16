import { Link, Outlet } from "react-router-dom";
import { useState } from "react";
import { ChevronDown, Heart, Menu, MessageCircle, Send, X } from "lucide-react";
import SmartSearch from "@/components/SmartSearch";
import { FavoritesProvider } from "@/lib/FavoritesContext";
import { DEFAULT_CATEGORIES } from "@/lib/catalog";
import { TELEGRAM_CHANNEL_URL, WHATSAPP_GROUP_URL } from "@/lib/publicLinks";
import { BRAND_LOGO } from "@/lib/brand";

function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

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
              <button type="button" className="min-h-10 inline-flex items-center gap-1 text-sm text-[#111111]/65 hover:text-[#111111] transition" aria-haspopup="true">
                Categorias <ChevronDown className="w-4 h-4" />
              </button>
              <div className="absolute top-full left-0 w-64 bg-white border border-[#111111]/10 rounded-lg shadow-[0_12px_32px_rgba(0,0,0,0.12)] p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition z-50">
                {DEFAULT_CATEGORIES.map((category) => (
                  <Link key={category.slug} to={`/categoria/${category.slug}`} className="block px-3 py-2.5 text-sm text-[#111111]/70 hover:text-[#111111] hover:bg-[#F3F3F3] rounded-md transition">
                    {category.name}
                  </Link>
                ))}
              </div>
            </div>
            <Link to="/" className="min-h-10 inline-flex items-center text-sm text-[#111111]/65 hover:text-[#111111] transition">Ofertas recentes</Link>
            <Link to="/categoria/abaixo-de-50" className="min-h-10 inline-flex items-center text-sm text-[#111111]/65 hover:text-[#111111] transition">Abaixo de R$ 50</Link>
            <Link to="/categoria/abaixo-de-100" className="min-h-10 inline-flex items-center text-sm text-[#111111]/65 hover:text-[#111111] transition">Abaixo de R$ 100</Link>
          </nav>
          <div className="flex items-center gap-5">
            {TELEGRAM_CHANNEL_URL && (
              <a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="min-h-10 inline-flex items-center gap-1.5 text-sm text-[#111111]/65 hover:text-[#FF6B35] transition">
                <Send className="w-4 h-4" /> Telegram
              </a>
            )}
            {WHATSAPP_GROUP_URL && (
              <a href={WHATSAPP_GROUP_URL} target="_blank" rel="noopener noreferrer" className="min-h-10 inline-flex items-center gap-1.5 text-sm text-[#111111]/65 hover:text-[#168A55] transition">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>

      {mobileOpen && (
        <nav id="mobile-navigation" aria-label="Navegação mobile" className="lg:hidden border-t border-[#111111]/10 bg-white px-4 py-4">
          <p className="text-xs font-semibold uppercase text-[#111111]/40 mb-2">Categorias</p>
          <div className="grid grid-cols-2 gap-2">
            {DEFAULT_CATEGORIES.map((category) => (
              <Link key={category.slug} to={`/categoria/${category.slug}`} onClick={() => setMobileOpen(false)} className="min-h-11 px-3 py-2.5 flex items-center text-sm text-[#111111]/75 bg-[#F3F3F3] rounded-md">
                {category.name}
              </Link>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 gap-2 mt-4">
            {TELEGRAM_CHANNEL_URL && (
              <a href={TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer" onClick={() => setMobileOpen(false)} className="min-h-11 px-4 py-2.5 flex items-center justify-center gap-2 bg-[#FF6B35] text-white text-sm font-semibold rounded-md">
                <Send className="w-4 h-4" /> Telegram
              </a>
            )}
            {WHATSAPP_GROUP_URL && (
              <a href={WHATSAPP_GROUP_URL} target="_blank" rel="noopener noreferrer" onClick={() => setMobileOpen(false)} className="min-h-11 px-4 py-2.5 flex items-center justify-center gap-2 bg-[#168A55] text-white text-sm font-semibold rounded-md">
                <MessageCircle className="w-4 h-4" /> WhatsApp
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
      <div className="min-h-screen bg-[#F3F3F3] flex flex-col">
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </FavoritesProvider>
  );
}
