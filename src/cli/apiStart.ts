import { createPostgresPool } from "../db/client.js";
import { runMigrations } from "../db/migrations.js";
import { createLotoLabServer } from "../api/server.js";
import { startOperationsScheduler, type OperationsScheduler } from "../operations/scheduler.js";
import { PostgresOperationRepository } from "../persistence/operationRepository.js";
import { getAnalysisJobManager } from "../analysis/jobManager.js";
import { logEvent } from "../observability/log.js";

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

function parseShutdownTimeout(value: string | undefined): number {
  const seconds = Number(value ?? 25);
  if (!Number.isFinite(seconds) || seconds < 5 || seconds > 120) {
    throw new Error("OPS_SHUTDOWN_TIMEOUT_SECONDS must be between 5 and 120");
  }
  return Math.round(seconds * 1000);
}

function autoSyncEnabled(value: string | undefined): boolean {
  if (value === undefined || value === "") return true;
  return value === "1" || value.toLowerCase() === "true";
}

function enabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function isLoopbackBind(value: string): boolean {
  return value === "127.0.0.1" || value === "::1" || value.toLowerCase() === "localhost";
}

function validatePublicExposure(): void {
  const bindAddress = process.env.PUBLIC_BIND_ADDRESS;
  if (!bindAddress || isLoopbackBind(bindAddress)) return;
  if (enabled(process.env.ALLOW_INSECURE_PUBLIC_HTTP)) {
    logEvent("warn", "insecure_public_http_allowed", { bindAddress });
    return;
  }

  const publicOrigin = process.env.PUBLIC_ORIGIN ?? process.env.API_CORS_ORIGIN;
  let protocol: string | undefined;
  try {
    protocol = publicOrigin ? new URL(publicOrigin).protocol : undefined;
  } catch {
    throw new Error("PUBLIC_ORIGIN must be a valid absolute URL when the app is exposed publicly");
  }
  if (protocol !== "https:") {
    throw new Error(
      "Public APP_BIND requires an https:// PUBLIC_ORIGIN because HTTP Basic credentials must not travel over plaintext HTTP. Use a TLS reverse proxy or explicitly set ALLOW_INSECURE_PUBLIC_HTTP=true for an intentional exception.",
    );
  }
}

function closeServer(server: ReturnType<typeof createLotoLabServer>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
    server.closeIdleConnections?.();
  });
}

async function withDeadline(promise: Promise<unknown>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Shutdown drain exceeded ${timeoutMs}ms`)), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  validatePublicExposure();
  const pool = createPostgresPool();
  await runMigrations(pool);

  const recoveredOperations = await new PostgresOperationRepository(pool).recoverRunning();
  if (recoveredOperations > 0) {
    logEvent("warn", "operations_recovered", { count: recoveredOperations });
  }

  const analysisJobs = getAnalysisJobManager(pool);
  const recoveredJobs = await analysisJobs.start();
  if (recoveredJobs > 0) {
    logEvent("warn", "analysis_jobs_recovered", { count: recoveredJobs });
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
      onRun: (message) => logEvent("info", "operational_sync_scheduler", { message }),
      onError: (error) => logEvent("error", "operational_sync_failed", {
        message: error instanceof Error ? error.message : String(error),
      }),
    });
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      logEvent("info", "server_listening", {
        host,
        port,
        autoSync: Boolean(scheduler),
        syncIntervalMinutes: scheduler ? parseInterval(process.env.OPS_INTERVAL_MINUTES) : undefined,
      });
      resolve();
    });
  });

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    const timeoutMs = parseShutdownTimeout(process.env.OPS_SHUTDOWN_TIMEOUT_SECONDS);
    logEvent("info", "shutdown_started", { signal, timeoutMs });

    const drain = Promise.allSettled([
      closeServer(server),
      scheduler?.stopAndDrain() ?? Promise.resolve(),
      analysisJobs.stopAndDrain(),
    ]).then((results) => {
      const rejected = results.filter((result) => result.status === "rejected");
      if (rejected.length > 0) throw new Error(`${rejected.length} shutdown component(s) failed to drain`);
    });

    try {
      await withDeadline(drain, timeoutMs);
    } catch (error) {
      logEvent("warn", "shutdown_deadline_exceeded", {
        signal,
        message: error instanceof Error ? error.message : String(error),
      });
      server.closeAllConnections?.();
    } finally {
      await pool.end().catch((error: unknown) => {
        logEvent("error", "database_pool_close_failed", {
          message: error instanceof Error ? error.message : String(error),
        });
      });
      logEvent("info", "shutdown_completed", { signal });
    }
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      shutdown(signal).catch((error: unknown) => {
        logEvent("error", "shutdown_failed", {
          signal,
          message: error instanceof Error ? error.message : String(error),
        });
        process.exitCode = 1;
      });
    });
  }
}

main().catch((error: unknown) => {
  logEvent("error", "startup_failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});