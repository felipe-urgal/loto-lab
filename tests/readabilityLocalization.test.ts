import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

async function source(path: string) {
  return readFile(path, "utf8");
}

function explicitFontSizes(css: string) {
  return [...css.matchAll(/font-size:\s*(\d+)px/g)].map((match) => Number(match[1]));
}

function assertMinimumExplicitFontSize(css: string, label: string, minimum = 16) {
  const sizes = explicitFontSizes(css);
  assert.ok(sizes.length > 0, `${label} should expose functional typography in source`);
  assert.ok(sizes.every((size) => size >= minimum), `${label} contains font-size below ${minimum}px: ${sizes.filter((size) => size < minimum).join(", ")}`);
}

test("web build ships canonical styles without global readability or localization layers", async () => {
  const pages = ["index.html", "agenda.html", "ai.html", "jobs.html", "lab.html", "strategies.html"];

  for (const page of pages) {
    const html = await source(`web-dist/${page}`);
    assert.doesNotMatch(html, /\/assets\/readability\.(?:css|js)(?:\?|["'])/, `${page} must not load a readability layer`);
    assert.doesNotMatch(html, /\/assets\/localization\.js(?:\?|["'])/, `${page} must not load localization.js`);
  }

  const assets = await readdir("web-dist/assets");
  assert.equal(assets.includes("readability.css"), false, "built assets must not contain readability.css");
  assert.equal(assets.includes("readability.js"), false, "built assets must not contain readability.js");
  assert.equal(assets.includes("localization.js"), false, "built assets must not contain localization.js");
});

test("canonical web source owns the 16px functional typography floor", async () => {
  const styles = await source("web/styles.css");
  const uiFoundation = await source("web/ui-foundation.css");
  const strategiesWorkspace = await source("web/strategies-workspace.css");
  const jobsWorkspace = await source("web/jobs-workspace.css");
  const agenda = await source("web/agenda-workspace.css");
  const build = await source("scripts/buildWeb.mjs");
  const e2e = await source("scripts/e2eReadability.mjs");

  assert.match(uiFoundation, /html \{ font-size: 16px; \}/);
  assert.match(uiFoundation, /body \{ font-size: 16px; line-height: 1\.55; \}/);
  assert.match(uiFoundation, /\.brand-copy strong \{ font-size: 18px; \}/);
  assert.match(uiFoundation, /\.topbar-copy h1 \{ font-size: 26px; \}/);
  assert.match(uiFoundation, /\.section-head h2 \{ font-size: 20px; \}/);
  assert.match(uiFoundation, /\.metric-value \{ font-size: 28px; \}/);
  assert.match(uiFoundation, /\.button, \.link-button \{ min-height: 42px; padding-inline: 14px; \}/);
  assert.match(uiFoundation, /\.button\.compact \{ min-height: 38px; \}/);
  assert.match(uiFoundation, /\.field input, \.field select \{ min-height: 46px; \}/);
  assert.match(uiFoundation, /\.ball \{ width: 38px; height: 38px; \}/);
  assert.match(uiFoundation, /\.list-row \{ min-height: 70px; \}/);
  assert.match(uiFoundation, /\.topbar-copy h1 \{ font-size: 24px; \}/);
  assert.match(strategiesWorkspace, /\.experiment-card-head h3 \{[^}]*font-size: 18px;/);
  assert.match(jobsWorkspace, /#job-form \.form-inline-note \{[^}]*line-height: 1\.45;/);
  assert.match(agenda, /\.agenda-card h3 \{\s*font-size: 18px;/);

  assert.doesNotMatch(build, /readability\.(?:css|js)/);
  assert.doesNotMatch(build, /localization\.js/);
  assert.doesNotMatch(e2e, /readability-min-text/);
  assert.match(e2e, /getComputedStyle\(el\)\.fontSize/);
  assert.match(e2e, /size < minimum - 0\.01/);

  const webEntries = await readdir("web", { withFileTypes: true });
  const cssFiles = webEntries.filter((entry) => entry.isFile() && entry.name.endsWith(".css"));
  assert.ok(cssFiles.length > 0, "web should contain canonical CSS files");

  for (const entry of cssFiles) {
    const stylesheet = await source(`web/${entry.name}`);
    const sizes = explicitFontSizes(stylesheet);
    assert.ok(
      sizes.every((size) => size >= 16),
      `${entry.name} contains font-size below 16px: ${sizes.filter((size) => size < 16).join(", ")}`,
    );
  }

  const inlineSources = webEntries.filter((entry) => entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".html")));
  for (const entry of inlineSources) {
    const content = await source(`web/${entry.name}`);
    assert.doesNotMatch(content, /style=["'][^"']*font-size\s*:/i, `${entry.name} must not use inline font-size corrections`);
  }

  assertMinimumExplicitFontSize(styles, "styles.css");
  assertMinimumExplicitFontSize(uiFoundation, "ui-foundation.css");
});

test("Analyses 2.0 owns its Portuguese product vocabulary in source", async () => {
  const analysis = await source("web/src/features/analysisV2.ts");

  assert.match(analysis, /ranking: "Classificação"/);
  assert.match(analysis, /Decomposição da pontuação/);
  assert.match(analysis, /Classificação por escore-z; valor-p exato/);
  assert.doesNotMatch(analysis, /ranking: "Ranking"/);
  assert.doesNotMatch(analysis, />Ranking auditável</);
  assert.doesNotMatch(analysis, />Score</);
  assert.doesNotMatch(analysis, /Decomposição do score/);
});

test("Generator 2.0 owns its conditioned reference copy in Portuguese", async () => {
  const generator = await source("web/src/features/generationV2.ts");

  assert.match(generator, />Referência condicionada</);
  assert.match(generator, /As referências abaixo são condicionadas/);
  assert.doesNotMatch(generator, />Baseline condicionado</);
  assert.doesNotMatch(generator, /Os baselines abaixo são condicionados/);
});

test("canonical owners keep dashboard, analyses and historical-test copy in Portuguese", async () => {
  const [app, backtests] = await Promise.all([
    source("web/app.js"),
    source("web/src/features/backtests.ts"),
  ]);

  assert.match(app, /dashboard: \["Painel"/);
  assert.match(app, /backtests: \["Testes históricos"/);
  assert.match(app, /Frequências, pontuação e classificação por horizonte/);
  assert.match(app, /Resumo do último teste histórico salvo/);
  assert.match(app, /Dezenas com maior pontuação/);
  assert.match(backtests, /Executar teste histórico/);
  assert.match(backtests, /Teste histórico concluído/);

  assert.doesNotMatch(app, /dashboard: \["Dashboard"/);
  assert.doesNotMatch(app, /backtests: \["Backtests"/);
  assert.doesNotMatch(app, /Resumo do último backtest persistido/);
  assert.doesNotMatch(backtests, />Executar backtest</);
  assert.doesNotMatch(app, />Score</);
  assert.doesNotMatch(app, /Executar teste histórico/);
  assert.doesNotMatch(app, /Teste histórico concluído/);
});

test("strategy lab owns its visible vocabulary in Portuguese while preserving internal contracts", async () => {
  const html = await source("web/lab.html");
  const lab = await source("web/src/features/lab.ts");

  assert.match(html, /Hipótese → regra → teste histórico → referência → evidência → decisão/);
  assert.match(html, /Evidência acima do acaso/);
  assert.match(html, /Evidência abaixo do acaso/);
  assert.doesNotMatch(html, /→ backtest →/);
  assert.doesNotMatch(html, /→ benchmark →/);
  assert.doesNotMatch(html, /Evidência (?:acima|abaixo) do random/);

  for (const copy of [
    "Pontuação v1 × v2 × sem pontuação",
    "Pontuação v1 × Pontuação v2 × sem pontuação",
    "Isola o valor da classificação",
    "validação progressiva sem olhar concursos futuros",
    "Otimização por validação progressiva",
    "A classificação colocou os números sorteados",
    "Classificação por ROI",
    "Classificação por taxa de premiação",
    "modelos de pontuação",
    "Executando testes históricos",
  ]) {
    assert.ok(lab.includes(copy), `missing canonical laboratory copy: ${copy}`);
  }

  assert.match(lab, /experiment === "score-model"/);
  assert.match(lab, /result\.rankingBasis/);
  assert.match(lab, /result\.rankingQuality/);
  assert.match(html, /class="lab-ranking"/);
  assert.doesNotMatch(lab, />Score v1 × v2 × sem score</);
  assert.doesNotMatch(lab, /Executando backtests/);
  assert.doesNotMatch(lab, /"Ranking por ROI"/);
  assert.doesNotMatch(lab, /"Ranking por taxa de premiação"/);
});

test("refinement layers own their Portuguese analysis vocabulary while preserving score contracts", async () => {
  const refinements = await source("web/refinements.js");
  const labRefinementsBoundary = await source("web/lab-refinements.js");
  const labRefinements = await source("web/src/features/labRefinements.ts");

  for (const copy of [
    "Explorar classificação",
    '<option value="score">Pontuação</option>',
    "Como a pontuação é calculada?",
    "posições relativas na classificação",
  ]) {
    assert.ok(refinements.includes(copy), `missing canonical refinement copy: ${copy}`);
  }
  assert.match(refinements, /b\.score - a\.score/);
  assert.match(refinements, /row\.score\.toFixed/);
  assert.match(refinements, /class="score-cell"/);
  assert.doesNotMatch(refinements, /style="font-size:\s*\d+px"/, "refinement copy must not use inline font-size corrections");
  assert.doesNotMatch(refinements, /Explorar ranking/);
  assert.doesNotMatch(refinements, />Score<\/option>/);
  assert.doesNotMatch(refinements, /Como o score é calculado/);
  assert.doesNotMatch(refinements, /posições relativas no ranking/);

  assert.equal(labRefinementsBoundary.trim(), 'import "./src/features/labRefinements.js";');
  assert.match(labRefinements, /document\.querySelector<HTMLElement>\("#lab-ranking"\)/);
  assert.match(labRefinements, /métrica de classificação não variou/);
  assert.doesNotMatch(labRefinements, /métrica de ranking não variou/);
});

test("real-bet flow remains owned by typed My Games while dashboard summary belongs to dashboard scope", async () => {
  const controller = await source("web/src/features/myGames.ts");
  const presentation = await source("web/src/features/myGames/presentation.ts");
  const betForm = await source("web/src/features/myGames/betForm.ts");
  const dashboardBoundary = await source("web/dashboard-scope.js");
  const dashboard = await source("web/src/features/dashboardScope.ts");
  const myGames = [controller, presentation, betForm].join("\n");

  assert.match(controller, /api<RealBetResponse>\(`\/real-bets\/\$\{lottery\}\?limit=200`/);
  assert.match(betForm, /api\("\/real-bets"/);
  assert.match(controller, /currentMainView\(\) !== "games"/);
  assert.match(presentation, /Resultado da aposta/);
  assert.match(presentation, /Custo real/);
  assert.match(presentation, /somente gerado/);
  assert.doesNotMatch(myGames, /real-performance-section/);
  assert.doesNotMatch(myGames, /refineDashboard/);

  assert.equal(dashboardBoundary, 'import "./src/features/dashboardScope.js";\n');
  assert.match(dashboard, /function realStatusCard/);
  assert.match(dashboard, /Apostas reais/);
  assert.match(dashboard, /Resultado real/);
  assert.match(dashboard, /knownNumber\(real\.netResult\)/);
});
