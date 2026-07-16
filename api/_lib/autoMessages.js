import { query } from "./db.js";
import { sendTelegramText } from "./telegram.js";

export function mapAutoMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    isActive: row.is_active,
    intervalMinutes: row.interval_minutes,
    sortOrder: row.sort_order,
    nextSendAt: row.next_send_at,
    lastSentAt: row.last_sent_at,
    telegramMessageId: row.telegram_message_id || "",
    errorMessage: row.error_message || "",
    sendCount: row.send_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function validateAutoMessage(input) {
  const errors = [];
  if (!String(input.title || "").trim()) errors.push("Titulo e obrigatorio.");
  if (!String(input.message || "").trim()) errors.push("Mensagem e obrigatoria.");
  const interval = Number(input.intervalMinutes);
  if (!Number.isFinite(interval) || interval < 5) errors.push("Periodo deve ser de pelo menos 5 minutos.");
  if (input.nextSendAt && Number.isNaN(new Date(input.nextSendAt).getTime())) errors.push("Proximo envio invalido.");
  return errors;
}

function params(input) {
  return {
    title: String(input.title || "").trim(),
    message: String(input.message || "").trim(),
    is_active: input.isActive !== false,
    interval_minutes: Number(input.intervalMinutes || 1440),
    sort_order: Number(input.sortOrder || 0),
    next_send_at: input.nextSendAt || new Date().toISOString(),
  };
}

export async function listAutoMessages() {
  const result = await query("SELECT * FROM telegram_auto_messages ORDER BY sort_order ASC, created_at ASC");
  return result.rows.map(mapAutoMessage);
}

export async function createAutoMessage(input) {
  const data = params(input);
  const result = await query(
    `INSERT INTO telegram_auto_messages (title, message, is_active, interval_minutes, sort_order, next_send_at)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [data.title, data.message, data.is_active, data.interval_minutes, data.sort_order, data.next_send_at]
  );
  return mapAutoMessage(result.rows[0]);
}

export async function updateAutoMessage(id, input) {
  const data = params(input);
  const result = await query(
    `UPDATE telegram_auto_messages
     SET title=$1, message=$2, is_active=$3, interval_minutes=$4, sort_order=$5, next_send_at=$6, error_message=NULL
     WHERE id=$7
     RETURNING *`,
    [data.title, data.message, data.is_active, data.interval_minutes, data.sort_order, data.next_send_at, id]
  );
  return mapAutoMessage(result.rows[0]);
}

export async function deleteAutoMessage(id) {
  const result = await query("DELETE FROM telegram_auto_messages WHERE id=$1 RETURNING id", [id]);
  return Boolean(result.rows[0]);
}

export async function sendAutoMessageNow(id) {
  const found = await query("SELECT * FROM telegram_auto_messages WHERE id=$1", [id]);
  const item = mapAutoMessage(found.rows[0]);
  if (!item) return null;

  try {
    const sent = await sendTelegramText(item.message);
    const updated = await query(
      `UPDATE telegram_auto_messages
       SET last_sent_at=NOW(),
           next_send_at=NOW() + ($2 || ' minutes')::interval,
           telegram_message_id=$3,
           telegram_response=$4,
           error_message=NULL,
           send_count=send_count+1
       WHERE id=$1
       RETURNING *`,
      [item.id, item.intervalMinutes, sent.messageId, JSON.stringify(sent.response)]
    );
    return { ok: true, message: mapAutoMessage(updated.rows[0]) };
  } catch (error) {
    const message = error?.name === "AbortError" ? "Timeout ao enviar mensagem." : error.message || "Erro ao enviar mensagem.";
    const updated = await query("UPDATE telegram_auto_messages SET error_message=$2 WHERE id=$1 RETURNING *", [item.id, message]);
    return { ok: false, message: mapAutoMessage(updated.rows[0]), error: message };
  }
}

export async function publishDueAutoMessages(limit = 5) {
  const due = await query(
    `SELECT * FROM telegram_auto_messages
     WHERE is_active=TRUE AND next_send_at <= NOW()
     ORDER BY sort_order ASC, next_send_at ASC
     LIMIT $1`,
    [limit]
  );

  const results = [];
  for (const row of due.rows) {
    const item = mapAutoMessage(row);
    try {
      const sent = await sendTelegramText(item.message);
      const updated = await query(
        `UPDATE telegram_auto_messages
         SET last_sent_at=NOW(),
             next_send_at=NOW() + ($2 || ' minutes')::interval,
             telegram_message_id=$3,
             telegram_response=$4,
             error_message=NULL,
             send_count=send_count+1
         WHERE id=$1
         RETURNING *`,
        [item.id, item.intervalMinutes, sent.messageId, JSON.stringify(sent.response)]
      );
      results.push({ ok: true, message: mapAutoMessage(updated.rows[0]) });
    } catch (error) {
      const message = error?.name === "AbortError" ? "Timeout ao enviar mensagem." : error.message || "Erro ao enviar mensagem.";
      await query("UPDATE telegram_auto_messages SET error_message=$2 WHERE id=$1", [item.id, message]);
      results.push({ ok: false, id: item.id, error: message });
    }
  }
  return results;
}
