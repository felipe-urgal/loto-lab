import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("generator entry exposes one page without product navigation", async () => {
  const html = await readFile("web/index.html", "utf8");
  assert.match(html, /id="content"/);
  assert.match(html, /id="recent-results"/);
  assert.match(html, /id="sync-results"/);
  assert.doesNotMatch(html, /<nav|class="sidebar"|data-shell-nav|assets\/shell\.js|feature-loader\.js/);
  assert.match(html, /src="\/assets\/app\.js"/);
});
