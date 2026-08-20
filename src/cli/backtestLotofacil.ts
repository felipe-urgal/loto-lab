import { loadContests } from "../data/jsonStore.js";
import { backtestLotofacil } from "../backtest/lotofacil.js";

const dataPath = process.argv[2] ?? "data/contests.json";
const gameCount = Number(process.argv[3] ?? 4);
const fixedCount = Number(process.argv[4] ?? 8);
const warmupContests = Number(process.argv[5] ?? 20);
const startContest = process.argv[6] ? Number(process.argv[6]) : undefined;
const endContest = process.argv[7] ? Number(process.argv[7]) : undefined;

async function main(): Promise<void> {
  if (![8, 9, 10].includes(fixedCount)) {
    throw new Error("fixedCount must be 8, 9 or 10");
  }

  const contests = await loadContests(dataPath);
  const result = backtestLotofacil(contests, {
    gameCount,
    fixedCount: fixedCount as 8 | 9 | 10,
    warmupContests,
    ...(startContest !== undefined ? { startContest } : {}),
    ...(endContest !== undefined ? { endContest } : {}),
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
