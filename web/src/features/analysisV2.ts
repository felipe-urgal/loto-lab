import { number, decimal, percent, evidenceCopy, validationCards, TIER_LABELS, type AnalysisMapFilter } from "./analysisV2/helpers.js";
import { numberDetailMarkup } from "./analysisV2/map.js";
import { shellMarkup } from "./analysisV2/shell.js";
import { api } from "../core/api.js";
import { currentMainView, onMainViewChanged, onViewRendered } from "../core/viewLifecycle.js";
import { escapeHtml } from "../shared/escaping.js";
import type { AnalysisPayload } from "./analysisV2/types.js";

const root = document.querySelector<HTMLElement>("#content")!;
const lotterySelect = document.querySelector<HTMLSelectElement>("#lottery-select");
const viewSubtitle = document.querySelector<HTMLElement>("#view-subtitle");


type LotteryCatalogItem = {
  id?: string;
  name?: string;
  family?: string;
  enabled?: boolean;
  capabilities?: {
    analysis?: boolean;
  };
};

type LotteryCatalogPayload = {
  items?: LotteryCatalogItem[];
};

const FLAT_NUMBER_FAMILIES = new Set(["number-draw", "number-draw-secondary"]);

let renderToken = 0;
let currentData: AnalysisPayload | null = null;
let detailReturnFocus: HTMLElement | null = null;
let activeMapFilter: AnalysisMapFilter = "all";

function currentLottery(): string {
  return lotterySelect?.value || "mega-sena";
}



































function cleanupDetailState({ restoreFocus = true }: { restoreFocus?: boolean } = {}): void {
  document.body.classList.remove("a2-detail-open");
  if (restoreFocus && detailReturnFocus?.isConnected) detailReturnFocus.focus();
  detailReturnFocus = null;
}

function closeNumberDetail({ restoreFocus = true }: { restoreFocus?: boolean } = {}): void {
  const detail = root.querySelector<HTMLDialogElement>("#a2-detail");
  if (detail?.open) detail.close();
  cleanupDetailState({ restoreFocus });
}

function openNumberDetail(value: string | undefined, trigger: EventTarget | null): void {
  const item = currentData?.advanced.ranking.dynamics.items.find((candidate) => candidate.number === Number(value));
  const detail = root.querySelector<HTMLDialogElement>("#a2-detail");
  if (!item || !detail) return;
  detailReturnFocus = trigger instanceof HTMLElement
    ? trigger
    : document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  detail.innerHTML = numberDetailMarkup(item);
  document.body.classList.add("a2-detail-open");
  if (!detail.open) detail.showModal();
  const closeButton = detail.querySelector<HTMLButtonElement>("[data-a2-detail-close]");
  closeButton?.addEventListener("click", () => closeNumberDetail(), { once: true });
  closeButton?.focus();
}

function compareNumbers(): void {
  const a = Number(root.querySelector<HTMLSelectElement>("[data-a2-compare-a]")?.value);
  const b = Number(root.querySelector<HTMLSelectElement>("[data-a2-compare-b]")?.value);
  const result = root.querySelector<HTMLElement>("[data-a2-compare-result]");
  const items = currentData?.advanced.ranking.dynamics.items || [];
  const first = items.find((item) => item.number === a);
  const second = items.find((item) => item.number === b);
  if (!result || !first || !second || a === b) {
    if (result) result.innerHTML = '<div class="a2-empty">Selecione duas dezenas diferentes.</div>';
    return;
  }
  const rows: Array<[string, string | number, string | number]> = [
    ["Pontuação", decimal(first.score), decimal(second.score)],
    ["Classificação", `#${first.rank}`, `#${second.rank}`],
    ["Grupo", TIER_LABELS[first.tier], TIER_LABELS[second.tier]],
    ["Movimento 10", first.movements.ten ?? "—", second.movements.ten ?? "—"],
    ["Ano", decimal(first.components.year), decimal(second.components.year)],
    ["Mês", decimal(first.components.month), decimal(second.components.month)],
    ["Últimos 10", decimal(first.components.recent10), decimal(second.components.recent10)],
    ["Últimos 20", decimal(first.components.recent20), decimal(second.components.recent20)],
    ["Histórico", decimal(first.components.historical), decimal(second.components.historical)],
    ["Robustez", percent(first.weightRobustness.tierStability), percent(second.weightRobustness.tierStability)],
  ];
  result.innerHTML = `<div class="a2-compare-table"><div><strong>Indicador</strong><strong>${number(a)}</strong><strong>${number(b)}</strong></div>${rows.map((row) => `<div><span>${row[0]}</span><b>${row[1]}</b><b>${row[2]}</b></div>`).join("")}</div>`;
}

