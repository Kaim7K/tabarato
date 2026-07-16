import { query } from "../_lib/db.js";
import { sendJson, methodNotAllowed, publicError } from "../_lib/http.js";

const mapPublicOffer = (row) => ({
  id: row.id,
  name: row.product_name,
  description: row.short_description,
  category: row.category,
  affiliate_link: row.affiliate_link,
  platform: row.platform,
  image: row.image_url || "",
  price: Number(row.current_price),
  previous_price: row.previous_price == null ? null : Number(row.previous_price),
  benefit: row.short_description,
  reason: row.extra_text || "",
  score: 100,
  status: "published",
  published_date: row.published_at || row.updated_at || row.created_at,
  clicks: row.clicks || 0,
  is_featured: false,
  time_label: row.published_at ? new Date(row.published_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "",
});

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  try {
    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "").trim();
    const limit = Math.min(Number(req.query.limit || 100) || 100, 200);
    const filters = ["status = 'PUBLICADO'"];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      filters.push(`(product_name ILIKE $${params.length} OR category ILIKE $${params.length} OR platform ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      filters.push(`category = $${params.length}`);
    }

    params.push(limit);
    const result = await query(
      `SELECT * FROM telegram_offers
       WHERE ${filters.join(" AND ")}
       ORDER BY COALESCE(published_at, updated_at, created_at) DESC
       LIMIT $${params.length}`,
      params
    );
    return sendJson(res, 200, { offers: result.rows.map(mapPublicOffer) });
  } catch (error) {
    return publicError(res, error, "Não foi possível carregar ofertas.");
  }
}

