import { methodNotAllowed, requireAdmin, sendJson } from "../_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  if (!requireAdmin(req, res)) return;
  return sendJson(res, 200, { ok: true });
}
