import { api } from "../core/api.js";
import { currentMainView, onViewRendered } from "../core/viewLifecycle.js";
import { escapeHtml } from "../shared/escaping.js";

interface LatestContest {
  number: number;
}

type AnalysisTier = "strong" | "balanced" | "cold";
type AnalysisSortKey = "score" | "year" | "month" | "recent10" | "recent20" | "historical";

interface AnalysisRow {
  number: number;
  tier: AnalysisTier;
  score: number;
  year: number;
  month: number;
  recent10: number;
  recent20: number;
  historical: number;
}

interface AnalysisResponse {
  numbers: AnalysisRow[];
  weights: {
    year: number;
    recent20: number;
    month: number;
    historical: number;
    recent10: number;
  };
}

const root = document.querySelector<HTMLElement>("#content");
const lotterySelect = document.querySelector<HTMLSelectElement>("#lottery-select");
const latestCache = new Map<string, Promise<LatestContest | undefined>>();
let scheduled = false;

function currentLottery(): string {
  return lotterySelect?.value || "mega-sena";
}

function getLatest(lottery: string, force = false): Promise<LatestContest | undefined> {
  if (force) latestCache.delete(lottery);
  if (!latestCache.has(lottery)) {
    const pending = api<LatestContest>(`/contests/${encodeURIComponent(lottery)}/latest`)
      .then((value) => value ?? undefined)
      .catch(() => {
        latestCache.delete(lottery);
        return undefined;
      });
    latestCache.set(lottery, pending);
  }
  return latestCache.get(lottery) as Promise<LatestContest | undefined>;
}

function tierLabel(tier: AnalysisTier): string {
  return tier === "strong" ? "Forte" : tier === "balanced" ? "Intermediária" : "Fria";
}

function tierBadgeClass(tier: AnalysisTier): string {
  return tier === "strong" ? "positive" : tier === "balanced" ? "warning" : "";
}

async function refineAnalysis(): Promise<void> {
  const table = root?.querySelector<HTMLTableElement>(".table-wrap table");
  if (!table || table.dataset.analysisRefined === "true" || table.dataset.analysisRefined === "loading") return;
  table.dataset.analysisRefined = "loading";

  const lottery = currentLottery();
  let data: AnalysisResponse | null;
  try {
    data = await api<AnalysisResponse>(`/analysis/${encodeURIComponent(lottery)}`);
    if (!data) throw new Error("Empty analysis response");
  } catch {
    if (table.isConnected) delete table.dataset.analysisRefined;
    return;
  }

  if (currentMainView() !== "analysis" || currentLottery() !== lottery || !table.isConnected) {
    if (table.isConnected) delete table.dataset.analysisRefined;
    return;
  }
  table.dataset.analysisRefined = "true";
  const analysis = data;

  const topByScore = new Set([...analysis.numbers]
    .sort((a, b) => b.score - a.score || a.number - b.number)
    .slice(0, 5)
    .map((row) => row.number));

  const tableWrap = table.closest<HTMLElement>(".table-wrap");
  if (!tableWrap?.parentElement) return;
  const refinement = document.createElement("div");
  refinement.className = "analysis-refinement";
  refinement.dataset.analysisRefined = "true";
  refinement.innerHTML = `
    <div class="analysis-toolbar">
      <div>
        <strong>Explorar classificação</strong>
        <div class="form-note">A classificação é relativa ao período e à distribuição atual.</div>
      </div>
      <div class="analysis-toolbar-controls">
        <label class="field"><span>Grupo</span><select data-analysis-filter>
          <option value="strong">Fortes</option>
          <option value="balanced">Intermediárias</option>
          <option value="cold">Frias</option>
          <option value="all">Todas</option>
        </select></label>
        <label class="field"><span>Ordenar por</span><select data-analysis-sort>
          <option value="score">Pontuação</option>
          <option value="year">Ano</option>
          <option value="month">Mês</option>
          <option value="recent10">10 últimos</option>
          <option value="recent20">20 últimos</option>
          <option value="historical">Histórico</option>
        </select></label>
      </div>
    </div>
    <details class="score-explainer">
      <summary>Como a pontuação é calculada?</summary>
      <p>Pesos atuais: ano ${(analysis.weights.year * 100).toFixed(0)}%, últimos 20 ${(analysis.weights.recent20 * 100).toFixed(0)}%, mês ${(analysis.weights.month * 100).toFixed(0)}%, histórico ${(analysis.weights.historical * 100).toFixed(0)}% e últimos 10 ${(analysis.weights.recent10 * 100).toFixed(0)}%. Cada componente é normalizado antes da combinação.</p>
    </details>
    <div class="methodology-note"><strong>Leitura correta:</strong> “forte”, “intermediária” e “fria” são posições relativas na classificação. Frequência histórica não aumenta a probabilidade individual de uma dezena no próximo sorteio.</div>`;
  tableWrap.parentElement.insertBefore(refinement, tableWrap);

  const tbody = table.querySelector<HTMLTableSectionElement>("tbody");
  const filter = refinement.querySelector<HTMLSelectElement>("[data-analysis-filter]");
  const sort = refinement.querySelector<HTMLSelectElement>("[data-analysis-sort]");
  if (!tbody || !filter || !sort) return;
  const tableBody = tbody;
  const filterSelect = filter;
  const sortSelect = sort;

  function renderRows(): void {
    const filterValue = filterSelect.value;
    const sortKey = sortSelect.value as AnalysisSortKey;
    const rows = [...analysis.numbers]
      .filter((row) => filterValue === "all" || row.tier === filterValue)
      .sort((a, b) => b[sortKey] - a[sortKey] || b.score - a.score || a.number - b.number);

    tableBody.innerHTML = rows.map((row) => `
      <tr class="${topByScore.has(row.number) ? "is-top-five" : ""}">
        <td><strong>${String(row.number).padStart(2, "0")}</strong></td>
        <td><span class="badge ${tierBadgeClass(row.tier)}">${tierLabel(row.tier)}</span></td>
        <td class="score-cell"><div class="score-line"><div class="score-track"><div class="score-fill" style="width:${Math.max(0, Math.min(100, row.score))}%"></div></div><span class="score-number">${row.score.toFixed(1)}</span></div></td>
        <td>${row.year.toFixed(0)}</td><td>${row.month.toFixed(0)}</td><td>${row.recent10.toFixed(0)}</td><td>${row.recent20.toFixed(0)}</td><td>${row.historical.toFixed(0)}</td>
      </tr>`).join("");
  }

  filterSelect.addEventListener("change", renderRows);
  sortSelect.addEventListener("change", renderRows);
  renderRows();
}

