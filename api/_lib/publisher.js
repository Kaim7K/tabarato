import { query } from "./db.js";
import { findDuplicateOffer, getOffer, mapOffer, validateOffer } from "./offers.js";
import { sendTelegramOffer } from "./telegram.js";

export async function publishOfferById(id, { shareImageDataUrl = "", forceRepublish = false, messageHeadline = "", destinations = { site: true, telegram: true } } = {}) {
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
    await query("UPDATE telegram_offers SET status='ERRO', error_message=$2 WHERE id=$1", [id, errors.join(" ")]);
    return { ok: false, status: 400, error: errors.join(" ") };
  }

  const siteRequested = destinations?.site !== false;
  const telegramRequested = destinations?.telegram !== false;
  if (!telegramRequested) {
    const updated = await query(
      `UPDATE telegram_offers
       SET status='PUBLICADO', published_at=COALESCE(published_at,NOW()), error_message=NULL
       WHERE id=$1 RETURNING *`,
      [id]
    );
    if (siteRequested) {
      await query(
        `INSERT INTO offer_publication_history (offer_id, channel, status)
         VALUES ($1, 'SITE', 'SUCESSO')`,
        [id]
      ).catch(() => {});
    }
    return { ok: true, channels: { site: { ok: siteRequested }, telegram: { ok: true, skipped: true } }, offer: mapOffer(updated.rows[0]) };
  }

  try {
    const result = await sendTelegramOffer({ ...offer, shareImageDataUrl, messageHeadline });
    const updated = await query(
      `UPDATE telegram_offers
       SET status='PUBLICADO', published_at=NOW(), telegram_message_id=$2, telegram_response=$3, error_message=NULL
       WHERE id=$1
       RETURNING *`,
      [id, result.messageId, JSON.stringify(result.response)]
    );
    await query(
      `INSERT INTO offer_publication_history (offer_id, channel, status, external_message_id)
       VALUES ($1, 'TELEGRAM', 'SUCESSO', $2)`,
      [id, result.messageId]
    ).catch(() => {});
    return { ok: true, offer: mapOffer(updated.rows[0]) };
  } catch (error) {
    const message = error?.name === "AbortError" ? "Timeout ao enviar para o Telegram." : error.message || "Erro ao publicar no Telegram.";
    const code = error?.code || "TELEGRAM_FAILED";
    const updated = await query(
      `UPDATE telegram_offers
       SET status=$3, published_at=CASE WHEN $3='PUBLICADO' THEN COALESCE(published_at,NOW()) ELSE published_at END,
           error_message=$2
       WHERE id=$1 RETURNING *`,
      [id, `[${code}] ${message}`, siteRequested ? "PUBLICADO" : "ERRO"]
    );
    await query(
      `INSERT INTO offer_publication_history (offer_id, channel, status, error_message)
       VALUES ($1, 'TELEGRAM', 'ERRO', $2)`,
      [id, message]
    ).catch(() => {});
    return {
      ok: false,
      partial: siteRequested,
      status: 502,
      error: message,
      errorCode: code,
      channels: { site: { ok: siteRequested }, telegram: { ok: false, error: message, errorCode: code } },
      offer: mapOffer(updated.rows[0]),
    };
  }
}

export async function publishDueOffers(limit = 5) {
  const due = await query(
    `SELECT id FROM telegram_offers
     WHERE status='AGENDADO'
       AND scheduled_at IS NOT NULL
       AND scheduled_at <= NOW()
       AND telegram_message_id IS NULL
     ORDER BY scheduled_at ASC
     LIMIT $1`,
    [limit]
  );

  const results = [];
  for (const row of due.rows) {
    results.push(await publishOfferById(row.id));
  }
  return results;
}
