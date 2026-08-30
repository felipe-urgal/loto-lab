import type { IncomingMessage, ServerResponse } from "node:http";
import {
  StrategyLotteryImmutableError,
  type StrategyCatalogUseCase,
} from "../application/strategyCatalog.js";
import type { ApiServerOptions } from "./app.js";
import {
  ApiError,
  isRecord,
  parseLottery,
  parsePositiveInt,
  readJsonBody,
  sendJson,
  sendNoContent,
} from "./http.js";

function requiredString(value: unknown, field: string, maxLength = 160): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new ApiError(400, "INVALID_ARGUMENT", `${field} must be a non-empty string up to ${maxLength} characters`);
  }
  return value.trim();
}

export async function serveStrategies(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
  catalog: StrategyCatalogUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  const isRoute = pathname === "/api/v1/strategies"
    || pathname.startsWith("/api/v1/strategies/")
    || pathname.startsWith("/api/v1/strategy-versions/");
  if (!isRoute) return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:3000";

  try {
    if (method === "OPTIONS") {
      sendNoContent(response, corsOrigin);
      return true;
    }

    if (method === "GET" && pathname === "/api/v1/strategies") {
      const lotteryParam = url.searchParams.get("lottery");
      const lottery = lotteryParam === null ? undefined : parseLottery(lotteryParam);
      sendJson(response, 200, { items: await catalog.list(lottery) }, corsOrigin);
      return true;
    }

    if (method === "POST" && pathname === "/api/v1/strategies") {
      const body = await readJsonBody(request);
      const slug = requiredString(body.slug, "slug", 100);
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new ApiError(400, "INVALID_ARGUMENT", "slug must contain lowercase letters, numbers and hyphens only");
      }
      const lottery = parseLottery(body.lottery);
      const name = requiredString(body.name, "name");
      const methodologyVersion = requiredString(body.methodologyVersion, "methodologyVersion", 80);
      if (body.config !== undefined && !isRecord(body.config)) {
        throw new ApiError(400, "INVALID_ARGUMENT", "config must be a JSON object");
      }
      const strategy = await catalog.upsert({
        slug,
        lottery,
        name,
        methodologyVersion,
        config: body.config ?? {},
      });
      sendJson(response, 201, strategy, corsOrigin);
      return true;
    }

    const versionsMatch = /^\/api\/v1\/strategies\/([^/]+)\/versions$/.exec(pathname);
    if (method === "GET" && versionsMatch) {
      const slug = decodeURIComponent(versionsMatch[1]!);
      const result = await catalog.listVersions(slug);
      if (!result) throw new ApiError(404, "STRATEGY_NOT_FOUND", `Strategy ${slug} was not found`);
      sendJson(response, 200, result, corsOrigin);
      return true;
    }

    const versionMatch = /^\/api\/v1\/strategy-versions\/(\d+)$/.exec(pathname);
    if (method === "GET" && versionMatch) {
      const id = parsePositiveInt(versionMatch[1], "strategyVersionId");
      const result = await catalog.getVersion(id);
      if (!result) throw new ApiError(404, "STRATEGY_VERSION_NOT_FOUND", `Strategy version ${id} was not found`);
      sendJson(response, 200, result, corsOrigin);
      return true;
    }

    throw new ApiError(404, "ROUTE_NOT_FOUND", `${method} ${pathname} was not found`);
  } catch (error) {
    const mapped = error instanceof ApiError
      ? error
      : error instanceof StrategyLotteryImmutableError
        ? new ApiError(
            409,
            "STRATEGY_LOTTERY_IMMUTABLE",
            "A strategy slug cannot move to another lottery; create a new strategy instead",
          )
        : undefined;
    if (mapped) {
      sendJson(response, mapped.statusCode, { error: { code: mapped.code, message: mapped.message } }, corsOrigin);
      return true;
    }
    throw error;
  }
}
