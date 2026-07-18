import { Bell, Globe2, Link2, Percent, ShoppingBag, Sparkles, Tag } from "lucide-react";
import { FaInstagram, FaTelegramPlane, FaTiktok, FaWhatsapp, FaYoutube } from "react-icons/fa";

const ICONS = {
  tag: Tag,
  telegram: FaTelegramPlane,
  whatsapp: FaWhatsapp,
  globe: Globe2,
  "shopping-bag": ShoppingBag,
  percent: Percent,
  sparkles: Sparkles,
  bell: Bell,
  instagram: FaInstagram,
  tiktok: FaTiktok,
  youtube: FaYoutube,
  link: Link2,
};

export function SocialIcon({ name, className = "" }) {
  const Icon = ICONS[name] || Link2;
  return <Icon className={className} aria-hidden="true" />;
}
