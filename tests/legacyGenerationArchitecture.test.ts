import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("legacy generation HTTP ownership delegates to the application use case", async () => {
  const [controller, app, services, routes, server, limits] = await Promise.all([
    source("src/api/generation.ts"),
    source("src/api/app.ts"),
    source("src/api/services.ts"),
    source("src/api/routes.ts"),
    source("src/api/server.ts"),
    source("src/api/generationRateLimit.ts"),
  ]);

  assert.doesNotMatch(controller, /PostgresGameRepository/);
  assert.doesNotMatch(controller, /PostgresContestRepository/);
  assert.doesNotMatch(controller, /options\.pool/);
  assert.match(controller, /generateGames\.execute\(/);
  assert.match(controller, /generationLimiter/);
  assert.match(controller, /InsufficientGenerationHistoryError/);

  assert.doesNotMatch(app, /\/api\/v1\/games\/generate/);
  assert.doesNotMatch(app, /services\.generate\(/);
  assert.doesNotMatch(app, /generationLimiter/);
  assert.doesNotMatch(app, /generationPlanLimiter/);

  assert.doesNotMatch(services, /new GenerateGamesUseCase/);
  assert.doesNotMatch(services, /async generate\(/);

  assert.match(routes, /generateGames: GenerateGamesUseCase/);
  assert.match(routes, /dependencies\.generateGames/);
  assert.match(server, /const games = new PostgresGameRepository\(options\.pool\)/);
  assert.match(server, /generateGames: new GenerateGamesUseCase\(contests, games\)/);

  assert.match(limits, /generationLimiter = new FixedWindowRateLimiter\(\{ limit: 30, windowMs: 60_000 \}\)/);
  assert.match(limits, /generationPlanLimiter = new FixedWindowRateLimiter\(\{ limit: 120, windowMs: 60_000 \}\)/);
});
