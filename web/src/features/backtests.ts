import { ApiError, api } from "../core/api.js";
import { currentMainView, onMainViewChanged, onViewRendered } from "../core/viewLifecycle.js";
import { escapeHtml } from "../shared/escaping.js";
import { formatCurrency, formatDateTime, formatPercent } from "../shared/formatters.js";
import { toast } from "../shared/toast.js";

type LotteryId = "mega-sena" | "lotofacil" | "dia-de-sorte";

type BacktestSummary = {
  roi?: number | null;
  financialCoverage?: number | null;
  financialCost?: number | null;
  totalPrizeValue?: number | null;
  totalGames?: number | null;
};

type BacktestRun = {
  id?: number | string | null;
  roundCount: number;
  createdAt?: string | null;
  summary?: BacktestSummary | null;
};

type BacktestListResponse = {
  items?: BacktestRun[];
};

type ContestSummary = {
  number: number;
};

type BacktestRunRequest = {
  lottery: LotteryId;
  gameCount: number;
  warmupContests: number;
  persist: boolean;
  startContest?: number;
  endContest?: number;
  fixedCount?: number;
};

const DEFAULT_GAMES: Record<LotteryId, number> = {
  "mega-sena": 2,
  lotofacil: 4,
  "dia-de-sorte": 4,
};

const LOTTERY_LABELS: Record<LotteryId, string> = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
};

const content = document.querySelector<HTMLElement>("#content");
const lotterySelect = document.querySelector<HTMLSelectElement>("#lottery-select");
let activeController: AbortController | null = null;
let renderSequence = 0;

function currentLottery(): LotteryId {
  const value = lotterySelect?.value;
  return value && value in DEFAULT_GAMES ? value as LotteryId : "mega-sena";
}

function errorDetails(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) return { code: error.code, message: error.message };
  if (error instanceof Error) return { code: "ERROR", message: error.message };
  return { code: "ERROR", message: "Erro inesperado." };
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isCurrentRender(sequence: number, lottery: LotteryId, signal: AbortSignal): boolean {
  return !signal.aborted
    && sequence === renderSequence
    && currentMainView() === "backtests"
    && currentLottery() === lottery;
}

async function optionalApi<T>(path: string, signal: AbortSignal): Promise<T | null> {
  try {
    return await api<T>(path, { signal });
  } catch (error) {
    if (signal.aborted || isAbort(error)) throw error;
    return null;
  }
}

function playIcon(): string {
  return '<span class="button-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m8 5 11 7-11 7V5Z"/></svg></span>';
}

function metric(label: string, value: string, detail: string, tone: "" | "positive" | "negative" = ""): string {
  return `<article class="panel metric-card"><span class="metric-label">${escapeHtml(label)}</span><strong class="metric-value ${tone}">${escapeHtml(value)}</strong><span class="metric-detail">${escapeHtml(detail)}</span></article>`;
}

function emptyState(title: string, copy: string): string {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(copy)}</p></div>`;
}

function backtestRow(run: BacktestRun): string {
  const summary = run.summary ?? {};
  const roi = summary.roi;
  const id = run.id ?? "—";
  return `<div class="list-row"><div class="list-row-main"><strong>Teste histórico #${escapeHtml(id)}</strong><p>${escapeHtml(run.roundCount)} concurso(s) · ${escapeHtml(summary.totalGames ?? "—")} jogo(s) · ${escapeHtml(formatDateTime(run.createdAt))}</p></div><div class="list-row-value"><strong class="${typeof roi === "number" && roi >= 0 ? "positive" : ""}">${escapeHtml(formatPercent(roi))}</strong><small>ROI · cobertura ${escapeHtml(formatPercent(summary.financialCoverage))}</small></div></div>`;
}

function defaultStartContest(endContest: number | undefined): number | undefined {
  if (!Number.isInteger(endContest) || !endContest || endContest < 1) return undefined;
  return Math.max(1, endContest - 99);
}

function renderWorkspace(lottery: LotteryId, runs: BacktestRun[], latest: ContestSummary | null): void {
  if (!content) return;
  const endContest = Number.isInteger(latest?.number) ? latest?.number : undefined;
  const startContest = defaultStartContest(endContest);
  const defaultNote = startContest
    ? '<div class="backtest-default-note">Padrão: últimos 100 concursos. Limpe este campo para testar todo o histórico disponível.</div>'
    : "";

  content.innerHTML = `<div class="stack">
    <section><div class="section-head"><div><h2>Executar teste histórico</h2><p>Cada concurso é simulado usando somente o histórico disponível antes dele.</p></div></div><form class="panel form-panel" id="backtest-form" data-ui-refined="true"><div class="form-grid">
      <div class="field"><label for="bt-games">Jogos por concurso</label><input id="bt-games" name="gameCount" type="number" min="1" max="10" value="${DEFAULT_GAMES[lottery]}" /></div>
      <div class="field"><label for="bt-warmup">Aquecimento</label><input id="bt-warmup" name="warmupContests" type="number" min="1" max="500" value="20" /></div>
      <div class="field" ${lottery !== "lotofacil" ? 'style="display:none"' : ""}><label for="bt-fixed">Núcleo fixo</label><select id="bt-fixed" name="fixedCount"><option value="8">8 dezenas</option><option value="9">9 dezenas</option><option value="10">10 dezenas</option></select></div>
      <div class="field"><label for="bt-start">Concurso inicial</label><input id="bt-start" name="startContest" type="number" min="1" value="${startContest ?? ""}" placeholder="Opcional" />${defaultNote}</div>
      <div class="field"><label for="bt-end">Concurso final</label><input id="bt-end" name="endContest" type="number" min="1" value="${endContest ?? ""}" placeholder="Opcional" /></div>
    </div><div class="form-actions"><div><label class="checkbox"><input type="checkbox" name="persist" checked /> Salvar execução</label><div class="form-note">Cada execução HTTP é limitada a 500 concursos para proteger a aplicação.</div></div><button class="button primary" type="submit">${playIcon()}Executar teste histórico</button></div></form></section>
    <section id="backtest-result"></section>
    <section><div class="section-head"><div><h2>Execuções recentes</h2><p>Histórico persistido para ${escapeHtml(LOTTERY_LABELS[lottery])}.</p></div></div><div class="panel list">${runs.length ? runs.map(backtestRow).join("") : emptyState("Nenhum teste histórico salvo", "Execute a primeira simulação para criar seu histórico.")}</div></section>
  </div>`;

  content.querySelector<HTMLFormElement>("#backtest-form")?.addEventListener("submit", (event) => {
    void handleBacktest(event, lottery);
  });
}

