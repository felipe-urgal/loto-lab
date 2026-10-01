import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("web shell exposes only the three approved destinations and redirects legacy routes", async () => {
  const [boundary, shell, html] = await Promise.all([
    source("web/shell.js"),
    source("web/src/core/shell.ts"),
    source("web/index.html"),
  ]);

  assert.equal(boundary.trim(), 'import "./src/core/shell.js";');
  assert.doesNotMatch(boundary, /data-shell-nav|localStorage|LEGACY_PATH_REDIRECTS/);

  assert.match(shell, /interface NavigationItem/);
  assert.match(shell, /data-shell-nav/);
  assert.match(shell, /loto-lab:lottery/);
  assert.match(shell, /label: "Painel"/);
  assert.match(shell, /label: "Análises"/);
  assert.match(shell, /label: "Gerar jogos"/);
  assert.doesNotMatch(shell, /label: "Meus jogos"|label: "Testes históricos"|label: "Laboratório"|label: "Execuções"|label: "Agenda"|label: "IA"/);
  assert.doesNotMatch(shell, /nav-more|Mais opções/);
  assert.match(shell, /"\/agenda": "dashboard"/);
  assert.match(shell, /"\/jobs": "dashboard"/);
  assert.match(shell, /"\/lab": "analysis"/);
  assert.match(shell, /"\/strategies": "analysis"/);
  assert.match(shell, /"\/ai": "analysis"/);
  assert.match(shell, /location\.replace/);
  assert.match(shell, /hashchange/);

  assert.match(html, /src="\/assets\/shell\.js"/);
  assert.match(html, /value="mais-milionaria"/);
  assert.match(html, /value="timemania"/);
  assert.match(html, /value="super-sete"/);
});
