import { createContext, useContext, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

const SettingsContext = createContext({ settings: {}, refresh: () => {} });
export const useSettings = () => useContext(SettingsContext);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({});
  const [loaded, setLoaded] = useState(false);

  const applySettings = (map) => {
    if (map.primary_color) document.documentElement.style.setProperty("--brand-primary", map.primary_color);
    if (map.primary_color_dark) document.documentElement.style.setProperty("--brand-primary-dark", map.primary_color_dark);
  };

  const loadSettings = () => {
    base44.entities.Settings.list()
      .then((items) => {
        const map = {};
        items.forEach((s) => { map[s.key] = s.value; });
        setSettings(map);
        applySettings(map);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  };

  useEffect(() => { loadSettings(); }, []);

  return (
    <SettingsContext.Provider value={{ settings, refresh: loadSettings, loaded }}>
      {children}
    </SettingsContext.Provider>
  );
}