import { loadContests } from "../data/jsonStore.js";
import { backtestMegaSena } from "../backtest/megaSena.js";

function optionalPositiveInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

async function main(): Promise<void> {
  const [pathArg, gameCountArg, warmupArg, startArg, endArg] = process.argv.slice(2);
  const path = pathArg ?? "data/contests.json";
  const contests = await loadContests(path);

  const result = backtestMegaSena(contests, {
    gameCount: optionalPositiveInt(gameCountArg, "gameCount"),
    warmupContests: optionalPositiveInt(warmupArg, "warmupContests"),
    startContest: optionalPositiveInt(startArg, "startContest"),
    endContest: optionalPositiveInt(endArg, "endContest"),
  });

  console.log(
    JSON.stringify(
      {
        summary: result.summary,
        lastRounds: result.rounds.slice(-10),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
