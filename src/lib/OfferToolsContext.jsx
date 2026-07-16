import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const COMPARE_KEY = "tb_compare";
const ALERTS_KEY = "tb_price_alerts";
const INTERESTS_KEY = "tb_category_interests";
const createId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const readStored = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
};

const OfferToolsContext = createContext(null);

export function OfferToolsProvider({ children }) {
  const [compareIds, setCompareIds] = useState(() => readStored(COMPARE_KEY, []));
  const [alerts, setAlerts] = useState(() => readStored(ALERTS_KEY, []));
  const [interests, setInterests] = useState(() => readStored(INTERESTS_KEY, {}));

  useEffect(() => localStorage.setItem(COMPARE_KEY, JSON.stringify(compareIds)), [compareIds]);
  useEffect(() => localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts)), [alerts]);
  useEffect(() => localStorage.setItem(INTERESTS_KEY, JSON.stringify(interests)), [interests]);

  const toggleCompare = useCallback((id) => {
    setCompareIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  }, []);

  const removeCompare = useCallback((id) => {
    setCompareIds((current) => current.filter((item) => item !== id));
  }, []);

  const createAlert = useCallback((offer, targetPrice) => {
    const price = Number(targetPrice);
    if (!Number.isFinite(price) || price <= 0) return false;
    setAlerts((current) => [
      ...current.filter((item) => item.offerId !== offer.id),
      {
        id: createId(),
        type: "price",
        offerId: offer.id,
        name: offer.name,
        image: offer.image || "",
        targetPrice: price,
        initialPrice: offer.price,
        createdAt: new Date().toISOString(),
      },
    ]);
    return true;
  }, []);

  const createSearchAlert = useCallback((criteria) => {
    const key = `${criteria.query || ""}|${criteria.category || ""}|${criteria.maxPrice || ""}`;
    setAlerts((current) => [
      ...current.filter((item) => item.searchKey !== key),
      { id: createId(), type: "search", searchKey: key, ...criteria, createdAt: new Date().toISOString() },
    ]);
  }, []);

  const removeAlert = useCallback((id) => setAlerts((current) => current.filter((item) => item.id !== id)), []);

  const recordInterest = useCallback((category) => {
    if (!category) return;
    setInterests((current) => ({ ...current, [category]: (current[category] || 0) + 1 }));
  }, []);

  const preferredCategories = useMemo(
    () => Object.entries(interests).sort((a, b) => b[1] - a[1]).map(([category]) => category),
    [interests]
  );

  const value = useMemo(() => ({
    compareIds,
    toggleCompare,
    removeCompare,
    isComparing: (id) => compareIds.includes(id),
    alerts,
    createAlert,
    createSearchAlert,
    removeAlert,
    recordInterest,
    preferredCategories,
  }), [alerts, compareIds, createAlert, createSearchAlert, preferredCategories, recordInterest, removeAlert, removeCompare, toggleCompare]);

  return <OfferToolsContext.Provider value={value}>{children}</OfferToolsContext.Provider>;
}

export const useOfferTools = () => useContext(OfferToolsContext);
