import { api } from "./src/core/api.js";
import { isLotteryId, isMainView, mainViewFromHash } from "./src/core/mainContext.js";
import { createMainRenderState } from "./src/core/mainRenderState.js";
import { escapeHtml } from "./src/shared/escaping.js";
import { toast } from "./src/shared/toast.js";

const LOTTERIES = {
  "mega-sena": { label: "Mega-Sena", defaultGames: 2, drawSize: 6 },
  lotofacil: { label: "Lotofácil", defaultGames: 4, drawSize: 15 },
  "dia-de-sorte": { label: "Dia de Sorte", defaultGames: 4, drawSize: 7 },
  quina: { label: "Quina", defaultGames: 4, drawSize: 5 },
  lotomania: { label: "Lotomania", defaultGames: 2, drawSize: 20 },
  "dupla-sena": { label: "Dupla Sena", defaultGames: 4, drawSize: 6 },
};

const VIEWS = {
  dashboard: ["Painel", "Resultados, jogos e pendências em um só lugar."],
  analysis: ["Análises", "Frequências, pontuação e classificação por horizonte."],
  generate: ["Gerar jogos", "Monte lotes seguindo as regras da metodologia."],
};

const ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg>',
  analysis: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19V3"/><path d="M2 19h20"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z"/><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z"/></svg>',
  ticket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3a3 3 0 0 0 0 6v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3a3 3 0 0 0 0-6V6Z"/><path d="M12 7v2M12 11v2M12 15v2"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.4-2.5L20 11"/><path d="M4 13l2.5 4.5A7 7 0 0 0 18 15"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m9 18 6-6-6-6"/></svg>',
};

const state = createMainRenderState(location.hash, localStorage.getItem("loto-lab:lottery"));

const content = document.querySelector("#content");
const title = document.querySelector("#view-title");
const subtitle = document.querySelector("#view-subtitle");
const lotterySelect = document.querySelector("#lottery-select");
const refreshButton = document.querySelector("#refresh-view");
const apiStatus = document.querySelector("#api-status");

function installIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((node) => {
    const icon = ICONS[node.dataset.icon];
    if (icon) node.innerHTML = icon;
  });
}

async function safeApi(path, options = {}) {
  try { return await api(path, options); } catch (error) {
    if (error?.name === "AbortError") throw error;
    return null;
  }
}

function number(value) { return String(value).padStart(2, "0"); }
function lotteryLabel(id) { return LOTTERIES[id]?.label || id; }

function balls(numbers, options = {}) {
  const fixed = new Set(options.fixed || []);
  const tier = options.tier || "";
  return (numbers || []).map((value) =>
    `<span class="ball ${fixed.has(value) ? "is-fixed" : ""} ${tier ? `is-${tier}` : ""}">${number(value)}</span>`,
  ).join("");
}

function loading() {
  content.innerHTML = '<div class="loading-state"><span class="spinner"></span><span>Carregando dados...</span></div>';
}

function emptyState(titleText, copy, action = "") {
  return `<div class="empty-state"><strong>${escapeHtml(titleText)}</strong><p>${escapeHtml(copy)}</p>${action}</div>`;
}

function errorState(error) {
  content.innerHTML = `<div class="error-state"><span class="error-code">${escapeHtml(error.code || "ERROR")}</span><strong>Não foi possível carregar esta tela</strong><p>${escapeHtml(error.message)}</p><button class="button" type="button" data-retry> tentar novamente </button></div>`;
  content.querySelector("[data-retry]")?.addEventListener("click", renderCurrentView);
}

function isCurrentRender(render) {
  return state.isCurrentRender(render);
}

async function checkHealth() {
  try {
    const response = await fetch("/health/ready");
    if (!response.ok) throw new Error();
    apiStatus.className = "status-row is-ok";
    apiStatus.querySelector("span:last-child").textContent = "API e banco online";
  } catch {
    apiStatus.className = "status-row is-error";
    apiStatus.querySelector("span:last-child").textContent = "API indisponível";
  }
}

function setView(view) {
  if (!isMainView(view)) view = "dashboard";
  state.view = view;
  location.hash = view;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
  [title.textContent, subtitle.textContent] = VIEWS[view];
  renderCurrentView();
}

function setLottery(lottery) {
  if (!isLotteryId(lottery)) return;
  state.lottery = lottery;
  localStorage.setItem("loto-lab:lottery", lottery);
  lotterySelect.value = lottery;
  renderCurrentView();
}

async function renderDashboard() {
  content.innerHTML = '<div class="loading-state" data-feature-owned="dashboard"><span class="spinner"></span><span>Carregando Painel...</span></div>';
}

async function renderAnalysis() {
  content.innerHTML = '<div class="loading-state" data-feature-owned="analysis"><span class="spinner"></span><span>Carregando Análises...</span></div>';
}

