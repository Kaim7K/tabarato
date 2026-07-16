export function sendJson(res, status, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(status).json(body);
}

export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
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

export function requireAdmin(req, res) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    sendJson(res, 500, { error: "ADMIN_API_KEY não configurada." });
    return false;
  }
  const provided = req.headers["x-admin-api-key"] || getBearer(req) || getCookie(req, "tb_admin_session");
  if (provided !== expected) {
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
  const provided = req.headers["x-cron-secret"] || getBearer(req) || req.query?.secret;
  if (provided !== expected) {
    sendJson(res, 401, { error: "Cron não autorizado." });
    return false;
  }
  return true;
}

export function methodNotAllowed(res, methods) {
  res.setHeader("Allow", methods.join(", "));
  return sendJson(res, 405, { error: "Método não permitido." });
}

export function publicError(res, error, fallback = "Erro interno.") {
  console.error(error?.message || error);
  return sendJson(res, 500, { error: fallback });
}
