import type { LotteryId } from "../domain/types.js";
import { CaixaContestSource } from "../data/caixa.js";
import { syncLatestContest, syncMissingContests } from "../data/sync.js";

const lotteryIds: LotteryId[] = ["mega-sena", "lotofacil", "dia-de-sorte"];

function parseLottery(value: string | undefined): LotteryId {
  if (!value || !lotteryIds.includes(value as LotteryId)) {
    throw new Error(
      `Lottery must be one of: ${lotteryIds.join(", ")}`,
    );
  }
  return value as LotteryId;
}

function positiveInt(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const [lotteryArg, startArg, endArg, pathArg] = process.argv.slice(2);
  const lottery = parseLottery(lotteryArg);
  const path = pathArg ?? "data/contests.json";
  const source = new CaixaContestSource();

  const result =
    startArg === undefined && endArg === undefined
      ? await syncLatestContest(path, source, lottery)
      : await syncMissingContests(
          path,
          source,
          lottery,
          positiveInt(startArg, "startContest"),
          positiveInt(endArg, "endContest"),
        );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
