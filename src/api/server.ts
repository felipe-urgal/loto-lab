import { createServer, type Server } from "node:http";
import { createApiRequestHandler, type ApiServerOptions } from "./app.js";
import type { AiInterpretationProvider } from "../ai/types.js";
import type { ContestSource } from "../data/source.js";
import { serveFeatureRoutes } from "./routes.js";
import { serveWebAsset } from "./web.js";
import { loadAppAuthConfig, requireAppAuthentication } from "./auth.js";

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

  return createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://localhost");

      if (!isHealthPath(url.pathname) && !requireAppAuthentication(request, response, auth)) {
        return;
      }

      if (await serveFeatureRoutes(request, response, options)) return;
      if (method === "GET" && await serveWebAsset(url, response)) return;
      apiHandler(request, response);
    } catch (error) {
      console.error("Loto Lab web request failed", error);
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
      }
      response.end("Unexpected server error");
    }
  });
}
