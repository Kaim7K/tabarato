import { query } from "./db.js";
import { isAdminAuthorized, isValidUuid, publicError, readJson, requireAdmin, sendJson } from "./http.js";

const ITEM_TYPES = new Set(["button", "featured", "image-card", "promo-banner", "gradient", "social", "divider", "category", "callout"]);
const STYLE_OPTIONS = {
  size: new Set(["compact", "default", "large"]),
  alignment: new Set(["left", "center"]),
  iconStyle: new Set(["plain", "soft", "solid", "circle"]),
  entryAnimation: new Set(["none", "fade", "slide", "pop"]),
  hoverEffect: new Set(["none", "lift", "scale", "glow"]),
  shadow: new Set(["none", "soft", "medium", "strong"]),
};
const STRUCTURAL_TYPES = new Set(["divider", "category", "callout"]);

const clean = (value, max) => String(value || "").trim().slice(0, max);
const validColor = (value, fallback = "") => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toUpperCase() : fallback;
const validAsset = (value) => !value || validLinkUrl(value, { asset: true });

function validLinkUrl(value, { asset = false } = {}) {
  if (!value) return false;
  if (asset && /^data:image\/(?:png|jpe?g|webp);base64,/i.test(value)) return value.length <= 950_000;
  if (!asset && /^\/(?!\/)/.test(value)) return true;
  try {
    const protocol = new URL(value).protocol;
    return asset ? protocol === "https:" : ["https:", "mailto:", "tel:"].includes(protocol);
  } catch {
    return false;
  }
}

function cleanDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function sanitizeSocialStyle(value = {}) {
  const style = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const gradientStart = validColor(style.gradientStart);
  const gradientEnd = validColor(style.gradientEnd);
  return {
    backgroundColor: validColor(style.backgroundColor),
    textColor: validColor(style.textColor),
    iconColor: validColor(style.iconColor),
    borderColor: validColor(style.borderColor),
    arrowColor: validColor(style.arrowColor),
    gradientStart,
    gradientEnd,
    gradientEnabled: Boolean(style.gradientEnabled && gradientStart && gradientEnd),
    borderRadius: Math.max(8, Math.min(Number(style.borderRadius) || 24, 40)),
    size: STYLE_OPTIONS.size.has(style.size) ? style.size : "default",
    alignment: STYLE_OPTIONS.alignment.has(style.alignment) ? style.alignment : "left",
    iconStyle: STYLE_OPTIONS.iconStyle.has(style.iconStyle) ? style.iconStyle : "soft",
    entryAnimation: STYLE_OPTIONS.entryAnimation.has(style.entryAnimation) ? style.entryAnimation : "fade",
    hoverEffect: STYLE_OPTIONS.hoverEffect.has(style.hoverEffect) ? style.hoverEffect : "lift",
    shadow: STYLE_OPTIONS.shadow.has(style.shadow) ? style.shadow : "soft",
  };
}

function mapLink(item) {
  const searchable = `${item.label || ""} ${item.url || ""}`.toLowerCase();
  const inferredIcon = searchable.includes("whatsapp") || searchable.includes("wa.me")
    ? "whatsapp"
    : searchable.includes("telegram") || searchable.includes("t.me")
      ? "telegram"
      : searchable.includes("instagram")
        ? "instagram"
        : searchable.includes("tiktok")
          ? "tiktok"
          : searchable.includes("youtube")
            ? "youtube"
            : searchable.includes("site")
              ? "globe"
              : "tag";
  const iconName = item.icon_name || inferredIcon;
  const itemType = item.item_type === "button" && ["telegram", "whatsapp"].includes(iconName) ? "social" : (item.item_type || "button");
  return {
    id: item.id,
    label: item.label,
    subtitle: item.subtitle || "",
    url: item.url || "",
    iconUrl: item.icon_url || "",
    iconName,
    imageUrl: item.image_url || "",
    backgroundImageUrl: item.background_image_url || "",
    itemType,
    badge: item.badge || "",
    sortOrder: item.sort_order,
    isActive: item.is_active,
    isPrimary: item.is_primary,
    openNewTab: item.open_new_tab,
    startsAt: item.starts_at,
    endsAt: item.ends_at,
    style: sanitizeSocialStyle(item.style_config),
  };
}

