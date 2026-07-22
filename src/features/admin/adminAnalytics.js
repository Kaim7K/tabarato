import { telegramStatuses } from "@/lib/telegramOffersApi";
import { number, statusLabels } from "@/features/admin/adminOfferConfig";

export function buildAdminAnalytics(offers, categories, siteMetrics) {
  const byStatus = telegramStatuses.map((item) => ({
    name: statusLabels[item] || item,
    value: offers.filter((offer) => offer.status === item).length,
    status: item,
  })).filter((item) => item.value > 0);

  const byCategory = categories.map((item) => ({
    name: item,
    ofertas: offers.filter((offer) => offer.category === item).length,
  })).filter((item) => item.ofertas > 0);

  const published = offers.filter((offer) => offer.status === "PUBLICADO");
  const scheduled = offers.filter((offer) => offer.status === "AGENDADO");
  const totalClicks = offers.reduce((sum, offer) => sum + number(offer.clicks), 0);
  const totalShares = offers.reduce((sum, offer) => sum + number(offer.shares), 0);
  const totalFavorites = offers.reduce((sum, offer) => sum + number(offer.favorites), 0);
  const publicationCount = offers.reduce((sum, offer) => sum + number(offer.publicationCount), 0);
  const totalValue = published.reduce((sum, offer) => sum + number(offer.currentPrice), 0);
  const discounts = offers.map((offer) => {
    const previous = number(offer.previousPrice);
    const current = number(offer.currentPrice);
    return previous > current && current > 0 ? Math.round(((previous - current) / previous) * 100) : 0;
  }).filter(Boolean);

  return {
    byStatus,
    byCategory,
    total: offers.length,
    published: published.length,
    scheduled: scheduled.length,
    errors: offers.filter((offer) => offer.status === "ERRO").length,
    drafts: offers.filter((offer) => offer.status === "RASCUNHO").length,
    totalClicks,
    totalShares,
    totalFavorites,
    publicationCount,
    uniqueVisitors: siteMetrics.uniqueVisitors,
    visits: siteMetrics.visits,
    socialUniqueVisitors: siteMetrics.socialUniqueVisitors,
    socialVisits: siteMetrics.socialVisits,
    socialVisitsToday: siteMetrics.socialVisitsToday,
    socialVisits7d: siteMetrics.socialVisits7d,
    topOffers: [...offers].sort((left, right) => number(right.clicks) - number(left.clicks)).slice(0, 5),
    byPlatform: [...new Set(offers.map((offer) => offer.platform).filter(Boolean))].map((name) => ({
      name,
      offers: offers.filter((offer) => offer.platform === name).length,
      clicks: offers.filter((offer) => offer.platform === name).reduce((sum, offer) => sum + number(offer.clicks), 0),
    })).sort((left, right) => right.clicks - left.clicks),
    averageDiscount: discounts.length ? Math.round(discounts.reduce((left, right) => left + right, 0) / discounts.length) : 0,
    averageTicket: published.length ? totalValue / published.length : 0,
    nextScheduled: scheduled
      .filter((offer) => offer.scheduledAt)
      .sort((left, right) => new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime())
      .slice(0, 4),
  };
}
