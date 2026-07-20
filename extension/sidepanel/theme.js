(() => {
  const STORAGE_KEY = "tabarato_extension_theme";
  const media = window.matchMedia("(prefers-color-scheme: dark)");

  function normalizedTheme(value) {
    return value === "light" || value === "dark" ? value : null;
  }

  function savedTheme() {
    return normalizedTheme(localStorage.getItem(STORAGE_KEY));
  }

  function apply(theme, persist = false) {
    const next = normalizedTheme(theme) || (media.matches ? "dark" : "light");
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    if (persist) {
      localStorage.setItem(STORAGE_KEY, next);
      chrome.storage?.local?.set({ [STORAGE_KEY]: next }).catch(() => {});
    }
    window.dispatchEvent(new CustomEvent("tabarato-theme-change", { detail: { theme: next } }));
    return next;
  }

  apply(savedTheme() || (media.matches ? "dark" : "light"));
  chrome.storage?.local?.get(STORAGE_KEY)
    .then((stored) => {
      const remote = normalizedTheme(stored?.[STORAGE_KEY]);
      if (remote && remote !== document.documentElement.dataset.theme) {
        localStorage.setItem(STORAGE_KEY, remote);
        apply(remote);
      }
    })
    .catch(() => {});

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== "local") return;
    const remote = normalizedTheme(changes[STORAGE_KEY]?.newValue);
    if (remote && remote !== document.documentElement.dataset.theme) {
      localStorage.setItem(STORAGE_KEY, remote);
      apply(remote);
    }
  });

  media.addEventListener("change", (event) => {
    if (!savedTheme()) apply(event.matches ? "dark" : "light");
  });

  globalThis.TaBaratoTheme = {
    current: () => document.documentElement.dataset.theme,
    toggle: () => apply(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true),
  };
})();
