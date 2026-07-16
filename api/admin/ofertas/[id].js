import { query } from "../../_lib/db.js";
import { requireAdmin, sendJson, methodNotAllowed, readJson, publicError } from "../../_lib/http.js";
import { getOffer, updateOffer, validateOffer } from "../../_lib/offers.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const { id } = req.query;

  try {
    if (req.method === "GET") {
      const offer = await getOffer(id);
      return offer ? sendJson(res, 200, { offer }) : sendJson(res, 404, { error: "Oferta não encontrada." });
    }

    if (req.method === "PATCH") {
      const input = await readJson(req);
      const errors = validateOffer(input, { requireSchedule: input.status === "AGENDADO" });
      if (errors.length) return sendJson(res, 400, { error: errors.join(" "), errors });
      const offer = await updateOffer(id, input);
      return offer ? sendJson(res, 200, { offer }) : sendJson(res, 404, { error: "Oferta não encontrada." });
    }

    if (req.method === "DELETE") {
      const result = await query("DELETE FROM telegram_offers WHERE id=$1 RETURNING id", [id]);
      return result.rows[0] ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: "Oferta não encontrada." });
    }

    return methodNotAllowed(res, ["GET", "PATCH", "DELETE"]);
  } catch (error) {
    return publicError(res, error);
  }
}
