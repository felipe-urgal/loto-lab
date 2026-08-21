import { createPostgresPool } from "../db/client.js";
import { runMigrations } from "../db/migrations.js";
import { createLotoLabServer } from "../api/server.js";
import { startOperationsScheduler, type OperationsScheduler } from "../operations/scheduler.js";
import { PostgresOperationRepository } from "../persistence/operationRepository.js";
import { getAnalysisJobManager } from "../analysis/jobManager.js";

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("API_PORT must be an integer between 1 and 65535");
  }
  return port;
}

function parseInterval(value: string | undefined): number {
  const minutes = Number(value ?? 30);
  if (!Number.isFinite(minutes) || minutes < 5 || minutes > 1440) {
    throw new Error("OPS_INTERVAL_MINUTES must be between 5 and 1440");
  }
  return minutes;
}

function autoSyncEnabled(value: string | undefined): boolean {
  if (value === undefined || value === "") return true;
  return value === "1" || value.toLowerCase() === "true";
}

async function main(): Promise<void> {
  const pool = createPostgresPool();
  await runMigrations(pool);

  const recoveredOperations = await new PostgresOperationRepository(pool).recoverRunning();
  if (recoveredOperations > 0) {
    console.warn(`Recovered ${recoveredOperations} interrupted operational run(s)`);
  }

  const analysisJobs = getAnalysisJobManager(pool);
  const recoveredJobs = await analysisJobs.start();
  if (recoveredJobs > 0) {
    console.warn(`Requeued ${recoveredJobs} interrupted analysis job(s)`);
  }

  const port = parsePort(process.env.API_PORT);
  const host = process.env.API_HOST ?? "127.0.0.1";
  const server = createLotoLabServer({
    pool,
    corsOrigin: process.env.API_CORS_ORIGIN,
  });

  let scheduler: OperationsScheduler | undefined;
  if (autoSyncEnabled(process.env.OPS_AUTO_SYNC)) {
    scheduler = startOperationsScheduler(pool, {
      intervalMinutes: parseInterval(process.env.OPS_INTERVAL_MINUTES),
      runOnStart: true,
      onRun: (message) => console.log(message),
      onError: (error) => console.error("Operational sync failed", error),
    });
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      console.log(`Loto Lab listening on http://${host}:${port}`);
      console.log(
        scheduler
          ? `Operational auto-sync enabled every ${parseInterval(process.env.OPS_INTERVAL_MINUTES)} minutes`
          : "Operational auto-sync disabled",
      );
      resolve();
    });
  });

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down Loto Lab`);

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    await Promise.all([
      scheduler?.stopAndDrain(),
      analysisJobs.stopAndDrain(),
    ]);
    await pool.end();
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      shutdown(signal).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
      });
    });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
