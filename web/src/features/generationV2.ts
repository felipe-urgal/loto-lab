import { api } from "../core/api.js";
import { isLotteryId } from "../core/mainContext.js";
import {
  currentMainView,
  onMainViewChanged,
  onViewRendered,
  type ViewRenderedDetail,
} from "../core/viewLifecycle.js";
import { escapeHtml } from "../shared/escaping.js";
import type {
  GeneratedGame,
  GenerationAlgorithmSpace,
  GenerationConstraints,
  GenerationFilterKey,
  GenerationPlan,
  GenerationPurpose,
  GenerationPlanPayload,
  GenerationPreviewResponse,
  GenerationRangeEdge,
  GenerationRequestPayload,
  GenerationSaveResponse,
  GeneratorState,
  LotteryGenerationConfig,
  LotteryId,
  NumberTier,
  SelectionMode,
} from "./generationV2/types.js";

const root = document.querySelector<HTMLElement>("#content");
let lifecycleToken = 0;
let cleanupCurrent: (() => void) | null = null;

const DEFAULT_GAME_COUNT = 4;
const DEFAULT_GAME_COUNTS: Partial<Record<LotteryId, number>> = {
  "mega-sena": 2,
  lotomania: 2,
};

const NUMBER_TIERS: readonly NumberTier[] = ["strong", "balanced", "cold"];

function supportsExperimental(lottery: LotteryId): boolean {
  return lottery === "mega-sena" || lottery === "lotofacil" || lottery === "dia-de-sorte";
}

function supportsCoverage(lottery: LotteryId): boolean {
  return lottery === "mega-sena" || lottery === "lotofacil" || lottery === "quina" || lottery === "dupla-sena";
}

function isSelectionMode(value: string | undefined): value is SelectionMode {
  return value === "fix" || value === "exclude" || value === "auto";
}

function isFilterKey(value: string | undefined): value is GenerationFilterKey {
  return value === "odd" || value === "repeated" || value === "sum";
}

function isRangeEdge(value: string | undefined): value is GenerationRangeEdge {
  return value === "min" || value === "max";
}

async function postJson<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  const payload = await api<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
  if (payload === null) throw new Error("Resposta vazia do servidor");
  return payload;
}

