import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { createApiRequestHandler, type ApiServerOptions } from "./app.js";
import type { AiInterpretationProvider } from "../ai/types.js";
import type { ContestSource } from "../data/source.js";
import { logEvent } from "../observability/log.js";
import { serveFeatureRoutes } from "./routes.js";
import { serveWebAsset } from "./web.js";
import { loadAppAuthConfig, requireAppAuthentication } from "./auth.js";
import { requireSameOriginMutation } from "./http.js";

export interface LotoLabServerOptions extends ApiServerOptions {
  aiProvider?: AiInterpretationProvider;
  operationSource?: ContestSource;
  staleAfterMinutes?: number;
}

function isHealthPath(pathname: string): boolean {
  return pathname === "/health" || pathname === "/health/live" || pathname === "/health/ready";
}

export function createLotoLabServer(options: LotoLabServerOptions): Server {
  const apiHandler = createApiRequestHandler(options);
  const auth = loadAppAuthConfig();
  const expectedOrigin = options.corsOrigin
    ?? process.env.API_CORS_ORIGIN
    ?? process.env.PUBLIC_ORIGIN
    ?? "http://localhost:3000";

  return createServer(async (request, response) => {
    const requestId = randomUUID();
    response.setHeader("X-Request-Id", requestId);
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://localhost");

      if (!isHealthPath(url.pathname) && !requireAppAuthentication(request, response, auth)) {
        return;
      }
      if (!isHealthPath(url.pathname) && !requireSameOriginMutation(request, response, expectedOrigin)) {
        logEvent("warn", "cross_origin_mutation_blocked", {
          requestId,
          method,
          pathname: url.pathname,
          origin: request.headers.origin,
          fetchSite: request.headers["sec-fetch-site"],
        });
        return;
      }

      if (await serveFeatureRoutes(request, response, options)) return;
      if ((method === "GET" || method === "HEAD") && await serveWebAsset(url, response, method === "HEAD")) return;
      await apiHandler(request, response);
    } catch (error) {
      logEvent("error", "web_request_failed", {
        requestId,
        method: request.method ?? "GET",
        pathname: request.url ?? "/",
        message: error instanceof Error ? error.message : String(error),
      });
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
      }
      if (!response.writableEnded) response.end("Unexpected server error");
    }
  });
}
