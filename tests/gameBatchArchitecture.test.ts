import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("game batch HTTP ownership delegates to application use cases", async () => {
  const [application, comparisonApplication, controller, management, comparison, app, routes, server] = await Promise.all([
    source("src/application/gameBatches.ts"),
    source("src/application/compareGameBatch.ts"),
    source("src/api/gameBatches.ts"),
    source("src/api/gameBatchManagement.ts"),
    source("src/api/gameComparison.ts"),
    source("src/api/app.ts"),
    source("src/api/routes.ts"),
    source("src/api/server.ts"),
  ]);

  assert.doesNotMatch(application, /ApiError/);
  assert.doesNotMatch(application, /Postgres/);
  assert.doesNotMatch(application, /from "pg"/);
  assert.match(application, /interface GameBatchStore/);
  assert.match(application, /class GameBatchUseCase/);

  assert.doesNotMatch(comparisonApplication, /ApiError/);
  assert.doesNotMatch(comparisonApplication, /Postgres/);
  assert.doesNotMatch(comparisonApplication, /from "pg"/);
  assert.match(comparisonApplication, /interface GameComparisonBatchReader/);
  assert.match(comparisonApplication, /interface GameComparisonContestReader/);
  assert.match(comparisonApplication, /class CompareGameBatchUseCase/);

  assert.doesNotMatch(controller, /PostgresGameRepository/);
  assert.doesNotMatch(controller, /options\.pool/);
  assert.match(controller, /game-batches/);
  assert.match(controller, /games\/check/);
  assert.match(controller, /gameBatches\.find\(/);
  assert.match(controller, /gameBatches\.listRecent\(/);
  assert.match(controller, /checkGameBatch\.execute\(/);

  assert.doesNotMatch(management, /PostgresGameRepository/);
  assert.doesNotMatch(management, /options\.pool/);
  assert.match(management, /gameBatches\.manage\(/);
  assert.match(management, /gameBatches\.setHidden\(/);

  assert.doesNotMatch(comparison, /PostgresGameRepository/);
  assert.doesNotMatch(comparison, /PostgresContestRepository/);
  assert.doesNotMatch(comparison, /options\.pool/);
  assert.match(comparison, /compareGameBatch\.execute\(/);

  assert.doesNotMatch(app, /\/api\/v1\/game-batches/);
  assert.doesNotMatch(app, /\/api\/v1\/games\/check/);
  assert.doesNotMatch(app, /LotoLabApiServices/);
  assert.doesNotMatch(app, /services\.games/);
  assert.doesNotMatch(app, /services\.checkBatch/);

  assert.match(routes, /checkGameBatch: CheckGameBatchUseCase/);
  assert.match(routes, /compareGameBatch: CompareGameBatchUseCase/);
  assert.match(routes, /gameBatches: GameBatchUseCase/);
  assert.match(routes, /dependencies\.checkGameBatch/);
  assert.match(routes, /dependencies\.compareGameBatch/);
  assert.match(routes, /dependencies\.gameBatches/);

  assert.match(server, /checkGameBatch: new CheckGameBatchUseCase\(games, contests\)/);
  assert.match(server, /compareGameBatch: new CompareGameBatchUseCase\(games, contests\)/);
  assert.match(server, /gameBatches: new GameBatchUseCase\(games\)/);
});
