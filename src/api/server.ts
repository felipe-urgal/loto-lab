import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { createApiRequestHandler, type ApiServerOptions } from "./app.js";
import { runAdvancedAnalysisInWorker } from "../analysis/advancedWorkerClient.js";
import { getAnalysisJobManager } from "../analysis/jobManager.js";
import { buildAiEvidenceContext } from "../ai/context.js";
import { OpenAiInterpretationProvider } from "../ai/openai.js";
import type { AiInterpretationProvider } from "../ai/types.js";
import { AgendaUseCase } from "../application/agenda.js";
import { AiInsightsUseCase } from "../application/aiInsights.js";
import { AnalysisJobsUseCase } from "../application/analysisJobs.js";
import { AnalyzeAdvancedLotteryUseCase } from "../application/analyzeAdvancedLottery.js";
import { AnalyzeLotteryUseCase } from "../application/analyzeLottery.js";
import { BacktestCatalogUseCase } from "../application/backtestCatalog.js";
import { CheckGameBatchUseCase } from "../application/checkGameBatch.js";
import { CompareGameBatchUseCase } from "../application/compareGameBatch.js";
import { ContestCatalogUseCase } from "../application/contestCatalog.js";
import { GetDataStatusUseCase } from "../application/dataStatus.js";
import { ExecuteBacktestUseCase } from "../application/executeBacktest.js";
import { GameBatchUseCase } from "../application/gameBatches.js";
import { GenerateGamesUseCase } from "../application/generateGames.js";
import { GenerationV2UseCase } from "../application/generationV2.js";
import {
  OperationAlreadyRunningError,
  OperationsUseCase,
} from "../application/operations.js";
import { RealBetUseCase } from "../application/realBets.js";
import { ResearchHypothesesUseCase } from "../application/researchHypotheses.js";
import { RunStrategyLabUseCase } from "../application/runStrategyLab.js";
import { StrategyCatalogUseCase } from "../application/strategyCatalog.js";
import type { ContestSource } from "../data/source.js";
import { runGenerationPlanInWorker } from "../generator/planningWorkerClient.js";
import { NotificationService } from "../notifications/service.js";
import { caixaMetricsSnapshot } from "../observability/caixaMetrics.js";
import {
  classifyHttpRoute,
  httpMetricsSnapshot,
  recordHttpRequest,
} from "../observability/httpMetrics.js";
import { logEvent } from "../observability/log.js";
import { postgresPoolMetricsSnapshot } from "../observability/postgresPoolMetrics.js";
import {
  OperationAlreadyRunningError as LegacyOperationAlreadyRunningError,
  runOperationalSync,
} from "../operations/sync.js";
import { PostgresAgendaRepository } from "../persistence/agendaRepository.js";
import { PostgresAiInsightRepository } from "../persistence/aiInsightRepository.js";
import { PostgresAnalysisJobRepository } from "../persistence/analysisJobRepository.js";
import { PostgresBacktestRepository } from "../persistence/backtestRepository.js";
import { PostgresContestRepository } from "../persistence/contestRepository.js";
import { PostgresGameRepository } from "../persistence/gameRepository.js";
import { PostgresNotificationRepository } from "../persistence/notificationRepository.js";
import { PostgresOperationRepository } from "../persistence/operationRepository.js";
import { PostgresRealBetRepository } from "../persistence/realBetRepository.js";
import { PostgresResearchHypothesisRepository } from "../persistence/researchHypothesisRepository.js";
import { PostgresStrategyRepository } from "../persistence/strategyRepository.js";
import { RealBetService } from "../realBets/service.js";
import { serveFeatureRoutes } from "./routes.js";
import { serveWebAsset } from "./web.js";
import { loadAppAuthConfig, requireAppAuthentication } from "./auth.js";
import {
  requireSameOriginMutation,
  resolveMutationExpectedOrigin,
  sendJson,
} from "./http.js";
import { expensiveAnalysisGate } from "./workGate.js";
import { runBacktestInWorker, runStrategyLabInWorker } from "./workerClient.js";

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
  const contests = new PostgresContestRepository(options.pool);
  const games = new PostgresGameRepository(options.pool);
  const backtests = new PostgresBacktestRepository(options.pool);
  const strategies = new PostgresStrategyRepository(options.pool);
  const researchHypotheses = new PostgresResearchHypothesisRepository(options.pool);
  const analysisJobRepository = new PostgresAnalysisJobRepository(options.pool);
  const agendaRepository = new PostgresAgendaRepository(options.pool);
  const notificationRepository = new PostgresNotificationRepository(options.pool);
  const aiProvider = options.aiProvider ?? new OpenAiInterpretationProvider();
  const featureRouteDependencies = {
    agenda: new AgendaUseCase(
      agendaRepository,
      notificationRepository,
      new NotificationService(options.pool),
    ),
    aiInsights: new AiInsightsUseCase(
      { load: (lottery) => buildAiEvidenceContext(options.pool, lottery) },
      new PostgresAiInsightRepository(options.pool),
      aiProvider,
    ),
    analysisJobs: new AnalysisJobsUseCase(
      getAnalysisJobManager(options.pool),
      strategies,
      contests,
    ),
    analyzeAdvancedLottery: new AnalyzeAdvancedLotteryUseCase(
      contests,
      runAdvancedAnalysisInWorker,
    ),
    analyzeLottery: new AnalyzeLotteryUseCase(contests),
    backtestCatalog: new BacktestCatalogUseCase(backtests),
    checkGameBatch: new CheckGameBatchUseCase(games, contests),
    compareGameBatch: new CompareGameBatchUseCase(games, contests),
    contestCatalog: new ContestCatalogUseCase(contests),
    dataStatus: new GetDataStatusUseCase(contests),
    executeBacktest: new ExecuteBacktestUseCase(
      expensiveAnalysisGate,
      (input, signal) => runBacktestInWorker(
        { contests, backtests },
        input,
        signal ? { signal } : {},
      ),
    ),
    gameBatches: new GameBatchUseCase(games),
    generateGames: new GenerateGamesUseCase(contests, games),
    generationV2: new GenerationV2UseCase(contests, games, runGenerationPlanInWorker),
    operations: new OperationsUseCase(
      new PostgresOperationRepository(options.pool),
      async () => {
        try {
          return await runOperationalSync(options.pool, {
            ...(options.operationSource ? { source: options.operationSource } : {}),
          });
        } catch (error) {
          if (error instanceof LegacyOperationAlreadyRunningError) {
            throw new OperationAlreadyRunningError();
          }
          throw error;
        }
      },
    ),
    realBets: new RealBetUseCase(
      new RealBetService(options.pool),
      new PostgresRealBetRepository(options.pool),
    ),
    researchHypotheses: new ResearchHypothesesUseCase(researchHypotheses),
    strategyCatalog: new StrategyCatalogUseCase(strategies),
    runStrategyLab: new RunStrategyLabUseCase(
      contests,
      expensiveAnalysisGate,
      runStrategyLabInWorker,
    ),
  };
  const auth = loadAppAuthConfig();
  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:5173";
  const configuredOrigin = options.corsOrigin
    ?? process.env.API_CORS_ORIGIN
    ?? process.env.PUBLIC_ORIGIN;

  return createServer(async (request, response) => {
    const requestId = randomUUID();
    const metricsStartedAt = performance.now();
    const metricsUrl = new URL(request.url ?? "/", "http://localhost");
    const routeFamily = classifyHttpRoute(metricsUrl.pathname);
    response.once("finish", () => {
      recordHttpRequest(routeFamily, response.statusCode, performance.now() - metricsStartedAt);
    });
    response.setHeader("X-Request-Id", requestId);

    try {
      const method = request.method ?? "GET";
      const url = metricsUrl;

      if (!isHealthPath(url.pathname) && !requireAppAuthentication(request, response, auth)) {
        return;
      }
      const expectedOrigin = resolveMutationExpectedOrigin(request, configuredOrigin);
      if (!isHealthPath(url.pathname) && !requireSameOriginMutation(request, response, expectedOrigin)) {
        logEvent("warn", "cross_origin_mutation_blocked", {
          requestId,
          method,
          pathname: url.pathname,
          origin: request.headers.origin,
          expectedOrigin,
          fetchSite: request.headers["sec-fetch-site"],
        });
        return;
      }

      if (method === "GET" && url.pathname === "/api/v1/ops/metrics") {
        sendJson(response, 200, {
          ...httpMetricsSnapshot(),
          analysisJobs: await analysisJobRepository.metricsSnapshot(),
          postgres: postgresPoolMetricsSnapshot(options.pool),
          caixa: caixaMetricsSnapshot(),
        }, corsOrigin);
        return;
      }

      if (await serveFeatureRoutes(request, response, options, featureRouteDependencies)) return;
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
