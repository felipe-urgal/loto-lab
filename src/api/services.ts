import type { AdvancedAnalysis } from "../analysis/advancedTypes.js";
import type { AdvancedAnalysisResponse } from "../application/analyzeAdvancedLottery.js";
import type { AnalysisResponse } from "../application/analyzeLottery.js";
import {
  InsufficientGenerationHistoryError,
  MIN_GENERATION_HISTORY,
  type GenerateGamesRequest,
  type GenerateGamesResponse,
} from "../application/generateGames.js";
import {
  BacktestRoundLimitError,
  MAX_BACKTEST_ROUNDS,
  type RunBacktestRequest,
  type RunBacktestResponse,
} from "../application/runBacktest.js";

export {
  BacktestRoundLimitError,
  InsufficientGenerationHistoryError,
  MIN_GENERATION_HISTORY,
};
export const MAX_HTTP_BACKTEST_ROUNDS = MAX_BACKTEST_ROUNDS;
export type {
  AdvancedAnalysis,
  AdvancedAnalysisResponse,
  AnalysisResponse,
  GenerateGamesRequest,
  GenerateGamesResponse,
  RunBacktestRequest,
  RunBacktestResponse,
};
