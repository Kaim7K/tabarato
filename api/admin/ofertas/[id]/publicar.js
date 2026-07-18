import { query } from "../../../_lib/db.js";
import { handleExtensionCors, requireAdmin, requireUuid, sendJson, methodNotAllowed, publicError } from "../../../_lib/http.js";
import { publishOfferById } from "../../../_lib/publisher.js";

export default async function handler(req, res) {
  if (handleExtensionCors(req, res, ["POST"])) return;
  if (!requireAdmin(req, res, { allowExtension: true })) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);
  if (!requireUuid(req.query.id, res)) return;

  try {
    if (req.body?.action === "record-channel") {
      const channel = String(req.body.channel || "").toUpperCase();
      const status = String(req.body.status || "").toUpperCase();
      if (channel !== "WHATSAPP" || !["SUCESSO", "ERRO"].includes(status)) return sendJson(res, 400, { error: "Histórico de publicação inválido." });
      await query(
        "INSERT INTO offer_publication_history (offer_id, channel, status, error_message) VALUES ($1,$2,$3,$4)",
        [req.query.id, channel, status, String(req.body.errorMessage || "").slice(0, 300) || null]
      );
      return sendJson(res, 201, { ok: true });
    }
    const shareImageDataUrl = String(req.body?.shareImageDataUrl || "");
    if (shareImageDataUrl && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/i.test(shareImageDataUrl) || shareImageDataUrl.length > 3_500_000)) {
      return sendJson(res, 400, { error: "Arte da oferta invalida ou muito grande." });
    }
    const result = await publishOfferById(req.query.id, {
      shareImageDataUrl,
      forceRepublish: req.body?.forceRepublish === true,
    });
    if (!result.ok) return sendJson(res, result.status || 500, result);
    return sendJson(res, 200, result);
  } catch (error) {
    return publicError(res, error);
  }
}
