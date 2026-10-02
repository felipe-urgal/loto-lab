import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Analyses is lazy-loaded, typed and exposes one capability-aware number map", async () => {
  const [
    boundary,
    source,
    types,
    css,
    workspaceCss,
    loader,
    controller,
    basicAnalysisUseCase,
    advancedAnalysisUseCase,
    routes,
    server,
    advanced,
    validation,
    hardening,
    repository,
    workerClient,
    worker,
  ] = await Promise.all([
    readFile("web/analysis-v2.js", "utf8"),
    readFile("web/src/features/analysisV2.ts", "utf8"),
    readFile("web/src/features/analysisV2/types.ts", "utf8"),
    readFile("web/analysis-v2.css", "utf8"),
    readFile("web/analysis-workspace.css", "utf8"),
    readFile("web/src/core/featureLoader.ts", "utf8"),
    readFile("src/api/analysis.ts", "utf8"),
    readFile("src/application/analyzeLottery.ts", "utf8"),
    readFile("src/application/analyzeAdvancedLottery.ts", "utf8"),
    readFile("src/api/routes.ts", "utf8"),
    readFile("src/api/server.ts", "utf8"),
    readFile("src/analysis/advanced.ts", "utf8"),
    readFile("src/analysis/validation.ts", "utf8"),
    readFile("src/analysis/advancedHardening.ts", "utf8"),
    readFile("src/persistence/contestRepository.ts", "utf8"),
    readFile("src/analysis/advancedWorkerClient.ts", "utf8"),
    readFile("src/api/analysisWorker.ts", "utf8"),
  ]);

  assert.equal(
    boundary,
    'import "./src/features/analysisV2.js";\nimport "./src/features/analysisV2/journey.js";\n',
  );
  assert.match(source, /from "\.\.\/core\/api\.js"/);
  assert.match(source, /from "\.\.\/core\/viewLifecycle\.js"/);
  assert.match(source, /from "\.\.\/shared\/escaping\.js"/);
  assert.doesNotMatch(source, /runtime\.js/);
  assert.match(source, /api<AnalysisPayload>/);
  assert.match(types, /export type AnalysisPayload/);
  assert.match(types, /export type AnalysisNumberItem/);

  assert.match(loader, /view === "analysis"/);
  assert.match(loader, /loadStyle\("analysis-v2"\)/);
  assert.match(loader, /loadStyle\("analysis-workspace"\)/);
  assert.doesNotMatch(loader, /loadStyle\("analysis-v2-hardening"\)/);
  assert.match(loader, /loadModule\("analysis-v2"\)/);
  assert.match(source, /Mapa das dezenas/);
  assert.match(source, /Histórico, não previsão/);
  assert.match(source, /data-a2-number-map/);
  assert.match(source, /data-a2-map-filter/);
  assert.match(source, /Comparar dezenas/);
  assert.match(source, /Indicadores e metodologia/);
  assert.match(source, /detailsBlock\("Classificação completa"/);
  assert.match(source, /detailsBlock\("Estrutura e distribuições"/);
  assert.match(source, /detailsBlock\("Dinâmica histórica"/);
  assert.match(source, /detailsBlock\("Associações"/);
  assert.match(source, /detailsBlock\("Auditoria de aleatoriedade"/);
  assert.match(source, /randomnessAuditView/);
  assert.match(source, /Compatível com o baseline testado/);
  assert.match(source, /detailsBlock\("Validação e metodologia"/);
  assert.match(source, /data-a2-pair-check/);
  assert.match(source, /data-a2-validation-window/);
  assert.match(source, /Atraso e frequência são descrições históricas/);
  assert.match(source, /api<LotteryCatalogPayload>\("\/lotteries"\)/);
  assert.match(source, /FLAT_NUMBER_FAMILIES/);
  assert.match(source, /column-draw/);
  assert.match(source, /dual-number-draw/);
  assert.doesNotMatch(source, /role="tablist"|data-a2-tab|ACTIVE_TAB_KEY/);
  assert.match(source, /<dialog class="a2-detail"/);
  assert.match(source, /showModal\(\)/);
  assert.match(source, /\.close\(\)/);
  assert.match(source, /Escape/);
  assert.match(source, /Qualidade do histórico/);
  assert.match(source, /historicalExpected/);
  assert.match(source, /amostra insuficiente para classificar evidência/);
  assert.match(source, /\/analysis\/\$\{lottery\}\/advanced/);
  assert.doesNotMatch(source, /const cache = new Map\(\)/);
  assert.doesNotMatch(source, /lotterySelect\?\.addEventListener\("change"/);
  assert.match(css, /\.a2-detail-open/);
  assert.match(css, /:focus-visible/);
  assert.match(workspaceCss, /\.a2-number-map/);
  assert.match(workspaceCss, /\.a2-technical-block/);
  assert.match(workspaceCss, /\.a2-detail::backdrop/);

  assert.match(advanced, /exactBinomialTwoSidedP/);
  assert.match(advanced, /validation: buildRollingValidation\(scoped, config\)/);
  assert.match(advanced, /randomnessAudit: buildRandomnessIntegrityAudit\(scoped, config\)/);
  assert.match(validation, /bonferroni-\$\{VALIDATION_COMPARISONS\}-tests/);
  assert.match(validation, /leakageProtection: true/);
  assert.match(hardening, /historicalExpected/);
  assert.match(hardening, /leftCensored/);
  assert.match(hardening, /MIN_EVIDENCE_ROUNDS/);
  assert.match(hardening, /targetNumber = latest\.number - offset/);

  assert.match(repository, /listAnalysisHistory/);
  assert.doesNotMatch(repository.match(/async listAnalysisHistory[\s\S]*?\n  }/)?.[0] ?? "", /contest_prize_tiers/);

  assert.match(controller, /analyzeLottery\.execute\(lottery\)/);
  assert.match(controller, /analyzeAdvancedLottery\.execute\(lottery\)/);
  assert.match(routes, /serveAnalysis/);
  assert.match(routes, /dependencies\.analyzeLottery/);
  assert.match(routes, /dependencies\.analyzeAdvancedLottery/);
  assert.match(server, /analyzeLottery: new AnalyzeLotteryUseCase\(contests\)/);
  assert.match(server, /analyzeAdvancedLottery: new AnalyzeAdvancedLotteryUseCase/);
  assert.match(server, /runAdvancedAnalysisInWorker/);
  assert.match(basicAnalysisUseCase, /listAnalysisHistory\(lottery: LotteryId\)/);
  assert.match(basicAnalysisUseCase, /buildNumberAnalysis\(contests, config\)/);

  assert.match(advancedAnalysisUseCase, /analysisSignature/);
  assert.match(advancedAnalysisUseCase, /createHash\("sha256"\)/);
  assert.match(advancedAnalysisUseCase, /private readonly inFlight/);
  assert.match(advancedAnalysisUseCase, /listAnalysisHistory\(lottery: LotteryId\)/);
  assert.match(advancedAnalysisUseCase, /this\.executeAnalysis\(contests, lottery\)/);

  assert.match(workerClient, /ADVANCED_ANALYSIS_TIMEOUT_MS = 15_000/);
  assert.match(workerClient, /worker\.terminate\(\)/);
  assert.match(workerClient, /resourceLimits/);
  assert.match(worker, /hardenAdvancedAnalysis/);
  assert.match(worker, /buildAdvancedAnalysis\(job\.contests, config\)/);
});
