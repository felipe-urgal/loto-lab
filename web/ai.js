const API = "/api/v1";
const lotterySelect = document.querySelector("#ai-lottery");
const focusSelect = document.querySelector("#ai-focus");
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

function formatCurrency(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : options.headers,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Erro HTTP ${response.status}`);
    error.code = payload?.error?.code || "HTTP_ERROR";
    throw error;
  }
  return payload;
}

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
        <div class="ai-evidence-item"><span>Backtest</span><strong>${backtest ? `#${backtest.id}` : "Não disponível"}</strong></div>
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
  historyRoot.innerHTML = '<div class="loading-state"><span class="spinner"></span><span>Carregando histórico...</span></div>';
  try {
    const data = await api(`/ai/insights/${lotterySelect.value}?limit=10`);
    historyItems = data.items || [];
    renderHistory();
  } catch (error) {
    historyItems = [];
    historyRoot.innerHTML = `<div class="ai-empty">${escapeHtml(error.message)}</div>`;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!status?.configured) return;
  runButton.disabled = true;
  runButton.textContent = "Interpretando...";
  message.className = "panel ai-message is-loading";
  message.innerHTML = '<div class="loading-state"><span class="spinner"></span><span>Interpretando evidências calculadas...</span></div>';
  try {
    const record = await api("/ai/insights", {
      method: "POST",
      body: JSON.stringify({ lottery: lotterySelect.value, focus: focusSelect.value }),
    });
    renderInsight(record, record.disclaimer);
    message.className = "panel ai-message";
    message.innerHTML = `<strong>Interpretação salva</strong><p>Snapshot #${record.id} criado sem alterar qualquer cálculo ou jogo.</p>`;
    await loadHistory();
  } catch (error) {
    message.className = "panel ai-message";
    message.innerHTML = `<strong>Falha na interpretação</strong><p>${escapeHtml(error.message)}</p>`;
  } finally {
    runButton.disabled = !status?.configured;
    runButton.textContent = "Gerar interpretação";
  }
});

lotterySelect.addEventListener("change", async () => {
  localStorage.setItem("loto-lab:lottery", lotterySelect.value);
  resultRoot.hidden = true;
  await loadHistory();
});

const storedLottery = localStorage.getItem("loto-lab:lottery");
if (storedLottery && LOTTERY_LABELS[storedLottery]) lotterySelect.value = storedLottery;
await loadStatus();
await loadHistory();
