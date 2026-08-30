import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path: string): Promise<string> {
  return readFile(path, "utf8");
}

const pages = ["index.html", "agenda.html", "ai.html", "jobs.html", "lab.html", "strategies.html"];

test("Prototype 1 design system is the shared source of truth across web surfaces", async () => {
  const designSystem = await source("web/design-system.css");

  assert.match(designSystem, /--bg:\s*#08111d/);
  assert.match(designSystem, /--accent:\s*#1689ff/);
  assert.match(designSystem, /--success:\s*#24c77d/);
  assert.match(designSystem, /--sidebar-width:\s*220px/);
  assert.match(designSystem, /\.button\.primary\s*\{[^}]*background:\s*var\(--accent\)/s);
  assert.match(designSystem, /\.status-row\.is-ok \.status-dot\s*\{[^}]*background:\s*var\(--success\)/s);

  for (const page of pages) {
    const html = await source(`web/${page}`);
    assert.match(html, /<meta name="theme-color" content="#08111d" \/>/, `${page} must own the Prototype 1 browser chrome color`);
    assert.match(html, /\/assets\/design-system\.css/, `${page} must load the canonical design system`);
  }
});

test("built web surfaces ship the fingerprinted Prototype 1 design system", async () => {
  for (const page of pages) {
    const html = await source(`web-dist/${page}`);
    assert.match(
      html,
      /\/assets\/design-system\.css\?v=[a-f0-9]{12}/,
      `${page} must ship the fingerprinted design system`,
    );
  }
});
