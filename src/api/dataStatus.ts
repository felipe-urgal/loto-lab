import type { IncomingMessage, ServerResponse } from "node:http";
import { LOTTERY_CONFIGS } from "../lotteries/config.js";
import { PostgresContestRepository } from "../persistence/contestRepository.js";
import { sendJson } from "./http.js";
import type { ApiServerOptions } from "./app.js";

export async function serveDataStatus(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  if (method !== "GET" || url.pathname !== "/api/v1/data/status") return false;

  const repository = new PostgresContestRepository(options.pool);
  const items = await Promise.all(
    Object.keys(LOTTERY_CONFIGS).map((lottery) =>
      repository.getDataStatus(lottery as keyof typeof LOTTERY_CONFIGS),
    ),
  );
  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:5173";
  sendJson(response, 200, { items }, corsOrigin);
  return true;
}
