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

  const shellOwner = shell + "\n" + await source("web/src/core/lotteryPreference.ts");
  assert.equal(boundary.trim(), 'import "./src/core/shell.js";');
  assert.doesNotMatch(boundary, /data-shell-nav|localStorage|LEGACY_PATH_REDIRECTS/);

  assert.match(shellOwner, /interface NavigationItem/);
  assert.match(shellOwner, /data-shell-nav/);
  assert.match(shellOwner, /loto-lab:lottery/);
  assert.match(shellOwner, /label: "Painel"/);
  assert.match(shellOwner, /label: "Análises"/);
  assert.match(shellOwner, /label: "Gerar jogos"/);
  assert.doesNotMatch(shell, /label: "Meus jogos"|label: "Testes históricos"|label: "Laboratório"|label: "Execuções"|label: "Agenda"|label: "IA"/);
  assert.doesNotMatch(shell, /nav-more|Mais opções/);
  assert.match(shellOwner, /"\/agenda": "dashboard"/);
  assert.match(shellOwner, /"\/jobs": "dashboard"/);
  assert.match(shellOwner, /"\/lab": "analysis"/);
  assert.match(shellOwner, /"\/strategies": "analysis"/);
  assert.match(shellOwner, /"\/ai": "analysis"/);
  assert.match(shellOwner, /location\.replace/);
  assert.match(shellOwner, /hashchange/);

  assert.match(html, /src="\/assets\/shell\.js"/);
  assert.match(html, /value="mais-milionaria"/);
  assert.match(html, /value="timemania"/);
  assert.match(html, /value="super-sete"/);
});
