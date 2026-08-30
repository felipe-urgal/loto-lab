import test from "node:test";
import assert from "node:assert/strict";
import {
  StrategyCatalogUseCase,
  StrategyLotteryImmutableError,
  type ApplicationStrategy,
  type ApplicationStrategyVersion,
  type StrategyCatalogStore,
  type UpsertStrategyCommand,
} from "../src/application/strategyCatalog.js";

function strategy(overrides: Partial<ApplicationStrategy> = {}): ApplicationStrategy {
  return {
    id: 11,
    slug: "mega-core-3",
    lottery: "mega-sena",
    name: "Mega 3 fixas",
    methodologyVersion: "2",
    config: { fixedCount: 3 },
    latestVersionId: 22,
    version: 2,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  };
}

function version(overrides: Partial<ApplicationStrategyVersion> = {}): ApplicationStrategyVersion {
  return {
    id: 22,
    strategyId: 11,
    version: 2,
    methodologyVersion: "2",
    config: { fixedCount: 3 },
    createdAt: "2026-08-02T00:00:00.000Z",
    ...overrides,
  };
}

function store(overrides: Partial<StrategyCatalogStore> = {}): StrategyCatalogStore {
  return {
    async upsert(input: UpsertStrategyCommand) {
      return strategy({
        slug: input.slug,
        lottery: input.lottery,
        name: input.name,
        methodologyVersion: input.methodologyVersion,
        config: input.config ?? {},
      });
    },
    async findById() {
      return strategy();
    },
    async findBySlug() {
      return strategy();
    },
    async findVersionById() {
      return version();
    },
    async listVersions() {
      return [version()];
    },
    async list() {
      return [strategy()];
    },
    ...overrides,
  };
}

test("StrategyCatalogUseCase lists and upserts strategies through an application port", async () => {
  const calls: Array<{ operation: string; value?: unknown }> = [];
  const useCase = new StrategyCatalogUseCase(store({
    async list(lottery) {
      calls.push({ operation: "list", value: lottery });
      return [strategy()];
    },
    async upsert(input) {
      calls.push({ operation: "upsert", value: input });
      return strategy({ name: input.name });
    },
  }));

  const listed = await useCase.list("mega-sena");
  const saved = await useCase.upsert({
    slug: "mega-core-3",
    lottery: "mega-sena",
    name: "Mega atualizada",
    methodologyVersion: "2",
    config: { fixedCount: 3 },
  });

  assert.equal(listed[0]?.slug, "mega-core-3");
  assert.equal(saved.name, "Mega atualizada");
  assert.deepEqual(calls.map((call) => call.operation), ["list", "upsert"]);
});

test("StrategyCatalogUseCase resolves immutable versions without transport or persistence dependencies", async () => {
  const useCase = new StrategyCatalogUseCase(store());

  const versions = await useCase.listVersions("mega-core-3");
  assert.equal(versions?.strategy.id, 11);
  assert.deepEqual(versions?.items.map((item) => item.id), [22]);

  const resolved = await useCase.getVersion(22);
  assert.equal(resolved?.id, 22);
  assert.equal(resolved?.strategy?.slug, "mega-core-3");
});

test("StrategyCatalogUseCase stops dependent lookups when strategy or version is missing", async () => {
  let versionLists = 0;
  let strategyReads = 0;
  const useCase = new StrategyCatalogUseCase(store({
    async findBySlug() {
      return undefined;
    },
    async listVersions() {
      versionLists += 1;
      return [];
    },
    async findVersionById() {
      return undefined;
    },
    async findById() {
      strategyReads += 1;
      return strategy();
    },
  }));

  assert.equal(await useCase.listVersions("missing"), undefined);
  assert.equal(await useCase.getVersion(999), undefined);
  assert.equal(versionLists, 0);
  assert.equal(strategyReads, 0);
});

test("StrategyLotteryImmutableError exposes a stable application error code", () => {
  const error = new StrategyLotteryImmutableError("mega-core-3");
  assert.equal(error.code, "STRATEGY_LOTTERY_IMMUTABLE");
  assert.equal(error.slug, "mega-core-3");
  assert.equal(error.message, "STRATEGY_LOTTERY_IMMUTABLE:mega-core-3");
});
