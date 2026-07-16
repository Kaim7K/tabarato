import { query } from "../_lib/db.js";
import { sendJson, methodNotAllowed, publicError } from "../_lib/http.js";
import { mapPublicOffer, PUBLIC_OFFER_COLUMNS, setPublicCache } from "../_lib/publicOffers.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  try {
    const search = String(req.query.search || "").trim().slice(0, 120);
    const category = String(req.query.category || "").trim().slice(0, 120);
    const platform = String(req.query.platform || "").trim().slice(0, 100);
    const minPrice = Number(req.query.minPrice);
    const maxPrice = Number(req.query.maxPrice);
    const requestedLimit = Number(req.query.limit || 24);
    const requestedPage = Number(req.query.page || 1);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 24, 100));
    const page = Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1);
    const offset = (page - 1) * limit;
    const filters = ["status = 'PUBLICADO'"];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      filters.push(`(product_name ILIKE $${params.length} OR short_description ILIKE $${params.length} OR category ILIKE $${params.length} OR platform ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      filters.push(`category = $${params.length}`);
    }
    if (platform) {
      params.push(platform);
      filters.push(`platform = $${params.length}`);
    }
    if (Number.isFinite(minPrice) && minPrice >= 0) {
      params.push(minPrice);
      filters.push(`current_price >= $${params.length}`);
    }
    if (Number.isFinite(maxPrice) && maxPrice > 0) {
      params.push(maxPrice);
      filters.push(`current_price <= $${params.length}`);
    }

    const sort = String(req.query.sort || "recent");
    const orderBy = {
      recent: "COALESCE(published_at, updated_at, created_at) DESC",
      clicked: "clicks DESC, COALESCE(published_at, updated_at, created_at) DESC",
      trending: "(clicks * 3 + shares * 5 + favorites * 4) DESC, COALESCE(published_at, updated_at, created_at) DESC",
      price_low: "current_price ASC",
      price_high: "current_price DESC",
      discount: "CASE WHEN previous_price > current_price THEN (previous_price - current_price) / previous_price ELSE 0 END DESC",
    }[sort] || "COALESCE(published_at, updated_at, created_at) DESC";

    params.push(limit);
    const limitParam = params.length;
    params.push(offset);
    const result = await query(
      `SELECT ${PUBLIC_OFFER_COLUMNS}, COUNT(*) OVER() AS total_count FROM telegram_offers
       WHERE ${filters.join(" AND ")}
       ORDER BY ${orderBy}
       LIMIT $${limitParam} OFFSET $${params.length}`,
      params
    );
    setPublicCache(res);
    const total = Number(result.rows[0]?.total_count || 0);
    return sendJson(res, 200, {
      offers: result.rows.map(mapPublicOffer),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return publicError(res, error, "Não foi possível carregar ofertas.");
  }
}
