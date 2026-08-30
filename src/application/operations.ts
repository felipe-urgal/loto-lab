export type OperationName = "sync-all";
export type OperationStatus = "running" | "success" | "partial" | "failed" | "abandoned";

export interface OperationRunSnapshot<TDetails = unknown> {
  id: number;
  operation: OperationName;
  status: OperationStatus;
  details: TDetails;
  startedAt: string;
  finishedAt?: string;
}

export interface OperationsHistoryReader {
  latest<TDetails>(operation: OperationName): Promise<OperationRunSnapshot<TDetails> | undefined>;
}

export type OperationalSyncExecutor = () => Promise<OperationRunSnapshot<unknown>>;

export interface OperationsStatusConfig {
  autoSyncEnabled: boolean;
  intervalMinutes: number;
  staleAfterMinutes: number;
}

export interface OperationsStatusSnapshot extends OperationsStatusConfig {
  stale: boolean;
  ageMinutes?: number;
  latest?: OperationRunSnapshot<unknown>;
}

export class OperationAlreadyRunningError extends Error {
  readonly code = "OPERATION_ALREADY_RUNNING";

  constructor() {
    super("An operational synchronization is already running");
    this.name = "OperationAlreadyRunningError";
  }
}

export class OperationsUseCase {
  constructor(
    private readonly history: OperationsHistoryReader,
    private readonly runSync: OperationalSyncExecutor,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async status(config: OperationsStatusConfig): Promise<OperationsStatusSnapshot> {
    const latest = await this.history.latest<unknown>("sync-all");
    const reference = latest?.finishedAt ?? latest?.startedAt;
    const ageMinutes = reference
      ? Math.max(0, (this.now() - Date.parse(reference)) / 60_000)
      : undefined;
    const stale = !latest
      || latest.status === "failed"
      || latest.status === "abandoned"
      || ageMinutes === undefined
      || ageMinutes > config.staleAfterMinutes;

    return {
      ...config,
      stale,
      ...(ageMinutes !== undefined ? { ageMinutes } : {}),
      ...(latest ? { latest } : {}),
    };
  }

  sync(): Promise<OperationRunSnapshot<unknown>> {
    return this.runSync();
  }
}
