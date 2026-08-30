import type { LotteryId } from "../domain/types.js";

export interface ApplicationStrategyVersion {
  id: number;
  strategyId: number;
  version: number;
  methodologyVersion: string;
  config: Record<string, unknown>;
  createdAt: string;
}

export interface ApplicationStrategy {
  id: number;
  slug: string;
  lottery: LotteryId;
  name: string;
  methodologyVersion: string;
  config: Record<string, unknown>;
  latestVersionId: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertStrategyCommand {
  slug: string;
  lottery: LotteryId;
  name: string;
  methodologyVersion: string;
  config?: Record<string, unknown>;
}

export interface StrategyCatalogStore {
  upsert(input: UpsertStrategyCommand): Promise<ApplicationStrategy>;
  findById(id: number): Promise<ApplicationStrategy | undefined>;
  findBySlug(slug: string): Promise<ApplicationStrategy | undefined>;
  findVersionById(id: number): Promise<ApplicationStrategyVersion | undefined>;
  listVersions(strategyId: number): Promise<ApplicationStrategyVersion[]>;
  list(lottery?: LotteryId): Promise<ApplicationStrategy[]>;
}

export class StrategyLotteryImmutableError extends Error {
  readonly code = "STRATEGY_LOTTERY_IMMUTABLE";

  constructor(readonly slug: string) {
    super(`STRATEGY_LOTTERY_IMMUTABLE:${slug}`);
    this.name = "StrategyLotteryImmutableError";
  }
}

export class StrategyCatalogUseCase {
  constructor(private readonly strategies: StrategyCatalogStore) {}

  async list(lottery?: LotteryId): Promise<ApplicationStrategy[]> {
    return this.strategies.list(lottery);
  }

  async upsert(input: UpsertStrategyCommand): Promise<ApplicationStrategy> {
    return this.strategies.upsert(input);
  }

  async listVersions(slug: string): Promise<{
    strategy: ApplicationStrategy;
    items: ApplicationStrategyVersion[];
  } | undefined> {
    const strategy = await this.strategies.findBySlug(slug);
    if (!strategy) return undefined;
    return {
      strategy,
      items: await this.strategies.listVersions(strategy.id),
    };
  }

  async getVersion(id: number): Promise<(ApplicationStrategyVersion & {
    strategy: ApplicationStrategy | undefined;
  }) | undefined> {
    const version = await this.strategies.findVersionById(id);
    if (!version) return undefined;
    return {
      ...version,
      strategy: await this.strategies.findById(version.strategyId),
    };
  }
}
