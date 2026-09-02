import { api } from "../core/api.js";
import { escapeHtml } from "../shared/escaping.js";
import { formatDateTime, formatPercent } from "../shared/formatters.js";

type LotteryId = "mega-sena" | "lotofacil" | "dia-de-sorte";
type AiInsightFocus = "overview" | "analysis" | "strategy" | "real-performance";

type AiInsightContent = {
  headline: string;
  summary: string;
  observations: string[];
  risks: string[];
  nextTests: string[];
};

type AiEvidenceContext = {
  latestContest?: {
    number: number;
    date: string;
  };
  latestBacktest?: {
    id: number;
  };
  strategyLab?: {
    rankingBasis: "roi" | "prizeRate";
    variants: unknown[];
  };
  realPerformance?: {
    checkedBets?: number;
    roi?: number;
  };
};

type AiInsightRecord = {
  id: number;
  focus: AiInsightFocus;
  model: string;
  evidence: AiEvidenceContext;
  insight: AiInsightContent;
  createdAt: string;
  reused?: boolean;
  disclaimer?: string;
};

type AiStatus = {
  provider: string;
  configured: boolean;
  model: string;
  disclaimer: string;
};

type AiHistoryResponse = {
  items: AiInsightRecord[];
  disclaimer: string;
};

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required AI element: ${selector}`);
  return element;
}

function requirePayload<T>(value: T | null): T {
  if (value === null) throw new Error("Resposta vazia da API.");
  return value;
}

const lotterySelect = requiredElement<HTMLSelectElement>("#ai-lottery");
const focusSelect = requiredElement<HTMLSelectElement>("#ai-focus");
const forceInput = document.querySelector<HTMLInputElement>("#ai-force");
const form = requiredElement<HTMLFormElement>("#ai-form");
const runButton = requiredElement<HTMLButtonElement>("#ai-run");
const providerStatus = requiredElement<HTMLElement>("#ai-provider-status");
const apiStatus = requiredElement<HTMLElement>("#ai-api-status");
const message = requiredElement<HTMLElement>("#ai-message");
const resultRoot = requiredElement<HTMLElement>("#ai-result");
const historyRoot = requiredElement<HTMLElement>("#ai-history");

const LOTTERY_LABELS: Record<LotteryId, string> = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
};
const FOCUS_LABELS: Record<AiInsightFocus, string> = {
  overview: "Visão geral",
  analysis: "Análise",
  strategy: "Estratégias",
  "real-performance": "Desempenho real",
};

let status: AiStatus | undefined;
let historyItems: AiInsightRecord[] = [];
let historyLoadToken = 0;
let insightRequestToken = 0;

function list(items: string[] | undefined): string {
  if (!items?.length) return "<li>Sem observações adicionais.</li>";
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderInsight(record: AiInsightRecord, disclaimer: string | undefined): void {
  const evidence = record.evidence || {};
  const real = evidence.realPerformance || {};
  const lab = evidence.strategyLab;
  const backtest = evidence.latestBacktest;
  const latest = evidence.latestContest;
  resultRoot.hidden = false;
  resultRoot.innerHTML = `
    <article class="panel ai-result-card">
      <div class="ai-result-head">
        <div><h2>${escapeHtml(record.insight.headline)}</h2><p>${escapeHtml(record.insight.summary)}</p></div>
        <div class="ai-result-meta">${escapeHtml(FOCUS_LABELS[record.focus] || record.focus)}<br />${escapeHtml(record.model)} · ${escapeHtml(formatDateTime(record.createdAt))}</div>
      </div>
      <div class="ai-columns">
        <section class="ai-section"><h3>Leituras principais</h3><ul>${list(record.insight.observations)}</ul></section>
        <section class="ai-section"><h3>Riscos e limites</h3><ul>${list(record.insight.risks)}</ul></section>
        <section class="ai-section"><h3>Próximos testes</h3><ul>${list(record.insight.nextTests)}</ul></section>
      </div>
      <div class="ai-evidence">
        <div class="ai-evidence-item"><span>Referência</span><strong>${latest ? `#${latest.number} · ${escapeHtml(latest.date)}` : "Sem concurso"}</strong></div>
        <div class="ai-evidence-item"><span>Teste histórico</span><strong>${backtest ? `#${backtest.id}` : "Não disponível"}</strong></div>
        <div class="ai-evidence-item"><span>Laboratório</span><strong>${lab ? `${lab.variants.length} variantes · ${lab.rankingBasis === "roi" ? "ROI" : "premiação"}` : "Não disponível"}</strong></div>
        <div class="ai-evidence-item"><span>Resultado real</span><strong>${real.checkedBets || 0} conferida(s) · ROI ${formatPercent(real.roi)}</strong></div>
      </div>
      <div class="ai-disclaimer">${escapeHtml(disclaimer || "")}</div>
    </article>`;
  resultRoot.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setApiStatusCopy(copy: string): void {
  const target = apiStatus.querySelector<HTMLElement>("span:last-child");
  if (target) target.textContent = copy;
}

async function loadStatus(): Promise<void> {
  try {
    status = requirePayload(await api<AiStatus>("/ai/status"));
    apiStatus.className = "status-row is-ok";
    setApiStatusCopy(status.configured ? "IA configurada" : "IA não configurada");
    if (status.configured) {
      providerStatus.className = "ai-provider-status is-ready";
      providerStatus.innerHTML = `<strong>OpenAI pronta</strong><br />Modelo: ${escapeHtml(status.model)}`;
      runButton.disabled = false;
    } else {
      providerStatus.className = "ai-provider-status is-offline";
      providerStatus.innerHTML =
        "<strong>OpenAI não configurada</strong><br />Defina OPENAI_API_KEY no arquivo .env.";
      runButton.disabled = true;
    }
  } catch {
    apiStatus.className = "status-row is-error";
    setApiStatusCopy("API indisponível");
    providerStatus.className = "ai-provider-status is-offline";
    providerStatus.textContent = "Não foi possível verificar a configuração da IA.";
    runButton.disabled = true;
  }
}

function renderHistory(): void {
  if (!historyItems.length) {
    historyRoot.innerHTML =
      '<div class="ai-empty">Nenhuma interpretação salva para esta loteria.</div>';
    return;
  }
  historyRoot.innerHTML = historyItems
    .map(
      (item) => `
    <button class="ai-history-row" type="button" data-insight-id="${item.id}">
      <div><strong>${escapeHtml(item.insight.headline)}</strong><p>${escapeHtml(FOCUS_LABELS[item.focus] || item.focus)} · ${escapeHtml(item.insight.summary)}</p></div>
      <div class="ai-history-meta">#${item.id}<br />${escapeHtml(formatDateTime(item.createdAt))}</div>
    </button>`,
    )
    .join("");
  historyRoot.querySelectorAll<HTMLButtonElement>("[data-insight-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = historyItems.find((entry) => entry.id === Number(button.dataset.insightId));
      if (item) renderInsight(item, status?.disclaimer);
    });
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erro desconhecido";
}

async function loadHistory(): Promise<void> {
  const requestedLottery = lotterySelect.value;
  const token = ++historyLoadToken;
  historyRoot.innerHTML =
    '<div class="loading-state"><span class="spinner"></span><span>Carregando histórico...</span></div>';
  try {
    const data = requirePayload(
      await api<AiHistoryResponse>(`/ai/insights/${requestedLottery}?limit=10`),
    );
    if (token !== historyLoadToken || lotterySelect.value !== requestedLottery) return;
    historyItems = data.items || [];
    renderHistory();
  } catch (error) {
    if (token !== historyLoadToken || lotterySelect.value !== requestedLottery) return;
    historyItems = [];
    historyRoot.innerHTML = `<div class="ai-empty">${escapeHtml(errorMessage(error))}</div>`;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!status?.configured) return;
  const requestedLottery = lotterySelect.value;
  const token = ++insightRequestToken;
  runButton.disabled = true;
  runButton.textContent = "Interpretando...";
  message.className = "panel ai-message is-loading";
  message.innerHTML =
    '<div class="loading-state"><span class="spinner"></span><span>Interpretando evidências calculadas...</span></div>';
  try {
    const record = requirePayload(
      await api<AiInsightRecord>("/ai/insights", {
        method: "POST",
        body: JSON.stringify({
          lottery: requestedLottery,
          focus: focusSelect.value,
          force: Boolean(forceInput?.checked),
        }),
      }),
    );
    if (token !== insightRequestToken || lotterySelect.value !== requestedLottery) return;
    renderInsight(record, record.disclaimer);
    message.className = "panel ai-message";
    message.innerHTML = record.reused
      ? `<strong>Interpretação reutilizada</strong><p>A evidência não mudou; o registro #${record.id} foi reutilizado sem nova chamada ao provedor.</p>`
      : `<strong>Interpretação salva</strong><p>Registro #${record.id} criado sem alterar qualquer cálculo ou jogo.</p>`;
    if (forceInput) forceInput.checked = false;
    await loadHistory();
  } catch (error) {
    if (token !== insightRequestToken || lotterySelect.value !== requestedLottery) return;
    message.className = "panel ai-message";
    message.innerHTML = `<strong>Falha na interpretação</strong><p>${escapeHtml(errorMessage(error))}</p>`;
  } finally {
    if (token === insightRequestToken) {
      runButton.disabled = !status?.configured;
      runButton.textContent = "Gerar interpretação";
    }
  }
});

lotterySelect.addEventListener("change", async () => {
  localStorage.setItem("loto-lab:lottery", lotterySelect.value);
  insightRequestToken += 1;
  runButton.disabled = !status?.configured;
  runButton.textContent = "Gerar interpretação";
  message.className = "panel ai-message";
  message.innerHTML =
    "<strong>Pronto para interpretar</strong><p>Escolha o foco. Nenhuma interpretação altera a metodologia ou os jogos gerados.</p>";
  resultRoot.hidden = true;
  await loadHistory();
});

const storedLottery = localStorage.getItem("loto-lab:lottery");
if (storedLottery && storedLottery in LOTTERY_LABELS) lotterySelect.value = storedLottery;
await loadStatus();
await loadHistory();
