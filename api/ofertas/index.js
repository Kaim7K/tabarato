import { query } from "../_lib/db.js";
import { sendJson, methodNotAllowed, publicError } from "../_lib/http.js";
import { mapPublicOffer, PUBLIC_OFFER_COLUMNS, setPublicCache } from "../_lib/publicOffers.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  try {
    const search = String(req.query.search || "").trim().slice(0, 120);
    const category = String(req.query.category || "").trim().slice(0, 120);
    const requestedLimit = Number(req.query.limit || 100);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 100, 200));
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
      `SELECT ${PUBLIC_OFFER_COLUMNS} FROM telegram_offers
       WHERE ${filters.join(" AND ")}
       ORDER BY COALESCE(published_at, updated_at, created_at) DESC
       LIMIT $${params.length}`,
      params
    );
    setPublicCache(res);
    return sendJson(res, 200, { offers: result.rows.map(mapPublicOffer) });
  } catch (error) {
    return publicError(res, error, "Não foi possível carregar ofertas.");
  }
}
