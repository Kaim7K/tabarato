const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * @param {string} path
 * @param {{ method?: string, body?: unknown, signal?: AbortSignal, fallbackMessage?: string, credentials?: RequestCredentials }} options
 */
export async function requestJson(path, {
  method = "GET",
  body,
  signal,
  fallbackMessage = "Nao foi possivel concluir a requisicao.",
  credentials = "include",
} = {}) {
  const response = await fetch(path, {
    method,
    credentials,
    headers: JSON_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) throw Object.assign(new Error(payload.error || fallbackMessage), { status: response.status });
  return payload;
}

export function queryPath(path, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== "" && value != null && value !== false) search.set(key, String(value));
  });
  return `${path}${search.toString() ? `?${search}` : ""}`;
}
