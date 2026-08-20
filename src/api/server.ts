import { createServer, type Server } from "node:http";
import { createApiRequestHandler, type ApiServerOptions } from "./app.js";
import type { AiInterpretationProvider } from "../ai/types.js";
import { serveDataStatus } from "./dataStatus.js";
import { serveStrategyLab } from "./strategyLab.js";
import { serveRealBets } from "./realBets.js";
import { serveGameBatchManagement } from "./gameBatchManagement.js";
import { serveAiInsights } from "./aiInsights.js";
import { serveWebAsset } from "./web.js";

export interface LotoLabServerOptions extends ApiServerOptions {
  aiProvider?: AiInterpretationProvider;
}

export function createLotoLabServer(options: LotoLabServerOptions): Server {
  const apiHandler = createApiRequestHandler(options);

  return createServer(async (request, response) => {
    try {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://localhost");
      if (await serveDataStatus(request, response, options)) return;
      if (await serveStrategyLab(request, response, options)) return;
      if (await serveRealBets(request, response, options)) return;
      if (await serveGameBatchManagement(request, response, options)) return;
      if (await serveAiInsights(request, response, options)) return;
      if (method === "GET" && await serveWebAsset(url.pathname, response)) return;
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
