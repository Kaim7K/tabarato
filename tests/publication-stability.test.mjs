import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const root = process.cwd();
const extensionRoot = join(root, "extension");
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

function listJavaScript(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listJavaScript(path) : path.endsWith(".js") ? [path] : [];
  });
}

test("browser packages use compatible manifests and a shared WebExtensions API", () => {
  const chromium = JSON.parse(read("extension", "manifest.json"));
  const firefox = JSON.parse(read("extension", "manifest.firefox.json"));
  const safari = JSON.parse(read("extension", "manifest.safari.json"));
  const runtime = read("extension", "shared", "runtime.js");
  const main = read("extension", "background", "main.js");

  assert.equal(chromium.background.service_worker, "background/service-worker.js");
  assert.ok(chromium.permissions.includes("sidePanel"));
  assert.ok(chromium.permissions.includes("offscreen"));
  assert.ok(chromium.permissions.includes("debugger"));

  assert.equal(firefox.background.scripts[0], "shared/runtime.js");
  assert.equal(firefox.sidebar_action.default_panel, "sidepanel/index.html");
  assert.ok(!firefox.permissions.some((permission) => ["sidePanel", "offscreen", "debugger"].includes(permission)));

  assert.equal(safari.background.service_worker, "background/service-worker.js");
  assert.ok(!safari.permissions.some((permission) => ["sidePanel", "offscreen", "debugger"].includes(permission)));

  assert.match(runtime, /globalThis\.browser \|\| globalThis\.chrome/);
  assert.match(main, /api\.sidePanel\?\.open/);
  assert.match(main, /api\.sidebarAction\?\.open/);
  assert.match(main, /sidepanel\/index\.html/);

  const directChromeReferences = listJavaScript(extensionRoot)
    .flatMap((path) => readFileSync(path, "utf8").match(/\bchrome\./g) || []);
  assert.equal(directChromeReferences.length, 0);
});

test("publication separates site, Telegram and WhatsApp without a shared blocking barrier", () => {
  const publishing = read("extension", "sidepanel", "modules", "publishing.js");
  const route = read("api", "admin", "ofertas", "[id]", "publicar.js");
  const publisher = read("api", "_lib", "publisher.js");
  const media = read("extension", "sidepanel", "modules", "media.js");

  assert.match(publishing, /action: "publish-site"/);
  assert.match(publishing, /action: "send-telegram"/);
  assert.match(publishing, /Promise\.allSettled\(\[siteTask, whatsappTask\]\)/);
  assert.doesNotMatch(publishing, /Promise\.allSettled\(\[siteTask, telegramTask, whatsappTask\]\)/);
  assert.match(publishing, /telegramTracker\.state === "pending"/);
  assert.match(publishing, /runtime\.delay\(350\)/);

  assert.match(route, /action === "publish-site"/);
  assert.match(route, /action === "send-telegram"/);
  assert.match(publisher, /export async function publishOfferSiteById/);
  assert.match(publisher, /export async function sendOfferTelegramById/);
  assert.match(publisher, /SET status='PUBLICADO'/);
  assert.match(publisher, /jsonb_build_object\('state','sending'/);
  assert.match(publisher, /currentState === "uncertain"/);
  assert.match(publisher, /evitar duplicidade/);

  assert.match(media, /prepared = \{ file: null, imageDataUrl: "", imageCacheKey: "" \}/);
  assert.match(media, /prepared\.file\?\.name \|\| "oferta\.png"/);
});

test("WhatsApp continues after one group fails and retries only safe stages", async () => {
  const source = read("extension", "background", "whatsapp.js");
  const attempts = new Map();
  const processed = [];
  const tab = { id: 10, windowId: 20, url: "https://web.whatsapp.com/", status: "complete" };

  const api = {
    tabs: {
      query: async () => [tab],
      create: async () => tab,
      update: async () => tab,
      sendMessage: async (_tabId, message) => {
        if (message.type === "TABARATO_WHATSAPP_PING") return { ok: true, ready: true };
        if (message.type === "TABARATO_WHATSAPP_CANCEL") return { ok: true };
        const count = (attempts.get(message.groupName) || 0) + 1;
        attempts.set(message.groupName, count);
        processed.push(`${message.groupName}:${count}`);
        if (message.groupName === "Grupo A") {
          return { ok: false, error: "Falha depois da confirmacao", stage: "send-confirmation", safeToRetry: false };
        }
        if (message.groupName === "Grupo B" && count === 1) {
          return { ok: false, error: "Busca ainda carregando", stage: "select-chat", safeToRetry: true };
        }
        return { ok: true };
      },
    },
    windows: { update: async () => ({}) },
    scripting: { executeScript: async () => ({}) },
  };
  const runtime = {
    delay: async () => {},
    errorMessage: (error) => String(error?.message || error),
    reportError: () => {},
    waitForTabComplete: async () => tab,
    withTimeout: async (promise) => promise,
  };
  const context = {
    TaBaratoExtensionApi: api,
    TaBaratoRuntime: runtime,
    TaBaratoBackgroundClipboard: { writeImage: async () => false },
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "background/whatsapp.js" });

  const result = await context.TaBaratoBackgroundWhatsApp.send({
    groupNames: ["Grupo A", "Grupo B", "Grupo C"],
    text: "Oferta",
    imageDataUrl: "",
  });

  assert.equal(result.successful, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.partial, true);
  assert.deepEqual(processed, ["Grupo A:1", "Grupo B:1", "Grupo B:2", "Grupo C:1"]);
});

