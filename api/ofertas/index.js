import { query } from "../_lib/db.js";
import { isAdminAuthorized, sendJson, methodNotAllowed, publicError, readJson } from "../_lib/http.js";
import { mapPublicOffer, PUBLIC_OFFER_COLUMNS, setPublicCache } from "../_lib/publicOffers.js";
import { searchGroups } from "../_lib/search.js";
import { listCategories } from "../_lib/categories.js";
import { handleSocial } from "../_lib/social.js";
import { isValidVisitorId, visitRejectionReason } from "../_lib/analytics.js";

export default async function handler(req, res) {
  if (req.query.resource === "social") return handleSocial(req, res);

  if (req.query.resource === "visit" && req.method === "POST") {
    try {
      if (isAdminAuthorized(req)) return sendJson(res, 200, { counted: false, reason: "admin" });
      const input = await readJson(req);
      const visitorId = String(input.visitorId || "");
      if (!isValidVisitorId(visitorId)) return sendJson(res, 400, { error: "Identificador de visitante invalido." });
      const rejectionReason = visitRejectionReason(req, input);
      if (rejectionReason) return sendJson(res, 200, { counted: false, reason: rejectionReason });
      await query(`INSERT INTO site_visitors (visitor_id) VALUES ($1) ON CONFLICT (visitor_id) DO UPDATE SET last_seen_at=NOW()`, [visitorId]);
      const visit = await query(`INSERT INTO site_visits (visitor_id) VALUES ($1) ON CONFLICT (visitor_id, visit_day) DO NOTHING RETURNING id`, [visitorId]);
      return sendJson(res, 200, { counted: visit.rowCount > 0 });
    } catch (error) {
      return publicError(res, error, "Nao foi possivel registrar a visita.");
    }
  }

  if (req.query.resource === "social-visit" && req.method === "POST") {
    try {
      if (isAdminAuthorized(req)) return sendJson(res, 200, { counted: false, reason: "admin" });
      if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
        return sendJson(res, 200, { counted: false, reason: "non-production" });
      }
      const input = await readJson(req);
      const visitorId = String(input.visitorId || "");
      if (!isValidVisitorId(visitorId)) return sendJson(res, 400, { error: "Identificador de visitante invalido." });
      const rejectionReason = visitRejectionReason(req, input, { minimumVisibleMs: 1200 });
      if (rejectionReason) return sendJson(res, 200, { counted: false, reason: rejectionReason });

      await query(`INSERT INTO site_visitors (visitor_id) VALUES ($1) ON CONFLICT (visitor_id) DO UPDATE SET last_seen_at=NOW()`, [visitorId]);
      const visit = await query(
        `INSERT INTO social_page_visits (visitor_id, visit_day)
         VALUES ($1, (NOW() AT TIME ZONE 'America/Bahia')::date)
         ON CONFLICT (visitor_id, visit_day) DO NOTHING
         RETURNING id`,
        [visitorId]
      );
      return sendJson(res, 200, { counted: visit.rowCount > 0 });
    } catch (error) {
      return publicError(res, error, "Nao foi possivel registrar a visita da pagina social.");
    }
  }

  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);

  try {
    if (req.query.resource === "categories") {
      const categories = await listCategories();
      setPublicCache(res);
      return sendJson(res, 200, { categories });
    }

    if (req.query.resource === "category-highlights") {
      const [categories, highlights] = await Promise.all([
        listCategories(),
        query(
          `SELECT ${PUBLIC_OFFER_COLUMNS}
           FROM (
             SELECT ${PUBLIC_OFFER_COLUMNS},
                    ROW_NUMBER() OVER (
                      PARTITION BY category
                      ORDER BY COALESCE(published_at, updated_at, created_at) DESC
                    ) AS category_position
             FROM telegram_offers
             WHERE site_published_at IS NOT NULL
           ) ranked_offers
           WHERE category_position <= 4
           ORDER BY category ASC, COALESCE(published_at, updated_at, created_at) DESC`
        ),
      ]);
      setPublicCache(res);
      return sendJson(res, 200, { categories, offers: highlights.rows.map(mapPublicOffer) });
    }

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
    const filters = ["site_published_at IS NOT NULL"];
    const params = [];

    if (search) {
      searchGroups(search).forEach((group) => {
        const groupFilters = group.map((term) => {
          params.push(`%${term}%`);
          return `(unaccent(product_name) ILIKE unaccent($${params.length}::text) OR unaccent(COALESCE(short_description, '')) ILIKE unaccent($${params.length}::text) OR unaccent(category) ILIKE unaccent($${params.length}::text) OR unaccent(platform) ILIKE unaccent($${params.length}::text))`;
        });
        filters.push(`(${groupFilters.join(" OR ")})`);
      });
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
    const where = filters.join(" AND ");
    const [result, countResult] = await Promise.all([
      query(
        `SELECT ${PUBLIC_OFFER_COLUMNS} FROM telegram_offers
         WHERE ${where}
         ORDER BY ${orderBy}
         LIMIT $${limitParam} OFFSET $${params.length}`,
        params,
      ),
      query(`SELECT COUNT(*) AS total_count FROM telegram_offers WHERE ${where}`, params.slice(0, -2)),
    ]);
    setPublicCache(res);
    const total = Number(countResult.rows[0]?.total_count || 0);
    return sendJson(res, 200, {
      offers: result.rows.map(mapPublicOffer),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return publicError(res, error, "Não foi possível carregar ofertas.");
  }
}
