export const DEFAULT_PAGE_SETTINGS = {
  eyebrow: "TÁ BARATO",
  title: "Escolha onde receber os achadinhos",
  bio: "Ofertas, descontos e promoções em um só lugar.",
  avatarUrl: "",
  mascotUrl: "",
  backgroundImageUrl: "",
  accentColor: "#FF5A1F",
  secondaryColor: "#16A34A",
  backgroundColor: "#FFF9F5",
};

export const DEFAULT_STYLE = {
  backgroundColor: "",
  textColor: "",
  iconColor: "",
  borderColor: "",
  arrowColor: "",
  gradientStart: "#FF6A1A",
  gradientEnd: "#FF3D00",
  gradientEnabled: false,
  borderRadius: 24,
  size: "default",
  alignment: "left",
  iconStyle: "soft",
  entryAnimation: "fade",
  hoverEffect: "lift",
  shadow: "soft",
};

export const EMPTY_LINK = {
  id: "",
  label: "",
  subtitle: "",
  url: "",
  iconUrl: "",
  iconName: "tag",
  imageUrl: "",
  backgroundImageUrl: "",
  itemType: "button",
  badge: "",
  sortOrder: 0,
  isActive: true,
  isPrimary: false,
  openNewTab: true,
  startsAt: "",
  endsAt: "",
  style: DEFAULT_STYLE,
};

export const ITEM_TYPES = [
  ["button", "Botão padrão"],
  ["featured", "Botão em destaque"],
  ["image-card", "Card com imagem"],
  ["promo-banner", "Banner promocional"],
  ["gradient", "Botão com gradiente"],
  ["social", "Botão de rede social"],
  ["divider", "Divisor de seção"],
  ["category", "Título de categoria"],
  ["callout", "Chamada promocional"],
];

export const ICON_OPTIONS = [
  ["tag", "Oferta"], ["telegram", "Telegram"], ["whatsapp", "WhatsApp"],
  ["globe", "Site"], ["shopping-bag", "Loja"], ["percent", "Desconto"],
  ["sparkles", "Destaque"], ["bell", "Alerta"], ["instagram", "Instagram"],
  ["tiktok", "TikTok"], ["youtube", "YouTube"], ["link", "Link"],
];

export const STYLE_TEMPLATES = {
  brand: {
    name: "Padrão Tá Barato",
    style: DEFAULT_STYLE,
  },
  telegram: {
    name: "Telegram",
    itemLabel: "Entrar no Telegram",
    itemType: "social",
    iconName: "telegram",
    style: { ...DEFAULT_STYLE, backgroundColor: "#168DE2", textColor: "#FFFFFF", iconColor: "#168DE2", arrowColor: "#168DE2", iconStyle: "circle", size: "large", shadow: "medium" },
  },
  whatsapp: {
    name: "WhatsApp",
    itemLabel: "Entrar no WhatsApp",
    itemType: "social",
    iconName: "whatsapp",
    style: { ...DEFAULT_STYLE, backgroundColor: "#16A834", textColor: "#FFFFFF", iconColor: "#16A834", arrowColor: "#16A834", iconStyle: "circle", size: "large", shadow: "medium" },
  },
  offer: {
    name: "Oferta",
    itemLabel: "Oferta em destaque",
    itemType: "featured",
    iconName: "percent",
    badge: "OFERTA",
    style: { ...DEFAULT_STYLE, gradientEnabled: true, gradientStart: "#FF6A1A", gradientEnd: "#FF3D00", textColor: "#FFFFFF", iconColor: "#FF5A1F", arrowColor: "#FF5A1F", size: "large", shadow: "strong", hoverEffect: "glow" },
  },
  dark: {
    name: "Preto premium",
    itemType: "button",
    style: { ...DEFAULT_STYLE, backgroundColor: "#141414", textColor: "#FFFFFF", iconColor: "#FF5A1F", borderColor: "#292929", arrowColor: "#FF5A1F", shadow: "medium" },
  },
};

export const mergeLinkDefaults = (link = {}) => ({
  ...EMPTY_LINK,
  ...link,
  style: { ...DEFAULT_STYLE, ...(link.style || {}) },
});

export const toDateTimeLocal = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export const toApiDate = (value) => value ? new Date(value).toISOString() : "";