test("WhatsApp falls back to text when image clipboard APIs are unavailable", async () => {
  const source = read("extension", "background", "whatsapp.js");
  const payloads = [];
  const tab = { id: 11, windowId: 21, url: "https://web.whatsapp.com/", status: "complete" };
  const api = {
    tabs: {
      query: async () => [tab],
      create: async () => tab,
      update: async () => tab,
      sendMessage: async (_tabId, message) => {
        if (message.type === "TABARATO_WHATSAPP_PING") return { ok: true, ready: true };
        if (message.type === "TABARATO_WHATSAPP_CANCEL") return { ok: true };
        payloads.push(message);
        if (message.hasImage) return { ok: false, error: "Clipboard de imagem indisponivel", stage: "prepare-clipboard", safeToRetry: true };
        return { ok: true };
      },
    },
    windows: { update: async () => ({}) },
    scripting: { executeScript: async () => ({}) },
  };
  const context = {
    TaBaratoExtensionApi: api,
    TaBaratoRuntime: {
      delay: async () => {},
      errorMessage: (error) => String(error?.message || error),
      reportError: () => {},
      waitForTabComplete: async () => tab,
      withTimeout: async (promise) => promise,
    },
    TaBaratoBackgroundClipboard: { writeImage: async () => false },
  };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "background/whatsapp.js" });

  const result = await context.TaBaratoBackgroundWhatsApp.send({
    groupNames: ["Grupo sem imagem"],
    text: "Oferta",
    imageDataUrl: "data:image/png;base64,AAAA",
    fileName: "oferta.png",
  });

  assert.equal(result.successful, 1);
  assert.equal(result.results[0].imageSkipped, true);
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].hasImage, true);
  assert.equal(payloads[1].hasImage, false);
});

test("Telegram has bounded requests and does not retry an uncertain timeout", () => {
  const telegram = read("api", "_lib", "telegram.js");
  const publisher = read("api", "_lib", "publisher.js");
  assert.match(telegram, /attempts = 2, timeoutMs = 15000/);
  assert.match(telegram, /TELEGRAM_TIMEOUT_UNCERTAIN/);
  assert.match(telegram, /if \(error\?\.name === "AbortError"\)[\s\S]+throw timeoutError/);
  assert.match(publisher, /state = failure\.uncertain \? "uncertain" : "failed"/);
  assert.match(publisher, /telegram_message_id IS NULL/);
});
