import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(path, "utf8");
}

function assertMinimumExplicitFontSize(css: string, label: string, minimum = 16) {
  const sizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((match) => Number(match[1]));
  assert.ok(sizes.length > 0, `${label} should expose functional typography in source`);
  assert.ok(sizes.every((size) => size >= minimum), `${label} contains font-size below ${minimum}px: ${sizes.filter((size) => size < minimum).join(", ")}`);
}

test("web build keeps static readability without runtime localization or font auditor", async () => {
  const pages = ["index.html", "agenda.html", "ai.html", "jobs.html", "lab.html", "strategies.html"];

  for (const page of pages) {
    const html = await source(`web-dist/${page}`);
    assert.match(html, /\/assets\/readability\.css\?v=[a-f0-9]{12}/, `${page} must load readability.css`);
    assert.doesNotMatch(html, /\/assets\/readability\.js(?:\?|["'])/, `${page} must not load readability.js`);
    assert.doesNotMatch(html, /\/assets\/localization\.js(?:\?|["'])/, `${page} must not load localization.js`);
  }
});

test("static readability layer establishes a hard 16px minimum for functional text", async () => {
  const css = await source("web/readability.css");
  const refinements = await source("web/refinements.css");
  const lab = await source("web/lab.css");
  const labV2 = await source("web/lab-v2.css");
  const agenda = await source("web/agenda.css");
  const ai = await source("web/ai.css");
  const dashboardScope = await source("web/dashboard-scope.css");
  const build = await source("scripts/buildWeb.mjs");
  const e2e = await source("scripts/e2eReadability.mjs");

  assert.match(css, /--loto-font-min: 16px/);
  assert.match(css, /body \{ font-size: 16px;/);
  assert.match(css, /th,[\s\S]*td,[\s\S]*font-size: 16px !important;/);
  assert.match(css, /\.field input,[\s\S]*\.field select[\s\S]*font-size: 16px !important;/);
  assert.match(css, /\.a2-panel-head strong,[\s\S]*font-size: 16px !important;/);
  assert.doesNotMatch(css, /readability-min-text/);
  assert.doesNotMatch(build, /readability\.js/);
  assert.doesNotMatch(build, /localization\.js/);
  assert.doesNotMatch(e2e, /readability-min-text/);
  assert.match(e2e, /getComputedStyle\(el\)\.fontSize/);
  assert.match(e2e, /size < minimum - 0\.01/);

  assertMinimumExplicitFontSize(css, "readability.css");
  assertMinimumExplicitFontSize(refinements, "refinements.css");
  assertMinimumExplicitFontSize(lab, "lab.css");
  assertMinimumExplicitFontSize(labV2, "lab-v2.css");
  assertMinimumExplicitFontSize(agenda, "agenda.css");
  assertMinimumExplicitFontSize(ai, "ai.css");
  assertMinimumExplicitFontSize(dashboardScope, "dashboard-scope.css");
});

test("Analyses 2.0 owns its Portuguese product vocabulary in source", async () => {
  const analysis = await source("web/analysis-v2.js");

  assert.match(analysis, /ranking: "Classificação"/);
  assert.match(analysis, /Decomposição da pontuação/);
  assert.match(analysis, /Classificação por escore-z; valor-p exato/);
  assert.doesNotMatch(analysis, /ranking: "Ranking"/);
  assert.doesNotMatch(analysis, />Ranking auditável</);
  assert.doesNotMatch(analysis, />Score</);
  assert.doesNotMatch(analysis, /Decomposição do score/);
});

test("Generator 2.0 owns its conditioned reference copy in Portuguese", async () => {
  const generator = await source("web/generation-v2.js");

  assert.match(generator, />Referência condicionada</);
  assert.match(generator, /As referências abaixo são condicionadas/);
  assert.doesNotMatch(generator, />Baseline condicionado</);
  assert.doesNotMatch(generator, /Os baselines abaixo são condicionados/);
});

test("core app owns dashboard, analyses and historical-test copy in Portuguese", async () => {
  const app = await source("web/app.js");

  assert.match(app, /dashboard: \["Painel"/);
  assert.match(app, /backtests: \["Testes históricos"/);
  assert.match(app, /Frequências, pontuação e classificação por horizonte/);
  assert.match(app, /Resumo do último teste histórico salvo/);
  assert.match(app, /Dezenas com maior pontuação/);
  assert.match(app, /Executar teste histórico/);
  assert.match(app, /Teste histórico concluído/);

  assert.doesNotMatch(app, /dashboard: \["Dashboard"/);
  assert.doesNotMatch(app, /backtests: \["Backtests"/);
  assert.doesNotMatch(app, /Resumo do último backtest persistido/);
  assert.doesNotMatch(app, />Executar backtest</);
  assert.doesNotMatch(app, />Score</);
});

test("strategy lab owns its visible vocabulary in Portuguese while preserving internal contracts", async () => {
  const html = await source("web/lab.html");
  const lab = await source("web/lab.js");

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
  const labRefinements = await source("web/lab-refinements.js");

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
  assert.doesNotMatch(refinements, /Explorar ranking/);
  assert.doesNotMatch(refinements, />Score<\/option>/);
  assert.doesNotMatch(refinements, /Como o score é calculado/);
  assert.doesNotMatch(refinements, /posições relativas no ranking/);

  assert.match(labRefinements, /const ranking = document\.querySelector\("#lab-ranking"\)/);
  assert.match(labRefinements, /métrica de classificação não variou/);
  assert.doesNotMatch(labRefinements, /métrica de ranking não variou/);
});

test("real-bet UI owns its historical-test vocabulary in source", async () => {
  const realBets = await source("web/real-bets.js");

  assert.match(realBets, /não inclui testes históricos/);
  assert.match(realBets, /separado dos lotes apenas gerados e dos testes históricos/);
  assert.doesNotMatch(realBets, /não inclui backtests/);
  assert.doesNotMatch(realBets, /lotes apenas gerados e dos backtests/);
  assert.match(realBets, /\/real-bets\/\$\{lottery\}/);
  assert.match(realBets, /api\("\/real-bets"/);
});
