import type { IncomingMessage, ServerResponse } from "node:http";
import type { ReconcileContestDataUseCase } from "../application/reconcileContestData.js";
import type { ApiServerOptions } from "./app.js";
import { ApiError, parseLottery, parsePositiveInt, sendJson, sendNoContent } from "./http.js";

export async function serveDataReconciliation(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
  reconciliation: ReconcileContestDataUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname !== "/api/v1/data/reconciliation") return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:5173";
  if (method === "OPTIONS") {
    sendNoContent(response, corsOrigin);
    return true;
  }
  if (method !== "GET") {
    throw new ApiError(405, "METHOD_NOT_ALLOWED", `${method} ${url.pathname} is not allowed`);
  }

  const lottery = parseLottery(url.searchParams.get("lottery"));
  if (lottery !== "mega-sena" && lottery !== "lotofacil") {
    throw new ApiError(
      400,
      "INVALID_ARGUMENT",
      "Secondary reconciliation currently supports mega-sena and lotofacil",
    );
  }
  const limit = parsePositiveInt(url.searchParams.get("limit"), "limit", {
    min: 1,
    max: 20,
    defaultValue: 10,
  });

  sendJson(response, 200, await reconciliation.execute(lottery, limit), corsOrigin);
  return true;
}