function strategyCopy(lottery: string, fixedCount: number): string {
  if (lottery === "mega-sena") return "Estratégia padrão · 3 fixas + 3 variáveis";
  if (lottery === "lotofacil") return `Estratégia padrão · ${fixedCount} fixas + ${15 - fixedCount} variáveis`;
  return "Estratégia padrão · 3 fixas + 4 variáveis + Mês da Sorte";
}

function decorateGeneratedResult(form: HTMLFormElement | null): void {
  const result = root?.querySelector<HTMLElement>("#generated-result");
  const grid = result?.querySelector<HTMLElement>(".game-grid");
  if (!grid) return;

  if (!result?.querySelector(".generation-summary")) {
    const fixed = Array.from(grid.querySelectorAll<HTMLElement>(".game-card:first-child .ball.is-fixed"))
      .map((node) => node.textContent?.trim() ?? "");
    const summary = document.createElement("div");
    summary.className = "generation-summary";
    summary.innerHTML = `
      <div class="generation-summary-copy"><strong>Núcleo compartilhado</strong><span>${fixed.length ? fixed.map(escapeHtml).join(" · ") : "sem núcleo fixo"}</span></div>
      <div class="generation-legend"><span><i class="legend-swatch fixed"></i>fixa</span><span><i class="legend-swatch"></i>variável</span></div>`;
    grid.parentElement?.insertBefore(summary, grid);
  }

  const submit = form?.querySelector<HTMLButtonElement>("button[type=submit]");
  if (submit && !submit.disabled && !submit.querySelector(".spinner") && submit.textContent?.trim() === "Gerar jogos") {
    submit.textContent = "Gerar novamente";
  }
}

