import type { RunBacktestRequest, RunBacktestResponse } from "./runBacktest.js";

export interface BacktestExecutionGate {
  acquire(): (() => void) | undefined;
}

export type BacktestExecutor = (
  input: RunBacktestRequest,
  signal?: AbortSignal,
) => Promise<RunBacktestResponse>;

export class BacktestExecutionBusyError extends Error {
  readonly code = "ANALYSIS_BUSY";

  constructor() {
    super("Another backtest or Strategy Lab analysis is already running");
    this.name = "BacktestExecutionBusyError";
  }
}

export class ExecuteBacktestUseCase {
  constructor(
    private readonly gate: BacktestExecutionGate,
    private readonly executor: BacktestExecutor,
  ) {}

  async execute(input: RunBacktestRequest, signal?: AbortSignal): Promise<RunBacktestResponse> {
    const release = this.gate.acquire();
    if (!release) throw new BacktestExecutionBusyError();

    try {
      return await this.executor(input, signal);
    } finally {
      release();
    }
  }
}
