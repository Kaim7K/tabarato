import { query } from "./db.js";
import { publicError, readJson, requireAdmin, sendJson } from "./http.js";

const clean = (value, max) => String(value || "").trim().slice(0, max);
const validColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : fallback;
const validHttps = (value, required = false) => {
  if (!value) return !required;
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};
const validAsset = (value) => !value || validHttps(value) || /^data:image\/(?:png|jpe?g|webp);base64,/i.test(value);

async function readSocialPage() {
  const [settings, links] = await Promise.all([
    query("SELECT * FROM social_page_settings WHERE id=1"),
    query("SELECT * FROM social_links ORDER BY sort_order ASC, created_at ASC"),
  ]);
  const row = settings.rows[0] || {};
  return {
    settings: { title: row.title || "Ta Barato", bio: row.bio || "", avatarUrl: row.avatar_url || "", accentColor: row.accent_color || "#FF6B35", backgroundColor: row.background_color || "#F4F5F6" },
    links: links.rows.map((item) => ({ id: item.id, label: item.label, url: item.url, iconUrl: item.icon_url || "", sortOrder: item.sort_order, isActive: item.is_active })),
  };
}

export async function handleSocial(req, res) {
  try {
    if (req.method === "GET") return sendJson(res, 200, await readSocialPage());
    if (!requireAdmin(req, res)) return;
    const input = await readJson(req);
    if (req.method === "PUT") {
      const avatarUrl = clean(input.avatarUrl, 950_000);
      if (!validAsset(avatarUrl)) return sendJson(res, 400, { error: "A imagem deve usar HTTPS ou ser enviada do aparelho." });
      await query(`UPDATE social_page_settings SET title=$1, bio=$2, avatar_url=$3, accent_color=$4, background_color=$5, updated_at=NOW() WHERE id=1`, [clean(input.title, 80) || "Ta Barato", clean(input.bio, 240), avatarUrl || null, validColor(input.accentColor, "#FF6B35"), validColor(input.backgroundColor, "#F4F5F6")]);
      return sendJson(res, 200, await readSocialPage());
    }
    if (req.method === "POST") {
      const label = clean(input.label, 80); const url = clean(input.url, 2048); const iconUrl = clean(input.iconUrl, 950_000);
      if (!label || !validHttps(url, true) || !validAsset(iconUrl)) return sendJson(res, 400, { error: "Informe nome e link HTTPS validos." });
      await query(`INSERT INTO social_links (label, url, icon_url, sort_order, is_active) VALUES ($1,$2,$3,$4,$5)`, [label, url, iconUrl || null, Number(input.sortOrder) || 0, input.isActive !== false]);
      return sendJson(res, 201, await readSocialPage());
    }
    if (req.method === "PATCH") {
      const id = clean(input.id, 50); const label = clean(input.label, 80); const url = clean(input.url, 2048); const iconUrl = clean(input.iconUrl, 950_000);
      if (!id || !label || !validHttps(url, true) || !validAsset(iconUrl)) return sendJson(res, 400, { error: "Dados do link invalidos." });
      await query(`UPDATE social_links SET label=$1, url=$2, icon_url=$3, sort_order=$4, is_active=$5, updated_at=NOW() WHERE id=$6`, [label, url, iconUrl || null, Number(input.sortOrder) || 0, input.isActive !== false, id]);
      return sendJson(res, 200, await readSocialPage());
    }
    if (req.method === "DELETE") {
      await query("DELETE FROM social_links WHERE id=$1", [clean(req.query.id, 50)]);
      return sendJson(res, 200, await readSocialPage());
    }
  } catch (error) {
    return publicError(res, error, "Nao foi possivel atualizar a pagina social.");
  }
}
