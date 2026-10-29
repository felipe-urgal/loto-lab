#!/usr/bin/env node
// Emite o status v1 lido pelo Dev Dashboard (prod:status): revisão do checkout
// em produção + estado do serviço `app` no Docker Compose. Somente leitura.
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 4_000,
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function appState() {
  try {
    const output = run("docker", [
      "compose",
      "--env-file",
      ".env.production",
      "-f",
      "docker-compose.prod.yml",
      "ps",
      "--format",
      "json",
      "app",
    ]);
    const containers = output
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const app = containers.find((container) => container.Service === "app");
    if (!app || app.State !== "running") return "unavailable";
    return app.Health === "healthy" || !app.Health ? "ready" : "degraded";
  } catch {
    return "unavailable";
  }
}

const revision = run("git", ["rev-parse", "--verify", "HEAD"]);

console.log(
  `DEV_DASHBOARD_PRODUCTION_STATUS_V1=${JSON.stringify({ version: 1, revision, state: appState() })}`,
);
