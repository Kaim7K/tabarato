import { ArrowRight, ExternalLink } from "lucide-react";
import { SocialIcon } from "./SocialIcon";
import { mergeLinkDefaults } from "./socialConfig";

const SHADOWS = {
  none: "none",
  soft: "0 8px 22px rgba(34, 24, 15, 0.08)",
  medium: "0 12px 28px rgba(34, 24, 15, 0.14)",
  strong: "0 16px 36px rgba(255, 74, 0, 0.22)",
};

const DEFAULT_COLORS = {
  telegram: { background: "#168DE2", foreground: "#FFFFFF", accent: "#168DE2" },
  whatsapp: { background: "#16A834", foreground: "#FFFFFF", accent: "#16A834" },
};

function itemStyle(link, settings) {
  const style = link.style;
  const social = DEFAULT_COLORS[link.iconName];
  const dark = link.itemType === "featured" || link.itemType === "promo-banner";
  const background = style.backgroundColor || social?.background || (dark ? settings.accentColor : "#FFFFFF");
  const foreground = style.textColor || social?.foreground || (dark ? "#FFFFFF" : "#171717");
  const backgroundImage = style.gradientEnabled
    ? `linear-gradient(115deg, ${style.gradientStart}, ${style.gradientEnd})`
    : link.backgroundImageUrl
      ? `linear-gradient(90deg, rgba(14,14,14,.88), rgba(14,14,14,.35)), url("${link.backgroundImageUrl.replace(/["\\]/g, "")}")`
      : undefined;
  return {
    backgroundColor: background,
    backgroundImage,
    color: foreground,
    borderColor: style.borderColor || (foreground === "#FFFFFF" ? "rgba(255,255,255,.22)" : "rgba(24,24,24,.09)"),
    borderRadius: `${style.borderRadius}px`,
    boxShadow: SHADOWS[style.shadow] || SHADOWS.soft,
    "--social-icon-color": style.iconColor || social?.accent || settings.accentColor,
    "--social-arrow-color": style.arrowColor || social?.accent || settings.accentColor,
  };
}

export function SocialLinkItem({ item, settings, preview = false, order = 0 }) {
  const link = mergeLinkDefaults(item);
  const style = { ...itemStyle(link, settings), animationDelay: `${order * 55}ms` };
  const classes = [
    "social-link-item",
    `social-link-item--${link.itemType}`,
    `social-link-item--${link.style.size}`,
    `social-link-item--align-${link.style.alignment}`,
    `social-link-item--icon-${link.style.iconStyle}`,
    `social-link-item--enter-${link.style.entryAnimation}`,
    `social-link-item--hover-${link.style.hoverEffect}`,
    !link.isActive ? "social-link-item--inactive" : "",
  ].filter(Boolean).join(" ");

  if (link.itemType === "divider") {
    return <div className={`${classes} social-link-divider`}><span>{link.label}</span></div>;
  }
  if (link.itemType === "category") {
    return <h2 className={`${classes} social-link-category`} style={{ color: link.style.textColor || "#171717" }}>{link.label}</h2>;
  }
  if (link.itemType === "callout") {
    return (
      <aside className={`${classes} social-link-callout`} style={style}>
        <SocialIcon name={link.iconName} className="social-link-callout__icon" />
        <div><strong>{link.label}</strong>{link.subtitle && <span>{link.subtitle}</span>}</div>
      </aside>
    );
  }

  const content = (
    <>
      {link.itemType === "image-card" && link.imageUrl && <img src={link.imageUrl} alt="" className="social-link-item__media" />}
      <span className="social-link-item__icon" aria-hidden="true">
        {link.iconUrl ? <img src={link.iconUrl} alt="" /> : <SocialIcon name={link.iconName} />}
      </span>
      <span className="social-link-item__copy">
        <strong>{link.label}</strong>
        {link.subtitle && <span>{link.subtitle}</span>}
      </span>
      {link.badge && <span className="social-link-item__badge">{link.badge}</span>}
      <span className="social-link-item__arrow" aria-hidden="true">{link.openNewTab ? <ExternalLink /> : <ArrowRight />}</span>
    </>
  );

  if (preview || !link.url) return <div className={classes} style={style}>{content}</div>;
  return <a href={link.url} target={link.openNewTab ? "_blank" : undefined} rel={link.openNewTab ? "noopener noreferrer" : undefined} className={classes} style={style}>{content}</a>;
}
