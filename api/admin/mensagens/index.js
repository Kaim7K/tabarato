import { createAutoMessage, deleteAutoMessage, listAutoMessages, sendAutoMessageNow, updateAutoMessage, validateAutoMessage } from "../../_lib/autoMessages.js";
import { requireAdmin, requireUuid, sendJson, methodNotAllowed, readJson, publicError } from "../../_lib/http.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  try {
    if (req.method === "GET") {
      const messages = await listAutoMessages();
      return sendJson(res, 200, { messages });
    }

    if (req.method === "POST") {
      if (req.query.action === "send") {
        const id = req.query.id;
        if (!requireUuid(id, res)) return;
        const result = await sendAutoMessageNow(id);
        if (!result) return sendJson(res, 404, { error: "Mensagem nao encontrada." });
        if (!result.ok) return sendJson(res, 500, { error: result.error || "Erro ao enviar mensagem.", message: result.message });
        return sendJson(res, 200, { ok: true, message: result.message });
      }

      const input = await readJson(req);
      const errors = validateAutoMessage(input);
      if (errors.length) return sendJson(res, 400, { error: errors.join(" "), errors });
      const message = await createAutoMessage(input);
      return sendJson(res, 201, { message });
    }

    if (req.method === "PATCH") {
      const id = req.query.id;
      if (!requireUuid(id, res)) return;
      const input = await readJson(req);
      const errors = validateAutoMessage(input);
      if (errors.length) return sendJson(res, 400, { error: errors.join(" "), errors });
      const message = await updateAutoMessage(id, input);
      return message ? sendJson(res, 200, { message }) : sendJson(res, 404, { error: "Mensagem nao encontrada." });
    }

    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!requireUuid(id, res)) return;
      const ok = await deleteAutoMessage(id);
      return ok ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: "Mensagem nao encontrada." });
    }

    return methodNotAllowed(res, ["GET", "POST", "PATCH", "DELETE"]);
  } catch (error) {
    return publicError(res, error);
  }
}