function formatInteger(value: unknown): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatDecimal(value: unknown, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function formatPercent(value: unknown, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function formatCurrencyCents(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

function numberLabel(value: number): string {
  return String(value).padStart(2, "0");
}

function tierByNumber(plan: GenerationPlan): Map<number, NumberTier> {
  const result = new Map<number, NumberTier>();
  for (const tier of NUMBER_TIERS) {
    for (const value of plan.numberTiers[tier] || []) result.set(value, tier);
  }
  return result;
}

function constraintPayload(state: GeneratorState): GenerationConstraints | undefined {
  const constraints: GenerationConstraints = {};
  if (state.filters.odd.enabled) constraints.odd = { min: state.filters.odd.min, max: state.filters.odd.max };
  if (state.filters.repeated.enabled) constraints.repeated = { min: state.filters.repeated.min, max: state.filters.repeated.max };
  if (state.filters.sum.enabled) constraints.sum = { min: state.filters.sum.min, max: state.filters.sum.max };
  return Object.keys(constraints).length ? constraints : undefined;
}

function requestPayload(state: GeneratorState, includeSeed = false): GenerationRequestPayload {
  const constraints = constraintPayload(state);
  const seed = includeSeed ? state.preview?.generatorOptions.seed : undefined;
  return {
    lottery: state.lottery,
    gameCount: state.gameCount,
    fixedCount: state.fixedCount,
    betSize: state.betSize,
    targetContestNumber: state.targetContestNumber,
    purpose: state.purpose,
    generationMode: "diversified",
    fixedNumbers: [...state.fixed].sort((a, b) => a - b),
    excludedNumbers: [...state.excluded].sort((a, b) => a - b),
    ...(constraints ? { constraints } : {}),
    ...(state.lottery === "mais-milionaria" ? { cloverCount: state.cloverCount } : {}),
    ...(state.lottery === "timemania" && state.favoriteTeam.trim() ? { favoriteTeam: state.favoriteTeam.trim() } : {}),
    ...(state.lottery === "super-sete" ? { columnMarks: state.columnMarks } : {}),
    ...(state.purpose === "coverage" ? {
      coveragePoolNumbers: [...state.coveragePool].sort((a, b) => a - b),
      coverageTargetSize: state.coverageTargetSize,
      ...(state.coverageBudgetCents !== undefined ? { coverageBudgetCents: state.coverageBudgetCents } : {}),
    } : {}),
    ...(typeof seed === "string" && seed ? { seed } : {}),
  };
}

function planPayload(state: GeneratorState): GenerationPlanPayload {
  const constraints = constraintPayload(state);
  return {
    lottery: state.lottery,
    betSize: state.betSize,
    targetContestNumber: state.targetContestNumber,
    fixedNumbers: [...state.fixed].sort((a, b) => a - b),
    excludedNumbers: [...state.excluded].sort((a, b) => a - b),
    ...(constraints ? { constraints } : {}),
  };
}

function rangeOptions(minimum: number, maximum: number, selected: number): string {
  let html = "";
  for (let value = minimum; value <= maximum; value += 1) {
    html += `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`;
  }
  return html;
}

function fixedCountOptions(state: GeneratorState): string {
  return state.plan.methodology.fixedCountOptions.map((value) =>
    `<option value="${value}" ${value === state.fixedCount ? "selected" : ""} ${value < state.fixed.size ? "disabled" : ""}>${value} fixas</option>`,
  ).join("");
}

function betSizeOptions(state: GeneratorState): string {
  const rule = state.plan.betRule;
  if (!rule && state.lottery === "mais-milionaria") {
    let html = "";
    for (let value = 6; value <= 12; value += 1) {
      html += `<option value="${value}" ${value === state.betSize ? "selected" : ""}>${value} números</option>`;
    }
    return html;
  }
  if (!rule) return `<option value="${state.plan.betSize}" selected>${state.lottery === "super-sete" ? "7 colunas" : `${state.plan.betSize} dezenas`}</option>`;
  let html = "";
  for (let value = rule.minBetSize; value <= rule.maxBetSize; value += 1) {
    const equivalent = rule.drawSize === value ? 1 : Math.round(
      Array.from({ length: rule.drawSize }, (_, index) => (value - index) / (rule.drawSize - index))
        .reduce((total, factor) => total * factor, 1),
    );
    html += `<option value="${value}" ${value === state.betSize ? "selected" : ""}>${value} dezenas · ${formatInteger(equivalent)} apostas simples</option>`;
  }
  return html;
}

function filterMarkup(
  key: GenerationFilterKey,
  title: string,
  baseline: string,
  state: GeneratorState,
  minimum: number,
  maximum: number,
  disabled = false,
): string {
  const filter = state.filters[key];
  const inactive = !filter.enabled || disabled;
  return `<div class="g2-filter" data-g2-filter="${key}" aria-disabled="${inactive ? "true" : "false"}">
    <div class="g2-filter-top">
      <label class="g2-filter-toggle"><input type="checkbox" data-g2-filter-toggle="${key}" ${filter.enabled ? "checked" : ""} ${disabled ? "disabled" : ""} /> ${escapeHtml(title)}</label>
      <span class="g2-filter-baseline" data-g2-filter-baseline="${key}">${escapeHtml(baseline)}</span>
    </div>
    <div class="g2-range">
      <select data-g2-range="${key}:min" aria-label="Mínimo de ${escapeHtml(title)}" ${inactive ? "disabled" : ""}>${rangeOptions(minimum, maximum, filter.min)}</select>
      <span>até</span>
      <select data-g2-range="${key}:max" aria-label="Máximo de ${escapeHtml(title)}" ${inactive ? "disabled" : ""}>${rangeOptions(minimum, maximum, filter.max)}</select>
    </div>
  </div>`;
}

function sumFilterMarkup(state: GeneratorState): string {
  const filter = state.filters.sum;
  const baseline = state.plan.baseline;
  return `<div class="g2-filter" data-g2-filter="sum" aria-disabled="${filter.enabled ? "false" : "true"}">
    <div class="g2-filter-top">
      <label class="g2-filter-toggle"><input type="checkbox" data-g2-filter-toggle="sum" ${filter.enabled ? "checked" : ""} /> Limitar soma</label>
      <span class="g2-filter-baseline" data-g2-filter-baseline="sum">Esperado ${formatDecimal(baseline.expectedSum)} · desvio ${formatDecimal(baseline.sumStdDev)}</span>
    </div>
    <div class="g2-range">
      <input type="number" data-g2-range="sum:min" value="${filter.min}" aria-label="Soma mínima" ${filter.enabled ? "" : "disabled"} />
      <span>até</span>
      <input type="number" data-g2-range="sum:max" value="${filter.max}" aria-label="Soma máxima" ${filter.enabled ? "" : "disabled"} />
    </div>
  </div>`;
}

function filtersMarkup(state: GeneratorState): string {
  const repeatedExpected = state.plan.baseline.expectedRepeated;
  const repeatedUnavailable = !state.plan.dataQuality.previousContestAvailable;
  return `${filterMarkup("odd", "Faixa de ímpares", `Esperado ${formatDecimal(state.plan.baseline.expectedOdd)}`, state, 0, state.plan.drawSize)}
    ${filterMarkup(
      "repeated",
      "Repetidas do concurso anterior",
      repeatedUnavailable ? `Concurso #${state.plan.dataQuality.expectedPreviousContestNumber ?? "—"} indisponível` : `Esperado ${formatDecimal(repeatedExpected)}`,
      state,
      0,
      state.plan.drawSize,
      repeatedUnavailable,
    )}
    ${sumFilterMarkup(state)}`;
}

function numberGridMarkup(state: GeneratorState): string {
  if (state.lottery === "super-sete") {
    return `<div class="g2-columns-note">Super Sete usa 7 colunas posicionais. Os dígitos são gerados e exibidos por coluna, sem serem tratados como dezenas.</div>`;
  }
  const tiers = tierByNumber(state.plan);
  const minimum = state.lotteryConfig.minNumber;
  let html = "";
  for (let offset = 0; offset < state.plan.universeSize; offset += 1) {
    const value = minimum + offset;
    const selection = state.purpose === "coverage"
      ? state.coveragePool.has(value) ? "fixed" : "auto"
      : state.fixed.has(value) ? "fixed" : state.excluded.has(value) ? "excluded" : "auto";
    const tier = state.purpose === "coverage" ? "" : tiers.get(value) || "";
    const selectionLabel = state.purpose === "coverage"
      ? selection === "fixed" ? "no pool de cobertura" : "fora do pool de cobertura"
      : selection === "fixed" ? "fixada" : selection === "excluded" ? "excluída" : "automática";
    html += `<button type="button" class="g2-number ${tier ? `is-${tier}` : ""} ${selection !== "auto" ? `is-${selection}` : ""}" data-g2-number="${value}" data-selection="${selection}" aria-label="Dezena ${numberLabel(value)}: ${selectionLabel}">${numberLabel(value)}</button>`;
  }
  return html;
}

function algorithmSpace(state: GeneratorState): GenerationAlgorithmSpace {
  return state.plan.algorithmSpaces[String(state.fixedCount)] || {
    fixedCount: state.fixedCount,
    candidatePoolSize: 0,
    rawCombinationCapacity: 0,
    shortlistLimit: 0,
    variableCount: state.plan.drawSize - state.fixedCount,
  };
}

function purposeCopy(purpose: GenerationPurpose): { label: string; description: string; disclaimer: string } {
  if (purpose === "uniform") {
    return {
      label: "Aleatório auditável",
      description: "Amostragem uniforme do espaço válido com seed reproduzível.",
      disclaimer: "Frequência, score e tiers históricos não participam da seleção das combinações.",
    };
  }
  if (purpose === "portfolio") {
    return {
      label: "Carteira diversificada",
      description: "Amostra candidatos sem score histórico e prioriza menor sobreposição entre jogos.",
      disclaimer: "Diversificação amplia cobertura entre os jogos; não aumenta a chance individual de uma combinação.",
    };
  }
  if (purpose === "coverage") {
    return {
      label: "Cobertura / Desdobramento",
      description: "Seleciona jogos por Greedy Set Cover para cobrir o máximo de subconjuntos do pool escolhido.",
      disclaimer: "Cobertura é uma propriedade combinatória. Garantia só existe quando a cobertura calculada chega a 100% e continua sendo condicional ao pool.",
    };
  }
  return {
    label: "Experimental",
    description: "Mantém as heurísticas históricas atuais para experimentação e backtest.",
    disclaimer: "Scores e frequências são hipóteses experimentais e não representam aumento comprovado de chance futura.",
  };
}
function planMarkup(state: GeneratorState): string {
  const plan = state.plan;
  const algorithm = algorithmSpace(state);
  const purpose = purposeCopy(state.purpose);
  const coverage = Math.max(0, Math.min(1, plan.space.overallCoverage));
  const issue = plan.constraintIssues[0];
  return `<div class="g2-card-head"><div><strong>Espaço e funil do motor</strong><span>Matemática global separada do espaço realmente percorrido pelo algoritmo.</span></div></div>
    <div class="g2-plan-grid">
      <div class="g2-plan-stat"><span>Universo matemático</span><strong>${formatInteger(plan.lotteryBaseline.totalCombinations)}</strong><small>todas as combinações simples</small></div>
      <div class="g2-plan-stat"><span>Após seleção manual</span><strong>${formatInteger(plan.space.afterManualSelection)}</strong><small>fixadas/excluídas, antes dos filtros</small></div>
      <div class="g2-plan-stat"><span>Elegíveis matematicamente</span><strong>${formatInteger(plan.space.eligibleCombinations)}</strong><small>atendem aos filtros estruturais</small></div>
      <div class="g2-plan-stat"><span>Pool explorado pelo motor</span><strong>${formatInteger(algorithm.rawCombinationCapacity)}</strong><small>${algorithm.candidatePoolSize} dezenas no pool · shortlist até ${algorithm.shortlistLimit}</small></div>
    </div>
    <div class="g2-space-bar" aria-hidden="true"><span style="width:${Math.max(.2, coverage * 100)}%"></span></div>
    ${issue ? `<p class="g2-error">${escapeHtml(issue)}</p>` : ""}
    <p class="g2-disclaimer"><strong>${escapeHtml(purpose.label)}:</strong> ${escapeHtml(purpose.disclaimer)}</p>`;
}

function methodologyMarkup(state: GeneratorState): string {
  return `<div class="g2-methodology">
    <strong>Metodologia · ${escapeHtml(state.lotteryConfig.name)}</strong>
    <ul>${state.plan.methodology.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
  </div>`;
}

function baselineMarkup(state: GeneratorState): string {
  const plan = state.plan;
  const conditional = plan.baseline;
  const lottery = plan.lotteryBaseline;
  const reference = plan.dataQuality.previousContestAvailable ? `#${plan.referenceContestNumber}` : "indisponível";
  const gaps = plan.dataQuality.historyGapCount;
  return `<div class="g2-card-head"><div><strong>Referência condicionada</strong><span>Referências após fixadas/excluídas; a referência original da loteria aparece abaixo.</span></div></div>
    <div class="g2-plan-grid">
      <div class="g2-plan-stat"><span>Ímpares esperados</span><strong>${formatDecimal(conditional.expectedOdd)}</strong><small>loteria sem seleção: ${formatDecimal(lottery.expectedOdd)}</small></div>
      <div class="g2-plan-stat"><span>Repetidas esperadas</span><strong>${conditional.expectedRepeated === null ? "—" : formatDecimal(conditional.expectedRepeated)}</strong><small>loteria: ${lottery.expectedRepeated === null ? "—" : formatDecimal(lottery.expectedRepeated)} · referência ${reference}</small></div>
      <div class="g2-plan-stat"><span>Soma esperada</span><strong>${formatDecimal(conditional.expectedSum)}</strong><small>loteria: ${formatDecimal(lottery.expectedSum)} · desvio cond. ${formatDecimal(conditional.sumStdDev)}</small></div>
      <div class="g2-plan-stat"><span>Histórico usado</span><strong>${formatInteger(plan.historyCount)}</strong><small>${gaps ? `${formatInteger(gaps)} concurso(s) ausente(s) no histórico` : "sequência armazenada sem gaps internos"}</small></div>
    </div>
    ${!plan.dataQuality.previousContestAvailable ? `<p class="g2-disclaimer"><strong>Repetição indisponível:</strong> falta o concurso #${escapeHtml(plan.dataQuality.expectedPreviousContestNumber ?? "—")}. Nenhum concurso mais antigo é usado como substituto.</p>` : ""}`;
}

function selectionModesMarkup(state: GeneratorState): string {
  const modes: Array<[SelectionMode, string]> = [
    ["fix", "Fixar"],
    ["exclude", "Excluir"],
    ["auto", "Automática"],
  ];
  return `<div class="g2-result-actions" role="group" aria-label="Ação ao clicar nas dezenas">
    ${modes.map(([mode, label]) => `<button class="button compact ${state.selectionMode === mode ? "primary" : ""}" type="button" data-g2-selection-mode="${mode}" aria-pressed="${state.selectionMode === mode ? "true" : "false"}">${label}</button>`).join("")}
  </div>`;
}

function structuredFieldsMarkup(state: GeneratorState): string {
  if (state.lottery === "mais-milionaria") {
    return `<div class="g2-field"><label for="g2-clover-count">Trevos por aposta</label><select id="g2-clover-count">${[2, 3, 4, 5, 6].map((value) => `<option value="${value}" ${value === state.cloverCount ? "selected" : ""}>${value} trevos</option>`).join("")}</select><small>Trevos permanecem separados dos números.</small></div>`;
  }
  if (state.lottery === "timemania") {
    return `<div class="g2-field"><label for="g2-favorite-team">Time do Coração</label><input id="g2-favorite-team" type="text" maxlength="120" value="${escapeHtml(state.favoriteTeam)}" placeholder="Informe o time" /><small>Campo obrigatório e independente das 10 dezenas.</small></div>`;
  }
  if (state.lottery === "super-sete") {
    return `<div class="g2-field" style="grid-column:1/-1"><label>Marcações por coluna</label><div class="g2-range">${state.columnMarks.map((count, index) => `<label>C${index + 1}<select data-g2-column-mark="${index}">${[1, 2, 3].map((value) => `<option value="${value}" ${value === count ? "selected" : ""}>${value}</option>`).join("")}</select></label>`).join("")}</div><small>7–14 marcações: 1–2 por coluna. 15–21: 2–3 por coluna.</small></div>`;
  }
  return "";
}

function activeFilterCount(state: GeneratorState): number {
  return Object.values(state.filters).filter((filter) => filter.enabled).length;
}

function structuredSummary(state: GeneratorState): string {
  if (state.lottery === "mais-milionaria") return `${state.cloverCount} trevos por aposta`;
  if (state.lottery === "timemania") return state.favoriteTeam.trim() ? `Time: ${escapeHtml(state.favoriteTeam.trim())}` : "Time do Coração pendente";
  if (state.lottery === "super-sete") return `${state.columnMarks.reduce((sum, value) => sum + value, 0)} marcações em 7 colunas`;
  return "";
}

function configurationSummaryMarkup(state: GeneratorState): string {
  const purpose = purposeCopy(state.purpose);
  const extra = structuredSummary(state);
  const filters = activeFilterCount(state);
  return `<div class="g2-summary-list">
    <div><span>Finalidade</span><strong>${escapeHtml(purpose.label)}</strong></div>
    <div><span>Jogos</span><strong>${state.gameCount}</strong></div>
    <div><span>${state.lottery === "super-sete" ? "Estrutura" : "Aposta"}</span><strong>${state.lottery === "super-sete" ? "7 colunas" : `${state.betSize} dezenas`}</strong></div>
    <div><span>${state.purpose === "coverage" ? "Pool" : "Núcleo"}</span><strong>${state.purpose === "coverage" ? `${state.coveragePool.size} dezenas` : state.fixedCount ? `${state.fixedCount} compartilhadas` : "Sem núcleo"}</strong></div>
    <div><span>Concurso alvo</span><strong>${state.targetContestNumber ? `#${state.targetContestNumber}` : "Automático"}</strong></div>
    <div><span>Filtros</span><strong>${filters ? `${filters} ativo(s)` : "Nenhum"}</strong></div>
    ${extra ? `<div class="g2-summary-wide"><span>Modalidade</span><strong>${extra}</strong></div>` : ""}
    <div class="g2-summary-wide"><span>Custo</span><strong>Confirmado na prévia</strong></div>
  </div>`;
}

function flowMarkup(): string {
  return `<ol class="g2-flow" aria-label="Etapas para gerar jogos">
    <li data-g2-flow-step="configure"><span>1</span><strong>Configurar</strong></li>
    <li data-g2-flow-step="preview"><span>2</span><strong>Gerar prévia</strong></li>
    <li data-g2-flow-step="review"><span>3</span><strong>Revisar</strong></li>
    <li data-g2-flow-step="save"><span>4</span><strong>Salvar</strong></li>
  </ol>`;
}

type GenerationFlowStage = "configure" | "preview" | "review" | "save" | "saved";

function updateFlowState(stage: GenerationFlowStage): void {
  const shell = root?.querySelector<HTMLElement>("[data-g2-shell]");
  if (!shell) return;
  shell.dataset.g2Stage = stage;
  const order: Array<Exclude<GenerationFlowStage, "saved">> = ["configure", "preview", "review", "save"];
  const effective = stage === "saved" ? "save" : stage;
  const activeIndex = order.indexOf(effective);
  shell.querySelectorAll<HTMLElement>("[data-g2-flow-step]").forEach((step) => {
    const key = step.dataset.g2FlowStep as Exclude<GenerationFlowStage, "saved"> | undefined;
    const index = key ? order.indexOf(key) : -1;
    const complete = stage === "saved" || (index >= 0 && index < activeIndex);
    const active = stage !== "saved" && index === activeIndex;
    step.classList.toggle("is-complete", complete);
    step.classList.toggle("is-active", active);
    if (active) step.setAttribute("aria-current", "step");
    else step.removeAttribute("aria-current");
  });
}

function renderConfigurationSummary(state: GeneratorState): void {
  const target = root?.querySelector<HTMLElement>("[data-g2-config-summary]");
  if (target) target.innerHTML = configurationSummaryMarkup(state);
}

function workspaceMarkup(state: GeneratorState): string {
  const hasHistoricalTiers = NUMBER_TIERS.some((tier) => (state.plan.numberTiers[tier] || []).length > 0);
  return `<div class="g2-shell" data-g2-shell data-g2-stage="configure">
    <div class="g2-principle"><strong>Gerar jogos</strong><span>Configure a aposta, gere uma prévia, revise os jogos e salve somente o que você aprovou.</span></div>
    ${flowMarkup()}
    <div class="g2-workspace">
      <div class="g2-main">
        <section class="panel g2-card g2-build-card">
          <div class="g2-card-head"><div><strong>${state.lottery === "super-sete" ? "Monte as colunas" : state.purpose === "coverage" ? "Monte o pool de cobertura" : "Monte suas escolhas"}</strong><span>${state.lottery === "super-sete" ? "As marcações permanecem posicionais por coluna." : state.purpose === "coverage" ? "Clique nas dezenas que devem formar o universo do desdobramento." : "Fixe, exclua ou deixe o motor escolher automaticamente."}</span></div></div>
          ${state.lottery === "super-sete" || state.purpose === "coverage" ? "" : selectionModesMarkup(state)}
          ${state.lottery === "super-sete" ? "" : `<div class="g2-number-legend">
            <span><i class="g2-key"></i> ${state.purpose === "coverage" ? "Fora do pool" : "Automática"}</span><span><i class="g2-key is-fixed"></i> ${state.purpose === "coverage" ? "No pool" : "Fixada"}</span>${state.purpose === "coverage" ? "" : '<span><i class="g2-key is-excluded"></i> Excluída</span>'}
            ${hasHistoricalTiers ? '<span><i class="g2-key is-strong"></i> Forte histórica</span><span><i class="g2-key is-balanced"></i> Intermediária histórica</span><span><i class="g2-key is-cold"></i> Fria histórica</span>' : ""}
          </div>`}
          <div class="g2-number-grid" data-g2-number-grid>${numberGridMarkup(state)}</div>
          <div class="g2-selection-summary" data-g2-selection-summary></div>
        </section>

        <details class="g2-advanced" data-g2-advanced>
          <summary><span>Filtros e auditoria</span><small>Opcional · fechado por padrão</small></summary>
          <div class="g2-advanced-body">
            <section>
              <div class="g2-card-head"><div><strong>Filtros estruturais</strong><span>${state.lottery === "super-sete" ? "Filtros de dezenas não se aplicam a esta modalidade." : "Desligados por padrão. Use somente quando quiser restringir a composição."}</span></div></div>
              <div class="g2-filter-list" data-g2-filters>${state.lottery === "super-sete" ? '<p class="g2-disclaimer">A composição é controlada pelas marcações de cada coluna.</p>' : filtersMarkup(state)}</div>
            </section>
            <details class="g2-subdetails">
              <summary>Metodologia</summary>
              <div class="g2-subdetails-body">${methodologyMarkup(state)}</div>
            </details>
            <details class="g2-subdetails">
              <summary>Espaço combinatório e referências</summary>
              <div class="g2-technical-grid">
                <section class="g2-technical-panel" data-g2-plan>${planMarkup(state)}</section>
                <section class="g2-technical-panel" data-g2-baseline>${baselineMarkup(state)}</section>
              </div>
            </details>
            <div data-g2-explainability-slot></div>
          </div>
        </details>
      </div>

      <aside class="g2-side">
        <section class="panel g2-card g2-config-card">
          <div class="g2-card-head"><div><strong>Configuração</strong><span>Somente o necessário para gerar a prévia.</span></div></div>
          <div class="g2-form-grid">
            <div class="g2-field"><label for="g2-purpose">Finalidade</label><select id="g2-purpose">
              <option value="uniform" ${state.purpose === "uniform" ? "selected" : ""}>Aleatório auditável</option>
              <option value="portfolio" ${state.purpose === "portfolio" ? "selected" : ""}>Carteira diversificada</option>
              <option value="coverage" ${state.purpose === "coverage" ? "selected" : ""} ${supportsCoverage(state.lottery) ? "" : "disabled"}>Cobertura / Desdobramento</option>
              <option value="experimental" ${state.purpose === "experimental" ? "selected" : ""} ${supportsExperimental(state.lottery) ? "" : "disabled"}>Experimental</option>
            </select><small>${escapeHtml(purposeCopy(state.purpose).description)}</small></div>
            <div class="g2-field"><label for="g2-game-count">${state.purpose === "coverage" ? "Limite de jogos" : "Quantidade de jogos"}</label><input id="g2-game-count" type="number" min="1" max="${state.purpose === "coverage" ? 100 : 10}" value="${state.gameCount}" /></div>
            <div class="g2-field"><label for="g2-bet-size">${state.lottery === "mais-milionaria" ? "Números por aposta" : state.lottery === "super-sete" ? "Estrutura" : "Dezenas por aposta"}</label><select id="g2-bet-size" ${state.purpose === "experimental" || (!state.plan.betRule && state.lottery !== "mais-milionaria") ? "disabled" : ""}>${betSizeOptions(state)}</select></div>
            <div class="g2-field"><label for="g2-fixed-count">Núcleo compartilhado</label><select id="g2-fixed-count" ${state.purpose === "coverage" ? "disabled" : ""}>${fixedCountOptions(state)}</select></div>
            <div class="g2-field"><label for="g2-target">Concurso alvo</label><input id="g2-target" type="number" min="1" value="${state.targetContestNumber ?? ""}" /></div>
            ${state.purpose === "coverage" ? `<div class="g2-field"><label for="g2-coverage-target">Subconjunto alvo</label><input id="g2-coverage-target" type="number" min="1" max="${state.betSize}" value="${state.coverageTargetSize}" /><small>Cada subconjunto deste tamanho será contabilizado na cobertura.</small></div><div class="g2-field"><label for="g2-coverage-budget">Orçamento máximo</label><input id="g2-coverage-budget" type="number" min="0" step="0.01" value="${state.coverageBudgetCents === undefined ? "" : (state.coverageBudgetCents / 100).toFixed(2)}" placeholder="Opcional" /><small>Em reais. O motor para antes de ultrapassar o orçamento.</small></div>` : ""}
            ${structuredFieldsMarkup(state)}
          </div>
        </section>

        <section class="panel g2-card g2-summary-card">
          <div class="g2-card-head"><div><strong>Resumo</strong><span>Revise a configuração antes de gerar.</span></div></div>
          <div data-g2-config-summary>${configurationSummaryMarkup(state)}</div>
        </section>

        <section class="panel g2-card g2-action-card">
          <p>A prévia não salva nada. Você verá os jogos e o custo antes de confirmar.</p>
          <button class="button primary" type="button" data-g2-preview>Gerar prévia</button>
          <div class="g2-error" data-g2-error hidden></div>
        </section>
      </aside>
    </div>
    <section class="g2-result" data-g2-result></section>
  </div>`;
}

function selectionSummary(state: GeneratorState, message = ""): void {
  const target = root?.querySelector<HTMLElement>("[data-g2-selection-summary]");
  if (!target) return;
  if (state.purpose === "coverage") {
    const pool = [...state.coveragePool].sort((a, b) => a - b).map(numberLabel).join(", ") || "nenhuma";
    target.innerHTML = `<span>Pool <strong>${escapeHtml(pool)}</strong></span><span>Alvo <strong>${state.coverageTargetSize} de ${state.betSize}</strong></span><span>Limite <strong>${state.gameCount} jogos</strong></span>${message ? `<span><strong>${escapeHtml(message)}</strong></span>` : ""}`;
    return;
  }
  const fixed = [...state.fixed].sort((a, b) => a - b).map(numberLabel).join(", ") || "nenhuma";
  const excluded = [...state.excluded].sort((a, b) => a - b).map(numberLabel).join(", ") || "nenhuma";
  const modeLabel = state.selectionMode === "fix" ? "Fixar" : state.selectionMode === "exclude" ? "Excluir" : "Automática";
  target.innerHTML = `<span>Ação <strong>${modeLabel}</strong></span><span>Fixadas <strong>${escapeHtml(fixed)}</strong></span><span>Excluídas <strong>${escapeHtml(excluded)}</strong></span>${message ? `<span><strong>${escapeHtml(message)}</strong></span>` : ""}`;
}

function updateModeButtons(state: GeneratorState): void {
  root?.querySelectorAll<HTMLButtonElement>("[data-g2-selection-mode]").forEach((button) => {
    const active = button.dataset.g2SelectionMode === state.selectionMode;
    button.classList.toggle("primary", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function updateNumberButtons(state: GeneratorState): void {
  const tiers = tierByNumber(state.plan);
  root?.querySelectorAll<HTMLButtonElement>("[data-g2-number]").forEach((button) => {
    const value = Number(button.dataset.g2Number);
    const selection = state.purpose === "coverage"
      ? state.coveragePool.has(value) ? "fixed" : "auto"
      : state.fixed.has(value) ? "fixed" : state.excluded.has(value) ? "excluded" : "auto";
    const tier = state.purpose === "coverage" ? "" : tiers.get(value) || "";
    button.dataset.selection = selection;
    button.classList.toggle("is-fixed", selection === "fixed");
    button.classList.toggle("is-excluded", selection === "excluded");
    for (const name of NUMBER_TIERS) button.classList.toggle(`is-${name}`, tier === name);
    const label = state.purpose === "coverage"
      ? selection === "fixed" ? "no pool de cobertura" : "fora do pool de cobertura"
      : selection === "fixed" ? "fixada" : selection === "excluded" ? "excluída" : "automática";
    button.setAttribute("aria-label", `Dezena ${numberLabel(value)}: ${label}`);
  });
  const select = root?.querySelector<HTMLSelectElement>("#g2-fixed-count");
  if (select) [...select.options].forEach((option) => { option.disabled = state.purpose === "coverage" || Number(option.value) < state.fixed.size; });
}

function clearPreview(state: GeneratorState): void {
  state.preview = null;
  const target = root?.querySelector<HTMLElement>("[data-g2-result]");
  if (target) target.innerHTML = "";
  updateFlowState("configure");
  renderConfigurationSummary(state);
}

function setError(message = ""): void {
  const error = root?.querySelector<HTMLElement>("[data-g2-error]");
  if (!error) return;
  error.hidden = !message;
  error.textContent = message;
}

function gameMarkup(game: GeneratedGame, index: number): string {
  const fixed = new Set(game.fixedNumbers || []);
  const balls = game.columns
    ? game.columns.map((values, column) => `<span class="ball" title="Coluna ${column + 1}">C${column + 1}:${values.join("·")}</span>`).join("")
    : (game.numbers || []).map((value) => `<span class="ball ${fixed.has(value) ? "is-fixed" : ""}">${numberLabel(value)}</span>`).join("");
  const repeated = game.metadata?.repeatedFromLastContest?.length ?? 0;
  const secondary = game.secondary?.kind === "clovers"
    ? `Trevos · ${game.secondary.values.join(" · ")}`
    : game.secondary?.kind === "favorite-team"
      ? `Time do Coração · ${escapeHtml(game.secondary.values[0] ?? "")}`
      : game.secondary?.kind === "lucky-month"
        ? `Mês da Sorte · ${escapeHtml(game.secondary.values[0] ?? "")}`
        : game.luckyMonth
          ? `Mês da Sorte · ${escapeHtml(game.luckyMonth)}`
          : "";
  return `<article class="panel g2-game">
    <div class="g2-game-head"><strong>Jogo ${index + 1}</strong><span>${game.fixedNumbers?.length ?? 0} núcleo · ${game.variableNumbers?.length ?? 0} variáveis</span></div>
    <div class="draw-numbers">${balls}</div>
    <div class="g2-game-meta"><span>Pares <strong>${game.metadata?.even ?? "—"}</strong></span><span>Ímpares <strong>${game.metadata?.odd ?? "—"}</strong></span><span>Soma <strong>${game.metadata?.sum ?? "—"}</strong></span><span>Repetidas <strong>${repeated}</strong></span></div>
    ${secondary ? `<div class="g2-game-month">${secondary}</div>` : ""}
  </article>`;
}

function renderPreview(state: GeneratorState): void {
  const target = root?.querySelector<HTMLElement>("[data-g2-result]");
  if (!target || !state.preview) return;
  const preview = state.preview;
  const audit = preview.audit;
  const seed = typeof preview.generatorOptions.seed === "string" ? preview.generatorOptions.seed : "—";
  const proof = preview.preview?.id || (typeof preview.generatorOptions.previewId === "string" ? preview.generatorOptions.previewId : "—");
  const coverage = preview.generatorOptions.coverage && typeof preview.generatorOptions.coverage === "object"
    ? preview.generatorOptions.coverage as {
        targetSubsets?: number;
        coveredSubsets?: number;
        coverageRatio?: number;
        isCompleteCoverage?: boolean;
        selectedTickets?: number;
        costCents?: number;
      }
    : undefined;
  const betQuote = preview.generatorOptions.betQuote && typeof preview.generatorOptions.betQuote === "object"
    ? preview.generatorOptions.betQuote as {
        betSize?: number;
        simpleEquivalentCount?: number;
        totalPriceCents?: number;
        topPrizeOneIn?: number;
        rule?: { effectiveFrom?: string; sourceUrl?: string };
      }
    : undefined;
  const purpose = purposeCopy(state.purpose);
  const cardinality = state.lottery === "super-sete" ? "7 colunas" : `${betQuote?.betSize ?? audit.plan.betSize} dezenas`;

  target.innerHTML = `<div class="g2-preview">
    <div class="g2-preview-head"><div><span class="g2-preview-kicker">Prévia gerada</span><h2>Revise antes de salvar</h2><p>Este lote ainda não foi persistido. Salvar grava exatamente os jogos exibidos abaixo.</p></div></div>
    <div class="g2-review-summary">
      <div><span>Jogos</span><strong>${preview.games.length}</strong></div>
      <div><span>Configuração</span><strong>${cardinality}</strong></div>
      <div><span>Finalidade</span><strong>${escapeHtml(purpose.label)}</strong></div>
      <div><span>Custo do lote</span><strong>${formatCurrencyCents(betQuote?.totalPriceCents)}</strong></div>
    </div>
    ${coverage ? `<section class="panel g2-card g2-preview-rationale"><div class="g2-card-head"><div><strong>${coverage.isCompleteCoverage ? "Cobertura completa" : "Cobertura parcial"}</strong><span>${coverage.isCompleteCoverage ? "Garantia combinatória condicional ao pool e ao alvo configurados." : "Não há garantia: o limite/orçamento encerrou o processo antes de cobrir todo o alvo."}</span></div></div><div class="g2-rationale-grid"><div><strong>${formatPercent(coverage.coverageRatio)}</strong><span>Cobertura calculada</span></div><div><strong>${formatInteger(coverage.coveredSubsets)} / ${formatInteger(coverage.targetSubsets)}</strong><span>Subconjuntos cobertos</span></div></div></section>` : ""}
    <div class="g2-game-grid">${preview.games.map(gameMarkup).join("")}</div>
    <details class="g2-preview-audit">
      <summary>Ver auditoria da prévia</summary>
      <div class="g2-preview-audit-body">
        <div class="g2-audit-grid">
          <div class="g2-audit"><span>Núcleo compartilhado</span><strong>${audit.sharedCore.map(numberLabel).join(" · ") || "Sem núcleo"}</strong><small>${audit.sharedCore.length} dezenas em todos os jogos</small></div>
          <div class="g2-audit"><span>Cobertura do lote</span><strong>${audit.uniqueNumbers.length} dezenas</strong><small>${audit.uniqueVariableNumbers.length} variáveis distintas</small></div>
          <div class="g2-audit"><span>Sobreposição média</span><strong>${formatDecimal(audit.averagePairwiseOverlap)}</strong><small>mín. ${formatDecimal(audit.minimumPairwiseOverlap)} · máx. ${formatDecimal(audit.maximumPairwiseOverlap)}</small></div>
          <div class="g2-audit"><span>Elegíveis matematicamente</span><strong>${formatInteger(audit.plan.space.eligibleCombinations)}</strong><small>${formatPercent(audit.plan.space.overallCoverage)} do universo</small></div>
          <div class="g2-audit"><span>Cardinalidade</span><strong>${cardinality}</strong><small>${betQuote ? `${formatInteger(betQuote.simpleEquivalentCount)} equivalentes simples` : "Preço oficial desconhecido"}</small></div>
          <div class="g2-audit"><span>Probabilidade oficial</span><strong>${betQuote?.topPrizeOneIn ? `1 em ${formatInteger(betQuote.topPrizeOneIn)}` : "—"}</strong><small>por aposta, quando disponível</small></div>
        </div>
        <div class="g2-seed"><strong>Seed</strong><code>${escapeHtml(seed)}</code></div>
        <div class="g2-seed"><strong>Preview ID</strong><code>${escapeHtml(proof)}</code></div>
      </div>
    </details>
    <div class="g2-result-actions">
      <button class="button" type="button" data-g2-another>Gerar outra prévia</button>
      <button class="button primary" type="button" data-g2-save>Salvar jogos</button>
      <button class="button" type="button" data-g2-open-dashboard hidden>Ver no Painel</button>
      <span class="g2-saved" data-g2-saved hidden></span>
    </div>
  </div>`;

  updateFlowState("review");
  target.querySelector<HTMLButtonElement>("[data-g2-another]")?.addEventListener("click", () => void generatePreview(state));
  target.querySelector<HTMLButtonElement>("[data-g2-save]")?.addEventListener("click", () => void savePreview(state));
  target.querySelector<HTMLButtonElement>("[data-g2-open-dashboard]")?.addEventListener("click", () => {
    window.location.hash = "dashboard";
  });
}

async function generatePreview(state: GeneratorState): Promise<void> {
  const button = root?.querySelector<HTMLButtonElement>("[data-g2-preview]");
  const another = root?.querySelector<HTMLButtonElement>("[data-g2-another]");
  if (button) button.disabled = true;
  if (another) another.disabled = true;
  setError("");
  updateFlowState("preview");
  try {
    state.preview = await postJson<GenerationPreviewResponse>("/generation/preview", requestPayload(state), state.controller.signal);
    renderPreview(state);
    root?.querySelector<HTMLElement>("[data-g2-result]")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    updateFlowState("configure");
    setError(error instanceof Error ? error.message : "Falha ao gerar a prévia");
  } finally {
    if (button?.isConnected) button.disabled = false;
    if (another?.isConnected) another.disabled = false;
  }
}

async function savePreview(state: GeneratorState): Promise<void> {
  if (typeof state.preview?.generatorOptions.seed !== "string" || !state.preview.generatorOptions.seed) return;
  const button = root?.querySelector<HTMLButtonElement>("[data-g2-save]");
  const saved = root?.querySelector<HTMLElement>("[data-g2-saved]");
  if (button) button.disabled = true;
  updateFlowState("save");
  try {
    const response = await postJson<GenerationSaveResponse>("/generation/save", requestPayload(state, true), state.controller.signal);
    if (saved) {
      saved.hidden = false;
      saved.textContent = response.alreadySaved ? `Lote #${response.batchId} já estava salvo e está disponível no Painel.` : `Lote #${response.batchId} salvo e disponível no Painel.`;
    }
    const dashboardButton = root?.querySelector<HTMLButtonElement>("[data-g2-open-dashboard]");
    if (dashboardButton) dashboardButton.hidden = false;
    if (button) button.textContent = "Jogos salvos";
    updateFlowState("saved");
  } catch (error) {
    updateFlowState("review");
    setError(error instanceof Error ? error.message : "Falha ao salvar o lote");
    if (button) button.disabled = false;
  }
}

