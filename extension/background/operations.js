(() => {
  if (globalThis.TaBaratoBackgroundOperations) return;

  const STORAGE_KEY = "tabarato_batch_owned_worker_lease_v2";
  const LEGACY_STORAGE_KEY = "tabarato_batch_worker_lease";
  const STALE_AFTER = 5 * 60 * 1000;
  let mutationQueue = Promise.resolve();

  const normalizedIds = (values) => [...new Set((Array.isArray(values) ? values : [values])
    .map(Number)
    .filter(Number.isInteger))];

  function serialize(task) {
    const next = mutationQueue.then(task, task);
    mutationQueue = next.catch(() => {});
    return next;
  }

  async function readLease() {
    const stored = await chrome.storage.session.get(STORAGE_KEY).catch(() => ({}));
    return stored?.[STORAGE_KEY] || { tabIds: [], updatedAt: 0 };
  }

  async function writeLease(tabIds) {
    const lease = { tabIds: normalizedIds(tabIds), updatedAt: Date.now() };
    await chrome.storage.session.set({ [STORAGE_KEY]: lease }).catch(() => {});
    return lease;
  }

  async function migrateLegacyLease() {
    // Versões antigas misturavam abas criadas pela extensão e abas do usuário.
    // O registro legado é descartado sem fechar nada para proteger as abas abertas.
    await chrome.storage.session.remove(LEGACY_STORAGE_KEY).catch(() => {});
  }

  function track(tabIds) {
    return serialize(async () => {
      const current = await readLease();
      return writeLease([...current.tabIds, ...normalizedIds(tabIds)]);
    });
  }

  function untrack(tabIds) {
    return serialize(async () => {
      const removing = new Set(normalizedIds(tabIds));
      const current = await readLease();
      return writeLease(current.tabIds.filter((id) => !removing.has(id)));
    });
  }

  function heartbeat(tabIds = []) {
    return serialize(async () => {
      const current = await readLease();
      const explicit = normalizedIds(tabIds);
      return writeLease(explicit.length ? explicit : current.tabIds);
    });
  }

  async function closeTabs(tabIds) {
    const ids = normalizedIds(tabIds);
    if (!ids.length) return;
    await chrome.tabs.remove(ids).catch(() => {});
  }

  async function stopUnlocked() {
    const current = await readLease();
    await writeLease([]);
    await closeTabs(current.tabIds);
    return { ok: true, closed: current.tabIds.length };
  }

  function stop() {
    return serialize(stopUnlocked);
  }

  function cleanupStale() {
    return serialize(async () => {
      const current = await readLease();
      if (!current.tabIds.length || Date.now() - Number(current.updatedAt || 0) < STALE_AFTER) {
        return { ok: true, closed: 0 };
      }
      return stopUnlocked();
    });
  }

  globalThis.TaBaratoBackgroundOperations = {
    cleanupStale,
    heartbeat,
    migrateLegacyLease,
    stop,
    track,
    untrack,
  };
})();
