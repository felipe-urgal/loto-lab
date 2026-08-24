import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const backupArg = process.argv[2];
if (!backupArg) throw new Error("Usage: npm run ops:restore-check -- backups/file.dump");
const backup = resolve(backupArg);
await access(backup);

const envFile = process.env.LOTO_LAB_ENV_FILE || ".env.production";
const composeFile = "docker-compose.prod.yml";
const user = process.env.POSTGRES_USER || "loto_lab";
const restoreDb = `loto_lab_restore_check_${Date.now()}`;

function dockerArgs(command) {
  return ["compose", "--env-file", envFile, "-f", composeFile, "exec", "-T", "postgres", ...command];
}

async function run(command, { stdin } = {}) {
  const child = spawn("docker", dockerArgs(command), {
    stdio: [stdin ? "pipe" : "ignore", "pipe", "inherit"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString("utf8"); });
  if (stdin) stdin.pipe(child.stdin);
  const code = await new Promise((resolveCode, reject) => {
    child.once("error", reject);
    child.once("close", resolveCode);
  });
  if (code !== 0) throw new Error(`${command[0]} failed with exit code ${code}`);
  return output.trim();
}

try {
  await run(["psql", "-U", user, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE ${restoreDb}`]);
  await run(
    ["pg_restore", "-U", user, "-d", restoreDb, "--no-owner", "--no-privileges", "--exit-on-error"],
    { stdin: createReadStream(backup) },
  );
  const verification = await run([
    "psql", "-U", user, "-d", restoreDb, "-At", "-v", "ON_ERROR_STOP=1", "-c",
    "SELECT 'migrations=' || COUNT(*) FROM schema_migrations; SELECT 'contests=' || COUNT(*) FROM contests; SELECT 'strategies=' || COUNT(*) FROM strategies; SELECT 'real_bets=' || COUNT(*) FROM real_bets;",
  ]);
  console.log(verification);
  console.log(`Restore check succeeded for ${backup}`);
} finally {
  await run([
    "psql", "-U", user, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c",
    `DROP DATABASE IF EXISTS ${restoreDb} WITH (FORCE)`,
  ]).catch((error) => console.error(`Failed to drop restore-check database: ${error.message}`));
}