export function sanitizeSocialLink(input) {
  const itemType = ITEM_TYPES.has(input.itemType) ? input.itemType : "button";
  const url = clean(input.url, 2048);
  const iconUrl = clean(input.iconUrl, 950_000);
  const imageUrl = clean(input.imageUrl, 950_000);
  const backgroundImageUrl = clean(input.backgroundImageUrl, 950_000);
  const startsAt = cleanDate(input.startsAt);
  const endsAt = cleanDate(input.endsAt);
  if (!clean(input.label, 100)) throw Object.assign(new Error("Informe o titulo do item."), { statusCode: 400 });
  if (!STRUCTURAL_TYPES.has(itemType) && !validLinkUrl(url)) throw Object.assign(new Error("Informe um destino HTTPS valido."), { statusCode: 400 });
  if (![iconUrl, imageUrl, backgroundImageUrl].every(validAsset)) throw Object.assign(new Error("As imagens devem usar HTTPS ou um upload valido."), { statusCode: 400 });
  if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) throw Object.assign(new Error("A data final deve ser posterior a data inicial."), { statusCode: 400 });
  return {
    label: clean(input.label, 100), subtitle: clean(input.subtitle, 180), url,
    iconUrl, iconName: clean(input.iconName, 40) || "tag", imageUrl, backgroundImageUrl,
    itemType, badge: clean(input.badge, 28), sortOrder: Math.max(0, Math.floor(Number(input.sortOrder) || 0)),
    isActive: input.isActive !== false, isPrimary: Boolean(input.isPrimary), openNewTab: input.openNewTab !== false,
    startsAt, endsAt, style: sanitizeSocialStyle(input.style),
  };
}

async function readSocialPage(includeUnpublished = false) {
  const visibility = includeUnpublished ? "" : "WHERE is_active = TRUE AND (starts_at IS NULL OR starts_at <= NOW()) AND (ends_at IS NULL OR ends_at > NOW())";
  const [settings, links] = await Promise.all([
    query("SELECT * FROM social_page_settings WHERE id=1"),
    query(`SELECT * FROM social_links ${visibility} ORDER BY is_primary DESC, sort_order ASC, created_at ASC`),
  ]);
  const row = settings.rows[0] || {};
  const storedTitle = row.title || "";
  const storedBio = row.bio || "";
  return {
    settings: {
      eyebrow: row.eyebrow || "TA BARATO", title: /^t[aá] barato$/i.test(storedTitle) ? "Escolha onde receber os achadinhos" : (storedTitle || "Escolha onde receber os achadinhos"),
      bio: storedBio === "Ofertas selecionadas para voce comprar melhor." ? "Ofertas, descontos e promocoes em um so lugar." : (storedBio || "Ofertas, descontos e promocoes em um so lugar."), avatarUrl: row.avatar_url || "",
      mascotUrl: row.mascot_url || "", backgroundImageUrl: row.background_image_url || "",
      accentColor: row.accent_color || "#FF5A1F", secondaryColor: row.secondary_color || "#16A34A",
      backgroundColor: row.background_color || "#FFF9F5",
    },
    links: links.rows.map(mapLink),
  };
}

