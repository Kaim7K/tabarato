import { getAdminSessionCookie, methodNotAllowed, readJson, requireAdmin, sendJson } from "../_lib/http.js";
import { createHash, timingSafeEqual } from "node:crypto";

const ADMIN_USER = process.env.ADMIN_USERNAME || "admin";

function safeCompare(a = "", b = "") {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function passwordMatches(password) {
  const plainPassword = process.env.ADMIN_PASSWORD;
  if (plainPassword) return safeCompare(password, plainPassword);

  const passwordHash = process.env.ADMIN_PASSWORD_SHA256;
  if (!passwordHash) return false;

  const salt = process.env.ADMIN_PASSWORD_SALT || "";
  const hash = createHash("sha256").update(`${salt}${password}`).digest("hex");
  return safeCompare(hash, passwordHash);
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    if (!requireAdmin(req, res)) return;
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);

  const expectedKey = process.env.ADMIN_API_KEY;
  if (!expectedKey) {
    return sendJson(res, 500, { error: "ADMIN_API_KEY nao configurada." });
  }
  if (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_SHA256) {
    return sendJson(res, 500, { error: "Senha administrativa nao configurada." });
  }

  const body = await readJson(req);
  if (body.username !== ADMIN_USER || !passwordMatches(body.password || "")) {
    return sendJson(res, 401, { error: "Usuario ou senha invalidos." });
  }

  res.setHeader("Set-Cookie", getAdminSessionCookie(expectedKey));
  return sendJson(res, 200, { ok: true });
}
