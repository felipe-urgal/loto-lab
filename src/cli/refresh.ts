import type { LotteryId } from "../domain/types.js";
import { CaixaContestSource } from "../data/caixa.js";
import { syncContestRange } from "../data/sync.js";

const lotteryIds: LotteryId[] = ["mega-sena", "lotofacil", "dia-de-sorte"];

function parseLottery(value: string | undefined): LotteryId {
  if (!value || !lotteryIds.includes(value as LotteryId)) {
    throw new Error(`Lottery must be one of: ${lotteryIds.join(", ")}`);
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
  const startContest = positiveInt(startArg, "startContest");
  const endContest = positiveInt(endArg, "endContest");
  const path = pathArg ?? "data/contests.json";

  const result = await syncContestRange(
    path,
    new CaixaContestSource(),
    lottery,
    startContest,
    endContest,
  );

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
