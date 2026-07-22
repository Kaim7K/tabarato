import { query } from "./db.js";
import { findDuplicateOffer, getOffer, mapOffer, validateOffer } from "./offers.js";
import { sendTelegramOffer } from "./telegram.js";

const MAX_TELEGRAM_RETRIES = 3;

function retryDelaySeconds(error, retryCount) {
  const retryAfter = Number(error?.payload?.parameters?.retry_after || 0);
  if (retryAfter > 0) return Math.min(3600, Math.max(30, retryAfter));
  return Math.min(1800, 60 * (2 ** Math.max(0, retryCount - 1)));
}

function canRetryTelegram(error, retryCount) {
  // A timeout can mean Telegram accepted the message but the response was lost.
  // Only retry a confirmed rate limit automatically to avoid duplicate posts.
  return error?.code === "RATE_LIMIT" && retryCount <= MAX_TELEGRAM_RETRIES;
}

function publicationSnapshot(offer) {
  return {
    price: Number(offer?.currentPrice || 0) || null,
    coupon: offer?.coupon || null,
    freeShipping: /frete\s+gr[aá]tis/i.test(String(offer?.extraText || "")),
  };
}

async function recordSitePublication(id, offer) {
  const snapshot = publicationSnapshot(offer);
  await query(
    `INSERT INTO offer_publication_history (offer_id, channel, status, price_snapshot, coupon_snapshot, free_shipping_snapshot)
     VALUES ($1, 'SITE', 'SUCESSO', $2, $3, $4)`,
    [id, snapshot.price, snapshot.coupon, snapshot.freeShipping]
  ).catch(() => {});
}

