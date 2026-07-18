import { BRAND_LOGO_CARD } from "@/lib/brand";
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
      <main className="social-public__content">
        <header className="social-hero">
          <img src={settings.avatarUrl || BRAND_LOGO_CARD} onError={(event) => { event.currentTarget.src = BRAND_LOGO_CARD; }} alt="Tá Barato" className="social-hero__logo" />
        </header>

        <nav className="social-links" aria-label="Canais e links do Tá Barato">
          {links.map((link, index) => <div key={link.id || `draft-${index}`}><SocialLinkItem item={link} settings={settings} preview={preview} order={index} /></div>)}
        </nav>

      </main>
    </div>
  );
}
