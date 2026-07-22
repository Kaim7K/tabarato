// @ts-nocheck
import { requestJson } from "@/lib/httpClient";

const ADMIN_AUTH = "tb_admin_logged_in";

const readAdminFlag = () => {
  try {
    return localStorage.getItem(ADMIN_AUTH) === "true";
  } catch {
    return false;
  }
};

export function isAdminLoggedIn() {
  return readAdminFlag();
}

export function setAdminLoggedIn(value) {
  try {
    if (value) localStorage.setItem(ADMIN_AUTH, "true");
    else localStorage.removeItem(ADMIN_AUTH);
  } catch {}
}

export async function loginAdmin(username, password) {
  const payload = await requestJson("/api/admin/login", {
    method: "POST",
    body: { username, password },
    fallbackMessage: "Falha no login.",
  });
  setAdminLoggedIn(true);
  return payload;
}

export async function validateAdminSession() {
  if (!isAdminLoggedIn()) return false;
  const valid = await requestJson("/api/admin/login").then(() => true).catch(() => false);
  if (!valid) {
    setAdminLoggedIn(false);
    return false;
  }
  return true;
}

export async function logoutAdmin() {
  await fetch("/api/admin/logout", { method: "POST", credentials: "include" }).catch(() => {});
  setAdminLoggedIn(false);
}
