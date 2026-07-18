const VISITOR_KEY = "tb_visitor_id";

export function visitorId() {
  let value = localStorage.getItem(VISITOR_KEY) || "";
  if (!/^[0-9a-f-]{36}$/i.test(value)) {
    value = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, value);
  }
  return value;
}

export function registerSiteVisit() {
  fetch("/api/ofertas?resource=visit", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitorId: visitorId() }),
  }).catch(() => {});
}
