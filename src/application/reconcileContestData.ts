import type { Contest, LotteryId } from "../domain/types.js";
import type { SecondaryContestSnapshot, SecondaryContestSource } from "../data/secondarySource.js";
import { SecondarySourceUnavailableError } from "../data/maickonSecondarySource.js";

export type ReconciliationStatus =
  | "consistent"
  | "secondary-stale"
  | "contest-missing"
  | "content-divergence"
  | "source-unavailable";

export interface ReconciliationItem {
  lottery: LotteryId;
  contestNumber: number;
  status: ReconciliationStatus;
  canonical: { drawDate: string; numbers: number[] };
  secondary?: { drawDate: string; numbers: number[]; source: SecondaryContestSnapshot["source"] };
  differences: Array<"drawDate" | "numbers">;
}

export interface ReconciliationResult {
  lottery: LotteryId;
  checkedAt: string;
  source: { provider: string; latestContestNumber?: number };
  requested: number;
  compared: number;
  counts: Record<ReconciliationStatus, number>;
  items: ReconciliationItem[];
  readonly: true;
}

export interface ReconciliationContestReader {
  list(options: {
    lottery: LotteryId;
    order: "desc";
    limit: number;
  }): Promise<Contest[]>;
}

function sameNumbers(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort((x, y) => x - y);
  const b = [...right].sort((x, y) => x - y);
  return a.every((value, index) => value === b[index]);
}

function emptyCounts(): Record<ReconciliationStatus, number> {
  return {
    consistent: 0,
    "secondary-stale": 0,
    "contest-missing": 0,
    "content-divergence": 0,
    "source-unavailable": 0,
  };
}

export class ReconcileContestDataUseCase {
  constructor(
    private readonly contests: ReconciliationContestReader,
    private readonly secondary: SecondaryContestSource,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async execute(lottery: LotteryId, limit = 10): Promise<ReconciliationResult> {
    if (!this.secondary.supports(lottery)) {
      throw new Error(`Secondary reconciliation is not supported for ${lottery}`);
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      throw new Error("Reconciliation limit must be between 1 and 20");
    }

    const canonical = await this.contests.list({ lottery, order: "desc", limit });
    const checkedAt = this.now();
    const counts = emptyCounts();
    const provider = this.secondary.provider;

    let latestSecondary: number;
    try {
      latestSecondary = await this.secondary.latestContestNumber(lottery);
    } catch (error) {
      if (error instanceof SecondarySourceUnavailableError || error instanceof Error) {
        counts["source-unavailable"] = canonical.length;
        return {
          lottery,
          checkedAt,
          source: { provider },
          requested: limit,
          compared: 0,
          counts,
          items: canonical.map((contest) => ({
            lottery,
            contestNumber: contest.number,
            status: "source-unavailable",
            canonical: { drawDate: contest.date, numbers: [...contest.numbers] },
            differences: [],
          })),
          readonly: true,
        };
      }
      throw error;
    }

    const items: ReconciliationItem[] = [];
    for (const contest of canonical) {
      if (contest.number > latestSecondary) {
        counts["secondary-stale"] += 1;
        items.push({
          lottery,
          contestNumber: contest.number,
          status: "secondary-stale",
          canonical: { drawDate: contest.date, numbers: [...contest.numbers] },
          differences: [],
        });
        continue;
      }

      let secondary: SecondaryContestSnapshot | undefined;
      try {
        secondary = await this.secondary.fetchContest(lottery, contest.number);
      } catch {
        counts["source-unavailable"] += 1;
        items.push({
          lottery,
          contestNumber: contest.number,
          status: "source-unavailable",
          canonical: { drawDate: contest.date, numbers: [...contest.numbers] },
          differences: [],
        });
        continue;
      }

      if (!secondary) {
        counts["contest-missing"] += 1;
        items.push({
          lottery,
          contestNumber: contest.number,
          status: "contest-missing",
          canonical: { drawDate: contest.date, numbers: [...contest.numbers] },
          differences: [],
        });
        continue;
      }

      const differences: Array<"drawDate" | "numbers"> = [];
      if (contest.date !== secondary.drawDate) differences.push("drawDate");
      if (!sameNumbers(contest.numbers, secondary.numbers)) differences.push("numbers");
      const status: ReconciliationStatus = differences.length ? "content-divergence" : "consistent";
      counts[status] += 1;
      items.push({
        lottery,
        contestNumber: contest.number,
        status,
        canonical: { drawDate: contest.date, numbers: [...contest.numbers] },
        secondary: {
          drawDate: secondary.drawDate,
          numbers: [...secondary.numbers],
          source: secondary.source,
        },
        differences,
      });
    }

    return {
      lottery,
      checkedAt,
      source: { provider, latestContestNumber: latestSecondary },
      requested: limit,
      compared: items.filter((item) =>
        item.status === "consistent" || item.status === "content-divergence"
      ).length,
      counts,
      items,
      readonly: true,
    };
  }
}
