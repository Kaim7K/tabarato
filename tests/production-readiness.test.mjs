import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function listJsFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return listJsFiles(path);
    return path.endsWith(".js") ? [path] : [];
  });
}

test("Vercel Hobby function count stays within the 12 function limit", () => {
  const functionFiles = listJsFiles(join(root, "api")).filter((path) => !path.includes(`${join("api", "_lib")}`));
  assert.ok(functionFiles.length <= 12, `Expected at most 12 serverless functions, found ${functionFiles.length}`);
});

test("public HTML includes core SEO metadata", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  assert.match(html, /<meta name="description"/);
  assert.match(html, /property="og:title"/);
  assert.match(html, /name="twitter:card"/);
  assert.match(html, /<html lang="pt-BR"/);
});

test("admin password is not hardcoded in the login function", () => {
  const login = readFileSync(join(root, "api", "admin", "login.js"), "utf8");
  assert.doesNotMatch(login, /Argolo@28/);
  assert.match(login, /process\.env\.ADMIN_PASSWORD/);
});

test("site does not expose an installable app version", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  const main = readFileSync(join(root, "src", "main.jsx"), "utf8");
  assert.doesNotMatch(html, /rel="manifest"/);
  assert.doesNotMatch(main, /serviceWorker\.register/);
  assert.equal(existsSync(join(root, "public", "manifest.json")), false);
  assert.equal(existsSync(join(root, "public", "sw.js")), false);
});

test("public routes include radar, comparison and alerts", () => {
  const app = readFileSync(join(root, "src", "App.jsx"), "utf8");
  assert.match(app, /path="\/radar"/);
  assert.match(app, /path="\/comparar"/);
  assert.match(app, /path="\/alertas"/);
});

test("comparison removal uses a dedicated action", () => {
  const context = readFileSync(join(root, "src", "lib", "OfferToolsContext.jsx"), "utf8");
  const compare = readFileSync(join(root, "src", "pages", "Compare.jsx"), "utf8");
  assert.match(context, /const removeCompare = useCallback/);
  assert.match(compare, /removeCompare\(id\)/);
  assert.match(compare, /setOffers\(\(current\) => current\.filter/);
});
