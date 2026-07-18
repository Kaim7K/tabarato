import { query } from "./db.js";
import { findDuplicateOffer, getOffer, mapOffer, validateOffer } from "./offers.js";
import { sendTelegramOffer } from "./telegram.js";

function telegramFailure(error) {
  const uncertain = error?.code === "TELEGRAM_TIMEOUT_UNCERTAIN" || error?.uncertain === true;
  return {
    ok: false,
    uncertain,
    error: error?.message || "Erro ao publicar no Telegram.",
  };
}

function telegramState(offer) {
  const response = offer?.telegramResponse;
  return response && typeof response === "object" ? String(response.state || "") : "";
}

async function recordPublication(id, channel, status, externalMessageId = null, errorMessage = null) {
  await query(
    `INSERT INTO offer_publication_history (offer_id, channel, status, external_message_id, error_message)
     VALUES ($1,$2,$3,$4,$5)`,
    [id, channel, status, externalMessageId, errorMessage]
  ).catch(() => {});
}

export async function publishOfferSiteById(id, { forceRepublish = false } = {}) {
  const candidate = await getOffer(id);
  if (!candidate) return { ok: false, status: 404, error: "Oferta não encontrada." };

  const duplicate = await findDuplicateOffer(candidate, id, ["PUBLICADO", "PUBLICANDO"]);
  if (duplicate) return { ok: false, status: 409, error: "Este produto já foi publicado com o mesmo preço." };

  if (candidate.status === "PUBLICADO" && !forceRepublish) {
    return { ok: true, sitePublished: true, alreadyPublished: true, offer: candidate };
  }

  const locked = await query(
    `UPDATE telegram_offers
     SET status='PUBLICANDO', error_message=NULL,
         telegram_message_id=CASE WHEN $2::boolean THEN NULL ELSE telegram_message_id END,
         telegram_response=CASE WHEN $2::boolean THEN NULL ELSE telegram_response END
     WHERE id=$1
       AND ($2::boolean = TRUE OR status IN ('APROVADO', 'AGENDADO', 'ERRO'))
     RETURNING *`,
    [id, forceRepublish]
  );

  if (!locked.rows[0]) {
    const current = await getOffer(id);
    if (!current) return { ok: false, status: 404, error: "Oferta não encontrada." };
    if (current.status === "PUBLICADO") return { ok: true, sitePublished: true, alreadyPublished: true, offer: current };
    if (current.status === "PUBLICANDO") return { ok: true, pending: true, sitePublished: false, offer: current };
    return { ok: false, status: 409, error: `Oferta não pode ser publicada com status ${current.status}.` };
  }

  const offer = mapOffer(locked.rows[0]);
  const errors = validateOffer(offer);
  if (errors.length) {
    await query("UPDATE telegram_offers SET status='ERRO', error_message=$2 WHERE id=$1", [id, errors.join(" ")]);
    return { ok: false, status: 400, error: errors.join(" ") };
  }

  const published = await query(
    `UPDATE telegram_offers
     SET status='PUBLICADO', published_at=COALESCE(published_at, NOW()), error_message=NULL
     WHERE id=$1
     RETURNING *`,
    [id]
  );
  return { ok: true, sitePublished: true, offer: mapOffer(published.rows[0]) };
}

export async function sendOfferTelegramById(id, { shareImageDataUrl = "", messageHeadline = "", forceRetry = false } = {}) {
  const candidate = await getOffer(id);
  if (!candidate) return { ok: false, status: 404, error: "Oferta não encontrada." };
  if (candidate.status !== "PUBLICADO") {
    return { ok: false, status: 409, error: "Publique a oferta no site antes de enviá-la ao Telegram." };
  }
  if (candidate.telegramMessageId) {
    return { ok: true, alreadySent: true, messageId: candidate.telegramMessageId, offer: candidate };
  }

  const currentState = telegramState(candidate);
  if (!forceRetry && currentState === "uncertain") {
    return {
      ok: false,
      pending: true,
      uncertain: true,
      status: 202,
      error: "O Telegram pode ter recebido a mensagem. A extensão não repetirá o envio automaticamente para evitar duplicidade.",
      offer: candidate,
    };
  }

  const claimed = await query(
    `UPDATE telegram_offers
     SET telegram_response=jsonb_build_object('state','sending','started_at',NOW()),
         error_message=NULL
     WHERE id=$1
       AND telegram_message_id IS NULL
       AND (
         $2::boolean = TRUE
         OR telegram_response IS NULL
         OR COALESCE(telegram_response->>'state','') NOT IN ('sending','uncertain')
         OR (
           telegram_response->>'state'='sending'
           AND COALESCE((telegram_response->>'started_at')::timestamptz, NOW() - INTERVAL '10 minutes') < NOW() - INTERVAL '2 minutes'
         )
       )
     RETURNING *`,
    [id, forceRetry]
  );

  if (!claimed.rows[0]) {
    const current = await getOffer(id);
    if (current?.telegramMessageId) {
      return { ok: true, alreadySent: true, messageId: current.telegramMessageId, offer: current };
    }
    const state = telegramState(current);
    return {
      ok: false,
      pending: state === "sending" || state === "uncertain",
      uncertain: state === "uncertain",
      status: 202,
      error: state === "uncertain"
        ? "O envio anterior ao Telegram ficou sem confirmação; repetição automática bloqueada para evitar mensagem duplicada."
        : "O envio ao Telegram já está em andamento.",
      offer: current,
    };
  }

  const offer = mapOffer(claimed.rows[0]);
  try {
    const result = await sendTelegramOffer({ ...offer, shareImageDataUrl, messageHeadline });
    const updated = await query(
      `UPDATE telegram_offers
       SET telegram_message_id=$2, telegram_response=$3, error_message=NULL
       WHERE id=$1
       RETURNING *`,
      [id, result.messageId, JSON.stringify(result.response)]
    );
    const publishedOffer = mapOffer(updated.rows[0]);
    await recordPublication(id, "TELEGRAM", "SUCESSO", result.messageId);
    return { ok: true, messageId: result.messageId, offer: publishedOffer };
  } catch (error) {
    const failure = telegramFailure(error);
    const state = failure.uncertain ? "uncertain" : "failed";
    const storedMessage = `${failure.uncertain ? "Telegram pendente" : "Telegram"}: ${failure.error}`.slice(0, 500);
    const updated = await query(
      `UPDATE telegram_offers
       SET status='PUBLICADO', error_message=$2,
           telegram_response=$3
       WHERE id=$1
       RETURNING *`,
      [id, storedMessage, JSON.stringify({ state, uncertain: failure.uncertain, error: failure.error, finished_at: new Date().toISOString() })]
    );
    await recordPublication(id, "TELEGRAM", "ERRO", null, storedMessage);
    return { ...failure, status: failure.uncertain ? 202 : 502, offer: mapOffer(updated.rows[0]) };
  }
}

export async function publishOfferById(id, options = {}) {
  const site = await publishOfferSiteById(id, { forceRepublish: options.forceRepublish === true });
  if (!site.ok || site.pending) return site;
  const telegram = await sendOfferTelegramById(id, {
    shareImageDataUrl: options.shareImageDataUrl || "",
    messageHeadline: options.messageHeadline || "",
    forceRetry: options.forceTelegramRetry === true,
  });
  return {
    ok: true,
    sitePublished: true,
    offer: telegram.offer || site.offer,
    telegram,
  };
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
  for (const row of due.rows) results.push(await publishOfferById(row.id));
  return results;
}
