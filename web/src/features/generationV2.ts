import { api } from "../core/api.js";
import { isLotteryId } from "../core/mainContext.js";
import { currentMainView, onMainViewChanged, onViewRendered, type ViewRenderedDetail } from "../core/viewLifecycle.js";
import { escapeHtml } from "../shared/escaping.js";
import { NUMBER_TIERS, isSelectionMode, isFilterKey, isRangeEdge, tierByNumber, requestPayload, planPayload, algorithmSpace, purposeCopy } from "./generationV2/state.js";
import { formatInteger, formatDecimal, formatPercent, formatCurrencyCents, numberLabel, planMarkup, baselineMarkup, configurationSummaryMarkup, workspaceMarkup, gameMarkup } from "./generationV2/view.js";
import type { GeneratorState, GenerationPlan, GenerationFilterKey, GenerationRangeEdge, GenerationPlanPayload, LotteryId, GenerationPreviewResponse, GenerationSaveResponse, LotteryGenerationConfig } from "./generationV2/types.js";

const root = document.querySelector<HTMLElement>("#content");
let lifecycleToken = 0;
let cleanupCurrent: (() => void) | null = null;

const DEFAULT_GAME_COUNT = 4;
const DEFAULT_GAME_COUNTS: Partial<Record<LotteryId, number>> = {
  "mega-sena": 2,
  lotomania: 2,
};







async function postJson<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  const payload = await api<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
  if (payload === null) throw new Error("Resposta vazia do servidor");
  return payload;
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
