import { requireAdmin, sendJson, methodNotAllowed, publicError } from "../../_lib/http.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHANNEL_ID;
    if (!token || !chatId) return sendJson(res, 500, { error: "Telegram não configurado." });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "✅ Bot do Tá Barato conectado com sucesso!",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      return sendJson(res, 502, { error: payload?.description || "Erro ao testar conexão com Telegram." });
    }
    return sendJson(res, 200, { ok: true, messageId: payload.result?.message_id });
  } catch (error) {
    return publicError(res, error, "Erro ao testar conexão com Telegram.");
  }
}
