import { api } from "../core/api.js";
import { isLotteryId } from "../core/mainContext.js";
import { currentMainView, onMainViewChanged, onViewRendered, type ViewRenderedDetail } from "../core/viewLifecycle.js";
import { escapeHtml } from "../shared/escaping.js";
import { isSelectionMode, isFilterKey, isRangeEdge, requestPayload, planPayload, algorithmSpace, purposeCopy } from "./generationV2/state.js";
import { formatDecimal, numberLabel, planMarkup, baselineMarkup, configurationSummaryMarkup, workspaceMarkup, selectionBrief, gameMarkup, emptyGamesMarkup, gamesToText, icon } from "./generationV2/view.js";
import type { GeneratorState, GenerationPlan, GenerationFilterKey, GenerationRangeEdge, GenerationPlanPayload, LotteryId, GenerationPreviewResponse, LotteryGenerationConfig } from "./generationV2/types.js";

const root = document.querySelector<HTMLElement>("#content");
let lifecycleToken = 0;
let cleanupCurrent: (() => void) | null = null;
let refreshOnSync: (() => void) | null = null;
window.addEventListener("loto-lab:data-synced", () => refreshOnSync?.());

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

type GenerationFlowStage = "configure" | "preview" | "review";

function updateFlowState(stage: GenerationFlowStage): void {
  const shell = root?.querySelector<HTMLElement>("[data-g2-shell]");
  if (shell) shell.dataset.g2Stage = stage;
}

function renderConfigurationSummary(state: GeneratorState): void {
  const target = root?.querySelector<HTMLElement>("[data-g2-config-summary]");
  if (target) target.innerHTML = configurationSummaryMarkup(state);
}


function selectionSummary(state: GeneratorState, message = ""): void {
  const brief = root?.querySelector<HTMLElement>("[data-g2-selection-brief]");
  if (brief) brief.textContent = selectionBrief(state);
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
  root?.querySelectorAll<HTMLButtonElement>("[data-g2-number]").forEach((button) => {
    const value = Number(button.dataset.g2Number);
    const selection = state.purpose === "coverage"
      ? state.coveragePool.has(value) ? "fixed" : "auto"
      : state.fixed.has(value) ? "fixed" : state.excluded.has(value) ? "excluded" : "auto";
    button.dataset.selection = selection;
    button.classList.toggle("is-fixed", selection === "fixed");
    button.classList.toggle("is-excluded", selection === "excluded");
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
  state.revision = (state.revision ?? 0) + 1;
  const target = root?.querySelector<HTMLElement>("[data-g2-result]");
  if (target) target.innerHTML = emptyGamesMarkup();
  root?.querySelector("[data-g2-generated-audit]")?.replaceChildren();
  updateFlowState("configure");
  renderConfigurationSummary(state);
}

function setError(message = ""): void {
  const error = root?.querySelector<HTMLElement>("[data-g2-error]");
  if (!error) return;
  error.hidden = !message;
  error.textContent = message;
}


async function copyGames(state: GeneratorState, button: HTMLButtonElement): Promise<void> {
  if (!state.preview) return;
  const text = gamesToText(state.preview.games);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const previous = document.activeElement;
      const input = document.createElement("textarea");
      input.value = text;
      input.className = "clipboard-fallback";
      input.setAttribute("aria-label", "Jogos para copiar");
      document.body.append(input);
      try {
        input.select();
        if (!document.execCommand("copy")) throw new Error("Selecione as dezenas para copiar manualmente.");
      } finally {
        input.remove();
        if (previous instanceof HTMLElement) previous.focus();
      }
    }
    button.innerHTML = `${icon("check")}Jogos copiados!`;
    button.setAttribute("aria-label", "Jogos copiados para a área de transferência");
  } catch {
    setError("Não foi possível copiar automaticamente. Selecione as dezenas e copie manualmente.");
  }
}

