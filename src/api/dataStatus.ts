import type { IncomingMessage, ServerResponse } from "node:http";
import type { GetDataStatusUseCase } from "../application/dataStatus.js";
import { sendJson } from "./http.js";

export interface DataStatusApiOptions {
  corsOrigin?: string;
}

export async function serveDataStatus(
  request: IncomingMessage,
  response: ServerResponse,
  options: DataStatusApiOptions,
  dataStatus: GetDataStatusUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  if (method !== "GET" || url.pathname !== "/api/v1/data/status") return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:5173";
  sendJson(response, 200, await dataStatus.execute(), corsOrigin);
  return true;
}