async function handleBacktest(event: SubmitEvent, lottery: LotteryId): Promise<void> {
  event.preventDefault();
  const form = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : null;
  if (!form || currentMainView() !== "backtests" || currentLottery() !== lottery) return;

  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const output = content?.querySelector<HTMLElement>("#backtest-result");
  if (!button || !output) return;

  const data = new FormData(form);
  const body: BacktestRunRequest = {
    lottery,
    gameCount: Number(data.get("gameCount")),
    warmupContests: Number(data.get("warmupContests")),
    persist: data.get("persist") === "on",
  };
  const startContest = data.get("startContest");
  const endContest = data.get("endContest");
  if (startContest) body.startContest = Number(startContest);
  if (endContest) body.endContest = Number(endContest);
  if (lottery === "lotofacil") body.fixedCount = Number(data.get("fixedCount"));

  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  button.disabled = true;
  button.textContent = "Executando...";
  output.innerHTML = '<div class="loading-state" style="min-height:120px"><span class="spinner"></span><span>Simulando concursos históricos...</span></div>';

  try {
    const result = await api<BacktestRun>("/backtests/run", {
      method: "POST",
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!result || controller.signal.aborted || !output.isConnected || currentMainView() !== "backtests" || currentLottery() !== lottery) return;

    const summary = result.summary ?? {};
    const roi = summary.roi;
    const resultId = result.id ? ` · #${escapeHtml(result.id)}` : "";
    output.innerHTML = `<div class="section-head"><div><h2>Resultado${resultId}</h2><p>${escapeHtml(result.roundCount)} concurso(s) simulados.</p></div></div><div class="grid cols-4">${metric("ROI", formatPercent(roi), "resultado sobre o custo coberto", typeof roi === "number" ? (roi >= 0 ? "positive" : "negative") : "")}${metric("Custo", formatCurrency(summary.financialCost), "custo com rateio disponível")}${metric("Prêmios", formatCurrency(summary.totalPrizeValue), "retorno bruto conhecido")}${metric("Cobertura", formatPercent(summary.financialCoverage), `${summary.totalGames ?? "—"} jogos simulados`)}</div>`;
    toast("Teste histórico concluído.");
  } catch (error) {
    if (controller.signal.aborted || isAbort(error) || !output.isConnected) return;
    const details = errorDetails(error);
    output.innerHTML = `<div class="error-state" style="min-height:140px"><span class="error-code">${escapeHtml(details.code)}</span><strong>Falha no teste histórico</strong><p>${escapeHtml(details.message)}</p></div>`;
    toast(details.message, "error");
  } finally {
    if (activeController === controller) activeController = null;
    if (button.isConnected) {
      button.disabled = false;
      button.innerHTML = `${playIcon()}Executar teste histórico`;
    }
  }
}

async function renderBacktests(): Promise<void> {
  if (!content || currentMainView() !== "backtests") return;
  const lottery = currentLottery();
  const sequence = ++renderSequence;

  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;

  try {
    const [catalog, latest] = await Promise.all([
      api<BacktestListResponse>(`/backtests/${lottery}?limit=20`, { signal: controller.signal }),
      optionalApi<ContestSummary>(`/contests/${lottery}/latest`, controller.signal),
    ]);
    if (!isCurrentRender(sequence, lottery, controller.signal)) return;
    renderWorkspace(lottery, catalog?.items ?? [], latest);
  } catch (error) {
    if (controller.signal.aborted || isAbort(error) || !isCurrentRender(sequence, lottery, controller.signal)) return;
    const details = errorDetails(error);
    content.innerHTML = `<div class="error-state"><span class="error-code">${escapeHtml(details.code)}</span><strong>Não foi possível carregar Testes históricos</strong><p>${escapeHtml(details.message)}</p></div>`;
  } finally {
    if (activeController === controller) activeController = null;
  }
}

onViewRendered((detail) => {
  if ((detail.view ?? currentMainView()) !== "backtests") return;
  void renderBacktests();
});

onMainViewChanged((view) => {
  if (view !== "backtests") {
    renderSequence += 1;
    activeController?.abort();
    activeController = null;
  }
});