function renderPreview(state: GeneratorState): void {
  const target = root?.querySelector<HTMLElement>("[data-g2-result]");
  if (!target || !state.preview) return;
  const preview = state.preview;
  const audit = preview.audit;
  const seed = typeof preview.generatorOptions.seed === "string" ? preview.generatorOptions.seed : "—";
  target.innerHTML = `<div class="g2-preview">
    <div class="section-heading"><h2><img class="coral-spark" src="/assets/images/coral-spark.webp" width="36" height="40" alt="" />Seus jogos</h2><span class="generated-count">${preview.games.length} ${preview.games.length === 1 ? "combinação gerada" : "combinações geradas"}</span><button class="button copy-button" type="button" data-g2-copy>${icon("copy")}Copiar jogos</button></div>
    <div class="g2-game-grid">${preview.games.map(gameMarkup).join("")}</div>

  </div>`;
  const auditTarget = root?.querySelector<HTMLElement>("[data-g2-generated-audit]");
  if (auditTarget) auditTarget.innerHTML = `<details class="g2-preview-audit"><summary>Como estes jogos foram gerados</summary><div class="g2-preview-audit-body"><p>${escapeHtml(purposeCopy(state.purpose).description)}</p><div class="g2-audit-grid"><div><span>Dezenas distintas</span><strong>${audit.uniqueNumbers.length}</strong></div><div><span>Sobreposição média</span><strong>${formatDecimal(audit.averagePairwiseOverlap)}</strong></div></div><p>Referência da geração: ${audit.plan.referenceContestNumber ? `histórico até o concurso #${audit.plan.referenceContestNumber}` : "sem concurso anterior disponível"}.</p><p>Identificador para reprodução: <code>${escapeHtml(seed)}</code></p></div></details>`;
  updateFlowState("review");
  const button = target.querySelector<HTMLButtonElement>("[data-g2-copy]");
  button?.addEventListener("click", () => void copyGames(state, button));
}

