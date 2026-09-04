import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { VIEW_RENDERED_EVENT, mainViewFromHash } from "../web/src/core/viewLifecycle.js";

const runtimeSource = await readFile(resolve(process.cwd(), "web/runtime.js"), "utf8");
const featureLoaderBoundarySource = await readFile(resolve(process.cwd(), "web/feature-loader.js"), "utf8");
const featureLoaderSource = await readFile(resolve(process.cwd(), "web/src/core/featureLoader.ts"), "utf8");
const dataStatusBoundarySource = await readFile(resolve(process.cwd(), "web/data-status.js"), "utf8");
const dataStatusSource = await readFile(resolve(process.cwd(), "web/src/features/dataStatus.ts"), "utf8");

test("view lifecycle normalizes the main hash contract", () => {
  assert.equal(mainViewFromHash(""), "dashboard");
  assert.equal(mainViewFromHash("#dashboard"), "dashboard");
  assert.equal(mainViewFromHash("#analysis"), "analysis");
  assert.equal(mainViewFromHash("generate"), "generate");
  assert.equal(VIEW_RENDERED_EVENT, "loto-lab:view-rendered");
});

test("runtime keeps lifecycle compatibility while implementation moves to TypeScript", () => {
  assert.match(runtimeSource, /from "\.\/src\/core\/viewLifecycle\.js"/);
  assert.match(runtimeSource, /onMainViewChanged/);
  assert.doesNotMatch(runtimeSource, /export function currentMainView/);
  assert.doesNotMatch(runtimeSource, /export function onMainViewChanged/);
  assert.doesNotMatch(runtimeSource, /export function onViewRendered/);
});

test("feature loader boundary delegates to the typed core owner", () => {
  assert.equal(featureLoaderBoundarySource.trim(), 'import "./src/core/featureLoader.js";');
  assert.match(
    featureLoaderSource,
    /import \{ currentMainView, emitViewRendered \} from "\.\/viewLifecycle\.js"/,
  );
  assert.match(featureLoaderSource, /new Map<string, Promise<boolean>>\(\)/);
  assert.match(featureLoaderSource, /emitViewRendered\(\{ view, lottery, token \}\)/);
  assert.match(featureLoaderSource, /loadStyledModule\("dashboard-scope"\)/);
  assert.match(featureLoaderSource, /loadModule\("my-games-v2"\)/);
  assert.doesNotMatch(featureLoaderSource, /new CustomEvent\("loto-lab:view-rendered"/);
  assert.doesNotMatch(featureLoaderSource, /location\.hash\.replace\("#", ""\)/);
  assert.doesNotMatch(featureLoaderBoundarySource, /currentMainView|emitViewRendered|hashchange|loadModule|loadStyle/);
});

test("data status is implemented in TypeScript and consumes shared core contracts directly", () => {
  assert.equal(dataStatusBoundarySource.trim(), 'import "./src/features/dataStatus.js";');
  assert.match(dataStatusSource, /import \{ api \} from "\.\.\/core\/api\.js"/);
  assert.match(
    dataStatusSource,
    /import \{ currentMainView, onMainViewChanged \} from "\.\.\/core\/viewLifecycle\.js"/,
  );
  assert.match(dataStatusSource, /api<DataStatusPayload>\("\/data\/status"\)/);
  assert.match(dataStatusSource, /api<OperationsStatus>\("\/operations\/status"\)/);
  assert.match(dataStatusSource, /onMainViewChanged\(\(\) => \{/);
  assert.doesNotMatch(dataStatusSource, /location\.hash/);
  assert.doesNotMatch(dataStatusSource, /addEventListener\("hashchange"/);
  assert.doesNotMatch(dataStatusSource, /from "\.\.\/\.\.\/runtime\.js"/);
  assert.doesNotMatch(dataStatusSource, /fetch\("\/api\/v1/);
});
