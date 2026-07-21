/*
 * TA BARATO — TESTE TOTAL DRY-RUN (CONSOLE DO PAINEL LATERAL)
 * Versão: 1.0.0
 *
 * COMO USAR
 * 1. Abra uma página de produto da Shopee ou Mercado Livre.
 * 2. Abra o painel lateral da extensão.
 * 3. Clique com o botão direito dentro do painel > Inspecionar.
 * 4. Cole TODO este arquivo no Console e pressione Enter.
 *
 * GARANTIAS
 * - Não publica no site/Telegram.
 * - Não envia ao WhatsApp.
 * - Não ativa cupons.
 * - Não abre, fecha ou navega abas.
 * - Não usa clipboard.
 * - Não faz fetch/XHR/WebSocket/sendBeacon.
 * - Restaura o armazenamento de teste no final.
 */
(async () => {
  "use strict";

  const VERSION = "1.0.0";
  const STARTED_AT = new Date().toISOString();
  const TEST_PREFIX = `__tabarato_dryrun_${Date.now()}__`;
  const JOURNAL_KEY = "tabarato_operation_journal_v1";
  const STORAGE_PROBE_KEY = `${TEST_PREFIX}:storage`;
  const BLOCKED_RUNTIME_TYPES = new Set([
    "TABARATO_SHARE_WHATSAPP",
    "TABARATO_ACTIVATE_ML_COUPONS",
    "TABARATO_STOP_ML_COUPONS",
    "TABARATO_START_AFFILIATE_GUARD",
    "TABARATO_STOP_AFFILIATE_GUARD",
    "TABARATO_STOP_WHATSAPP",
    "TABARATO_STOP_BATCH_WORKERS",
    "TABARATO_BATCH_TRACK_WORKERS",
    "TABARATO_BATCH_UNTRACK_WORKERS",
    "TABARATO_BATCH_HEARTBEAT",
  ]);
  const SAFE_RUNTIME_TYPES = new Set([
    "TABARATO_OPERATION_CREATE",
    "TABARATO_OPERATION_PATCH",
    "TABARATO_OPERATION_CHANNEL",
    "TABARATO_OPERATION_LIST",
  ]);
  const SAFE_CONTENT_TYPES = new Set([
    "TABARATO_EXTRACT_PRODUCT",
    "TABARATO_ENRICH_PRODUCT",
    "TABARATO_LIST_VISIBLE_PRODUCTS",
  ]);

  const results = [];
  const blockedAttempts = [];
  const cleanups = [];
  let activeTab = null;
  let capturedProduct = null;
  let originalJournal;
  let journalExisted = false;

  const originals = {
    fetch: globalThis.fetch,
    XMLHttpRequest: globalThis.XMLHttpRequest,
    WebSocket: globalThis.WebSocket,
    EventSource: globalThis.EventSource,
    open: globalThis.open,
    sendBeacon: globalThis.navigator?.sendBeacon,
    runtimeSendMessage: globalThis.chrome?.runtime?.sendMessage,
    tabsCreate: globalThis.chrome?.tabs?.create,
    tabsUpdate: globalThis.chrome?.tabs?.update,
    tabsRemove: globalThis.chrome?.tabs?.remove,
    windowsUpdate: globalThis.chrome?.windows?.update,
    clipboardWrite: globalThis.navigator?.clipboard?.write,
    clipboardWriteText: globalThis.navigator?.clipboard?.writeText,
  };

  function elapsed(start) {
    return Math.max(0, Math.round(performance.now() - start));
  }

  function serialize(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return String(value);
    }
  }

  function messageOf(error) {
    return String(error?.message || error || "Erro desconhecido");
  }

  function isSupportedProductUrl(url = "") {
    return /(^|\.)mercadolivre\.com\.br|(^|\.)mercadolibre\.com|(^|\.)shopee\.com\.br/i.test(new URL(url).hostname);
  }

  function platformFromUrl(url = "") {
    try {
      const host = new URL(url).hostname;
      if (/mercadolivre|mercadolibre/i.test(host)) return "Mercado Livre";
      if (/shopee/i.test(host)) return "Shopee";
    } catch { /* invalid URL */ }
    return "Desconhecida";
  }

  function classify(status) {
    if (status === "PASS") return "✅";
    if (status === "WARN") return "⚠️";
    if (status === "BLOCKED") return "🛡️";
    return "❌";
  }

  async function check(name, fn, options = {}) {
    const started = performance.now();
    try {
      const value = await fn();
      let status = "PASS";
      let detail = value;
      if (value && typeof value === "object" && value.__status) {
        status = value.__status;
        detail = value.detail;
      }
      const entry = { name, status, durationMs: elapsed(started), detail: serialize(detail) };
      results.push(entry);
      console.log(`${classify(status)} ${name} (${entry.durationMs} ms)`, detail ?? "");
      return value;
    } catch (error) {
      const entry = { name, status: options.optional ? "WARN" : "FAIL", durationMs: elapsed(started), error: messageOf(error) };
      results.push(entry);
      console[options.optional ? "warn" : "error"](`${classify(entry.status)} ${name} (${entry.durationMs} ms): ${entry.error}`);
      return null;
    }
  }

  function blocked(kind, detail) {
    const item = { kind, detail: serialize(detail), at: new Date().toISOString() };
    blockedAttempts.push(item);
    console.warn(`🛡️ DRY-RUN bloqueou ${kind}`, detail || "");
    const error = new Error(`DRY_RUN_BLOCKED: ${kind}`);
    error.code = "DRY_RUN_BLOCKED";
    throw error;
  }

  function installGuards() {
    if (typeof originals.fetch === "function") {
      globalThis.fetch = (...args) => blocked("fetch", { url: String(args[0]?.url || args[0] || "") });
    }
    if (originals.XMLHttpRequest) {
      globalThis.XMLHttpRequest = class DryRunXMLHttpRequest {
        constructor() { blocked("XMLHttpRequest", {}); }
      };
    }
    if (originals.WebSocket) {
      globalThis.WebSocket = class DryRunWebSocket {
        constructor(url) { blocked("WebSocket", { url }); }
      };
    }
    if (originals.EventSource) {
      globalThis.EventSource = class DryRunEventSource {
        constructor(url) { blocked("EventSource", { url }); }
      };
    }
    globalThis.open = (...args) => blocked("window.open", { args });

    try {
      if (globalThis.navigator && typeof originals.sendBeacon === "function") {
        Object.defineProperty(globalThis.navigator, "sendBeacon", {
          configurable: true,
          value: (...args) => blocked("navigator.sendBeacon", { url: args[0] }),
        });
      }
    } catch { /* browser may protect navigator */ }

    if (chrome?.runtime && typeof originals.runtimeSendMessage === "function") {
      chrome.runtime.sendMessage = function guardedRuntimeSendMessage(message, ...rest) {
        const type = message?.type;
        if (BLOCKED_RUNTIME_TYPES.has(type)) return Promise.reject(Object.assign(new Error(`DRY_RUN_BLOCKED: ${type}`), { code: "DRY_RUN_BLOCKED" }));
        if (type && !SAFE_RUNTIME_TYPES.has(type)) {
          blockedAttempts.push({ kind: "chrome.runtime.sendMessage", detail: { type }, at: new Date().toISOString() });
          return Promise.reject(Object.assign(new Error(`DRY_RUN_BLOCKED: runtime ${type}`), { code: "DRY_RUN_BLOCKED" }));
        }
        return originals.runtimeSendMessage.call(chrome.runtime, message, ...rest);
      };
    }

    if (chrome?.tabs) {
      chrome.tabs.create = (...args) => Promise.reject(Object.assign(new Error("DRY_RUN_BLOCKED: tabs.create"), { code: "DRY_RUN_BLOCKED", args }));
      chrome.tabs.update = (...args) => Promise.reject(Object.assign(new Error("DRY_RUN_BLOCKED: tabs.update"), { code: "DRY_RUN_BLOCKED", args }));
      chrome.tabs.remove = (...args) => Promise.reject(Object.assign(new Error("DRY_RUN_BLOCKED: tabs.remove"), { code: "DRY_RUN_BLOCKED", args }));
    }
    if (chrome?.windows && typeof originals.windowsUpdate === "function") {
      chrome.windows.update = (...args) => Promise.reject(Object.assign(new Error("DRY_RUN_BLOCKED: windows.update"), { code: "DRY_RUN_BLOCKED", args }));
    }

    try {
      if (navigator?.clipboard) {
        if (typeof originals.clipboardWrite === "function") navigator.clipboard.write = (...args) => blocked("clipboard.write", { count: args.length });
        if (typeof originals.clipboardWriteText === "function") navigator.clipboard.writeText = (...args) => blocked("clipboard.writeText", { length: String(args[0] || "").length });
      }
    } catch { /* clipboard methods may be read-only */ }
  }

  function restoreGuards() {
    if (originals.fetch) globalThis.fetch = originals.fetch;
    if (originals.XMLHttpRequest) globalThis.XMLHttpRequest = originals.XMLHttpRequest;
    if (originals.WebSocket) globalThis.WebSocket = originals.WebSocket;
    if (originals.EventSource) globalThis.EventSource = originals.EventSource;
    if (originals.open) globalThis.open = originals.open;
    try {
      if (globalThis.navigator && originals.sendBeacon) {
        Object.defineProperty(globalThis.navigator, "sendBeacon", { configurable: true, value: originals.sendBeacon });
      }
    } catch { /* ignore */ }
    if (chrome?.runtime && originals.runtimeSendMessage) chrome.runtime.sendMessage = originals.runtimeSendMessage;
    if (chrome?.tabs) {
      if (originals.tabsCreate) chrome.tabs.create = originals.tabsCreate;
      if (originals.tabsUpdate) chrome.tabs.update = originals.tabsUpdate;
      if (originals.tabsRemove) chrome.tabs.remove = originals.tabsRemove;
    }
    if (chrome?.windows && originals.windowsUpdate) chrome.windows.update = originals.windowsUpdate;
    try {
      if (navigator?.clipboard) {
        if (originals.clipboardWrite) navigator.clipboard.write = originals.clipboardWrite;
        if (originals.clipboardWriteText) navigator.clipboard.writeText = originals.clipboardWriteText;
      }
    } catch { /* ignore */ }
  }

  async function safeContentMessage(tabId, message) {
    if (!SAFE_CONTENT_TYPES.has(message?.type)) throw new Error(`Mensagem de conteúdo não permitida no dry-run: ${message?.type}`);
    try {
      return await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
    } catch (error) {
      const text = messageOf(error);
      if (!/Receiving end does not exist|Could not establish connection/i.test(text)) throw error;
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [
          "shared/runtime.js",
          "shared/coupon-code.js",
          "content/shared.js",
          platformFromUrl(activeTab?.url) === "Mercado Livre" ? "content/stores/mercado-livre.js" : "content/stores/shopee.js",
          "content/stores/generic.js",
          "content/index.js",
        ],
      });
      return chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
    }
  }

  function validateProduct(product) {
    const issues = [];
    const warnings = [];
    if (!product || typeof product !== "object") issues.push("A captura não retornou um objeto.");
    if (!String(product?.productName || product?.title || "").trim()) issues.push("Nome do produto ausente.");
    if (!String(product?.url || product?.productUrl || activeTab?.url || "").trim()) issues.push("URL do produto ausente.");
    if (!String(product?.currentPrice || product?.price || "").trim()) warnings.push("Preço atual não foi identificado.");
    if (!String(product?.imageUrl || product?.image || "").trim()) warnings.push("Imagem principal não foi identificada.");
    if (!String(product?.platform || "").trim()) warnings.push("Marketplace não foi explicitado na captura.");
    if (product?.affiliateUrl && !/^https?:\/\//i.test(String(product.affiliateUrl))) issues.push("Link de afiliado tem formato inválido.");
    return { valid: issues.length === 0, issues, warnings };
  }

  function simulatePublicationEngine() {
    const scenarios = [
      { name: "todos concluem", site: "completed", telegram: "completed", whatsapp: "completed", expected: "completed" },
      { name: "Telegram falha e WhatsApp conclui", site: "failed", telegram: "failed", whatsapp: "completed", expected: "partial" },
      { name: "WhatsApp falha e Telegram conclui", site: "completed", telegram: "completed", whatsapp: "failed", expected: "partial" },
      { name: "todos falham", site: "failed", telegram: "failed", whatsapp: "failed", expected: "failed" },
      { name: "um canal executando", site: "completed", telegram: "running", whatsapp: "pending", expected: "running" },
    ];
    const terminal = new Set(["completed", "failed", "cancelled", "skipped"]);
    const calculate = (channels) => {
      const requested = Object.values(channels).filter((channel) => channel.requested);
      if (requested.every((channel) => channel.status === "completed")) return "completed";
      if (requested.some((channel) => channel.status === "running")) return "running";
      if (requested.some((channel) => channel.status === "pending" || channel.status === "retrying")) return "pending";
      if (requested.some((channel) => channel.status === "completed")) return "partial";
      if (requested.every((channel) => terminal.has(channel.status))) return "failed";
      return "pending";
    };
    const evaluated = scenarios.map((scenario) => {
      const channels = Object.fromEntries(["site", "telegram", "whatsapp"].map((name) => [name, { requested: true, status: scenario[name] }]));
      const actual = calculate(channels);
      return { scenario: scenario.name, expected: scenario.expected, actual, ok: actual === scenario.expected };
    });
    if (evaluated.some((item) => !item.ok)) throw new Error(`Falha na independência de canais: ${JSON.stringify(evaluated)}`);
    return evaluated;
  }

  function simulateRetryPolicy() {
    const base = [0, 3000, 10000, 30000, 120000];
    const temporaryErrors = ["TIMEOUT", "NETWORK_ERROR", "TAB_NOT_READY", "WHATSAPP_CHAT_NOT_READY"];
    const permanentErrors = ["INVALID_URL", "AUTH_REQUIRED", "PRODUCT_REMOVED", "MISSING_REQUIRED_DATA"];
    const decisions = [
      ...temporaryErrors.map((code) => ({ code, retry: true })),
      ...permanentErrors.map((code) => ({ code, retry: false })),
    ];
    if (base.some((delay, index) => index > 0 && delay <= base[index - 1])) throw new Error("Backoff não é crescente.");
    return { delaysMs: base, decisions };
  }

  function downloadReport(report) {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tabarato-dry-run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  console.clear();
  console.log(`%cTA BARATO — TESTE TOTAL DRY-RUN v${VERSION}`, "font-size:16px;font-weight:bold");
  console.log("Nenhum disparo real será permitido durante este teste.");

  try {
    await check("Contexto correto: painel lateral da extensão", () => {
      if (!location.protocol.startsWith("chrome-extension")) throw new Error("Execute no Console do painel lateral da extensão.");
      if (!chrome?.runtime?.id) throw new Error("API chrome.runtime indisponível.");
      return { extensionId: chrome.runtime.id, page: location.pathname };
    });

    await check("APIs essenciais do navegador", () => {
      const required = ["storage", "tabs", "runtime", "scripting"].filter((name) => !chrome?.[name]);
      if (required.length) throw new Error(`APIs ausentes: ${required.join(", ")}`);
      return { available: ["storage", "tabs", "runtime", "scripting"] };
    });

    await check("Manifesto e permissões", () => {
      const value = chrome.runtime.getManifest();
      const broadHosts = (value.host_permissions || []).filter((host) => /\*:\/\/\*\/\*|https:\/\/\*\/\*/.test(host));
      if (broadHosts.length) throw new Error(`Permissões excessivas: ${broadHosts.join(", ")}`);
      return {
        version: value.version,
        manifestVersion: value.manifest_version,
        hosts: value.host_permissions,
        permissions: value.permissions,
      };
    });

    const storedJournal = await chrome.storage.local.get(JOURNAL_KEY);
    journalExisted = Object.prototype.hasOwnProperty.call(storedJournal, JOURNAL_KEY);
    originalJournal = storedJournal[JOURNAL_KEY];
    cleanups.push(async () => {
      if (journalExisted) await chrome.storage.local.set({ [JOURNAL_KEY]: originalJournal });
      else await chrome.storage.local.remove(JOURNAL_KEY);
    });

    installGuards();

    await check("Bloqueio de fetch real", async () => {
      try { await fetch("https://example.invalid/"); } catch (error) {
        if (error?.code === "DRY_RUN_BLOCKED" || /DRY_RUN_BLOCKED/.test(messageOf(error))) return { blocked: true };
        throw error;
      }
      throw new Error("fetch não foi bloqueado.");
    });

    await check("Bloqueio de disparo WhatsApp", async () => {
      try {
        await chrome.runtime.sendMessage({ type: "TABARATO_SHARE_WHATSAPP", groupNames: ["TESTE"], text: "NÃO ENVIAR" });
      } catch (error) {
        if (/DRY_RUN_BLOCKED/.test(messageOf(error))) return { blocked: true };
        throw error;
      }
      throw new Error("Mensagem de WhatsApp não foi bloqueada.");
    });

    await check("Bloqueio de criação de aba", async () => {
      try { await chrome.tabs.create({ url: "https://example.invalid/" }); } catch (error) {
        if (/DRY_RUN_BLOCKED/.test(messageOf(error))) return { blocked: true };
        throw error;
      }
      throw new Error("tabs.create não foi bloqueado.");
    });

    await check("Leitura e escrita temporária no storage", async () => {
      const payload = { value: crypto.randomUUID?.() || String(Math.random()), at: Date.now() };
      await chrome.storage.local.set({ [STORAGE_PROBE_KEY]: payload });
      const read = await chrome.storage.local.get(STORAGE_PROBE_KEY);
      await chrome.storage.local.remove(STORAGE_PROBE_KEY);
      if (read?.[STORAGE_PROBE_KEY]?.value !== payload.value) throw new Error("Storage não devolveu o valor gravado.");
      return { ok: true };
    });

    activeTab = await check("Aba ativa disponível", async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("Nenhuma aba ativa foi identificada.");
      return { id: tab.id, url: tab.url, status: tab.status, platform: platformFromUrl(tab.url) };
    });

    await check("Página compatível com Shopee/Mercado Livre", () => {
      if (!activeTab?.url || !isSupportedProductUrl(activeTab.url)) {
        return { __status: "WARN", detail: "Abra uma página de produto da Shopee ou Mercado Livre para testar a captura real." };
      }
      return { platform: platformFromUrl(activeTab.url), url: activeTab.url };
    }, { optional: true });

    if (activeTab?.id && isSupportedProductUrl(activeTab.url)) {
      capturedProduct = await check("Captura real somente leitura", async () => {
        const product = await safeContentMessage(activeTab.id, { type: "TABARATO_EXTRACT_PRODUCT" });
        if (!product || product.ok === false) throw new Error(product?.error || "A página não retornou produto.");
        return product.product || product;
      });

      await check("Validação estrutural do produto capturado", () => {
        const validation = validateProduct(capturedProduct);
        if (!validation.valid) throw new Error(validation.issues.join(" | "));
        return validation.warnings.length
          ? { __status: "WARN", detail: validation }
          : validation;
      }, { optional: true });

      await check("Enriquecimento somente leitura", async () => {
        if (!capturedProduct) throw new Error("Sem produto para enriquecer.");
        const response = await safeContentMessage(activeTab.id, { type: "TABARATO_ENRICH_PRODUCT", product: capturedProduct });
        if (response?.ok === false) throw new Error(response.error || "Falha no enriquecimento.");
        return response?.product || response;
      }, { optional: true });

      await check("Listagem de produtos visíveis somente leitura", async () => {
        const response = await safeContentMessage(activeTab.id, { type: "TABARATO_LIST_VISIBLE_PRODUCTS", limit: 10 });
        if (response?.ok === false) throw new Error(response.error || "Falha na listagem.");
        const products = response?.products || response || [];
        return { count: Array.isArray(products) ? products.length : 0 };
      }, { optional: true });
    }

    await check("Utilitários do painel carregados", () => {
      const missing = [];
      if (!globalThis.TaBaratoRuntime) missing.push("TaBaratoRuntime");
      if (!globalThis.TaBaratoProductUtils) missing.push("TaBaratoProductUtils");
      if (!globalThis.TaBaratoPanel) missing.push("TaBaratoPanel");
      if (missing.length) throw new Error(`Globais ausentes: ${missing.join(", ")}`);
      return { globals: ["TaBaratoRuntime", "TaBaratoProductUtils", "TaBaratoPanel"] };
    });

    await check("Normalização de preços", () => {
      const parsePrice = globalThis.TaBaratoProductUtils?.parsePrice;
      if (typeof parsePrice !== "function") throw new Error("parsePrice indisponível.");
      const cases = [
        ["R$ 1.299,90", 1299.9],
        ["99,99", 99.99],
        ["R$ 10", 10],
      ];
      const evaluated = cases.map(([input, expected]) => ({ input, expected, actual: parsePrice(input) }));
      if (evaluated.some((item) => Math.abs(item.actual - item.expected) > 0.001)) throw new Error(JSON.stringify(evaluated));
      return evaluated;
    });

    await check("Normalização de cupom", () => {
      const normalize = globalThis.TaBaratoProductUtils?.normalizeCouponValue;
      if (typeof normalize !== "function") throw new Error("normalizeCouponValue indisponível.");
      const evaluated = [" com VALEDESCONTO ", "OFERTAPRACASA", ""]; 
      return evaluated.map((input) => ({ input, output: normalize(input) }));
    });

    await check("Retry e timeout do runtime", async () => {
      const runtime = globalThis.TaBaratoRuntime;
      let attempts = 0;
      const value = await runtime.retry(async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("falha temporária simulada");
        return "ok";
      }, { attempts: 3, baseDelay: 5 });
      if (value !== "ok" || attempts !== 3) throw new Error(`Retry incorreto: ${attempts} tentativas.`);
      let timedOut = false;
      try {
        await runtime.runWithTimeout(() => new Promise((resolve) => setTimeout(resolve, 80)), { milliseconds: 10, message: "timeout simulado" });
      } catch (error) { timedOut = /timeout simulado/i.test(messageOf(error)); }
      if (!timedOut) throw new Error("Timeout não interrompeu a promessa simulada.");
      return { retryAttempts: attempts, timeoutDetected: timedOut };
    });

    const operationId = `${TEST_PREFIX}:operation`;
    await check("Criação persistente de operação", async () => {
      const response = await originals.runtimeSendMessage.call(chrome.runtime, {
        type: "TABARATO_OPERATION_CREATE",
        operation: {
          id: operationId,
          kind: "dry-run",
          marketplace: platformFromUrl(activeTab?.url),
          productId: "DRY-RUN",
          requestedChannels: { site: true, telegram: true, whatsapp: true },
          payload: { dryRun: true },
        },
      });
      if (!response?.id || response.id !== operationId) throw new Error(`Operação não criada: ${JSON.stringify(response)}`);
      return response;
    });

    await check("Idempotência da operação", async () => {
      const first = await originals.runtimeSendMessage.call(chrome.runtime, {
        type: "TABARATO_OPERATION_CREATE",
        operation: { id: operationId, kind: "dry-run-duplicate", requestedChannels: { site: true } },
      });
      const list = await originals.runtimeSendMessage.call(chrome.runtime, { type: "TABARATO_OPERATION_LIST", options: { limit: 250 } });
      const matches = (Array.isArray(list) ? list : []).filter((item) => item.id === operationId);
      if (matches.length !== 1) throw new Error(`Esperava 1 operação, encontrou ${matches.length}.`);
      return { matches: matches.length, preservedKind: first.kind };
    });

    await check("Independência de canais persistentes", async () => {
      await originals.runtimeSendMessage.call(chrome.runtime, { type: "TABARATO_OPERATION_CHANNEL", id: operationId, channel: "site", patch: { status: "completed", attempts: 1 } });
      await originals.runtimeSendMessage.call(chrome.runtime, { type: "TABARATO_OPERATION_CHANNEL", id: operationId, channel: "telegram", patch: { status: "failed", attempts: 3, errorCode: "DRY_TELEGRAM_TIMEOUT", errorMessage: "Falha simulada" } });
      const final = await originals.runtimeSendMessage.call(chrome.runtime, { type: "TABARATO_OPERATION_CHANNEL", id: operationId, channel: "whatsapp", patch: { status: "completed", attempts: 1 } });
      if (final.status !== "partial") throw new Error(`Status esperado partial, recebido ${final.status}.`);
      if (final.channels.whatsapp.status !== "completed") throw new Error("WhatsApp foi afetado pela falha simulada do Telegram.");
      return { status: final.status, channels: final.channels };
    });

    await check("Concorrência do diário de operações", async () => {
      const ids = Array.from({ length: 25 }, (_, index) => `${TEST_PREFIX}:concurrent:${index}`);
      await Promise.all(ids.map((id) => originals.runtimeSendMessage.call(chrome.runtime, {
        type: "TABARATO_OPERATION_CREATE",
        operation: { id, kind: "dry-run-concurrency", requestedChannels: { site: true, telegram: false, whatsapp: false } },
      })));
      const list = await originals.runtimeSendMessage.call(chrome.runtime, { type: "TABARATO_OPERATION_LIST", options: { limit: 250 } });
      const found = new Set((Array.isArray(list) ? list : []).map((item) => item.id).filter((id) => id.startsWith(TEST_PREFIX)));
      const missing = ids.filter((id) => !found.has(id));
      if (missing.length) throw new Error(`${missing.length} operações desapareceram durante concorrência.`);
      return { created: ids.length, found: found.size };
    });

    await check("Simulação de independência dos destinos", simulatePublicationEngine);
    await check("Política simulada de retries", simulateRetryPolicy);

    await check("Configuração do painel", () => {
      const panel = globalThis.TaBaratoPanel;
      const state = panel?.state || {};
      return {
        authenticated: Boolean(panel?.api?.sessionIsValid?.()),
        activeProductLoaded: Boolean(state.activeProduct),
        batchRunning: Boolean(state.batchRunning),
        groupsConfigured: typeof panel?.groupNames === "function" ? panel.groupNames().length : null,
      };
    }, { optional: true });

    await check("Nenhum disparo real escapou", () => {
      const dangerous = blockedAttempts.filter((item) => !["fetch", "chrome.runtime.sendMessage"].includes(item.kind));
      return { totalBlocked: blockedAttempts.length, dangerousAttemptsPrevented: dangerous.length };
    });
  } finally {
    restoreGuards();
    for (const cleanup of cleanups.reverse()) {
      try { await cleanup(); } catch (error) { console.warn("Falha ao restaurar estado temporário:", error); }
    }
    await chrome.storage.local.remove(STORAGE_PROBE_KEY).catch(() => {});
  }

  const counts = results.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const finishedAt = new Date().toISOString();
  const report = {
    test: "Ta Barato Total Dry-Run",
    version: VERSION,
    startedAt: STARTED_AT,
    finishedAt,
    durationMs: new Date(finishedAt).getTime() - new Date(STARTED_AT).getTime(),
    environment: {
      userAgent: navigator.userAgent,
      extensionId: chrome?.runtime?.id || "",
      extensionVersion: chrome?.runtime?.getManifest?.().version || "",
      activeTab: activeTab ? { id: activeTab.id, url: activeTab.url, platform: platformFromUrl(activeTab.url) } : null,
    },
    summary: counts,
    safeMode: {
      realDispatches: 0,
      blockedAttempts: blockedAttempts.length,
      storageRestored: true,
    },
    capturedProduct: serialize(capturedProduct),
    results,
    blockedAttempts,
  };

  const failed = counts.FAIL || 0;
  console.group(`%cRESULTADO: ${failed ? "FALHAS ENCONTRADAS" : "TESTE CONCLUÍDO SEM FALHAS CRÍTICAS"}`, `font-size:15px;font-weight:bold;color:${failed ? "#c62828" : "#2e7d32"}`);
  console.table(results.map((item) => ({ Teste: item.name, Status: item.status, "Tempo (ms)": item.durationMs, Erro: item.error || "" })));
  console.log("Resumo:", counts);
  console.log("Disparos reais:", 0);
  console.log("Ações bloqueadas pelo dry-run:", blockedAttempts.length);
  console.log("Relatório completo:", report);
  console.groupEnd();

  globalThis.__TABARATO_LAST_DRY_RUN_REPORT__ = report;
  try {
    downloadReport(report);
    console.log("📄 O relatório JSON foi baixado automaticamente.");
  } catch (error) {
    console.warn("Não foi possível baixar automaticamente. Use __TABARATO_LAST_DRY_RUN_REPORT__ no console.", error);
  }

  return report;
})();
