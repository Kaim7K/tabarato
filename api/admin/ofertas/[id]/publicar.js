import { requireAdmin, sendJson, methodNotAllowed, publicError } from "../../../_lib/http.js";
import { publishOfferById } from "../../../_lib/publisher.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  try {
    const result = await publishOfferById(req.query.id);
    if (!result.ok) return sendJson(res, result.status || 500, result);
    return sendJson(res, 200, result);
  } catch (error) {
    return publicError(res, error);
  }
}
