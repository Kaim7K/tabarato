import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeSocialLink, sanitizeSocialStyle } from "../api/_lib/social.js";

test("social style accepts supported options and clamps rounding", () => {
  const style = sanitizeSocialStyle({
    backgroundColor: "#ff5a1f",
    gradientEnabled: true,
    gradientStart: "#112233",
    gradientEnd: "#445566",
    borderRadius: 90,
    size: "large",
    alignment: "center",
    shadow: "strong",
  });

  assert.equal(style.backgroundColor, "#FF5A1F");
  assert.equal(style.gradientEnabled, true);
  assert.equal(style.borderRadius, 40);
  assert.equal(style.size, "large");
  assert.equal(style.alignment, "center");
});

test("social style drops unsafe colors and unsupported values", () => {
  const style = sanitizeSocialStyle({ backgroundColor: "url(javascript:alert(1))", size: "giant", hoverEffect: "spin" });
  assert.equal(style.backgroundColor, "");
  assert.equal(style.size, "default");
  assert.equal(style.hoverEffect, "lift");
});

test("social links accept structural items without a destination", () => {
  const item = sanitizeSocialLink({ label: "Ofertas por categoria", itemType: "divider", style: {} });
  assert.equal(item.url, "");
  assert.equal(item.itemType, "divider");
});

test("social links reject an unsafe destination", () => {
  assert.throws(
    () => sanitizeSocialLink({ label: "Link inseguro", url: "javascript:alert(1)", itemType: "button" }),
    /HTTPS valido/
  );
});

test("social links validate publication windows", () => {
  assert.throws(
    () => sanitizeSocialLink({ label: "Oferta", url: "https://example.com", startsAt: "2026-08-02T10:00:00Z", endsAt: "2026-08-01T10:00:00Z" }),
    /data final/
  );
});
