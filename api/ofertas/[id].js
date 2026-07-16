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
  try {
    if (req.method === "GET") {
      const result = await query("SELECT * FROM telegram_offers WHERE id=$1 AND status='PUBLICADO'", [req.query.id]);
      return result.rows[0]
        ? sendJson(res, 200, { offer: mapPublicOffer(result.rows[0]) })
        : sendJson(res, 404, { error: "Oferta não encontrada." });
    }

    if (req.method === "POST") {
      const result = await query(
        "UPDATE telegram_offers SET clicks = COALESCE(clicks, 0) + 1 WHERE id=$1 RETURNING clicks",
        [req.query.id]
      );
      return result.rows[0]
        ? sendJson(res, 200, { clicks: result.rows[0].clicks })
        : sendJson(res, 404, { error: "Oferta não encontrada." });
    }

    return methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    return publicError(res, error, "Não foi possível carregar oferta.");
  }
}

