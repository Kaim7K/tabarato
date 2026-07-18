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

export function registerSocialVisit() {
  if (navigator.webdriver) return () => {};

  const day = new Date().toISOString().slice(0, 10);
  const sessionKey = `tb_social_visit_${day}`;
  if (sessionStorage.getItem(sessionKey)) return () => {};

  let timer;
  let stopped = false;
  const startedAt = performance.now();

  const send = () => {
    if (stopped || document.visibilityState !== "visible" || sessionStorage.getItem(sessionKey)) return;
    const elapsedMs = Math.round(performance.now() - startedAt);
    if (elapsedMs < 1200) {
      timer = window.setTimeout(send, 1200 - elapsedMs);
      return;
    }

    sessionStorage.setItem(sessionKey, "pending");
    fetch("/api/ofertas?resource=social-visit", {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorId: visitorId(),
        elapsedMs,
        visibility: document.visibilityState,
        webdriver: navigator.webdriver === true,
      }),
    }).then((response) => {
      if (!response.ok) sessionStorage.removeItem(sessionKey);
      else sessionStorage.setItem(sessionKey, "sent");
    }).catch(() => sessionStorage.removeItem(sessionKey));
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") send();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);
  timer = window.setTimeout(send, 1200);

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
