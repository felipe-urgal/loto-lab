import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("agenda workspace follows Prototype 1 while preserving notification safety contracts", async () => {
  const [html, workspace, agenda] = await Promise.all([
    readFile("web/agenda.html", "utf8"),
    readFile("web/agenda-workspace.css", "utf8"),
    readFile("web/agenda.js", "utf8"),
  ]);

  const baseAgenda = html.indexOf('/assets/agenda.css');
  const workspaceLayer = html.indexOf('/assets/agenda-workspace.css');
  assert.ok(baseAgenda >= 0, "base Agenda styles must remain available");
  assert.ok(workspaceLayer > baseAgenda, "Prototype 1 must be the final Agenda presentation layer");

  assert.match(workspace, /\.agenda-content > \.stack \{[\s\S]*max-width: 1440px/);
  assert.match(workspace, /\.agenda-status-pill \{[\s\S]*background: var\(--accent-soft\)[\s\S]*color: var\(--accent-strong\)/);
  assert.match(workspace, /\.agenda-notification\.is-unread \{[\s\S]*box-shadow: inset 3px 0 0 var\(--accent\)/);
  assert.match(workspace, /\.agenda-severity\.success \{[\s\S]*background: var\(--success\)/);
  assert.match(workspace, /\.agenda-severity\.warning \{[\s\S]*background: var\(--warning\)/);
  assert.match(workspace, /\.agenda-severity\.error \{[\s\S]*background: var\(--danger\)/);
  assert.match(workspace, /@media \(max-width: 700px\)[\s\S]*\.agenda-grid \{[\s\S]*grid-template-columns: 1fr/);
  assert.match(workspace, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(workspace, /font-size:\s*(?:[0-9]|1[0-5])px/);

  assert.match(agenda, /fetch\(`\/api\/v1\/agenda\$\{requestFilter === "unread" \? "\?unread=true" : ""\}`/);
  assert.match(agenda, /const url = new URL\(value, location\.origin\)/);
  assert.match(agenda, /if \(url\.origin !== location\.origin\) return undefined/);
  assert.match(agenda, /fetch\(`\/api\/v1\/notifications\/\$\{id\}\/read`, \{ method: "POST" \}\)/);
  assert.match(agenda, /fetch\("\/api\/v1\/notifications\/read-all", \{ method: "POST" \}\)/);
  assert.match(agenda, /new AbortController\(\)/);
  assert.match(agenda, /const token = \+\+loadToken/);
  assert.match(agenda, /button\.setAttribute\("aria-pressed", String\(selected\)\)/);
});
