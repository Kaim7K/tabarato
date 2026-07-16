import { createContext, useContext, useState, useEffect, useCallback } from "react";

const FavoritesContext = createContext({
  favorites: [],
  toggle: (_id) => {},
  isFavorite: (_id) => Boolean(false),
  replaceFavorites: (_ids) => {},
});
export const useFavorites = () => useContext(FavoritesContext);

const KEY = "ac_favorites";

export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    try { setFavorites(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch {}
    const sync = (event) => {
      if (event.key !== KEY) return;
      try { setFavorites(JSON.parse(event.newValue || "[]")); } catch {}
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const toggle = useCallback((id) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const isFavorite = useCallback((id) => favorites.includes(id), [favorites]);
  const replaceFavorites = useCallback((ids) => {
    const next = [...new Set(ids.filter((id) => typeof id === "string"))];
    localStorage.setItem(KEY, JSON.stringify(next));
    setFavorites(next);
  }, []);

  return (
    <FavoritesContext.Provider value={{ favorites, toggle, isFavorite, replaceFavorites }}>
      {children}
    </FavoritesContext.Provider>
  );
}
