export const SITE_NAME = "Tá Barato";

export const DEFAULT_CATEGORIES = [
  { name: "Casa e organização", slug: "casa-e-organizacao", icon: "Casa" },
  { name: "Tecnologia", slug: "tecnologia", icon: "Notebook" },
  { name: "Escritório", slug: "escritorio", icon: "Paperclip" },
  { name: "Ferramentas", slug: "ferramentas", icon: "Wrench" },
  { name: "Cozinha", slug: "cozinha", icon: "ChefHat" },
  { name: "Beleza e cuidados", slug: "beleza-e-cuidados", icon: "Sparkles" },
  { name: "Abaixo de R$ 50", slug: "abaixo-de-50", icon: "BadgeDollarSign", virtual: true },
  { name: "Abaixo de R$ 100", slug: "abaixo-de-100", icon: "BadgeDollarSign", virtual: true },
];

export const normalizeText = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export const slugify = (value = "") =>
  normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const formatPrice = (value) =>
  typeof value === "number"
    ? `R$ ${value.toFixed(2).replace(".", ",")}`
    : "Preço indisponível";

export const formatRelativeDate = (value) => {
  const timestamp = new Date(value || 0).getTime();
  if (!timestamp) return "";
  const minutes = Math.round((timestamp - Date.now()) / 60000);
  const formatter = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
};

export const categoryNameBySlug = (slug) =>
  DEFAULT_CATEGORIES.find((category) => category.slug === slug)?.name;

export const visibleCategories = DEFAULT_CATEGORIES.filter((category) => !category.virtual);
