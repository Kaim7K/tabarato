import { handleExtensionCors, requireAdmin, sendJson, methodNotAllowed, readJson, publicError } from "../../_lib/http.js";
import { createOffer, listOffers, validateOffer } from "../../_lib/offers.js";

export default async function handler(req, res) {
  if (handleExtensionCors(req, res, ["GET", "POST"])) return;
  if (!requireAdmin(req, res, { allowExtension: true })) return;

  try {
    if (req.method === "GET") {
      const offers = await listOffers({
        search: req.query.search || "",
        status: req.query.status || "",
        category: req.query.category || "",
      });
      return sendJson(res, 200, { offers });
    }

    if (req.method === "POST") {
      const input = await readJson(req);
      const errors = validateOffer(input);
      if (errors.length) return sendJson(res, 400, { error: errors.join(" "), errors });
      const offer = await createOffer(input);
      return sendJson(res, 201, { offer });
    }

    return methodNotAllowed(res, ["GET", "POST"]);
  } catch (error) {
    return publicError(res, error);
  }
}
