import { getAdminSessionCookie, methodNotAllowed, readJson, sendJson } from "../_lib/http.js";

const ADMIN_USER = "admins";
const ADMIN_PASSWORD = "Argolo@28";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  const expectedKey = process.env.ADMIN_API_KEY;
  if (!expectedKey) {
    return sendJson(res, 500, { error: "ADMIN_API_KEY nao configurada." });
  }

  const body = await readJson(req);
  if (body.username !== ADMIN_USER || body.password !== ADMIN_PASSWORD) {
    return sendJson(res, 401, { error: "Usuario ou senha invalidos." });
  }

  res.setHeader("Set-Cookie", getAdminSessionCookie(expectedKey));
  return sendJson(res, 200, { ok: true });
}
