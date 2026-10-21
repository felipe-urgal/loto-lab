import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path: string) => readFile(path, "utf8");

test("Playground owns its light palette, local fonts and motion preferences", async () => {
  const css = await source("web/generator.css");
  const html = await source("web/index.html");
  assert.match(html, /theme-color" content="#faf9f3"/);
  assert.match(html, /assets\/generator\.css/);
  assert.doesNotMatch(html, /assets\/(?:design-system|styles|ui-foundation)\.css/);
  assert.match(css, /#faf9f3/);
  assert.match(css, /#4d41f8/);
  assert.match(css, /bricolage-grotesque\.woff2/);
  assert.match(css, /dm-sans\.woff2/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:focus-visible/);
});

test("production ships fingerprinted Playground assets and a single destination", async () => {
  const html = await source("web-dist/index.html");
  assert.match(html, /assets\/generator\.css\?v=[a-f0-9]{12}/);
  assert.match(html, /images\/generator-orbit\.webp\?v=[a-f0-9]{12}/);
  assert.match(html, /fonts\/dm-sans\.woff2\?v=[a-f0-9]{12}/);
  for (const page of ["agenda", "ai", "jobs", "lab", "strategies"]) {
    await assert.rejects(source(`web-dist/${page}.html`), /ENOENT/);
  }
});

test("nested frontend imports carry the same build version as the entry point", async () => {
  const html = await source("web-dist/index.html");
  const version = html.match(/data-build="([a-f0-9]{12})"/)?.[1];
  assert.ok(version);
  for (const name of ["app.js", "src/features/generatorPage.js", "src/features/generationV2.js"]) {
    const module = await source(`web-dist/assets/${name}`);
    const imports = [...module.matchAll(/(?:from|import)\s*["'](\.[^"']+)["']/g)].map(match => match[1]!);
    assert.ok(imports.length > 0);
    assert.ok(imports.every(path => path.endsWith(`?v=${version}`)), `${name}: nested imports must be fresh after an update`);
  }
});
