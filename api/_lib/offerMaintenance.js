import { query } from "./db.js";
import { fetchProductPreview } from "./productPreview.js";

export async function refreshPublishedOffers(limit = 5) {
  const due = await query(
    `SELECT id, affiliate_link, current_price
     FROM telegram_offers
     WHERE status='PUBLICADO'
       AND (last_checked_at IS NULL OR last_checked_at < NOW() - INTERVAL '12 hours')
     ORDER BY last_checked_at ASC NULLS FIRST, published_at DESC
     LIMIT $1`,
    [limit]
  );
  const results = [];
  for (const offer of due.rows) {
    try {
      const product = await fetchProductPreview(offer.affiliate_link);
      if (product.availabilityStatus === "INDISPONIVEL") {
        await query("UPDATE telegram_offers SET status='EXPIRADO', availability_status='INDISPONIVEL', last_checked_at=NOW(), last_check_error=NULL WHERE id=$1", [offer.id]);
        results.push({ id: offer.id, ok: true, expired: true });
        continue;
      }
      const price = Number(product.currentPrice);
      if (!Number.isFinite(price) || price <= 0) throw new Error("Preço atual não encontrado.");
      await query(
        `UPDATE telegram_offers SET
          previous_price=CASE WHEN current_price<>$2 THEN current_price ELSE previous_price END,
          current_price=$2,
          image_url=COALESCE(NULLIF($3, ''), image_url),
          availability_status='DISPONIVEL', last_checked_at=NOW(), last_check_error=NULL
         WHERE id=$1`,
        [offer.id, price, product.imageUrl || ""]
      );
      results.push({ id: offer.id, ok: true, changed: Number(offer.current_price) !== price, price });
    } catch (error) {
      const message = String(error?.message || "Falha na verificação").slice(0, 300);
      await query("UPDATE telegram_offers SET last_checked_at=NOW(), last_check_error=$2 WHERE id=$1", [offer.id, message]);
      results.push({ id: offer.id, ok: false, error: message });
    }
  }
  return results;
}