export async function handleSocial(req, res) {
  try {
    if (req.method === "GET") return sendJson(res, 200, await readSocialPage(isAdminAuthorized(req)));
    if (!requireAdmin(req, res)) return;
    const input = await readJson(req);

    if (req.method === "PUT") {
      const avatarUrl = clean(input.avatarUrl, 950_000);
      const mascotUrl = clean(input.mascotUrl, 950_000);
      const backgroundImageUrl = clean(input.backgroundImageUrl, 950_000);
      if (![avatarUrl, mascotUrl, backgroundImageUrl].every(validAsset)) return sendJson(res, 400, { error: "As imagens devem usar HTTPS ou um upload valido." });
      await query(
        `UPDATE social_page_settings SET eyebrow=$1, title=$2, bio=$3, avatar_url=$4, mascot_url=$5, background_image_url=$6, accent_color=$7, secondary_color=$8, background_color=$9, updated_at=NOW() WHERE id=1`,
        [clean(input.eyebrow, 32) || "TA BARATO", clean(input.title, 100) || "Escolha onde receber os achadinhos", clean(input.bio, 240), avatarUrl || null, mascotUrl || null, backgroundImageUrl || null, validColor(input.accentColor, "#FF5A1F"), validColor(input.secondaryColor, "#16A34A"), validColor(input.backgroundColor, "#FFF9F5")]
      );
      return sendJson(res, 200, await readSocialPage(true));
    }

    if (req.method === "POST") {
      const item = sanitizeSocialLink(input);
      await query(
        `INSERT INTO social_links (label, subtitle, url, icon_url, icon_name, image_url, background_image_url, item_type, badge, sort_order, is_active, is_primary, open_new_tab, starts_at, ends_at, style_config)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)`,
        [item.label, item.subtitle, item.url, item.iconUrl || null, item.iconName, item.imageUrl || null, item.backgroundImageUrl || null, item.itemType, item.badge || null, item.sortOrder, item.isActive, item.isPrimary, item.openNewTab, item.startsAt, item.endsAt, JSON.stringify(item.style)]
      );
      return sendJson(res, 201, await readSocialPage(true));
    }

    if (req.method === "PATCH" && input.action === "reorder") {
      const order = Array.isArray(input.order) ? input.order.filter((item) => isValidUuid(item.id)).map((item, index) => ({ id: item.id, sort_order: index })) : [];
      if (!order.length) return sendJson(res, 400, { error: "Informe a nova ordem dos itens." });
      await query(`UPDATE social_links AS links SET sort_order=ordering.sort_order, updated_at=NOW() FROM jsonb_to_recordset($1::jsonb) AS ordering(id uuid, sort_order integer) WHERE links.id=ordering.id`, [JSON.stringify(order)]);
      return sendJson(res, 200, await readSocialPage(true));
    }

    if (req.method === "PATCH") {
      const id = clean(input.id, 50);
      if (!isValidUuid(id)) return sendJson(res, 400, { error: "Item invalido." });
      const item = sanitizeSocialLink(input);
      await query(
        `UPDATE social_links SET label=$1, subtitle=$2, url=$3, icon_url=$4, icon_name=$5, image_url=$6, background_image_url=$7, item_type=$8, badge=$9, sort_order=$10, is_active=$11, is_primary=$12, open_new_tab=$13, starts_at=$14, ends_at=$15, style_config=$16::jsonb, updated_at=NOW() WHERE id=$17`,
        [item.label, item.subtitle, item.url, item.iconUrl || null, item.iconName, item.imageUrl || null, item.backgroundImageUrl || null, item.itemType, item.badge || null, item.sortOrder, item.isActive, item.isPrimary, item.openNewTab, item.startsAt, item.endsAt, JSON.stringify(item.style), id]
      );
      return sendJson(res, 200, await readSocialPage(true));
    }

    if (req.method === "DELETE") {
      const id = clean(req.query.id, 50);
      if (!isValidUuid(id)) return sendJson(res, 400, { error: "Item invalido." });
      await query("DELETE FROM social_links WHERE id=$1", [id]);
      return sendJson(res, 200, await readSocialPage(true));
    }
    return sendJson(res, 405, { error: "Metodo nao permitido." });
  } catch (error) {
    return publicError(res, error, "Nao foi possivel atualizar a pagina social.");
  }
}