function refineGenerate(): void {
  const form = root?.querySelector<HTMLFormElement>("#generate-form");
  if (!form) return;

  decorateGeneratedResult(form);
  if (form.dataset.uiRefined === "true") return;
  form.dataset.uiRefined = "true";
  form.classList.add("generate-form-refined");

  const lotteryField = Array.from(form.querySelectorAll<HTMLElement>(".field"))
    .find((field) => field.querySelector("label")?.textContent?.trim() === "Loteria");
  lotteryField?.remove();

  const target = form.querySelector<HTMLInputElement>("#target-contest");
  if (target) {
    const help = document.createElement("small");
    help.className = "field-help";
    const previous = Number(target.value) - 1;
    help.textContent = previous > 0 ? `Calculado a partir do último concurso #${previous}.` : "Preenchido automaticamente quando há histórico.";
    target.parentElement?.append(help);
  }

  const strategy = document.createElement("div");
  strategy.className = "generation-strategy";
  const grid = form.querySelector<HTMLElement>(".form-grid");
  if (!grid) return;
  grid.insertAdjacentElement("afterend", strategy);
  const fixedSelect = form.querySelector<HTMLSelectElement>("#fixed-count");

  function updateStrategy(): void {
    const fixedCount = Number(fixedSelect?.value || 8);
    strategy.innerHTML = `<strong>${escapeHtml(strategyCopy(currentLottery(), fixedCount))}</strong><span>As variantes experimentais ficam no Laboratório.</span>`;
  }

  fixedSelect?.addEventListener("change", updateStrategy);
  updateStrategy();
}

async function refineGames(): Promise<void> {
  const cards = Array.from(root?.querySelectorAll<HTMLElement>(".batch-card") ?? []);
  if (!cards.length) return;
  const lottery = currentLottery();
  const latest = await getLatest(lottery);
  if (!latest || currentMainView() !== "games" || currentLottery() !== lottery) return;
  const latestNumber = latest.number;

  const sectionCopy = root?.querySelector<HTMLElement>(".section-head p");
  if (sectionCopy && !sectionCopy.dataset.latestAdded) {
    sectionCopy.dataset.latestAdded = "true";
    sectionCopy.textContent += ` Último resultado na base: #${latestNumber}.`;
  }

  for (const card of cards) {
    if (!card.isConnected || card.dataset.pendingRefined === "true") continue;
    card.dataset.pendingRefined = "true";
    const input = card.querySelector<HTMLInputElement>("[data-contest-input]");
    const button = card.querySelector<HTMLButtonElement>("[data-check-batch]");
    const copy = card.querySelector<HTMLElement>(".batch-head-copy");
    if (!input || !button || !copy) continue;
    const contestInput = input;
    const checkButton = button;

    const badge = document.createElement("span");
    badge.className = "batch-pending";
    badge.textContent = "Resultado ainda não disponível";
    badge.hidden = true;
    copy.append(badge);

    function updatePending(): void {
      const value = Number(contestInput.value);
      const pending = Number.isInteger(value) && value > latestNumber;
      card.classList.toggle("is-pending", pending);
      badge.hidden = !pending;
    }

    contestInput.addEventListener("input", updatePending);
    checkButton.addEventListener("click", (event) => {
      const value = Number(contestInput.value);
      if (!Number.isInteger(value) || value <= latestNumber) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const resultTarget = root?.querySelector<HTMLElement>("#check-result");
      if (resultTarget) {
        resultTarget.innerHTML = `<div class="pending-state"><div><strong>Aguardando resultado do concurso #${value}</strong><p>O lote está salvo e pronto para conferência. Depois que o resultado entrar na base, volte aqui e clique em Conferir novamente.</p></div></div>`;
        resultTarget.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, { capture: true });
    updatePending();
  }
}

async function refine(): Promise<void> {
  const view = currentMainView();
  if (view === "analysis") await refineAnalysis();
  else if (view === "generate") refineGenerate();
  else if (view === "games") await refineGames();
}

function scheduleRefine(): void {
  if (scheduled) return;
  scheduled = true;
  setTimeout(async () => {
    scheduled = false;
    await refine();
  }, 0);
}

onViewRendered(scheduleRefine);
lotterySelect?.addEventListener("change", () => {
  latestCache.clear();
});
document.querySelector("#refresh-view")?.addEventListener("click", () => {
  latestCache.delete(currentLottery());
});
window.addEventListener("loto-lab:data-synced", () => {
  latestCache.clear();
  scheduleRefine();
});
scheduleRefine();
