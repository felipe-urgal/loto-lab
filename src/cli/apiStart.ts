import { createPostgresPool } from "../db/client.js";
import { createLotoLabServer } from "../api/server.js";

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("API_PORT must be an integer between 1 and 65535");
  }
  return port;
}

const pool = createPostgresPool();
const port = parsePort(process.env.API_PORT);
const host = process.env.API_HOST ?? "127.0.0.1";
const server = createLotoLabServer({
  pool,
  corsOrigin: process.env.API_CORS_ORIGIN,
});

server.listen(port, host, () => {
  console.log(`Loto Lab listening on http://${host}:${port}`);
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
