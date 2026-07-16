import { handleExtensionCors, requireAdmin, sendJson, methodNotAllowed, readJson, publicError } from "../../_lib/http.js";
import { createOffer, listOffers, validateOffer } from "../../_lib/offers.js";
import { createCategory, listCategories, removeCategory } from "../../_lib/categories.js";

export default async function handler(req, res) {
  if (handleExtensionCors(req, res, ["GET", "POST", "DELETE"])) return;
  if (!requireAdmin(req, res, { allowExtension: true })) return;

  try {
    if (req.method === "GET") {
      const offers = await listOffers({
        search: req.query.search || "",
        status: req.query.status || "",
        category: req.query.category || "",
      });
      const categories = await listCategories();
      return sendJson(res, 200, { offers, categories });
    }

    if (req.method === "POST") {
      const input = await readJson(req);
      if (input.resource === "category") {
        const category = await createCategory(input.name);
        return sendJson(res, 201, { category });
      }
      const errors = validateOffer(input);
      if (errors.length) return sendJson(res, 400, { error: errors.join(" "), errors });
      const offer = await createOffer(input);
      return sendJson(res, 201, { offer });
    }

    if (req.method === "DELETE" && req.query.resource === "category") {
      await removeCategory(req.query.slug || "");
      return sendJson(res, 200, { ok: true });
    }

    return methodNotAllowed(res, ["GET", "POST", "DELETE"]);
  } catch (error) {
    return publicError(res, error);
  }
}
