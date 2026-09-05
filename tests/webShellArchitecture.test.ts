import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("web shell keeps a thin JavaScript boundary with TypeScript ownership", async () => {
  const [boundary, shell, html] = await Promise.all([
    source("web/shell.js"),
    source("web/src/core/shell.ts"),
    source("web/index.html"),
  ]);

  assert.equal(boundary.trim(), 'import "./src/core/shell.js";');
  assert.doesNotMatch(boundary, /data-shell-nav|localStorage|matchMedia|nav-more/);

  assert.match(shell, /interface NavigationItem/);
  assert.match(shell, /data-shell-nav/);
  assert.match(shell, /loto-lab:lottery/);
  assert.match(shell, /max-width: 680px/);
  assert.match(shell, /aria-expanded/);
  assert.match(shell, /Escape/);
  assert.match(shell, /hashchange/);

  assert.match(html, /src="\/assets\/shell\.js"/);
});
