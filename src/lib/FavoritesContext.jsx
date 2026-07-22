import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { readStoredArray, writeStoredJson } from "@/lib/browserStorage";

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
    setFavorites(readStoredArray(KEY).filter((id) => typeof id === "string"));
    const sync = (event) => {
      if (event.key !== KEY) return;
      try {
        const value = JSON.parse(event.newValue || "[]");
        setFavorites(Array.isArray(value) ? value.filter((id) => typeof id === "string") : []);
      } catch {
        setFavorites([]);
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const toggle = useCallback((id) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeStoredJson(KEY, next);
      return next;
    });
  }, []);

  const isFavorite = useCallback((id) => favorites.includes(id), [favorites]);
  const replaceFavorites = useCallback((ids) => {
    const next = [...new Set(ids.filter((id) => typeof id === "string"))];
    writeStoredJson(KEY, next);
    setFavorites(next);
  }, []);

  return (
    <FavoritesContext.Provider value={{ favorites, toggle, isFavorite, replaceFavorites }}>
      {children}
    </FavoritesContext.Provider>
  );
}