function pairCheck(): void {
  const a = Number(root.querySelector<HTMLSelectElement>("[data-a2-pair-a]")?.value);
  const b = Number(root.querySelector<HTMLSelectElement>("[data-a2-pair-b]")?.value);
  const target = root.querySelector<HTMLElement>("[data-a2-pair-result]");
  if (!target) return;
  if (a === b) {
    target.innerHTML = '<div class="a2-empty">Escolha duas dezenas diferentes.</div>';
    return;
  }
  const pair = currentData?.advanced.combinations.pairs.find((item) => item.numbers.includes(a) && item.numbers.includes(b));
  if (!pair) {
    target.innerHTML = '<div class="a2-empty">Par indisponível para a amostra atual.</div>';
    return;
  }
  target.innerHTML = `<div class="a2-pair-stat"><strong>${number(a)} + ${number(b)}</strong><span><small>observado</small><b>${pair.observed}</b></span><span><small>esperado</small><b>${decimal(pair.expected)}</b></span><span><small>razão obs./esp.</small><b>${decimal(pair.lift, 2)}×</b></span><span><small>escore-z</small><b>${decimal(pair.zScore, 2)}</b></span><em class="evidence-${pair.evidence}">${evidenceCopy(pair.evidence)} · p exato ajustado ${decimal(pair.adjustedPValue, 4)}</em></div>`;
}

function chooseDistinctDefaults(firstSelector: string, secondSelector: string): void {
  const first = root.querySelector<HTMLSelectElement>(firstSelector);
  const second = root.querySelector<HTMLSelectElement>(secondSelector);
  if (!first || !second || second.options.length < 2) return;
  if (first.value === second.value) second.selectedIndex = 1;
}

function applyMapFilter(filter: AnalysisMapFilter): void {
  activeMapFilter = filter;
  root.querySelectorAll<HTMLButtonElement>("[data-a2-map-filter]").forEach((button) => {
    const selected = button.dataset.a2MapFilter === filter;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  root.querySelectorAll<HTMLElement>(".a2-map-number").forEach((button) => {
    button.hidden = filter !== "all" && button.dataset.a2Tier !== filter;
  });
}

function bindAnalysisInteractions(): void {
  root.querySelectorAll<HTMLElement>("[data-a2-number]").forEach((node) => {
    node.addEventListener("click", () => openNumberDetail(node.dataset.a2Number, node));
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openNumberDetail(node.dataset.a2Number, node);
      }
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-a2-map-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.a2MapFilter;
      if (filter === "all" || filter === "strong" || filter === "balanced" || filter === "cold") {
        applyMapFilter(filter);
      }
    });
  });
  chooseDistinctDefaults("[data-a2-compare-a]", "[data-a2-compare-b]");
  chooseDistinctDefaults("[data-a2-pair-a]", "[data-a2-pair-b]");
  root.querySelector("[data-a2-compare]")?.addEventListener("click", compareNumbers);
  root.querySelector("[data-a2-pair-check]")?.addEventListener("click", pairCheck);
  root.querySelector<HTMLSelectElement>("[data-a2-validation-window]")?.addEventListener("change", (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    const period = currentData?.advanced.validation.periods.find((candidate) => candidate.window === Number(select.value));
    const target = root.querySelector<HTMLElement>("[data-a2-validation-cards]");
    if (period && target) target.innerHTML = validationCards(period);
  });
}

