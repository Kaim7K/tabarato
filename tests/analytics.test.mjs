import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isValidVisitorId, visitRejectionReason } from "../api/_lib/analytics.js";

const visitorId = "8e188cec-6fcb-4c96-9f97-a8b984ea2ec1";

function request(headers = {}) {
  return { headers: { "user-agent": "Mozilla/5.0 Chrome/126 Safari/537.36", "sec-fetch-site": "same-origin", ...headers } };
}

test("social analytics accepts a visible human visit", () => {
  assert.equal(isValidVisitorId(visitorId), true);
  assert.equal(visitRejectionReason(request(), { elapsedMs: 1400, visibility: "visible", webdriver: false }, { minimumVisibleMs: 1200 }), "");
});

test("social analytics rejects bots, previews and unconfirmed views", () => {
  assert.equal(visitRejectionReason(request({ "user-agent": "TelegramBot/1.0" }), { elapsedMs: 2000 }), "automated");
  assert.equal(visitRejectionReason(request({ "sec-purpose": "prefetch" }), { elapsedMs: 2000 }), "automated");
  assert.equal(visitRejectionReason(request(), { elapsedMs: 500, visibility: "visible" }, { minimumVisibleMs: 1200 }), "unconfirmed");
  assert.equal(visitRejectionReason(request(), { elapsedMs: 2000, visibility: "hidden" }, { minimumVisibleMs: 1200 }), "hidden");
});

test("social visit route excludes admins and deduplicates visitors by day", () => {
  const route = readFileSync(new URL("../api/ofertas/index.js", import.meta.url), "utf8");
  assert.match(route, /resource === "social-visit"/);
  assert.match(route, /isAdminAuthorized\(req\)/);
  assert.match(route, /ON CONFLICT \(visitor_id, visit_day\) DO NOTHING/);
  assert.match(route, /VERCEL_ENV !== "production"/);
});

test("admin dashboard exposes isolated social visitor metrics", () => {
  const route = readFileSync(new URL("../api/admin/ofertas/index.js", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../src/features/admin/AdminDashboard.jsx", import.meta.url), "utf8");
  assert.match(route, /COUNT\(DISTINCT visitor_id\) FROM social_page_visits/);
  assert.match(route, /socialVisitsToday/);
  assert.match(dashboard, /Visitantes da \/social/);
});