function updateRange(
  state: GeneratorState,
  key: GenerationFilterKey,
  edge: GenerationRangeEdge,
  value: string,
): void {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return;
  state.filters[key][edge] = Math.round(numeric);
  if (state.filters[key].min > state.filters[key].max) {
    if (edge === "min") state.filters[key].max = state.filters[key].min;
    else state.filters[key].min = state.filters[key].max;
  }
  const min = root?.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-g2-range="${key}:min"]`);
  const max = root?.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-g2-range="${key}:max"]`);
  if (min) min.value = String(state.filters[key].min);
  if (max) max.value = String(state.filters[key].max);
}

function renderDynamicPlan(state: GeneratorState): void {
  renderConfigurationSummary(state);
  const planTarget = root?.querySelector<HTMLElement>("[data-g2-plan]");
  if (planTarget) planTarget.innerHTML = planMarkup(state);
  const baselineTarget = root?.querySelector<HTMLElement>("[data-g2-baseline]");
  if (baselineTarget) baselineTarget.innerHTML = baselineMarkup(state);
  updateNumberButtons(state);
  const repeatedToggle = root?.querySelector<HTMLInputElement>('[data-g2-filter-toggle="repeated"]');
  if (repeatedToggle) repeatedToggle.disabled = !state.plan.dataQuality.previousContestAvailable;
  const filterBaselines: Record<GenerationFilterKey, string> = {
    odd: `Esperado ${formatDecimal(state.plan.baseline.expectedOdd)}`,
    repeated: state.plan.dataQuality.previousContestAvailable
      ? `Esperado ${formatDecimal(state.plan.baseline.expectedRepeated)}`
      : `Concurso #${state.plan.dataQuality.expectedPreviousContestNumber ?? "—"} indisponível`,
    sum: `Esperado ${formatDecimal(state.plan.baseline.expectedSum)} · desvio ${formatDecimal(state.plan.baseline.sumStdDev)}`,
  };
  for (const [key, text] of Object.entries(filterBaselines)) {
    const node = root?.querySelector<HTMLElement>(`[data-g2-filter-baseline="${key}"]`);
    if (node) node.textContent = text;
  }
  const algorithm = algorithmSpace(state);
  const previewButton = root?.querySelector<HTMLButtonElement>("[data-g2-preview]");
  const invalid = state.plan.space.eligibleCombinations < 1
    || (state.purpose === "coverage" && state.coveragePool.size < state.betSize)
    || (state.purpose === "experimental" && algorithm.rawCombinationCapacity < 1)
    || state.plan.constraintIssues.length > 0
    || (state.lottery === "timemania" && !state.favoriteTeam.trim());
  if (previewButton) previewButton.disabled = invalid;
}

