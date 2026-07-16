import { requireAdmin, methodNotAllowed, readJson, sendJson } from "../_lib/http.js";
import { fetchProductPreview } from "../_lib/productPreview.js";

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (req.method !== "POST") return methodNotAllowed(res, ["POST"]);

  try {
    const { link } = await readJson(req);
    if (!link) return sendJson(res, 400, { error: "Informe o link do produto." });

    const product = await fetchProductPreview(link);
    if (!product.productName && !product.currentPrice) {
      return sendJson(res, 422, { error: "Nao consegui identificar os dados do produto nesse link." });
    }

    return sendJson(res, 200, { product });
  } catch (error) {
    console.error(error?.message || error);
    return sendJson(res, 422, {
      error: error.name === "AbortError"
        ? "Tempo esgotado ao consultar a loja."
        : error.message || "Nao foi possivel preencher automaticamente.",
    });
  }
}
