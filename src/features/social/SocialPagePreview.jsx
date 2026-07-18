import { BRAND_LOGO_CARD, BRAND_MASCOT } from "@/lib/brand";
import { SocialLinkItem } from "./SocialLinkItem";
import { DEFAULT_PAGE_SETTINGS } from "./socialConfig";

export function SocialPagePreview({ page, preview = false }) {
  const settings = { ...DEFAULT_PAGE_SETTINGS, ...(page.settings || {}) };
  const links = page.links || [];
  const shellStyle = {
    "--social-accent": settings.accentColor,
    "--social-secondary": settings.secondaryColor,
    "--social-bg": settings.backgroundColor,
    backgroundColor: settings.backgroundColor,
    backgroundImage: settings.backgroundImageUrl ? `linear-gradient(rgba(255,249,245,.9), rgba(255,249,245,.96)), url("${settings.backgroundImageUrl.replace(/["\\]/g, "")}")` : undefined,
  };

  return (
    <div className={`social-public ${preview ? "social-public--preview" : ""}`} style={shellStyle}>
      <div className="social-public__curve" aria-hidden="true" />
      <main className="social-public__content">
        <header className="social-hero">
          <div className="social-hero__brand">
            <img src={settings.avatarUrl || BRAND_LOGO_CARD} onError={(event) => { event.currentTarget.src = BRAND_LOGO_CARD; }} alt="Tá Barato" className="social-hero__logo" />
            <p className="social-hero__eyebrow">{settings.eyebrow}</p>
            <h1>{settings.title}</h1>
            {settings.bio && <p className="social-hero__description">{settings.bio}</p>}
            <span className="social-hero__dash" aria-hidden="true" />
          </div>
          <div className="social-hero__mascot" aria-hidden="true">
            <span className="social-hero__mascot-ring" />
            <img src={settings.mascotUrl || BRAND_MASCOT} alt="" onError={(event) => { event.currentTarget.src = BRAND_MASCOT; }} />
          </div>
        </header>

        <nav className="social-links" aria-label="Canais e links do Tá Barato">
          {links.map((link, index) => <div key={link.id || `draft-${index}`}><SocialLinkItem item={link} settings={settings} preview={preview} order={index} /></div>)}
        </nav>

        {!links.length && <p className="social-public__empty">Novos canais serão publicados em breve.</p>}

        <aside className="social-benefits" aria-label="Vantagens Tá Barato">
          <span><strong>Ofertas</strong> reais</span>
          <span><strong>Descontos</strong> exclusivos</span>
          <span><strong>Economize</strong> todo dia</span>
        </aside>
        <footer className="social-public__footer">© {new Date().getFullYear()} Tá Barato</footer>
      </main>
    </div>
  );
}
