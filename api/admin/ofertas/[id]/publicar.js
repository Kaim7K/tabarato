import { query } from "../../../_lib/db.js";
import { handleExtensionCors, requireAdmin, requireUuid, sendJson, methodNotAllowed, publicError } from "../../../_lib/http.js";
import { publishOfferById, publishOfferSiteById, sendOfferTelegramById } from "../../../_lib/publisher.js";

function telegramPayload(req, res) {
  const shareImageDataUrl = String(req.body?.shareImageDataUrl || "");
  const messageHeadline = String(req.body?.messageHeadline || "").trim();
  if (shareImageDataUrl && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/i.test(shareImageDataUrl) || shareImageDataUrl.length > 3_500_000)) {
    sendJson(res, 400, { error: "Arte da oferta invalida ou muito grande." });
    return null;
  }
  if (messageHeadline.length > 80) {
    sendJson(res, 400, { error: "Mensagem personalizada muito grande." });
    return null;
  }
  return { shareImageDataUrl, messageHeadline };
}

export default async function handler(req, res) {
  if (handleExtensionCors(req, res, ["POST"])) return;
  if (!requireAdmin(req, res, { allowExtension: true })) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!requireUuid(req.query.id, res)) return;

  try {
    const action = String(req.body?.action || "publish-all");
    if (action === "record-channel") {
      const channel = String(req.body.channel || "").toUpperCase();
      const status = String(req.body.status || "").toUpperCase();
      if (channel !== "WHATSAPP" || !["SUCESSO", "ERRO"].includes(status)) return sendJson(res, 400, { error: "Histórico de publicação inválido." });
      await query(
        "INSERT INTO offer_publication_history (offer_id, channel, status, error_message) VALUES ($1,$2,$3,$4)",
        [req.query.id, channel, status, String(req.body.errorMessage || "").slice(0, 300) || null]
      );
      return sendJson(res, 201, { ok: true });
    }

    if (action === "publish-site") {
      const result = await publishOfferSiteById(req.query.id, { forceRepublish: req.body?.forceRepublish === true });
      return sendJson(res, result.ok ? (result.pending ? 202 : 200) : result.status || 500, result);
    }

    const payload = telegramPayload(req, res);
    if (!payload) return;
    if (action === "send-telegram") {
      const result = await sendOfferTelegramById(req.query.id, {
        ...payload,
        forceRetry: req.body?.forceTelegramRetry === true,
      });
      return sendJson(res, result.ok ? 200 : result.status || 500, result);
    }

    const result = await publishOfferById(req.query.id, {
      ...payload,
      forceRepublish: req.body?.forceRepublish === true,
      forceTelegramRetry: req.body?.forceTelegramRetry === true,
    });
    return sendJson(res, result.ok ? (result.pending ? 202 : 200) : result.status || 500, result);
  } catch (error) {
    return publicError(res, error);
  }
}
