import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  formatCurrency,
  formatDateTime,
  formatPercent,
} from "../web/src/shared/formatters.js";

const [runtimeSource, buildSource, webTsconfigSource] = await Promise.all([
  readFile(resolve(process.cwd(), "web/runtime.js"), "utf8"),
  readFile(resolve(process.cwd(), "scripts/buildWeb.mjs"), "utf8"),
  readFile(resolve(process.cwd(), "tsconfig.web.json"), "utf8"),
]);

test("shared web formatters preserve PT-BR display contracts", () => {
  assert.equal(formatCurrency(undefined), "—");
  assert.equal(formatCurrency(Number.NaN), "—");
  assert.equal(
    formatCurrency(0),
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(0),
  );

  assert.equal(formatPercent(undefined), "—");
  assert.equal(formatPercent(0), "0,0%");
  assert.equal(formatPercent(0.125), "12,5%");

  assert.equal(formatDateTime(null), "—");
  assert.equal(formatDateTime("invalid-date"), "—");
  const value = "2026-08-30T12:34:00Z";
  assert.equal(
    formatDateTime(value),
    new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(
      new Date(value),
    ),
  );
});

test("runtime keeps the existing formatter API while implementation moves to TypeScript", () => {
  assert.match(runtimeSource, /from "\.\/src\/shared\/formatters\.js"/);
  assert.doesNotMatch(runtimeSource, /function formatCurrency/);
  assert.doesNotMatch(runtimeSource, /function formatDateTime/);
  assert.doesNotMatch(runtimeSource, /function formatPercent/);
});

test("web build typechecks and transpiles TypeScript sources to browser JavaScript", () => {
  assert.match(buildSource, /ts\.transpileModule/);
  assert.match(buildSource, /extension === "\.ts"/);
  assert.match(buildSource, /rel\.replace\(\/\\\.ts\$\/, "\.js"\)/);

  const webTsconfig = JSON.parse(webTsconfigSource) as {
    compilerOptions?: { noEmit?: boolean; lib?: string[] };
    include?: string[];
  };
  assert.equal(webTsconfig.compilerOptions?.noEmit, true);
  assert.deepEqual(webTsconfig.include, ["web/src/**/*.ts"]);
  assert.ok(webTsconfig.compilerOptions?.lib?.includes("DOM"));
});