function bindWorkspace(state: GeneratorState): void {
  selectionSummary(state);
  updateModeButtons(state);
  renderDynamicPlan(state);
  let planTimer: ReturnType<typeof setTimeout> | undefined;
  let planSequence = 0;

  async function refreshPlan(): Promise<void> {
    const sequence = ++planSequence;
    try {
      const plan = await postJson<GenerationPlan>("/generation/plan", planPayload(state), state.controller.signal);
      if (sequence !== planSequence || state.controller.signal.aborted) return;
      state.plan = plan;
      if (!plan.dataQuality.previousContestAvailable && state.filters.repeated.enabled) {
        state.filters.repeated.enabled = false;
        const toggle = root?.querySelector<HTMLInputElement>('[data-g2-filter-toggle="repeated"]');
        if (toggle) toggle.checked = false;
        return void refreshPlan();
      }
      renderDynamicPlan(state);
      const issue = plan.constraintIssues[0];
      setError(issue || (plan.space.eligibleCombinations < 1 ? "Nenhuma combinação atende à configuração atual." : ""));
    } catch (error) {
      if (state.controller.signal.aborted) return;
      setError(error instanceof Error ? error.message : "Não foi possível recalcular o espaço combinatório");
    }
  }

  function schedulePlan(): void {
    clearPreview(state);
    if (planTimer !== undefined) clearTimeout(planTimer);
    planTimer = setTimeout(() => void refreshPlan(), 220);
  }

  root?.querySelector<HTMLSelectElement>("#g2-purpose")?.addEventListener("change", (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    const next = select.value;
    if (next !== "uniform" && next !== "portfolio" && next !== "coverage" && next !== "experimental") return;
    state.purpose = next;
    if (next !== "coverage" && !state.plan.methodology.fixedCountOptions.includes(state.fixedCount)) {
      state.fixedCount = state.plan.methodology.defaultFixedCount;
    }
    if (next === "experimental") state.betSize = state.plan.drawSize;
    if (next === "coverage") {
      state.fixed.clear();
      state.excluded.clear();
      state.fixedCount = 0;
      state.coverageTargetSize = Math.max(1, state.plan.drawSize - 1);
      if (state.coveragePool.size < state.betSize) {
        state.coveragePool = new Set(Array.from({ length: Math.min(state.plan.universeSize, state.betSize + 2) }, (_, index) => state.lotteryConfig.minNumber + index));
      }
    }
    clearPreview(state);
    root.innerHTML = workspaceMarkup(state);
    bindWorkspace(state);
    updateFlowState("configure");
  });
  root?.querySelector<HTMLSelectElement>("#g2-bet-size")?.addEventListener("change", (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    state.betSize = Number(select.value);
    if (state.purpose === "coverage") {
      state.coverageTargetSize = Math.min(state.coverageTargetSize, state.betSize);
    }
    schedulePlan();
  });

  root?.querySelector<HTMLSelectElement>("#g2-clover-count")?.addEventListener("change", (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    state.cloverCount = Number(select.value);
    clearPreview(state);
  });
  root?.querySelector<HTMLInputElement>("#g2-favorite-team")?.addEventListener("input", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    state.favoriteTeam = input.value;
    clearPreview(state);
    renderDynamicPlan(state);
  });
  root?.querySelectorAll<HTMLSelectElement>("[data-g2-column-mark]").forEach((select) => select.addEventListener("change", () => {
    const index = Number(select.dataset.g2ColumnMark);
    state.columnMarks[index] = Number(select.value);
    clearPreview(state);
  }));

  root?.querySelector<HTMLInputElement>("#g2-game-count")?.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const maximum = state.purpose === "coverage" ? 100 : 10;
    const value = Math.max(1, Math.min(maximum, Math.round(Number(input.value) || 1)));
    state.gameCount = value;
    input.value = String(value);
    clearPreview(state);
  });

  root?.querySelector<HTMLSelectElement>("#g2-fixed-count")?.addEventListener("change", (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    const next = Number(select.value);
    if (next < state.fixed.size) {
      select.value = String(state.fixedCount);
      selectionSummary(state, "Remova algumas dezenas fixadas antes de reduzir o núcleo.");
      return;
    }
    state.fixedCount = next;
    selectionSummary(state);
    clearPreview(state);
    renderDynamicPlan(state);
  });

  root?.querySelector<HTMLInputElement>("#g2-target")?.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const raw = input.value.trim();
    if (!raw) {
      state.targetContestNumber = undefined;
      schedulePlan();
      return;
    }
    const next = Number(raw);
    if (Number.isInteger(next) && next > 0) {
      state.targetContestNumber = next;
      schedulePlan();
    }
  });

  root?.querySelectorAll<HTMLButtonElement>("[data-g2-selection-mode]").forEach((button) => button.addEventListener("click", () => {
    if (!isSelectionMode(button.dataset.g2SelectionMode)) return;
    state.selectionMode = button.dataset.g2SelectionMode;
    updateModeButtons(state);
    selectionSummary(state);
  }));

  root?.querySelectorAll<HTMLButtonElement>("[data-g2-number]").forEach((button) => button.addEventListener("click", () => {
    const value = Number(button.dataset.g2Number);
    let message = "";
    if (state.purpose === "coverage") {
      if (state.coveragePool.has(value)) state.coveragePool.delete(value);
      else state.coveragePool.add(value);
      updateNumberButtons(state);
      selectionSummary(state);
      clearPreview(state);
      renderDynamicPlan(state);
      return;
    }
    if (state.selectionMode === "fix") {
      if (state.fixed.has(value)) {
        state.fixed.delete(value);
      } else if (state.fixedCount === 0) {
        message = "Selecione um núcleo compartilhado maior que zero para fixar dezenas.";
      } else if (state.fixed.size >= state.fixedCount) {
        message = `O núcleo já tem ${state.fixedCount} dezenas fixadas manualmente.`;
      } else {
        state.excluded.delete(value);
        state.fixed.add(value);
      }
    } else if (state.selectionMode === "exclude") {
      state.fixed.delete(value);
      if (state.excluded.has(value)) state.excluded.delete(value);
      else state.excluded.add(value);
    } else {
      state.fixed.delete(value);
      state.excluded.delete(value);
    }
    updateNumberButtons(state);
    selectionSummary(state, message);
    if (!message) schedulePlan();
  }));

  root?.querySelectorAll<HTMLInputElement>("[data-g2-filter-toggle]").forEach((toggle) => toggle.addEventListener("change", () => {
    const key = toggle.dataset.g2FilterToggle;
    if (!isFilterKey(key)) return;
    state.filters[key].enabled = toggle.checked;
    const panel = root?.querySelector<HTMLElement>(`[data-g2-filter="${key}"]`);
    panel?.setAttribute("aria-disabled", state.filters[key].enabled ? "false" : "true");
    root?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`[data-g2-range^="${key}:"]`).forEach((control) => {
      control.disabled = !state.filters[key].enabled;
    });
    schedulePlan();
  }));

  root?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-g2-range]").forEach((control) => control.addEventListener("change", () => {
    const [key, edge] = (control.dataset.g2Range || "").split(":");
    if (!isFilterKey(key) || !isRangeEdge(edge)) return;
    updateRange(state, key, edge, control.value);
    schedulePlan();
  }));

  root?.querySelector<HTMLInputElement>("#g2-coverage-target")?.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    state.coverageTargetSize = Math.max(1, Math.min(state.betSize, Math.round(Number(input.value) || 1)));
    input.value = String(state.coverageTargetSize);
    clearPreview(state);
    renderDynamicPlan(state);
  });

  root?.querySelector<HTMLInputElement>("#g2-coverage-budget")?.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const raw = input.value.trim();
    state.coverageBudgetCents = raw ? Math.max(0, Math.round(Number(raw.replace(",", ".")) * 100)) : undefined;
    clearPreview(state);
    renderDynamicPlan(state);
  });

  root?.querySelector<HTMLButtonElement>("[data-g2-preview]")?.addEventListener("click", () => void generatePreview(state));

  state.cleanup = () => {
    if (planTimer !== undefined) clearTimeout(planTimer);
    state.controller.abort();
  };
}

