import { isLotteryId, isMainView, mainViewFromHash } from "./src/core/mainContext.js";
import { createMainRenderState } from "./src/core/mainRenderState.js";
import { escapeHtml } from "./src/shared/escaping.js";

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

async function renderGenerate() {
  content.innerHTML = '<div class="loading-state" data-feature-owned="generate"><span class="spinner"></span><span>Carregando Gerador...</span></div>';
}

async function renderCurrentView() {
  const render = state.beginRender();

  loading();
  refreshButton.classList.add("is-spinning");
  try {
    if (render.view === "dashboard") await renderDashboard();
    else if (render.view === "analysis") await renderAnalysis();
    else if (render.view === "generate") await renderGenerate();
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
