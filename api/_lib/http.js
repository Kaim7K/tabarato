export function sendJson(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return req.body ? JSON.parse(req.body) : {};
    } catch {
      throw Object.assign(new Error("JSON invalido."), { statusCode: 400 });
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (Buffer.byteLength(raw, "utf8") > 1_000_000) {
    throw Object.assign(new Error("Corpo da requisicao muito grande."), { statusCode: 413 });
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error("JSON invalido."), { statusCode: 400 });
  }
}

export function getBearer(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

export function getCookie(req, name) {
  const cookies = req.headers.cookie || "";
  const match = cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

export function getAdminSessionCookie(value, maxAge = 60 * 60 * 24 * 7) {
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : "";
  return `tb_admin_session=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge};${secure}`;
}

export function createAdminSessionToken(secret) {
  return createHmac("sha256", String(secret)).update("tb_admin_session:v1").digest("hex");
}

const EXTENSION_TOKEN_PREFIX = "tbx1";

export function createAdminExtensionToken(secret, expiresAt = Date.now() + 24 * 60 * 60 * 1000) {
  const payload = Buffer.from(JSON.stringify({
    exp: Math.floor(expiresAt / 1000),
    scope: "admin:offers",
  })).toString("base64url");
  const unsigned = `${EXTENSION_TOKEN_PREFIX}.${payload}`;
  const signature = createHmac("sha256", String(secret)).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

export function verifyAdminExtensionToken(token, secret, now = Date.now()) {
  const [prefix, payload, signature, extra] = String(token || "").split(".");
  if (extra || prefix !== EXTENSION_TOKEN_PREFIX || !payload || !signature) return false;

  const unsigned = `${prefix}.${payload}`;
  const expected = createHmac("sha256", String(secret)).update(unsigned).digest("base64url");
  if (!safeEqual(signature, expected)) return false;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return claims.scope === "admin:offers" && Number(claims.exp) > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

export function handleExtensionCors(req, res, methods) {
  const origin = String(req.headers.origin || "");
  const configuredOrigin = String(process.env.EXTENSION_ORIGIN || "").trim();
  const validOrigin = /^chrome-extension:\/\/[a-p]{32}$/.test(origin)
    && (!configuredOrigin || configuredOrigin === origin);

  if (!validOrigin) return false;

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", [...methods, "OPTIONS"].join(", "));
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Vary", "Origin");

  if (req.method !== "OPTIONS") return false;
  res.status(204).end();
  return true;
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireAdmin(req, res, { allowExtension = false } = {}) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    sendJson(res, 500, { error: "ADMIN_API_KEY não configurada." });
    return false;
  }
  const providedKey = req.headers["x-admin-api-key"] || getBearer(req);
  const session = getCookie(req, "tb_admin_session");
  const authorized = safeEqual(providedKey, expected)
    || safeEqual(session, createAdminSessionToken(expected))
    || (allowExtension && verifyAdminExtensionToken(providedKey, expected));
  if (!authorized) {
    sendJson(res, 401, { error: "Acesso administrativo não autorizado." });
    return false;
  }
  return true;
}

export function requireCron(req, res) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    sendJson(res, 500, { error: "CRON_SECRET não configurado." });
    return false;
  }
  const provided = req.headers["x-cron-secret"] || getBearer(req);
  if (!safeEqual(provided, expected)) {
    sendJson(res, 401, { error: "Cron não autorizado." });
    return false;
  }
  return true;
}

export function methodNotAllowed(res, methods) {
  res.setHeader("Allow", methods.join(", "));
  return sendJson(res, 405, { error: "Método não permitido." });
}

export function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

export function requireUuid(value, res) {
  if (isValidUuid(value)) return true;
  sendJson(res, 400, { error: "ID invalido." });
  return false;
}

export function publicError(res, error, fallback = "Erro interno.") {
  console.error(error?.message || error);
  const status = Number(error?.statusCode) || 500;
  return sendJson(res, status, { error: status < 500 ? error.message : fallback });
}
import { createHmac, timingSafeEqual } from "node:crypto";
