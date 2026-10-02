import {
  benchmarkCoverage,
  type CoverageBenchmarkResult,
} from "../analysis/coverageSimulator.js";
import type { ApplicationGameBatch } from "./gameBatch.js";

export interface CoverageBatchReader {
  findBatch(id: number): Promise<ApplicationGameBatch | undefined>;
}

export interface EvaluateGameBatchCoverageInput {
  batchId: number;
  seed?: string;
  samples?: number;
  maxMarginError?: number;
}

export interface GameBatchCoverageResult extends CoverageBenchmarkResult {
  batch: {
    id: number;
    lottery: ApplicationGameBatch["lottery"];
    gameCount: number;
    generatorPurpose?: string;
    coveringDesign: boolean;
  };
}

export class EvaluateGameBatchCoverageUseCase {
  constructor(private readonly batches: CoverageBatchReader) {}

  async execute(input: EvaluateGameBatchCoverageInput): Promise<GameBatchCoverageResult | undefined> {
    const batch = await this.batches.findBatch(input.batchId);
    if (!batch) return undefined;
    const purpose = typeof batch.generatorOptions.purpose === "string"
      ? batch.generatorOptions.purpose
      : undefined;
    const coveringDesign = Boolean(
      batch.generatorOptions.coverage
      && typeof batch.generatorOptions.coverage === "object",
    );
    const benchmark = benchmarkCoverage({
      lottery: batch.lottery,
      games: batch.games,
      seed: input.seed ?? `batch:${batch.id}:coverage-benchmark:v1`,
      ...(input.samples !== undefined ? { samples: input.samples } : {}),
      ...(input.maxMarginError !== undefined ? { maxMarginError: input.maxMarginError } : {}),
    });
    return {
      ...benchmark,
      batch: {
        id: batch.id,
        lottery: batch.lottery,
        gameCount: batch.games.length,
        ...(purpose ? { generatorPurpose: purpose } : {}),
        coveringDesign,
      },
    };
  }
}
