const VISITOR_KEY = "tb_visitor_id";

const readStorage = (storage, key) => {
  try {
    return storage.getItem(key) || "";
  } catch {
    return "";
  }
};

const writeStorage = (storage, key, value) => {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const removeStorage = (storage, key) => {
  try {
    storage.removeItem(key);
  } catch {}
};

const createVisitorId = () => globalThis.crypto?.randomUUID?.()
  || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });

export function visitorId() {
  let value = readStorage(localStorage, VISITOR_KEY);
  if (!/^[0-9a-f-]{36}$/i.test(value)) {
    value = createVisitorId();
    writeStorage(localStorage, VISITOR_KEY, value);
  }
  return value;
}

export function registerSiteVisit() {
  fetch("/api/ofertas?resource=visit", {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitorId: visitorId() }),
  }).catch(() => {});
}

export function registerSocialVisit() {
  if (navigator.webdriver) return () => {};

  const day = new Date().toISOString().slice(0, 10);
  const sessionKey = `tb_social_visit_${day}`;
  if (readStorage(sessionStorage, sessionKey)) return () => {};

  let timer;
  let stopped = false;
  const startedAt = performance.now();

  const send = () => {
    if (stopped || document.visibilityState !== "visible" || readStorage(sessionStorage, sessionKey)) return;
    const elapsedMs = Math.round(performance.now() - startedAt);
    if (elapsedMs < 1200) {
      timer = window.setTimeout(send, 1200 - elapsedMs);
      return;
    }

    writeStorage(sessionStorage, sessionKey, "pending");
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
      if (!response.ok) removeStorage(sessionStorage, sessionKey);
      else writeStorage(sessionStorage, sessionKey, "sent");
    }).catch(() => removeStorage(sessionStorage, sessionKey));
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
