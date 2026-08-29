import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Analyses 2.0 is lazy-loaded, independently degradable and exposes the five modes", async () => {
  const [
    source,
    css,
    hardeningCss,
    loader,
    services,
    app,
    advanced,
    hardening,
    repository,
    workerClient,
    worker,
  ] = await Promise.all([
    readFile("web/analysis-v2.js", "utf8"),
    readFile("web/analysis-v2.css", "utf8"),
    readFile("web/analysis-v2-hardening.css", "utf8"),
    readFile("web/feature-loader.js", "utf8"),
    readFile("src/api/services.ts", "utf8"),
    readFile("src/api/app.ts", "utf8"),
    readFile("src/analysis/advanced.ts", "utf8"),
    readFile("src/analysis/advancedHardening.ts", "utf8"),
    readFile("src/persistence/contestRepository.ts", "utf8"),
    readFile("src/analysis/advancedWorkerClient.ts", "utf8"),
    readFile("src/api/analysisWorker.ts", "utf8"),
  ]);

  assert.match(loader, /view === "analysis"/);
  assert.match(loader, /loadStyle\("analysis-v2"\)/);
  assert.match(loader, /loadStyle\("analysis-v2-hardening"\)/);
  assert.match(loader, /loadModule\("analysis-v2"\)/);
  assert.match(source, /Classificação/);
  assert.match(source, /Estrutura/);
  assert.match(source, /Dinâmica/);
  assert.match(source, /Combinações/);
  assert.match(source, /Validação/);
  assert.match(source, /Observado × esperado/);
  assert.match(source, /data-a2-number/);
  assert.match(source, /data-a2-pair-check/);
  assert.match(source, /data-a2-validation-window/);
  assert.match(source, /Atraso e frequência são descrições históricas/);
  assert.match(source, /role="tablist"/);
  assert.match(source, /<dialog class="a2-detail"/);
  assert.match(source, /showModal\(\)/);
  assert.match(source, /\.close\(\)/);
  assert.match(source, /ArrowLeft/);
  assert.match(source, /Escape/);
  assert.match(source, /Qualidade do histórico/);
  assert.match(source, /historicalExpected/);
  assert.match(source, /amostra insuficiente para classificar evidência/);
  assert.match(source, /\/analysis\/\$\{lottery\}\/advanced/);
  assert.doesNotMatch(source, /const cache = new Map\(\)/);
  assert.doesNotMatch(source, /lotterySelect\?\.addEventListener\("change"/);
  assert.match(css, /\.a2-tabs/);
  assert.match(css, /\.a2-detail-open/);
  assert.match(css, /:focus-visible/);
  assert.match(hardeningCss, /\.a2-detail::backdrop/);
  assert.match(hardeningCss, /repeat\(4/);

  assert.match(advanced, /exactBinomialTwoSidedP/);
  assert.match(advanced, /bonferroni-\$\{VALIDATION_COMPARISONS\}-tests/);
  assert.match(hardening, /historicalExpected/);
  assert.match(hardening, /leftCensored/);
  assert.match(hardening, /MIN_EVIDENCE_ROUNDS/);
  assert.match(hardening, /targetNumber = latest\.number - offset/);

  assert.match(repository, /listAnalysisHistory/);
  assert.doesNotMatch(repository.match(/async listAnalysisHistory[\s\S]*?\n  }/)?.[0] ?? "", /contest_prize_tiers/);

  assert.match(services, /analysisSignature/);
  assert.match(services, /createHash\("sha256"\)/);
  assert.match(services, /advancedAnalysisInFlight/);
  assert.match(services, /async analyze\(lottery: LotteryId\): Promise<AnalysisResponse>/);
  assert.match(services, /buildNumberAnalysis\(contests, config\)/);
  assert.match(services, /async analyzeAdvanced/);
  assert.match(services, /runAdvancedAnalysisInWorker\(contests, lottery\)/);
  assert.match(app, /analysis\\\/\(\[\^\/\]\+\)\\\/advanced/);
  assert.match(app, /services\.analyzeAdvanced\(lottery\)/);

  assert.match(workerClient, /ADVANCED_ANALYSIS_TIMEOUT_MS = 15_000/);
  assert.match(workerClient, /worker\.terminate\(\)/);
  assert.match(workerClient, /resourceLimits/);
  assert.match(worker, /hardenAdvancedAnalysis/);
  assert.match(worker, /buildAdvancedAnalysis\(job\.contests, config\)/);
});
