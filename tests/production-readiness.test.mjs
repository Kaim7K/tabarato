import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
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
