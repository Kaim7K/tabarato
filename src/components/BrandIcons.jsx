import { Store } from "lucide-react";
import { FaAmazon, FaTelegram, FaWhatsapp } from "react-icons/fa6";
import { SiShopee } from "react-icons/si";
import { normalizeText } from "@/lib/catalog";

export function TelegramIcon({ className = "w-5 h-5" }) {
  return <FaTelegram className={className} aria-hidden="true" />;
}

export function WhatsAppIcon({ className = "w-5 h-5" }) {
  return <FaWhatsapp className={className} aria-hidden="true" />;
}

const storeBrands = {
  "mercado livre": {
    label: "Mercado Livre",
    icon: ({ className }) => <img src="/brands/mercado-livre.png" alt="" className={className} />,
  },
  shopee: { label: "Shopee", icon: SiShopee, color: "#EE4D2D" },
  amazon: { label: "Amazon", icon: FaAmazon, color: "#FF9900" },
};

export function StoreBadge({ platform, compact = false }) {
  if (!platform) return null;

  const brand = storeBrands[normalizeText(platform)] || {
    label: platform,
    icon: Store,
    color: "#525252",
  };
  const Icon = brand.icon;

  return (
    <span
      className={`absolute z-10 inline-flex items-center justify-center bg-white border border-black/10 shadow-[0_4px_14px_rgba(0,0,0,0.16)] ${compact ? "bottom-1 right-1 w-6 h-6 rounded-md" : "bottom-2.5 right-2.5 w-10 h-10 rounded-lg"}`}
      title={`Oferta no ${brand.label}`}
      aria-label={`Oferta no ${brand.label}`}
    >
      <Icon className={compact ? "w-3.5 h-3.5 object-contain" : "w-6 h-6 object-contain"} style={brand.color ? { color: brand.color } : undefined} />
    </span>
  );
}
