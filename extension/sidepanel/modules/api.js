(() => {
  const panel = globalThis.TaBaratoPanel;
  if (!panel || panel.api) return;

  const { LIMITS, STORAGE, elements, setStatus, showToast, state } = panel;
  const runtime = globalThis.TaBaratoRuntime;
  const brandConfig = globalThis.TaBaratoConfig;

  function normalizeBaseUrl(value) {
    const url = new URL(String(value || "").trim());
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
      throw new Error("Use HTTPS. HTTP so e permitido localmente.");
    }
    return brandConfig.migrateBaseUrl(url.origin);
  }

  function sessionIsValid(session = state.session) {
    return Boolean(
      session?.token
      && session?.baseUrl
      && Number.isFinite(new Date(session.expiresAt).getTime())
      && new Date(session.expiresAt).getTime() > Date.now()
    );
  }

  async function saveSession(value) {
    state.session = value;
    await globalThis.TaBaratoExtensionApi.storage.local.set({ [STORAGE.session]: value });
  }

  async function clearSession() {
    state.session = null;
    state.activeProduct = null;
    await globalThis.TaBaratoExtensionApi.storage.local.remove(STORAGE.session);
  }

  async function request(path, options = {}) {
    if (!sessionIsValid()) throw new Error("Conecte a extensao ao painel.");
    const method = String(options.method || "GET").toUpperCase();
    const execute = async () => {
      const response = await runtime.fetchWithTimeout(`${state.session.baseUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${state.session.token}`,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      }, options.timeout || LIMITS.requestTimeout);
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        await clearSession();
        renderAuth();
        throw new Error("Sua sessao expirou. Entre novamente.");
      }
      if (!response.ok) {
        const error = new Error(payload.error || `O painel respondeu com status ${response.status}.`);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }
      return payload;
    };

    const safeToRetry = method === "GET" || method === "HEAD";
    if (!safeToRetry || options.retry === false) return execute();
    return runtime.retry(execute, {
      attempts: Math.max(1, Number(options.attempts) || 2),
      delays: [450],
      signal: options.signal,
      shouldRetry: (error) => !Number(error?.status) || Number(error.status) >= 500,
    });
  }

  async function requestOriginPermission(baseUrl) {
    const origin = `${new URL(baseUrl).origin}/*`;
    const contains = await globalThis.TaBaratoExtensionApi.permissions.contains({ origins: [origin] });
    if (contains) return;
    const granted = await globalThis.TaBaratoExtensionApi.permissions.request({ origins: [origin] });
    if (!granted) throw new Error("Autorize o acesso ao dominio do seu site.");
  }

  async function authenticate(username, password, baseUrlValue) {
    const baseUrl = normalizeBaseUrl(baseUrlValue);
    await requestOriginPermission(baseUrl);
    const response = await runtime.fetchWithTimeout(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: String(username || "").trim(), password, client: "extension" }),
    }, LIMITS.requestTimeout, "O painel demorou para responder.");
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.token || !payload.expiresAt) {
      throw new Error(payload.error || "Login nao autorizado.");
    }
    await saveSession({ baseUrl, token: payload.token, expiresAt: payload.expiresAt });
    await globalThis.TaBaratoExtensionApi.storage.local.set({ [STORAGE.lastBaseUrl]: baseUrl });
    return state.session;
  }

  async function openAdminPanel() {
    const stored = await globalThis.TaBaratoExtensionApi.storage.local.get(STORAGE.lastBaseUrl);
    const candidate = state.session?.baseUrl || elements.baseUrl.value || stored[STORAGE.lastBaseUrl];
    if (!candidate) {
      elements.baseUrl.focus();
      throw new Error("Informe o endereco do site.");
    }
    const baseUrl = normalizeBaseUrl(candidate);
    const targetUrl = `${baseUrl}/admin`;
    const existing = (await globalThis.TaBaratoExtensionApi.tabs.query({ url: `${baseUrl}/admin*` }))[0];
    if (existing?.id) {
      if (globalThis.TaBaratoExtensionApi.windows?.update && existing.windowId) {
        await globalThis.TaBaratoExtensionApi.windows.update(existing.windowId, { focused: true });
      }
      await globalThis.TaBaratoExtensionApi.tabs.update(existing.id, { active: true });
      return;
    }
    await globalThis.TaBaratoExtensionApi.tabs.create({ url: targetUrl });
  }

  function renderAuth() {
    const connected = sessionIsValid();
    elements.setup.classList.toggle("hidden", connected);
    elements.editor.classList.toggle("hidden", !connected);
    setStatus(connected ? "Conectado" : "Desconectado", connected ? "success" : "neutral");
    if (connected) panel.catalog?.synchronize().catch((error) => runtime.reportError("sync-categories", error));
  }

  async function restoreSession(stored) {
    state.session = stored[STORAGE.session] || null;
    const migratedBaseUrl = brandConfig.migrateBaseUrl(state.session?.baseUrl || stored[STORAGE.lastBaseUrl]);
    if (state.session?.baseUrl && state.session.baseUrl !== migratedBaseUrl) {
      state.session = { ...state.session, baseUrl: migratedBaseUrl };
      await globalThis.TaBaratoExtensionApi.storage.local.set({ [STORAGE.session]: state.session, [STORAGE.lastBaseUrl]: migratedBaseUrl });
    } else if (stored[STORAGE.lastBaseUrl] !== migratedBaseUrl) {
      await globalThis.TaBaratoExtensionApi.storage.local.set({ [STORAGE.lastBaseUrl]: migratedBaseUrl });
    }
    elements.baseUrl.value = migratedBaseUrl;
    if (state.session && !sessionIsValid()) await clearSession();
    return state.session;
  }

  panel.api = {
    authenticate,
    clearSession,
    normalizeBaseUrl,
    openAdminPanel,
    renderAuth,
    request,
    restoreSession,
    sessionIsValid,
    showToast,
  };
})();
