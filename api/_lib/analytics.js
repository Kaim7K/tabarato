const VISITOR_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AUTOMATED_AGENT = /bot|crawler|spider|headless|lighthouse|preview|prerender|slurp|facebookexternalhit|telegrambot|whatsapp|google-inspectiontool|uptimerobot/i;
const AUTOMATED_PURPOSE = /prefetch|preview|prerender/i;

export function isValidVisitorId(value) {
  return VISITOR_UUID.test(String(value || ""));
}

export function visitRejectionReason(req, input = {}, { minimumVisibleMs = 0 } = {}) {
  const agent = String(req.headers["user-agent"] || "").trim();
  const purpose = String(req.headers["sec-purpose"] || req.headers.purpose || "");
  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();

  if (!agent || AUTOMATED_AGENT.test(agent) || AUTOMATED_PURPOSE.test(purpose)) return "automated";
  if (fetchSite === "cross-site") return "cross-site";
  if (input.webdriver === true) return "automated";
  if (input.visibility && input.visibility !== "visible") return "hidden";
  if (minimumVisibleMs > 0 && Number(input.elapsedMs || 0) < minimumVisibleMs) return "unconfirmed";
  return "";
}
