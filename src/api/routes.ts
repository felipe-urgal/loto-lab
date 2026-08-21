import type { IncomingMessage, ServerResponse } from "node:http";
import { serveDataStatus } from "./dataStatus.js";
import { serveStrategyLab } from "./strategyLab.js";
import { serveRealBets } from "./realBets.js";
import { serveGameBatchManagement } from "./gameBatchManagement.js";
import { serveAiInsights } from "./aiInsights.js";
import { serveOperations } from "./operations.js";
import { serveAgenda } from "./agenda.js";
import type { LotoLabServerOptions } from "./server.js";

type FeatureRouteHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  options: LotoLabServerOptions,
) => Promise<boolean>;

const featureRoutes: FeatureRouteHandler[] = [
  serveDataStatus,
  serveStrategyLab,
  serveRealBets,
  serveGameBatchManagement,
  serveAiInsights,
  serveOperations,
  serveAgenda,
];

export async function serveFeatureRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  options: LotoLabServerOptions,
): Promise<boolean> {
  for (const handler of featureRoutes) {
    if (await handler(request, response, options)) return true;
  }
  return false;
}
