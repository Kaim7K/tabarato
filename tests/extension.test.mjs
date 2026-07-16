import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const extensionRoot = join(root, "extension");

function listFiles(dir, extension) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? listFiles(path, extension) : path.endsWith(extension) ? [path] : [];
  });
}

test("extension manifest is valid Manifest V3 with restricted product matches", () => {
  const manifest = JSON.parse(readFileSync(join(extensionRoot, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.service_worker, "background/service-worker.js");
  assert.equal(manifest.side_panel.default_path, "sidepanel/index.html");
  assert.ok(manifest.content_scripts[0].matches.some((match) => match.includes("mercadolivre")));
  assert.ok(manifest.content_scripts[0].matches.some((match) => match.includes("amazon")));
  assert.ok(manifest.content_scripts[0].matches.some((match) => match.includes("shopee")));
  assert.doesNotMatch(JSON.stringify(manifest.content_scripts), /<all_urls>/);
  const referencedFiles = [
    manifest.background.service_worker,
    manifest.side_panel.default_path,
    manifest.icons["128"],
    ...manifest.content_scripts.flatMap((entry) => entry.js),
  ];
  assert.ok(referencedFiles.every((path) => existsSync(join(extensionRoot, path))));
});

test("all extension JavaScript files have valid syntax", () => {
  listFiles(extensionRoot, ".js").forEach((path) => {
    assert.doesNotThrow(() => new vm.Script(readFileSync(path, "utf8"), { filename: path }));
  });
});

test("extension never embeds admin secrets or writes captured HTML", () => {
  const source = listFiles(extensionRoot, ".js").map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(source, /ADMIN_API_KEY/);
  assert.doesNotMatch(source, /innerHTML\s*=/);
  assert.match(source, /status: "RASCUNHO"/);
});

test("Mercado Livre capture waits for and requires the generated meli.la link", () => {
  const shared = readFileSync(join(extensionRoot, "content", "shared.js"), "utf8");
  const mercadoLivre = readFileSync(join(extensionRoot, "content", "stores", "mercado-livre.js"), "utf8");
  const sidePanel = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  assert.match(shared, /meli\\\.la/);
  assert.match(mercadoLivre, /prepareAffiliateLink/);
  assert.match(mercadoLivre, /tools\.waitFor\(generatedAffiliateLink\)/);
  assert.match(sidePanel, /Use o link meli\.la gerado pelo botao Compartilhar/);
});

test("extension publishes through the protected existing publisher", () => {
  const sidePanel = readFileSync(join(extensionRoot, "sidepanel", "app.js"), "utf8");
  const publishRoute = readFileSync(join(root, "api", "admin", "ofertas", "[id]", "publicar.js"), "utf8");
  assert.match(sidePanel, /status: "APROVADO"/);
  assert.match(sidePanel, /\/api\/admin\/ofertas\/\$\{created\.offer\.id\}\/publicar/);
  assert.match(sidePanel, /window\.confirm/);
  assert.match(publishRoute, /handleExtensionCors/);
  assert.match(publishRoute, /allowExtension: true/);
});
