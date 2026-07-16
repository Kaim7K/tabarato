import { query } from "../_lib/db.js";
import { sendJson, methodNotAllowed, publicError, requireUuid } from "../_lib/http.js";
import { mapPublicOffer, PUBLIC_OFFER_COLUMNS, setPublicCache } from "../_lib/publicOffers.js";

export default async function handler(req, res) {
  if (!requireUuid(req.query.id, res)) return;
  try {
    if (req.method === "GET") {
      const result = await query(`SELECT ${PUBLIC_OFFER_COLUMNS} FROM telegram_offers WHERE id=$1 AND status='PUBLICADO'`, [req.query.id]);
      setPublicCache(res);
      return result.rows[0]
        ? sendJson(res, 200, { offer: mapPublicOffer(result.rows[0]) })
        : sendJson(res, 404, { error: "Oferta não encontrada." });
    }

    if (req.method === "POST") {
      const result = await query(
        "UPDATE telegram_offers SET clicks = COALESCE(clicks, 0) + 1 WHERE id=$1 AND status='PUBLICADO' RETURNING clicks",
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
