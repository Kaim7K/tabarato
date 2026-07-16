import { query } from "../../../_lib/db.js";
import { requireAdmin, requireUuid, sendJson, methodNotAllowed, readJson, publicError } from "../../../_lib/http.js";
import { mapOffer } from "../../../_lib/offers.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!requireUuid(req.query.id, res)) return;

  try {
    const input = await readJson(req);
    if (!input.scheduledAt || Number.isNaN(new Date(input.scheduledAt).getTime())) {
      return sendJson(res, 400, { error: "Data de agendamento inválida." });
    }
    const result = await query(
      `UPDATE telegram_offers
       SET status='AGENDADO', scheduled_at=$2, error_message=NULL
       WHERE id=$1 AND status IN ('RASCUNHO', 'APROVADO', 'AGENDADO', 'ERRO')
       RETURNING *`,
      [req.query.id, input.scheduledAt]
    );
    return result.rows[0]
      ? sendJson(res, 200, { offer: mapOffer(result.rows[0]) })
      : sendJson(res, 404, { error: "Oferta não encontrada ou não pode ser agendada." });
  } catch (error) {
    return publicError(res, error);
  }
}
