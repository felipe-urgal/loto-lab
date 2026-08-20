import { loadContests } from "../data/jsonStore.js";
import { backtestDiaDeSorte } from "../backtest/diaDeSorte.js";

const dataPath = process.argv[2] ?? "data/contests.json";
const gameCount = Number(process.argv[3] ?? 4);
const warmupContests = Number(process.argv[4] ?? 20);
const startContest = process.argv[5] ? Number(process.argv[5]) : undefined;
const endContest = process.argv[6] ? Number(process.argv[6]) : undefined;

async function main(): Promise<void> {
  const contests = await loadContests(dataPath);
  const result = backtestDiaDeSorte(contests, {
    gameCount,
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
