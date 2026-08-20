import type { LotteryId } from "../domain/types.js";
import { loadContests } from "../data/jsonStore.js";
import { generateMegaSenaGames } from "../generator/megaSena.js";
import { generateLotofacilGames } from "../generator/lotofacil.js";
import { generateDiaDeSorteGames } from "../generator/diaDeSorte.js";

const lottery = process.argv[2] as LotteryId | undefined;
const dataPath = process.argv[3] ?? "data/contests.json";
const gameCount = Number(process.argv[4] ?? 2);
const fixedCountArg = Number(process.argv[5] ?? 8);

function usage(): never {
  throw new Error(
    "Usage: games:generate -- <mega-sena|lotofacil|dia-de-sorte> [dataPath] [gameCount] [lotofacilFixedCount]",
  );
}

async function main(): Promise<void> {
  if (!lottery || !["mega-sena", "lotofacil", "dia-de-sorte"].includes(lottery)) usage();
  if (!Number.isInteger(gameCount) || gameCount < 1) usage();

  const contests = await loadContests(dataPath);
  let games;

  if (lottery === "mega-sena") {
    games = generateMegaSenaGames(contests, gameCount);
  } else if (lottery === "lotofacil") {
    if (![8, 9, 10].includes(fixedCountArg)) usage();
    games = generateLotofacilGames(contests, {
      gameCount,
      fixedCount: fixedCountArg as 8 | 9 | 10,
    });
  } else {
    games = generateDiaDeSorteGames(contests, gameCount);
  }

  process.stdout.write(`${JSON.stringify(games, null, 2)}\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
