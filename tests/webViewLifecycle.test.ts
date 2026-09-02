import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { VIEW_RENDERED_EVENT, mainViewFromHash } from "../web/src/core/viewLifecycle.js";

const runtimeSource = await readFile(resolve(process.cwd(), "web/runtime.js"), "utf8");
const featureLoaderSource = await readFile(resolve(process.cwd(), "web/feature-loader.js"), "utf8");
const dataStatusSource = await readFile(resolve(process.cwd(), "web/data-status.js"), "utf8");

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

test("feature loader emits the shared lifecycle contract", () => {
  assert.match(
    featureLoaderSource,
    /import \{ currentMainView, emitViewRendered \} from "\.\/runtime\.js"/,
  );
  assert.match(featureLoaderSource, /emitViewRendered\(\{ view, lottery, token \}\)/);
  assert.doesNotMatch(featureLoaderSource, /new CustomEvent\("loto-lab:view-rendered"/);
  assert.doesNotMatch(featureLoaderSource, /location\.hash\.replace\("#", ""\)/);
});

test("data status consumes the shared main-view lifecycle", () => {
  assert.match(
    dataStatusSource,
    /import \{ currentMainView, onMainViewChanged \} from "\.\/runtime\.js"/,
  );
  assert.match(dataStatusSource, /onMainViewChanged\(\(\) => \{/);
  assert.doesNotMatch(dataStatusSource, /location\.hash/);
  assert.doesNotMatch(dataStatusSource, /addEventListener\("hashchange"/);
});
