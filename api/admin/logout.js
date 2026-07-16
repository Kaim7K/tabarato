import { getAdminSessionCookie, methodNotAllowed, sendJson } from "../_lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  res.setHeader("Set-Cookie", getAdminSessionCookie("", 0));
  return sendJson(res, 200, { ok: true });
}
