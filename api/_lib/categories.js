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

export async function removeCategory(slugValue) {
  const slug = categorySlug(slugValue);
  const found = await query("SELECT name, is_default FROM site_categories WHERE slug=$1", [slug]);
  const category = found.rows[0];
  if (!category) throw Object.assign(new Error("Categoria nao encontrada."), { statusCode: 404 });
  if (category.is_default) throw Object.assign(new Error("Categorias padrao nao podem ser removidas."), { statusCode: 400 });
  const used = await query("SELECT 1 FROM telegram_offers WHERE LOWER(category)=LOWER($1) LIMIT 1", [category.name]);
  if (used.rowCount) throw Object.assign(new Error("A categoria possui ofertas e nao pode ser removida."), { statusCode: 409 });
  await query("DELETE FROM site_categories WHERE slug=$1", [slug]);
}
