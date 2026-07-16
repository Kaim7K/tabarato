export const PUBLIC_OFFER_COLUMNS = `
  id, product_name, short_description, category, affiliate_link, platform,
  image_url, current_price, previous_price, extra_text, published_at,
  updated_at, created_at, clicks
`;

export function mapPublicOffer(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.product_name,
    description: row.short_description,
    category: row.category,
    affiliate_link: row.affiliate_link,
    platform: row.platform,
    image: row.image_url || "",
    price: Number(row.current_price),
    previous_price: row.previous_price == null ? null : Number(row.previous_price),
    benefit: row.short_description,
    reason: row.extra_text || "",
    score: 100,
    status: "published",
    published_date: row.published_at || row.updated_at || row.created_at,
    clicks: row.clicks || 0,
    is_featured: false,
    time_label: row.published_at
      ? new Date(row.published_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : "",
  };
}

export function setPublicCache(res, maxAge = 60) {
  res.setHeader("Cache-Control", `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 5}`);
}
