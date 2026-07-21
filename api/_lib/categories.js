import { query } from "./db.js";

export const DEFAULT_CATEGORY_NAMES = [
  "Casa e organização",
  "Tecnologia",
  "Escritório",
  "Ferramentas",
  "Cozinha",
  "Beleza e cuidados",
];

export const categorySlug = (value = "") => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

export async function listCategories() {
  const [registered, used] = await Promise.all([
    query("SELECT name, slug, is_default FROM site_categories ORDER BY is_default DESC, name ASC"),
    query("SELECT DISTINCT category AS name FROM telegram_offers WHERE NULLIF(TRIM(category), '') IS NOT NULL ORDER BY name ASC"),
  ]);
  const categories = registered.rows.map((row) => ({
    name: row.name,
    slug: row.slug,
    isDefault: row.is_default,
  }));
  const known = new Set(categories.map((item) => item.name.toLocaleLowerCase("pt-BR")));
  used.rows.forEach((row) => {
    if (known.has(row.name.toLocaleLowerCase("pt-BR"))) return;
    categories.push({ name: row.name, slug: categorySlug(row.name), isDefault: false });
  });
  return categories;
}

export async function createCategory(value) {
  const name = String(value || "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) {
    throw Object.assign(new Error("Categoria deve ter entre 2 e 60 caracteres."), { statusCode: 400 });
  }
  const slug = categorySlug(name);
  if (!slug) throw Object.assign(new Error("Nome de categoria invalido."), { statusCode: 400 });
  const result = await query(
    `INSERT INTO site_categories (name, slug)
     VALUES ($1, $2)
     ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name
     RETURNING name, slug, is_default`,
    [name, slug],
  );
  const row = result.rows[0];
  return { name: row.name, slug: row.slug, isDefault: row.is_default };
}

const normalizeCategoryText = (value = "") => String(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const CATEGORY_HINTS = {
  tecnologia: ["celular", "smartphone", "notebook", "computador", "mouse", "teclado", "monitor", "fone", "ssd", "camera", "gamer"],
  cozinha: ["panela", "liquidificador", "cafeteira", "air fryer", "fatiador", "garrafa", "copo", "talher"],
  ferramentas: ["furadeira", "parafusadeira", "serra", "chave", "broca", "alicate", "martelo"],
  "casa e organizacao": ["organizador", "tapete", "cama", "colchao", "mesa", "armario", "limpeza", "decoracao"],
  "beleza e cuidados": ["perfume", "maquiagem", "cabelo", "barbeador", "shampoo", "hidratante", "protes", "whey", "saude"],
  escritorio: ["escritorio", "papel", "caneta", "cadeira", "impressora", "agenda"],
};

function words(value = "") {
  return new Set(normalizeCategoryText(value).split(/\s+/).filter((item) => item.length >= 3));
}

function overlap(left, right) {
  const a = words(left);
  const b = words(right);
  if (!a.size || !b.size) return 0;
  let matches = 0;
  a.forEach((item) => { if (b.has(item)) matches += 1; });
  return matches / Math.min(a.size, b.size);
}

function categoryScore(category, offer, peers = []) {
  const key = normalizeCategoryText(category);
  const text = normalizeCategoryText(`${offer.product_name || ""} ${offer.short_description || ""} ${offer.platform || ""}`);
  let score = overlap(key, text) * 10;
  const hints = CATEGORY_HINTS[key] || [];
  score += hints.reduce((total, hint) => total + (text.includes(hint) ? 3 : 0), 0);
  const peerScore = peers
    .filter((peer) => normalizeCategoryText(peer.category) === key)
    .reduce((best, peer) => Math.max(best, overlap(text, `${peer.product_name || ""} ${peer.short_description || ""}`)), 0);
  return score + peerScore * 8;
}

export async function removeCategory(slugValue, options = {}) {
  const slug = categorySlug(slugValue);
  const found = await query("SELECT name, is_default FROM site_categories WHERE slug=$1", [slug]);
  const category = found.rows[0];
  if (!category) throw Object.assign(new Error("Categoria nao encontrada."), { statusCode: 404 });
  if (category.is_default) throw Object.assign(new Error("Categorias padrao nao podem ser removidas."), { statusCode: 400 });

  const [remainingResult, affectedResult, peersResult] = await Promise.all([
    query("SELECT name FROM site_categories WHERE slug<>$1 ORDER BY is_default DESC, name ASC", [slug]),
    query("SELECT id, product_name, short_description, platform FROM telegram_offers WHERE LOWER(category)=LOWER($1)", [category.name]),
    query("SELECT product_name, short_description, category FROM telegram_offers WHERE LOWER(category)<>LOWER($1) AND NULLIF(TRIM(category),'') IS NOT NULL LIMIT 2000", [category.name]),
  ]);
  const remaining = remainingResult.rows.map((row) => row.name).filter(Boolean);
  if (!remaining.length && affectedResult.rowCount) {
    throw Object.assign(new Error("Crie ao menos uma categoria de destino antes de remover esta categoria."), { statusCode: 409 });
  }

  const requestedTarget = String(options.targetCategory || "").trim();
  const explicitTarget = remaining.find((name) => normalizeCategoryText(name) === normalizeCategoryText(requestedTarget)) || "";
  const moved = [];
  for (const offer of affectedResult.rows) {
    const ranked = remaining
      .map((name) => ({ name, score: categoryScore(name, offer, peersResult.rows) }))
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name, "pt-BR"));
    const target = explicitTarget || ranked[0]?.name || "";
    if (!target) throw Object.assign(new Error(`Nao foi possivel determinar uma categoria para ${offer.product_name}.`), { statusCode: 409 });
    await query("UPDATE telegram_offers SET category=$2, updated_at=NOW() WHERE id=$1", [offer.id, target]);
    moved.push({ id: offer.id, category: target, confidence: ranked[0]?.score || 0 });
  }

  await query("DELETE FROM site_categories WHERE slug=$1", [slug]);
  return { removed: category.name, movedCount: moved.length, moved };
}