function cleanupGeneration(): void {
  lifecycleToken += 1;
  cleanupCurrent?.();
  cleanupCurrent = null;
}

async function mount(detail: ViewRenderedDetail): Promise<void> {
  const token = ++lifecycleToken;
  cleanupCurrent?.();
  cleanupCurrent = null;
  if (!root || currentMainView() !== "generate") return;
  const legacyForm = root.querySelector<HTMLFormElement>("#generate-form");

  const lotteryValue = detail.lottery || document.querySelector<HTMLSelectElement>("#lottery-select")?.value || "mega-sena";
  if (!isLotteryId(lotteryValue)) return;
  const lottery = lotteryValue;
  const legacyGameCount = Number(legacyForm?.querySelector<HTMLInputElement>("#game-count")?.value)
    || DEFAULT_GAME_COUNTS[lottery]
    || DEFAULT_GAME_COUNT;
  const legacyTargetValue = Number(legacyForm?.querySelector<HTMLInputElement>("#target-contest")?.value);
  const legacyTarget = legacyTargetValue || undefined;
  const controller = new AbortController();

  try {
    const catalog = await api<{ items?: LotteryGenerationConfig[] }>("/lotteries", {
      signal: controller.signal,
    });
    const lotteryConfig = (catalog?.items || []).find((item) => item.id === lottery);
    if (
      !lotteryConfig
      || !isLotteryId(lotteryConfig.id)
      || lotteryConfig.enabled === false
      || lotteryConfig.capabilities?.simulation === false
      || !Number.isFinite(lotteryConfig.minNumber)
      || !Number.isFinite(lotteryConfig.defaultBetSize)
    ) {
      throw new Error("A modalidade selecionada não possui configuração de geração disponível");
    }

    const plan = await postJson<GenerationPlan>("/generation/plan", {
      lottery,
      betSize: lotteryConfig.defaultBetSize,
      ...(legacyTarget ? { targetContestNumber: legacyTarget } : {}),
      fixedNumbers: [],
      excludedNumbers: [],
    } satisfies GenerationPlanPayload, controller.signal);
    if (token !== lifecycleToken || currentMainView() !== "generate" || controller.signal.aborted) return;

    const preferredSumMin = Math.max(1, Math.round(plan.baseline.expectedSum - plan.baseline.sumStdDev));
    const preferredSumMax = Math.round(plan.baseline.expectedSum + plan.baseline.sumStdDev);
    const state: GeneratorState = {
      lottery,
      lotteryConfig,
      gameCount: legacyGameCount,
      fixedCount: plan.methodology.defaultFixedCount,
      betSize: plan.betSize,
      targetContestNumber: plan.targetContestNumber,
      fixed: new Set<number>(),
      excluded: new Set<number>(),
      selectionMode: "fix",
      purpose: "uniform",
      filters: {
        odd: { enabled: false, ...plan.methodology.preferredOdd },
        repeated: { enabled: false, ...plan.methodology.preferredRepeated },
        sum: { enabled: false, min: preferredSumMin, max: preferredSumMax },
      },
      plan,
      preview: null,
      cloverCount: 2,
      favoriteTeam: "",
      columnMarks: Array(7).fill(1),
      coveragePool: new Set<number>(),
      coverageTargetSize: Math.max(1, plan.drawSize - 1),
      controller,
      cleanup: null,
    };

    root.innerHTML = workspaceMarkup(state);
    bindWorkspace(state);
    cleanupCurrent = () => state.cleanup?.();
  } catch (error) {
    controller.abort();
    console.warn("Generator 2.0 unavailable; keeping basic generator", error);
  }
}

onViewRendered((detail) => {
  if (detail.view === "generate") void mount(detail);
  else cleanupGeneration();
});

onMainViewChanged((view) => {
  if (view !== "generate") cleanupGeneration();
});
