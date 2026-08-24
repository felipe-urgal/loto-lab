import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const envFile = process.env.LOTO_LAB_ENV_FILE || ".env.production";
const composeFile = "docker-compose.prod.yml";
const user = process.env.POSTGRES_USER || "loto_lab";
const database = process.env.POSTGRES_DB || "loto_lab";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = resolve(process.argv[2] || `backups/loto-lab-${stamp}.dump`);

await mkdir(dirname(output), { recursive: true });

const args = [
  "compose", "--env-file", envFile, "-f", composeFile,
  "exec", "-T", "postgres",
  "pg_dump", "-U", user, "-d", database,
  "--format=custom", "--no-owner", "--no-privileges",
];

const child = spawn("docker", args, { stdio: ["ignore", "pipe", "inherit"] });
const stream = createWriteStream(output, { flags: "wx" });
child.stdout.pipe(stream);

const exitCode = await new Promise((resolveCode, reject) => {
  child.once("error", reject);
  child.once("close", resolveCode);
});

if (exitCode !== 0) {
  stream.destroy();
  throw new Error(`pg_dump failed with exit code ${exitCode}`);
}

await new Promise((resolveDone, reject) => {
  stream.once("finish", resolveDone);
  stream.once("error", reject);
  if (stream.writableFinished) resolveDone();
});

console.log(output);
