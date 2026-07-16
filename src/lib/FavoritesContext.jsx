import { createContext, useContext, useState, useEffect, useCallback } from "react";

const FavoritesContext = createContext({ favorites: [], toggle: () => {}, isFavorite: () => false });
export const useFavorites = () => useContext(FavoritesContext);

const KEY = "ac_favorites";

export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    try { setFavorites(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch {}
  }, []);

  const toggle = useCallback((id) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isFavorite = useCallback((id) => favorites.includes(id), [favorites]);

  return (
    <FavoritesContext.Provider value={{ favorites, toggle, isFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}