async function renderGenerate(render) {
  const latest = await safeApi(`/contests/${render.lottery}/latest`, { signal: render.signal });
  if (!isCurrentRender(render)) return;
  const config = LOTTERIES[render.lottery];
  if (!config) {
    content.innerHTML = '<div class="loading-state" data-feature-owned="generate"><span class="spinner"></span><span>Carregando Gerador...</span></div>';
    return;
  }
  content.innerHTML = `<div class="stack">
    <section><div class="section-head"><div><h2>Configurar lote</h2><p>O algoritmo usa somente dados anteriores ao concurso alvo.</p></div></div>
      <form class="panel form-panel" id="generate-form">
        <div class="form-grid">
          <div class="field"><label>Loteria</label><input value="${escapeHtml(config.label)}" disabled /></div>
          <div class="field"><label for="game-count">Quantidade de jogos</label><input id="game-count" name="gameCount" type="number" min="1" max="10" value="${config.defaultGames}" /></div>
          <div class="field" id="fixed-field" ${render.lottery !== "lotofacil" ? 'style="display:none"' : ""}><label for="fixed-count">Núcleo fixo</label><select id="fixed-count" name="fixedCount"><option value="8">8 dezenas</option><option value="9">9 dezenas</option><option value="10">10 dezenas</option></select></div>
          <div class="field"><label for="target-contest">Concurso alvo</label><input id="target-contest" name="targetContestNumber" type="number" min="1" value="${latest ? latest.number + 1 : ""}" placeholder="Automático" /></div>
        </div>
        <div class="form-actions"><div><label class="checkbox"><input type="checkbox" name="persist" checked /> Salvar lote no Painel</label><div class="form-note">As dezenas são calculadas pelo core. O frontend apenas envia a configuração.</div></div><button class="button primary" type="submit"><span class="button-icon" data-icon="spark"></span>Gerar jogos</button></div>
      </form>
    </section>
    <section id="generated-result">${emptyState("Pronto para gerar", "Configure a quantidade e execute o motor. O núcleo compartilhado será destacado em verde.")}</section>
  </div>`;
  installIcons(content);
  content.querySelector("#generate-form").addEventListener("submit", handleGenerate);
}

async function handleGenerate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const result = content.querySelector("#generated-result");
  const data = new FormData(form);
  const body = {
    lottery: state.lottery,
    gameCount: Number(data.get("gameCount")),
    persist: data.get("persist") === "on",
  };
  const target = data.get("targetContestNumber");
  if (target) body.targetContestNumber = Number(target);
  if (state.lottery === "lotofacil") body.fixedCount = Number(data.get("fixedCount"));

  button.disabled = true;
  button.innerHTML = '<span class="spinner" style="width:14px;height:14px"></span>Gerando...';
  try {
    const generated = await api("/games/generate", { method: "POST", body: JSON.stringify(body) });
    result.innerHTML = `<div class="section-head"><div><h2>Lote gerado</h2><p>${generated.batchId ? `Lote #${generated.batchId} salvo` : "Prévia não persistida"} · alvo ${generated.targetContestNumber ? `#${generated.targetContestNumber}` : "automático"}</p></div>${generated.batchId ? '<button class="link-button" data-open-dashboard>Ver no Painel</button>' : ""}</div><div class="game-grid">${generated.games.map((game, index) => gameCard(game, index)).join("")}</div>`;
    result.querySelector("[data-open-dashboard]")?.addEventListener("click", () => setView("dashboard"));
    toast(`${generated.games.length} jogo(s) gerado(s) com sucesso.`);
  } catch (error) {
    result.innerHTML = `<div class="error-state"><span class="error-code">${escapeHtml(error.code)}</span><strong>Falha ao gerar jogos</strong><p>${escapeHtml(error.message)}</p></div>`;
    toast(error.message, "error");
  } finally {
    button.disabled = false;
    button.innerHTML = '<span class="button-icon" data-icon="spark"></span>Gerar jogos';
    installIcons(button);
  }
}

function gameCard(game, index) {
  const repeated = game.metadata?.repeatedFromLastContest?.length ?? 0;
  return `<article class="panel game-card"><div class="game-head"><strong>Jogo ${index + 1}</strong><span>${game.fixedNumbers.length} fixas · ${game.variableNumbers.length} variáveis</span></div><div class="draw-numbers">${balls(game.numbers, { fixed: game.fixedNumbers })}</div><div class="game-meta"><span>Pares <strong>${game.metadata?.even ?? "—"}</strong></span><span>Ímpares <strong>${game.metadata?.odd ?? "—"}</strong></span><span>Soma <strong>${game.metadata?.sum ?? "—"}</strong></span><span>Repetidas <strong>${repeated}</strong></span></div>${game.luckyMonth ? `<div class="game-month">Mês da Sorte · ${escapeHtml(game.luckyMonth)}</div>` : ""}</article>`;
}

async function renderCurrentView() {
  const render = state.beginRender();

  loading();
  refreshButton.classList.add("is-spinning");
  try {
    if (render.view === "dashboard") await renderDashboard();
    else if (render.view === "analysis") await renderAnalysis();
    else if (render.view === "generate") await renderGenerate(render);
  } catch (error) {
    if (error?.name !== "AbortError" && isCurrentRender(render)) errorState(error);
  } finally {
    if (state.finishRender(render)) {
      refreshButton.classList.remove("is-spinning");
    }
  }
}

document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));
lotterySelect.addEventListener("change", (event) => setLottery(event.target.value));
refreshButton.addEventListener("click", renderCurrentView);
window.addEventListener("hashchange", () => {
  const next = mainViewFromHash(location.hash);
  if (next !== state.view) setView(next);
});

lotterySelect.value = state.lottery;
installIcons();
checkHealth();
setView(state.view);
