(() => {
  if (globalThis.TaBaratoBackgroundOperations) return;

  const LEASE_KEY = "tabarato_batch_owned_worker_lease_v3";
  const LEGACY_LEASE_KEYS = ["tabarato_batch_owned_worker_lease_v2", "tabarato_batch_worker_lease"];
  const JOURNAL_KEY = "tabarato_operation_journal_v1";
  const STALE_AFTER = 5 * 60 * 1000;
  const JOURNAL_LIMIT = 250;
  const TERMINAL = new Set(["completed", "failed", "cancelled", "skipped"]);
  const CHANNELS = ["site", "telegram", "whatsapp"];
  let mutationQueue = Promise.resolve();

  const normalizedIds = (values) => [...new Set((Array.isArray(values) ? values : [values])
    .map(Number)
    .filter(Number.isInteger))];

  function serialize(task) {
    const next = mutationQueue.then(task, task);
    mutationQueue = next.catch(() => {});
    return next;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function safeId(value) {
    return String(value || "").trim().replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 180);
  }

  function operationId(input = {}) {
    const explicit = safeId(input.id);
    if (explicit) return explicit;
    const parts = [input.marketplace, input.productId, input.price, input.coupon]
      .map((value) => safeId(value) || "none");
    return `${parts.join(":")}:${Date.now()}`;
  }

  function initialChannel(requested) {
    return {
      requested: Boolean(requested),
      status: requested ? "pending" : "skipped",
      attempts: 0,
      errorCode: "",
      errorMessage: "",
      updatedAt: nowIso(),
    };
  }

  function normalizeOperation(input = {}) {
    const requested = input.requestedChannels || {};
    const createdAt = input.createdAt || nowIso();
    return {
      id: operationId(input),
      kind: String(input.kind || "publish"),
      marketplace: String(input.marketplace || ""),
      productId: String(input.productId || ""),
      offerId: String(input.offerId || ""),
      status: String(input.status || "pending"),
      payload: input.payload && typeof input.payload === "object" ? input.payload : {},
      channels: {
        site: initialChannel(requested.site !== false),
        telegram: initialChannel(requested.telegram !== false),
        whatsapp: initialChannel(Boolean(requested.whatsapp)),
      },
      createdAt,
      updatedAt: input.updatedAt || createdAt,
      finishedAt: "",
    };
  }

  async function readJournal() {
    const stored = await chrome.storage.local.get(JOURNAL_KEY).catch(() => ({}));
    return Array.isArray(stored?.[JOURNAL_KEY]) ? stored[JOURNAL_KEY] : [];
  }

  async function writeJournal(entries) {
    const sorted = [...entries]
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
      .slice(0, JOURNAL_LIMIT);
    await chrome.storage.local.set({ [JOURNAL_KEY]: sorted });
    return sorted;
  }

  function calculateStatus(operation) {
    const requested = CHANNELS.map((name) => operation.channels?.[name]).filter((channel) => channel?.requested);
    if (!requested.length) return "completed";
    if (requested.every((channel) => channel.status === "completed")) return "completed";
    if (requested.some((channel) => channel.status === "running")) return "running";
    if (requested.some((channel) => channel.status === "pending" || channel.status === "retrying")) return "pending";
    if (requested.some((channel) => channel.status === "completed")) return "partial";
    if (requested.every((channel) => TERMINAL.has(channel.status))) return "failed";
    return operation.status || "pending";
  }

  function create(input) {
    return serialize(async () => {
      const journal = await readJournal();
      const normalized = normalizeOperation(input);
      const existing = journal.find((entry) => entry.id === normalized.id);
      if (existing) return existing;
      journal.unshift(normalized);
      await writeJournal(journal);
      return normalized;
    });
  }

  function patch(id, patchValue = {}) {
    return serialize(async () => {
      const journal = await readJournal();
      const index = journal.findIndex((entry) => entry.id === id);
      if (index < 0) throw new Error("Operacao nao encontrada.");
      const current = journal[index];
      const next = {
        ...current,
        ...patchValue,
        channels: { ...current.channels, ...(patchValue.channels || {}) },
        updatedAt: nowIso(),
      };
      next.status = calculateStatus(next);
      if (TERMINAL.has(next.status) || next.status === "completed") next.finishedAt = next.finishedAt || nowIso();
      journal[index] = next;
      await writeJournal(journal);
      return next;
    });
  }

  function updateChannel(id, channelName, patchValue = {}) {
    if (!CHANNELS.includes(channelName)) return Promise.reject(new Error("Canal de operacao invalido."));
    return serialize(async () => {
      const journal = await readJournal();
      const index = journal.findIndex((entry) => entry.id === id);
      if (index < 0) throw new Error("Operacao nao encontrada.");
      const operation = journal[index];
      const current = operation.channels[channelName] || initialChannel(true);
      const nextChannel = {
        ...current,
        ...patchValue,
        attempts: Number.isFinite(Number(patchValue.attempts))
          ? Number(patchValue.attempts)
          : current.attempts,
        updatedAt: nowIso(),
      };
      const next = {
        ...operation,
        channels: { ...operation.channels, [channelName]: nextChannel },
        updatedAt: nowIso(),
      };
      next.status = calculateStatus(next);
      if (next.status === "completed" || next.status === "failed") next.finishedAt = next.finishedAt || nowIso();
      journal[index] = next;
      await writeJournal(journal);
      return next;
    });
  }

  function list({ activeOnly = false, limit = 100 } = {}) {
    return readJournal().then((journal) => journal
      .filter((entry) => !activeOnly || !TERMINAL.has(entry.status) && entry.status !== "completed")
      .slice(0, Math.max(1, Math.min(250, Number(limit) || 100))));
  }

  function recoverInterrupted() {
    return serialize(async () => {
      const journal = await readJournal();
      let changed = 0;
      const recovered = journal.map((operation) => {
        let operationChanged = false;
        const channels = Object.fromEntries(CHANNELS.map((name) => {
          const channel = operation.channels?.[name] || initialChannel(false);
          if (channel.status !== "running") return [name, channel];
          operationChanged = true;
          return [name, {
            ...channel,
            status: "retrying",
            errorCode: "BROWSER_INTERRUPTED",
            errorMessage: "O navegador encerrou a etapa antes da confirmacao.",
            updatedAt: nowIso(),
          }];
        }));
        if (!operationChanged) return operation;
        changed += 1;
        const next = { ...operation, channels, status: "pending", updatedAt: nowIso(), finishedAt: "" };
        return next;
      });
      if (changed) await writeJournal(recovered);
      return { ok: true, recovered: changed };
    });
  }

  async function readLease() {
    const stored = await chrome.storage.session.get(LEASE_KEY).catch(() => ({}));
    return stored?.[LEASE_KEY] || { tabIds: [], updatedAt: 0 };
  }

  async function writeLease(tabIds) {
    const lease = { tabIds: normalizedIds(tabIds), updatedAt: Date.now() };
    await chrome.storage.session.set({ [LEASE_KEY]: lease }).catch(() => {});
    return lease;
  }

  async function migrateLegacyLease() {
    await chrome.storage.session.remove(LEGACY_LEASE_KEYS).catch(() => {});
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
    if (ids.length) await chrome.tabs.remove(ids).catch(() => {});
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
    create,
    heartbeat,
    list,
    migrateLegacyLease,
    patch,
    recoverInterrupted,
    stop,
    track,
    untrack,
    updateChannel,
  };
})();
