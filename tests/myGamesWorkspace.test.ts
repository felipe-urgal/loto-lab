import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

test("my games workspace follows Prototype 1 with typed-only functional ownership", async () => {
  const [loader, workspace, boundary, controller, presentation, comparison, formatting, betForm, auditability] = await Promise.all([
    readFile("web/src/core/featureLoader.ts", "utf8"),
    readFile("web/my-games-workspace.css", "utf8"),
    readFile("web/my-games-v2.js", "utf8"),
    readFile("web/src/features/myGames.ts", "utf8"),
    readFile("web/src/features/myGames/presentation.ts", "utf8"),
    readFile("web/src/features/myGames/comparison.ts", "utf8"),
    readFile("web/src/features/myGames/formatting.ts", "utf8"),
    readFile("web/src/features/myGames/betForm.ts", "utf8"),
    readFile("web/src/features/myGames/auditability.ts", "utf8"),
  ]);
  const myGames = [controller, presentation, comparison, formatting, betForm, auditability].join("\n");

  const baseStyle = loader.indexOf('loadStyle("my-games-v2")');
  const moduleLoad = loader.indexOf('loadModule("my-games-v2")');
  const workspaceLoad = loader.indexOf('loadStyle("my-games-workspace")');
  const gamesBranch = loader.indexOf('if (view === "games")');
  const refinementsLoad = loader.indexOf('loadStyledModule("refinements")');
  assert.ok(baseStyle >= 0, "My Games 2.0 base style must remain available");
  assert.ok(moduleLoad > baseStyle, "My Games functional module must follow its base style");
  assert.ok(workspaceLoad > moduleLoad, "Prototype 1 must load after the functional owner");
  assert.ok(gamesBranch >= 0 && refinementsLoad > gamesBranch, "My Games must return before generic legacy refinements load");
  assert.doesNotMatch(loader, /load(?:Module|Style)\("(?:real-bet-auditability|real-bets|my-games-management)"\)/);
  assert.match(loader, /view === "games"[\s\S]*return loadMyGamesFeatures\(\)/);
  assert.match(loader, /Não foi possível carregar Meus Jogos/);

  assert.match(workspace, /\.mg2-shell \{[\s\S]*max-width: 1440px/);
  assert.match(workspace, /\.mg2-filter\.is-active \{[\s\S]*background: var\(--accent-soft\)[\s\S]*color: var\(--accent-strong\)/);
  assert.match(workspace, /\.mg2-number\.is-fixed \{[\s\S]*background: var\(--accent-soft\)/);
  assert.match(workspace, /\.mg2-number\.is-match \{[\s\S]*background: var\(--success-soft\)/);
  assert.match(workspace, /\.mg2-status\.is-success \{[\s\S]*color: var\(--success-strong\)/);
  assert.match(workspace, /\.mg2-count\.is-active \{[\s\S]*background: var\(--accent-soft\)/);
  assert.match(workspace, /@media \(max-width: 760px\)[\s\S]*\.mg2-summary \{[\s\S]*grid-template-columns: 1fr/);
  assert.match(workspace, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(workspace, /font-size:\s*(?:[0-9]|1[0-5])px/);

  assert.equal(boundary.trim(), 'import "./src/features/myGames.js";');
  assert.ok(controller.includes('from "../core/api.js"'));
  assert.ok(controller.includes('from "../core/viewLifecycle.js"'));
  assert.ok(controller.includes('from "../shared/escaping.js"'));
  assert.ok(controller.includes('from "../shared/toast.js"'));
  assert.ok(!myGames.includes('from "./runtime.js"'));
  assert.match(controller, /currentMainView\(\)/);
  assert.doesNotMatch(controller, /function currentView\(/);
  assert.match(betForm, /api\("\/real-bets"/);
  assert.match(betForm, /bindTargetContestAudit\(form, batch\.targetContestNumber\)/);
  assert.match(betForm, /contestNumber === batch\.targetContestNumber/);
  assert.match(comparison, /\/game-batches\/\$\{batch\.id\}\/comparison/);
  assert.match(controller, /\/game-batches\/\$\{batchId\}\/hide/);
  assert.match(controller, /\/game-batches\/\$\{batchId\}\/show/);
  assert.match(presentation, /Aguardando resultado/);
  assert.match(presentation, /Conferência oficial/);
  assert.match(controller, /onViewRendered\(scheduleMount\)/);
  assert.doesNotMatch(controller, /\nscheduleMount\(\);\s*$/);
  assert.match(formatting, /typeof value === "number" && Number\.isFinite\(value\)/);
  assert.doesNotMatch(formatting, /Number\(value\)/);

  assert.match(auditability, /input\.readOnly = true/);
  assert.match(auditability, /input\.max = String\(target\)/);
  assert.match(auditability, /input\.dataset\.auditTargetContest = String\(target\)/);
  assert.match(auditability, /Use exatamente o concurso alvo/);
  assert.match(auditability, /addEventListener\("submit"[\s\S]*capture: true/);
  assert.doesNotMatch(auditability, /MutationObserver|document\.addEventListener/);
});

test("legacy My Games functional assets stay removed", async () => {
  for (const path of [
    "web/real-bet-auditability.js",
    "web/real-bets.js",
    "web/real-bets.css",
    "web/my-games-management.js",
    "web/my-games-management.css",
  ]) {
    await assert.rejects(access(path));
  }
});
