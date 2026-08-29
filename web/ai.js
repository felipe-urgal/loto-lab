import { api, escapeHtml, formatDateTime, formatPercent } from "./runtime.js";

const lotterySelect = document.querySelector("#ai-lottery");
const focusSelect = document.querySelector("#ai-focus");
const forceInput = document.querySelector("#ai-force");
const form = document.querySelector("#ai-form");
const runButton = document.querySelector("#ai-run");
const providerStatus = document.querySelector("#ai-provider-status");
const apiStatus = document.querySelector("#ai-api-status");
const message = document.querySelector("#ai-message");
const resultRoot = document.querySelector("#ai-result");
const historyRoot = document.querySelector("#ai-history");

const LOTTERY_LABELS = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
};
const FOCUS_LABELS = {
  overview: "Visão geral",
  analysis: "Análise",
  strategy: "Estratégias",
  "real-performance": "Desempenho real",
};
let status = null;
let historyItems = [];
let historyLoadToken = 0;
let insightRequestToken = 0;

function list(items) {
  if (!items?.length) return "<li>Sem observações adicionais.</li>";
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderInsight(record, disclaimer) {
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

async function loadStatus() {
  try {
    status = await api("/ai/status");
    apiStatus.className = "status-row is-ok";
    apiStatus.querySelector("span:last-child").textContent = status.configured ? "IA configurada" : "IA não configurada";
    if (status.configured) {
      providerStatus.className = "ai-provider-status is-ready";
      providerStatus.innerHTML = `<strong>OpenAI pronta</strong><br />Modelo: ${escapeHtml(status.model)}`;
      runButton.disabled = false;
    } else {
      providerStatus.className = "ai-provider-status is-offline";
      providerStatus.innerHTML = `<strong>OpenAI não configurada</strong><br />Defina OPENAI_API_KEY no arquivo .env.`;
      runButton.disabled = true;
    }
  } catch {
    apiStatus.className = "status-row is-error";
    apiStatus.querySelector("span:last-child").textContent = "API indisponível";
    providerStatus.className = "ai-provider-status is-offline";
    providerStatus.textContent = "Não foi possível verificar a configuração da IA.";
    runButton.disabled = true;
  }
}

function renderHistory() {
  if (!historyItems.length) {
    historyRoot.innerHTML = '<div class="ai-empty">Nenhuma interpretação salva para esta loteria.</div>';
    return;
  }
  historyRoot.innerHTML = historyItems.map((item) => `
    <button class="ai-history-row" type="button" data-insight-id="${item.id}">
      <div><strong>${escapeHtml(item.insight.headline)}</strong><p>${escapeHtml(FOCUS_LABELS[item.focus] || item.focus)} · ${escapeHtml(item.insight.summary)}</p></div>
      <div class="ai-history-meta">#${item.id}<br />${escapeHtml(formatDateTime(item.createdAt))}</div>
    </button>`).join("");
  historyRoot.querySelectorAll("[data-insight-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = historyItems.find((entry) => entry.id === Number(button.dataset.insightId));
      if (item) renderInsight(item, status?.disclaimer);
    });
  });
}

async function loadHistory() {
  const requestedLottery = lotterySelect.value;
  const token = ++historyLoadToken;
  historyRoot.innerHTML = '<div class="loading-state"><span class="spinner"></span><span>Carregando histórico...</span></div>';
  try {
    const data = await api(`/ai/insights/${requestedLottery}?limit=10`);
    if (token !== historyLoadToken || lotterySelect.value !== requestedLottery) return;
    historyItems = data.items || [];
    renderHistory();
  } catch (error) {
    if (token !== historyLoadToken || lotterySelect.value !== requestedLottery) return;
    historyItems = [];
    historyRoot.innerHTML = `<div class="ai-empty">${escapeHtml(error.message)}</div>`;
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
  message.innerHTML = '<div class="loading-state"><span class="spinner"></span><span>Interpretando evidências calculadas...</span></div>';
  try {
    const record = await api("/ai/insights", {
      method: "POST",
      body: JSON.stringify({
        lottery: requestedLottery,
        focus: focusSelect.value,
        force: Boolean(forceInput?.checked),
      }),
    });
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
    message.innerHTML = `<strong>Falha na interpretação</strong><p>${escapeHtml(error.message)}</p>`;
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
  message.innerHTML = "<strong>Pronto para interpretar</strong><p>Escolha o foco. Nenhuma interpretação altera a metodologia ou os jogos gerados.</p>";
  resultRoot.hidden = true;
  await loadHistory();
});

const storedLottery = localStorage.getItem("loto-lab:lottery");
if (storedLottery && LOTTERY_LABELS[storedLottery]) lotterySelect.value = storedLottery;
await loadStatus();
await loadHistory();