export async function publishOfferById(id, { shareImageDataUrl = "", forceRepublish = false, retryTelegram = false, messageHeadline = "", destinations = { site: true, telegram: true } } = {}) {
  const candidate = await getOffer(id);
  if (!candidate) return { ok: false, status: 404, error: "Oferta não encontrada." };
  const duplicate = await findDuplicateOffer(candidate, id, ["PUBLICADO", "PUBLICANDO"]);
  if (duplicate) {
    return { ok: false, status: 409, error: "Este produto já foi publicado com o mesmo preço." };
  }

  const locked = forceRepublish
    ? await query(
      `UPDATE telegram_offers
       SET status='PUBLICANDO', error_message=NULL
       WHERE id=$1
       RETURNING *`,
      [id]
    )
    : retryTelegram
      ? await query(
        `UPDATE telegram_offers
         SET status='PUBLICANDO', error_message=NULL
         WHERE id=$1
           AND telegram_message_id IS NULL
           AND status IN ('APROVADO', 'AGENDADO', 'ERRO', 'PUBLICADO')
         RETURNING *`,
        [id]
      )
      : await query(
      `UPDATE telegram_offers
       SET status='PUBLICANDO', error_message=NULL
       WHERE id=$1
         AND status IN ('APROVADO', 'AGENDADO', 'ERRO')
         AND telegram_message_id IS NULL
       RETURNING *`,
      [id]
    );

  if (!locked.rows[0]) {
    const current = await query("SELECT * FROM telegram_offers WHERE id=$1", [id]);
    const offer = mapOffer(current.rows[0]);
    if (!offer) return { ok: false, status: 404, error: "Oferta não encontrada." };
    if (!forceRepublish && (offer.telegramMessageId || offer.status === "PUBLICADO")) {
      return { ok: false, status: 409, error: "Oferta já publicada." };
    }
    return { ok: false, status: 409, error: `Oferta não pode ser publicada com status ${offer.status}.` };
  }

  const offer = mapOffer(locked.rows[0]);
  const errors = validateOffer(offer);
  if (errors.length) {
    await query(
      `UPDATE telegram_offers
       SET status='ERRO', error_message=$2, telegram_next_retry_at=NULL, telegram_last_error_code='VALIDATION'
       WHERE id=$1`,
      [id, errors.join(" ")]
    );
    return { ok: false, status: 400, error: errors.join(" ") };
  }

  const siteRequested = destinations?.site !== false;
  const telegramRequested = destinations?.telegram !== false;
  const siteWasPublished = Boolean(offer.sitePublishedAt);
  if (!telegramRequested) {
    const updated = await query(
      `UPDATE telegram_offers
       SET status='PUBLICADO', published_at=COALESCE(published_at,NOW()),
           site_published_at=CASE WHEN $2 THEN COALESCE(site_published_at,NOW()) ELSE site_published_at END,
           error_message=NULL, telegram_next_retry_at=NULL, telegram_last_error_code=NULL
       WHERE id=$1 RETURNING *`,
      [id, siteRequested]
    );
    if (siteRequested) await recordSitePublication(id, offer);
    return { ok: true, channels: { site: { ok: siteRequested }, telegram: { ok: true, skipped: true } }, offer: mapOffer(updated.rows[0]) };
  }

  if (siteRequested) await recordSitePublication(id, offer);
  try {
    const result = await sendTelegramOffer({ ...offer, shareImageDataUrl, messageHeadline });
    const updated = await query(
      `UPDATE telegram_offers
       SET status='PUBLICADO', published_at=COALESCE(published_at,NOW()), telegram_message_id=$2, telegram_response=$3,
           site_published_at=CASE WHEN $4 THEN COALESCE(site_published_at,NOW()) ELSE site_published_at END,
           error_message=NULL, telegram_retry_count=0, telegram_next_retry_at=NULL, telegram_last_error_code=NULL
       WHERE id=$1
       RETURNING *`,
      [id, result.messageId, JSON.stringify(result.response), siteRequested]
    );
    await query(
      `INSERT INTO offer_publication_history (offer_id, channel, status, price_snapshot, coupon_snapshot, free_shipping_snapshot, external_message_id)
       VALUES ($1, 'TELEGRAM', 'SUCESSO', $2, $3, $4, $5)`,
      [id, publicationSnapshot(offer).price, publicationSnapshot(offer).coupon, publicationSnapshot(offer).freeShipping, result.messageId]
    ).catch(() => {});
    return {
      ok: true,
      channels: { site: { ok: siteRequested || siteWasPublished }, telegram: { ok: true } },
      offer: mapOffer(updated.rows[0]),
    };
  } catch (error) {
    const message = error?.name === "AbortError" ? "Timeout ao enviar para o Telegram." : error.message || "Erro ao publicar no Telegram.";
    const code = error?.code || "TELEGRAM_FAILED";
    const retryCount = Number(offer.telegramRetryCount || 0) + 1;
    const retryable = canRetryTelegram(error, retryCount);
    const visibleOnSite = siteRequested || siteWasPublished;
    const updated = await query(
      `UPDATE telegram_offers
       SET status=$3,
           published_at=CASE WHEN $3='PUBLICADO' THEN COALESCE(published_at,NOW()) ELSE published_at END,
           site_published_at=CASE WHEN $4 THEN COALESCE(site_published_at,NOW()) ELSE site_published_at END,
           error_message=$2, telegram_retry_count=$5,
           telegram_next_retry_at=CASE WHEN $6 THEN NOW() + ($7 || ' seconds')::interval ELSE NULL END,
           telegram_last_error_code=$8
       WHERE id=$1 RETURNING *`,
      [id, `[${code}] ${message}`, visibleOnSite ? "PUBLICADO" : "ERRO", visibleOnSite, retryCount, retryable, retryDelaySeconds(error, retryCount), code]
    );
    await query(
      `INSERT INTO offer_publication_history (offer_id, channel, status, error_message)
       VALUES ($1, 'TELEGRAM', 'ERRO', $2)`,
      [id, message]
    ).catch(() => {});
    return {
      ok: false,
      partial: visibleOnSite,
      status: 502,
      error: message,
      errorCode: code,
      channels: { site: { ok: visibleOnSite }, telegram: { ok: false, error: message, errorCode: code, retryAt: retryable ? mapOffer(updated.rows[0])?.telegramNextRetryAt : null } },
      offer: mapOffer(updated.rows[0]),
    };
  }
}

export async function publishDueOffers(limit = 5) {
  const due = await query(
    `SELECT id,
      CASE WHEN telegram_next_retry_at IS NOT NULL AND telegram_next_retry_at <= NOW() THEN TRUE ELSE FALSE END AS retry_telegram
     FROM telegram_offers
     WHERE telegram_message_id IS NULL
       AND (
         (status='AGENDADO' AND scheduled_at IS NOT NULL AND scheduled_at <= NOW())
         OR (telegram_next_retry_at IS NOT NULL AND telegram_next_retry_at <= NOW() AND telegram_retry_count <= $2)
       )
     ORDER BY COALESCE(telegram_next_retry_at, scheduled_at) ASC
     LIMIT $1`,
    [limit, MAX_TELEGRAM_RETRIES]
  );

  const results = [];
  for (const row of due.rows) {
    results.push(await publishOfferById(row.id, row.retry_telegram
      ? { retryTelegram: true, destinations: { site: false, telegram: true } }
      : {}));
  }
  return results;
}
