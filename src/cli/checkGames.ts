import { readFile } from "node:fs/promises";
import type { GeneratedGame } from "../domain/types.js";
import { loadContests } from "../data/jsonStore.js";
import { evaluateGames } from "../checker/evaluate.js";

const gamesPath = process.argv[2];
const dataPath = process.argv[3] ?? "data/contests.json";
const contestArg = process.argv[4] ? Number(process.argv[4]) : undefined;

function usage(): never {
  throw new Error("Usage: games:check -- <games.json> [dataPath] [contestNumber]");
}

async function main(): Promise<void> {
  if (!gamesPath) usage();
  if (contestArg !== undefined && (!Number.isInteger(contestArg) || contestArg < 1)) usage();

  const raw = await readFile(gamesPath, "utf8");
  const games = JSON.parse(raw) as GeneratedGame[];
  if (!Array.isArray(games) || games.length === 0) {
    throw new Error("games file must contain a non-empty array");
  }

  const lottery = games[0]!.lottery;
  if (games.some((game) => game.lottery !== lottery)) {
    throw new Error("all games in the file must belong to the same lottery");
  }

  const contests = (await loadContests(dataPath))
    .filter((contest) => contest.lottery === lottery)
    .sort((a, b) => a.number - b.number);
  const target = contestArg === undefined
    ? contests.at(-1)
    : contests.find((contest) => contest.number === contestArg);

  if (!target) throw new Error("target contest was not found in the data file");

  process.stdout.write(`${JSON.stringify({ target, checks: evaluateGames(games, target) }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
