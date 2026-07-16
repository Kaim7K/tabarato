// @ts-nocheck
const ADMIN_AUTH = "tb_admin_logged_in";

export function isAdminLoggedIn() {
  return localStorage.getItem(ADMIN_AUTH) === "true";
}

export function setAdminLoggedIn(value) {
  if (value) localStorage.setItem(ADMIN_AUTH, "true");
  else localStorage.removeItem(ADMIN_AUTH);
}

export async function loginAdmin(username, password) {
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Falha no login.");
  setAdminLoggedIn(true);
  return payload;
}

export async function validateAdminSession() {
  if (!isAdminLoggedIn()) return false;
  const response = await fetch("/api/admin/login", { credentials: "include" }).catch(() => null);
  if (!response?.ok) {
    setAdminLoggedIn(false);
    return false;
  }
  return true;
}

export async function logoutAdmin() {
  await fetch("/api/admin/logout", { method: "POST", credentials: "include" }).catch(() => {});
  setAdminLoggedIn(false);
}
