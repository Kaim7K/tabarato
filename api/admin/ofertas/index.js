import { handleExtensionCors, requireAdmin, sendJson, methodNotAllowed, readJson, publicError } from "../../_lib/http.js";
import { createOffer, listOffers, listPostedProductIds, validateOffer } from "../../_lib/offers.js";
import { createCategory, listCategories, removeCategory } from "../../_lib/categories.js";
import { query } from "../../_lib/db.js";

function connectedStoreHostsFromOffers(offers) {
  const hosts = new Set();
  offers.forEach((offer) => {
    [offer.affiliateLink, offer.imageUrl].forEach((value) => {
      try {
        const host = new URL(value).hostname.replace(/^www\./, "");
        if (host && !/mercadolivre|mercadolibre|shopee|mlstatic|susercontent/i.test(host)) hosts.add(host);
      } catch {
        // Invalid offer URLs must not block the admin catalog.
      }
    });
  });
  return [...hosts].slice(0, 80);
}

const emptySiteMetrics = {
  uniqueVisitors: 0,
  visits: 0,
  realClicks: 0,
  socialUniqueVisitors: 0,
  socialVisits: 0,
  socialVisitsToday: 0,
  socialVisits7d: 0,
};

async function safeListCategories() {
  try {
    return await listCategories();
  } catch (error) {
    console.error("admin-offers-categories", error?.message || error);
    return [];
  }
}

async function safeSiteMetrics() {
  try {
    const metrics = await query(`SELECT
      (SELECT COUNT(*) FROM site_visitors) AS unique_visitors,
      (SELECT COUNT(*) FROM site_visits) AS visits,
      (SELECT COUNT(*) FROM site_analytics_events WHERE event_type='click') AS real_clicks,
      (SELECT COUNT(DISTINCT visitor_id) FROM social_page_visits) AS social_unique_visitors,
      (SELECT COUNT(*) FROM social_page_visits) AS social_visits,
      (SELECT COUNT(*) FROM social_page_visits WHERE visit_day = (NOW() AT TIME ZONE 'America/Bahia')::date) AS social_visits_today,
      (SELECT COUNT(*) FROM social_page_visits WHERE visit_day >= (NOW() AT TIME ZONE 'America/Bahia')::date - 6) AS social_visits_7d`);
    const row = metrics.rows[0] || {};
    return {
      uniqueVisitors: Number(row.unique_visitors || 0),
      visits: Number(row.visits || 0),
      realClicks: Number(row.real_clicks || 0),
      socialUniqueVisitors: Number(row.social_unique_visitors || 0),
      socialVisits: Number(row.social_visits || 0),
      socialVisitsToday: Number(row.social_visits_today || 0),
      socialVisits7d: Number(row.social_visits_7d || 0),
    };
  } catch (error) {
    console.error("admin-offers-metrics", error?.message || error);
    return emptySiteMetrics;
  }
}

export default async function handler(req, res) {
  if (handleExtensionCors(req, res, ["GET", "POST", "DELETE"])) return;
  if (!requireAdmin(req, res, { allowExtension: true })) return;

  try {
    if (req.method === "GET") {
      if (req.query.resource === "posted-products") {
        const sourceProductIds = String(req.query.sourceProductIds || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 100);
        const postedProductIds = await listPostedProductIds(req.query.platform || "", sourceProductIds, {
          recentOnly: req.query.recentOnly === "true",
          cooldownHours: req.query.cooldownHours,
        });
        return sendJson(res, 200, { postedProductIds });
      }

      const offers = await listOffers({
        search: req.query.search || "",
        status: req.query.status || "",
        category: req.query.category || "",
      });
      const [categories, siteMetrics] = await Promise.all([
        safeListCategories(),
        safeSiteMetrics(),
      ]);
      return sendJson(res, 200, {
        offers,
        categories,
        siteMetrics,
        connectedStoreHosts: connectedStoreHostsFromOffers(offers),
      });
    }

    if (req.method === "POST") {
      const input = await readJson(req);
      if (input.resource === "category") {
        const category = await createCategory(input.name);
        return sendJson(res, 201, { category });
      }
      const errors = validateOffer(input);
      if (errors.length) return sendJson(res, 400, { error: errors.join(" "), errors });
      const offer = await createOffer(input);
      return sendJson(res, 201, { offer });
    }

    if (req.method === "DELETE" && req.query.resource === "category") {
      const result = await removeCategory(req.query.slug || "", { targetCategory: req.query.targetCategory || "" });
      return sendJson(res, 200, { ok: true, ...result });
    }

    return methodNotAllowed(res, ["GET", "POST", "DELETE"]);
  } catch (error) {
    return publicError(res, error);
  }
}
