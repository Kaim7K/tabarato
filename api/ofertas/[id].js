import { query } from "../_lib/db.js";
import { sendJson, methodNotAllowed, publicError, requireUuid } from "../_lib/http.js";
import { mapPublicOffer, PUBLIC_OFFER_COLUMNS, setPublicCache } from "../_lib/publicOffers.js";

export default async function handler(req, res) {
  if (!requireUuid(req.query.id, res)) return;
  try {
    if (req.method === "GET") {
      const [result, historyResult] = await Promise.all([
        query(`SELECT ${PUBLIC_OFFER_COLUMNS} FROM telegram_offers WHERE id=$1 AND status='PUBLICADO'`, [req.query.id]),
        query("SELECT price, recorded_at FROM offer_price_history WHERE offer_id=$1 ORDER BY recorded_at ASC LIMIT 120", [req.query.id]),
      ]);
      setPublicCache(res);
      return result.rows[0]
        ? sendJson(res, 200, {
            offer: {
              ...mapPublicOffer(result.rows[0]),
              price_history: historyResult.rows.map((item) => ({ price: Number(item.price), date: item.recorded_at })),
            },
          })
        : sendJson(res, 404, { error: "Oferta não encontrada." });
    }

    if (req.method === "POST") {
      const action = String(req.body?.action || "click");
      const column = { click: "clicks", share: "shares", favorite: "favorites" }[action];
      if (!column) return sendJson(res, 400, { error: "Ação inválida." });
      const result = await query(
        `UPDATE telegram_offers SET ${column} = COALESCE(${column}, 0) + 1 WHERE id=$1 AND status='PUBLICADO' RETURNING ${column}`,
        [req.query.id]
      );
      return result.rows[0]
        ? sendJson(res, 200, { [column]: result.rows[0][column] })
        : sendJson(res, 404, { error: "Oferta não encontrada." });
    }

    return methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    return publicError(res, error, "Não foi possível carregar oferta.");
  }
}
