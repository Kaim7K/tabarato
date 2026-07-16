export const PUBLIC_OFFER_COLUMNS = `
  id, product_name, short_description, category, affiliate_link, platform,
  image_url, current_price, previous_price, coupon, extra_text, published_at,
  coupon_discount_percent, availability_status, last_checked_at,
  updated_at, created_at, clicks, shares, favorites
`;

export function mapPublicOffer(row) {
  if (!row) return null;
  const price = Number(row.current_price);
  const previousPrice = row.previous_price == null ? null : Number(row.previous_price);
  const discount = previousPrice > price ? Math.round(((previousPrice - price) / previousPrice) * 100) : 0;
  const couponDiscountPercent = Number(row.coupon_discount_percent || 0);
  const finalPrice = couponDiscountPercent > 0 ? price * (1 - couponDiscountPercent / 100) : price;
  return {
    id: row.id,
    name: row.product_name,
    description: row.short_description,
    category: row.category,
    affiliate_link: row.affiliate_link,
    platform: row.platform,
    image: row.image_url || "",
    price,
    previous_price: previousPrice,
    discount,
    savings: previousPrice > price ? previousPrice - price : 0,
    coupon: row.coupon || "",
    coupon_discount_percent: couponDiscountPercent,
    final_price: Math.round(finalPrice * 100) / 100,
    availability: row.availability_status || "DESCONHECIDO",
    last_checked_at: row.last_checked_at || null,
    benefit: row.short_description,
    reason: row.extra_text || "",
    score: Math.min(100, 45 + discount + Math.round(Math.log10((row.clicks || 0) + 1) * 12)),
    status: "published",
    published_date: row.published_at || row.updated_at || row.created_at,
    clicks: row.clicks || 0,
    shares: row.shares || 0,
    favorites: row.favorites || 0,
    is_featured: false,
    time_label: row.published_at
      ? new Date(row.published_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : "",
  };
}

export function setPublicCache(res, maxAge = 60) {
  res.setHeader("Cache-Control", `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 5}`);
}
