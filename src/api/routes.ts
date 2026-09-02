import type { IncomingMessage, ServerResponse } from "node:http";
import type { AnalyzeAdvancedLotteryUseCase } from "../application/analyzeAdvancedLottery.js";
import type { AnalyzeLotteryUseCase } from "../application/analyzeLottery.js";
import type { BacktestCatalogUseCase } from "../application/backtestCatalog.js";
import type { CheckGameBatchUseCase } from "../application/checkGameBatch.js";
import type { CompareGameBatchUseCase } from "../application/compareGameBatch.js";
import type { ContestCatalogUseCase } from "../application/contestCatalog.js";
import type { GetDataStatusUseCase } from "../application/dataStatus.js";
import type { ExecuteBacktestUseCase } from "../application/executeBacktest.js";
import type { GameBatchUseCase } from "../application/gameBatches.js";
import type { GenerateGamesUseCase } from "../application/generateGames.js";
import type { GenerationV2UseCase } from "../application/generationV2.js";
import type { OperationsUseCase } from "../application/operations.js";
import type { RealBetUseCase } from "../application/realBets.js";
import type { RunStrategyLabUseCase } from "../application/runStrategyLab.js";
import type { StrategyCatalogUseCase } from "../application/strategyCatalog.js";
import { serveAnalysis } from "./analysis.js";
import { serveContests } from "./contests.js";
import { serveDataStatus } from "./dataStatus.js";
import { serveGameBatchManagement } from "./gameBatchManagement.js";
import { serveGameBatches } from "./gameBatches.js";
import { serveGameComparison } from "./gameComparison.js";
import { serveGeneration } from "./generation.js";
import { serveGenerationV2 } from "./generationV2.js";
import { serveStrategyLab } from "./strategyLab.js";
import { serveRealBets } from "./realBets.js";
import { serveAiInsights } from "./aiInsights.js";
import { serveOperations } from "./operations.js";
import { serveAgenda } from "./agenda.js";
import { serveBacktests } from "./backtests.js";
import { serveStrategies } from "./strategies.js";
import { serveAnalysisJobs } from "./analysisJobs.js";
import type { LotoLabServerOptions } from "./server.js";

export interface FeatureRouteDependencies {
  analyzeAdvancedLottery: AnalyzeAdvancedLotteryUseCase;
  analyzeLottery: AnalyzeLotteryUseCase;
  backtestCatalog: BacktestCatalogUseCase;
  checkGameBatch: CheckGameBatchUseCase;
  compareGameBatch: CompareGameBatchUseCase;
  contestCatalog: ContestCatalogUseCase;
  dataStatus: GetDataStatusUseCase;
  executeBacktest: ExecuteBacktestUseCase;
  gameBatches: GameBatchUseCase;
  generateGames: GenerateGamesUseCase;
  generationV2: GenerationV2UseCase;
  operations: OperationsUseCase;
  realBets: RealBetUseCase;
  strategyCatalog: StrategyCatalogUseCase;
  runStrategyLab: RunStrategyLabUseCase;
}

type FeatureRouteHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  options: LotoLabServerOptions,
  dependencies: FeatureRouteDependencies,
) => Promise<boolean>;

const featureRoutes: FeatureRouteHandler[] = [
  (request, response, options, dependencies) =>
    serveAnalysis(
      request,
      response,
      options,
      dependencies.analyzeLottery,
      dependencies.analyzeAdvancedLottery,
    ),
  (request, response, options, dependencies) =>
    serveContests(request, response, options, dependencies.contestCatalog),
  (request, response, options, dependencies) =>
    serveDataStatus(request, response, options, dependencies.dataStatus),
  (request, response, options, dependencies) =>
    serveGeneration(request, response, options, dependencies.generateGames),
  (request, response, options, dependencies) =>
    serveGenerationV2(request, response, options, dependencies.generationV2),
  (request, response, options, dependencies) =>
    serveBacktests(
      request,
      response,
      options,
      dependencies.backtestCatalog,
      dependencies.executeBacktest,
    ),
  (request, response, options, dependencies) =>
    serveStrategies(request, response, options, dependencies.strategyCatalog),
  serveAnalysisJobs,
  (request, response, options, dependencies) =>
    serveStrategyLab(request, response, options, dependencies.runStrategyLab),
  (request, response, options, dependencies) =>
    serveRealBets(request, response, options, dependencies.realBets),
  (request, response, options, dependencies) =>
    serveGameBatches(
      request,
      response,
      options,
      dependencies.gameBatches,
      dependencies.checkGameBatch,
    ),
  (request, response, options, dependencies) =>
    serveGameBatchManagement(request, response, options, dependencies.gameBatches),
  (request, response, options, dependencies) =>
    serveGameComparison(request, response, options, dependencies.compareGameBatch),
  serveAiInsights,
  (request, response, options, dependencies) =>
    serveOperations(request, response, options, dependencies.operations),
  serveAgenda,
];

export async function serveFeatureRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  options: LotoLabServerOptions,
  dependencies: FeatureRouteDependencies,
): Promise<boolean> {
  for (const handler of featureRoutes) {
    if (await handler(request, response, options, dependencies)) return true;
  }
  return false;
}