function bindShellInteractions(): void {
  bindAnalysisInteractions();
  applyMapFilter(activeMapFilter);

  const detail = root.querySelector<HTMLDialogElement>("#a2-detail");
  detail?.addEventListener("close", () => cleanupDetailState());
  detail?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeNumberDetail();
  });
  detail?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeNumberDetail();
    }
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Tente atualizar novamente em alguns instantes.";
}

function showFallbackNotice(error: unknown): void {
  if (currentMainView() !== "analysis") return;
  root.innerHTML = `<div class="a2-shell"><div class="a2-warning a2-fallback-notice" data-analysis-v2-fallback><strong>Análises indisponíveis</strong><span>${escapeHtml(errorMessage(error))}</span></div></div>`;
}

function renderUnsupportedAnalysis(catalog: LotteryCatalogItem): void {
  const familyCopy = catalog.family === "column-draw"
    ? "Esta modalidade usa colunas independentes; tratá-la como um conjunto plano de dezenas produziria uma leitura incorreta."
    : catalog.family === "dual-number-draw"
      ? "Esta modalidade possui dois sorteios por concurso; o mapa único de dezenas não representa corretamente essa estrutura."
      : "Esta modalidade não possui análise numérica compatível com esta superfície.";
  currentData = null;
  closeNumberDetail({ restoreFocus: false });
  root.innerHTML = `<div class="a2-shell"><section class="a2-unavailable"><span class="a2-eyebrow">Análise por modalidade</span><h2>${escapeHtml(catalog.name || currentLottery())}</h2><p>${escapeHtml(familyCopy)}</p><strong>Nenhum indicador incompatível foi exibido.</strong></section></div>`;
  if (viewSubtitle) viewSubtitle.textContent = "Indicadores aparecem somente quando a estrutura da modalidade é compatível.";
}

async function renderAnalysisV2(): Promise<void> {
  if (currentMainView() !== "analysis") return;
  const lottery = currentLottery();
  const token = ++renderToken;
  try {
    const catalogPayload = await api<LotteryCatalogPayload>("/lotteries");
    if (token !== renderToken || currentMainView() !== "analysis" || currentLottery() !== lottery) return;
    const catalog = (catalogPayload?.items || []).find((item) => item.id === lottery);
    if (!catalog || catalog.enabled === false || catalog.capabilities?.analysis === false || !FLAT_NUMBER_FAMILIES.has(catalog.family || "")) {
      renderUnsupportedAnalysis(catalog || { id: lottery, name: lottery, family: "unsupported" });
      return;
    }

    const data = await api<AnalysisPayload>(`/analysis/${lottery}/advanced`);
    if (token !== renderToken || currentMainView() !== "analysis" || currentLottery() !== lottery) return;
    if (!data?.advanced) return;
    currentData = data;
    activeMapFilter = "all";
    if (viewSubtitle) viewSubtitle.textContent = "Dezenas e indicadores históricos da modalidade selecionada.";
    closeNumberDetail({ restoreFocus: false });
    root.innerHTML = shellMarkup(data, catalog, lottery, activeMapFilter);
    bindShellInteractions();
  } catch (error) {
    if (token !== renderToken || currentMainView() !== "analysis") return;
    showFallbackNotice(error);
  }
}

onViewRendered(({ view }) => {
  if (view === "analysis") void renderAnalysisV2();
  else closeNumberDetail({ restoreFocus: false });
});

onMainViewChanged((view) => {
  if (view !== "analysis") closeNumberDetail({ restoreFocus: false });
});

window.addEventListener("loto-lab:data-synced", () => {
  if (currentMainView() === "analysis") void renderAnalysisV2();
});