async function generatePreview(state: GeneratorState): Promise<void> {
  if (state.generating || state.planPending) return;
  const button = root?.querySelector<HTMLButtonElement>("[data-g2-preview]");
  const label = button?.querySelector("span");
  if (button) button.disabled = true;
  if (label) label.textContent = "Criando combinações…";
  setError("");
  updateFlowState("preview");
  state.generating = true;
  const revision = state.revision ?? 0;
  const result = root?.querySelector<HTMLElement>("[data-g2-result]");
  result?.setAttribute("aria-busy", "true");
  try {
    const response = await postJson<GenerationPreviewResponse>("/generation/preview", requestPayload(state), state.controller.signal);
    if (state.controller.signal.aborted || revision !== (state.revision ?? 0)) return;
    state.preview = response;
    renderPreview(state);
    const output = root?.querySelector<HTMLElement>("[data-g2-result]");
    if (output && output.getBoundingClientRect().top > window.innerHeight - 100) {
      output.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    }
  } catch (error) {
    if (state.controller.signal.aborted || revision !== (state.revision ?? 0)) return;
    updateFlowState("configure");
    setError(error instanceof Error ? error.message : "Não foi possível gerar os jogos. Tente novamente.");
  } finally {
    state.generating = false;
    result?.setAttribute("aria-busy", "false");
    if (label?.isConnected) label.textContent = "Gerar jogos";
    if (!state.controller.signal.aborted) renderDynamicPlan(state);
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
  const invalid = Boolean(state.generating || state.planPending)
    || state.plan.space.eligibleCombinations < 1
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

  async function refreshPlan(): Promise<void> {
    const sequence = state.planSequence = (state.planSequence ?? 0) + 1;
    try {
      const plan = await postJson<GenerationPlan>("/generation/plan", planPayload(state), state.controller.signal);
      if (sequence !== state.planSequence || state.controller.signal.aborted) return;
      state.plan = plan;
      state.planPending = false;
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
      if (state.controller.signal.aborted || sequence !== state.planSequence) return;
      state.planPending = false;
      setError(error instanceof Error ? error.message : "Não foi possível recalcular o espaço combinatório");
      renderDynamicPlan(state);
    }
  }

  function schedulePlan(): void {
    state.planSequence = (state.planSequence ?? 0) + 1;
    clearPreview(state);
    state.planPending = true;
    renderDynamicPlan(state);
    if (planTimer !== undefined) clearTimeout(planTimer);
    planTimer = setTimeout(() => void refreshPlan(), 220);
  }

  root?.querySelector<HTMLSelectElement>("#g2-purpose")?.addEventListener("change", (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    const next = select.value;
    if (next !== "uniform" && next !== "portfolio" && next !== "coverage" && next !== "experimental" && next !== "payout") return;
    state.purpose = next;
    if (next === "uniform" || next === "portfolio" || next === "payout") state.fixedCount = state.fixed.size;
    if (next === "experimental" && !state.plan.methodology.fixedCountOptions.includes(state.fixedCount)) {
      state.fixedCount = state.plan.methodology.defaultFixedCount;
    }
    if (next === "experimental" || next === "payout") state.betSize = state.plan.drawSize;
    if (next === "coverage") {
      state.fixed.clear();
      state.excluded.clear();
      state.fixedCount = 0;
      state.coverageTargetSize = Math.max(1, state.plan.drawSize - 1);
      if (state.coveragePool.size < state.betSize) {
        state.coveragePool = new Set(Array.from({ length: Math.min(state.plan.universeSize, state.betSize + 2) }, (_, index) => state.lotteryConfig.minNumber + index));
      }
    }
    if (planTimer !== undefined) clearTimeout(planTimer);
    clearPreview(state);
    state.planPending = true;
    root.innerHTML = workspaceMarkup(state);
    bindWorkspace(state);
    void refreshPlan();
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
      } else if (state.fixed.size >= (state.purpose === "experimental" ? state.fixedCount : state.betSize)) {
        message = `Você pode fixar até ${state.purpose === "experimental" ? state.fixedCount : state.betSize} dezenas neste modo.`;
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
    if (state.purpose === "uniform" || state.purpose === "portfolio" || state.purpose === "payout") state.fixedCount = state.fixed.size;
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

  root?.querySelectorAll<HTMLButtonElement>("[data-g2-step]").forEach(button => button.addEventListener("click", () => {
    const input = root?.querySelector<HTMLInputElement>("#g2-game-count");
    if (!input) return;
    input.value = String(state.gameCount + Number(button.dataset.g2Step));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }));

  root?.querySelector<HTMLButtonElement>("[data-g2-preview]")?.addEventListener("click", () => void generatePreview(state));

  refreshOnSync = () => {
    if (planTimer !== undefined) clearTimeout(planTimer);
    state.planPending = true;
    renderDynamicPlan(state);
    void refreshPlan();
  };

  state.cleanup = () => {
    if (planTimer !== undefined) clearTimeout(planTimer);
    state.controller.abort();
  };
}

function cleanupGeneration(): void {
  lifecycleToken += 1;
  cleanupCurrent?.();
  cleanupCurrent = null;
  refreshOnSync = null;
}

async function mount(detail: ViewRenderedDetail): Promise<void> {
  const token = ++lifecycleToken;
  cleanupCurrent?.();
  cleanupCurrent = null;
  if (!root || currentMainView() !== "generate") return;
  const lotteryValue = detail.lottery || "mega-sena";
  if (!isLotteryId(lotteryValue)) return;
  const controller = new AbortController();
  cleanupCurrent = () => controller.abort();
  refreshOnSync = null;

  try {
    const catalog = await api<{ items?: LotteryGenerationConfig[] }>("/lotteries", {
      signal: controller.signal,
    });
    const available = (catalog?.items || []).filter(item => isLotteryId(item.id)
      && item.enabled !== false && item.capabilities?.simulation !== false
      && Number.isFinite(item.minNumber) && Number.isFinite(item.defaultBetSize));
    const lotteryConfig = available.find(item => item.id === lotteryValue)
      || available.find(item => item.id === "mega-sena") || available[0];
    if (!lotteryConfig) throw new Error("Nenhuma modalidade está disponível para geração agora.");
    const lottery = lotteryConfig.id;
    const gameCount = DEFAULT_GAME_COUNTS[lottery] || DEFAULT_GAME_COUNT;

    const plan = await postJson<GenerationPlan>("/generation/plan", {
      lottery,
      betSize: lotteryConfig.defaultBetSize,
      fixedNumbers: [],
      excludedNumbers: [],
    } satisfies GenerationPlanPayload, controller.signal);
    if (token !== lifecycleToken || currentMainView() !== "generate" || controller.signal.aborted) return;

    const preferredSumMin = Math.max(1, Math.round(plan.baseline.expectedSum - plan.baseline.sumStdDev));
    const preferredSumMax = Math.round(plan.baseline.expectedSum + plan.baseline.sumStdDev);
    const state: GeneratorState = {
      lottery,
      lotteryConfig,
      lotteryCatalog: catalog?.items || [],
      gameCount,
      fixedCount: 0,
      betSize: plan.betSize,
      targetContestNumber: undefined,
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
    root.setAttribute("aria-busy", "false");
    bindWorkspace(state);
    window.dispatchEvent(new CustomEvent("loto-lab:generator-ready", { detail: { lottery, name: lotteryConfig.name } }));
    cleanupCurrent = () => state.cleanup?.();
  } catch (error) {
    controller.abort();
    if (token !== lifecycleToken) return;
    root.setAttribute("aria-busy", "false");
    root.innerHTML = `<div class="error-state" role="alert"><h2>Vamos tentar de novo?</h2><p>${escapeHtml(error instanceof Error ? error.message : "Não foi possível preparar o gerador.")}</p><button class="button" type="button" data-g2-retry>Tentar novamente</button></div>`;
  }
}

onViewRendered((detail) => {
  if (detail.view === "generate") void mount(detail);
  else cleanupGeneration();
});

onMainViewChanged((view) => {
  if (view !== "generate") cleanupGeneration();
});
