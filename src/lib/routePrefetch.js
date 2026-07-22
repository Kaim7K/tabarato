const loaders = {
  alerts: () => import("@/pages/Alerts"),
  categories: () => import("@/pages/Categories"),
  compare: () => import("@/pages/Compare"),
  favorites: () => import("@/pages/Favorites"),
  radar: () => import("@/pages/Radar"),
  search: () => import("@/pages/SearchPage"),
};

const requested = new Set();

export function prefetchRoute(name) {
  if (requested.has(name) || !loaders[name]) return;
  requested.add(name);
  loaders[name]().catch(() => requested.delete(name));
}

export function prefetchProps(name) {
  return {
    onMouseEnter: () => prefetchRoute(name),
    onFocus: () => prefetchRoute(name),
  };
}
