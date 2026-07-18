(() => {
  const STORAGE_KEY = "tabarato_extension_theme";
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  function savedTheme() {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  }

  function apply(theme, persist = false) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    if (persist) localStorage.setItem(STORAGE_KEY, theme);
    window.dispatchEvent(new CustomEvent("tabarato-theme-change", { detail: { theme } }));
    return theme;
  }

  apply(savedTheme() || (media.matches ? "dark" : "light"));
  media.addEventListener("change", (event) => {
    if (!savedTheme()) apply(event.matches ? "dark" : "light");
  });

  globalThis.TaBaratoTheme = {
    current: () => document.documentElement.dataset.theme,
    toggle: () => apply(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true),
  };
})();
