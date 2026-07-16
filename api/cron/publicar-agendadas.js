import { requireCron, sendJson, methodNotAllowed, publicError } from "../_lib/http.js";
import { publishDueOffers } from "../_lib/publisher.js";

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) return methodNotAllowed(res, ["GET", "POST"]);
  if (!requireCron(req, res)) return;

  try {
    const limit = Math.min(Number(req.query.limit || 5) || 5, 10);
    const results = await publishDueOffers(limit);
    return sendJson(res, 200, { ok: true, count: results.length, results });
  } catch (error) {
    return publicError(res, error, "Erro ao publicar ofertas agendadas.");
  }
}
