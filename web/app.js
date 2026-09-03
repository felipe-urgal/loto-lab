const API = "/api/v1";

const LOTTERIES = {
  "mega-sena": { label: "Mega-Sena", defaultGames: 2, drawSize: 6 },
  lotofacil: { label: "Lotofácil", defaultGames: 4, drawSize: 15 },
  "dia-de-sorte": { label: "Dia de Sorte", defaultGames: 4, drawSize: 7 },
};

const VIEWS = {
  dashboard: ["Painel", "Visão geral dos concursos, jogos e desempenho."],
  analysis: ["Análises", "Frequências, pontuação e classificação por horizonte."],
  generate: ["Gerar jogos", "Monte lotes seguindo as regras da metodologia."],
  games: ["Meus jogos", "Lotes gerados, núcleo compartilhado e conferência."],
  backtests: ["Testes históricos", "Teste a estratégia em dados passados sem vazamento futuro."],
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

const state = {
  view: location.hash.replace("#", "") || "dashboard",
  lottery: localStorage.getItem("loto-lab:lottery") || "mega-sena",
  loading: false,
  renderToken: 0,
  renderController: null,
};

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...(options.headers || {}) } : options.headers,
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || `Erro HTTP ${response.status}`;
    const error = new Error(message);
    error.code = payload?.error?.code || "HTTP_ERROR";
    throw error;
  }
  return payload;
}

async function safeApi(path, options = {}) {
  try { return await api(path, options); } catch (error) {
    if (error?.name === "AbortError") throw error;
    return null;
  }
}

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatCurrency(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function sumKnownMoney(items, field) {
  if (!items.every((item) => typeof item[field] === "number" && Number.isFinite(item[field]))) {
    return undefined;
  }
  return items.reduce((sum, item) => sum + item[field], 0);
}

function formatPercent(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
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

function compactNumbers(game) {
  const fixed = new Set(game.fixedNumbers || []);
  return game.numbers.map((value) =>
    `<span class="compact-number ${fixed.has(value) ? "is-fixed" : ""}">${number(value)}</span>`,
  ).join("");
}

function toast(message, type = "info") {
  const root = document.querySelector("#toast-root");
  const item = document.createElement("div");
  item.className = `toast ${type === "error" ? "error" : ""}`;
  item.textContent = message;
  root.append(item);
  window.setTimeout(() => item.remove(), 3600);
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
  return !render.signal.aborted
    && render.token === state.renderToken
    && render.view === state.view
    && render.lottery === state.lottery;
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
  if (!VIEWS[view]) view = "dashboard";
  state.view = view;
  location.hash = view;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === view));
  [title.textContent, subtitle.textContent] = VIEWS[view];
  renderCurrentView();
}

function setLottery(lottery) {
  if (!LOTTERIES[lottery]) return;
  state.lottery = lottery;
  localStorage.setItem("loto-lab:lottery", lottery);
  lotterySelect.value = lottery;
  renderCurrentView();
}

function metric(label, value, detail = "", tone = "") {
  return `<article class="panel metric-card"><span class="metric-label">${escapeHtml(label)}</span><strong class="metric-value ${tone}">${value}</strong><span class="metric-detail">${escapeHtml(detail)}</span></article>`;
}

async function renderDashboard(render) {
  const ids = Object.keys(LOTTERIES);
  const latest = await Promise.all(ids.map((id) => safeApi(`/contests/${id}/latest`, { signal: render.signal })));
  const [recentBacktests, recentBatches] = await Promise.all([
    safeApi(`/backtests/${render.lottery}?limit=1`, { signal: render.signal }),
    safeApi(`/game-batches/${render.lottery}?limit=5`, { signal: render.signal }),
  ]);
  if (!isCurrentRender(render)) return;

  const lastBacktest = recentBacktests?.items?.[0];
  const summary = lastBacktest?.summary || {};

  const lotteryCards = ids.map((id, index) => {
    const contest = latest[index];
    if (!contest) {
      return `<article class="panel lottery-card"><div class="lottery-kicker"><span class="lottery-name">${lotteryLabel(id)}</span><span class="contest-number">Sem dados</span></div><div class="empty-state" style="min-height:100px"><p>Sincronize concursos para começar.</p></div></article>`;
    }
    return `<article class="panel lottery-card">
      <div class="lottery-kicker"><span class="lottery-name">${lotteryLabel(id)}</span><span class="contest-number">Concurso ${contest.number} · ${formatDate(contest.date)}</span></div>
      <div class="draw-numbers">${balls(contest.numbers)}</div>
      <div class="lottery-card-footer"><span class="target-copy">Próximo alvo <strong>#${contest.number + 1}</strong></span><button class="button compact" data-quick-generate="${id}">Gerar jogos <span class="button-icon" data-icon="arrow"></span></button></div>
    </article>`;
  }).join("");

  const batches = recentBatches?.items || [];
  const batchesMarkup = batches.length ? batches.map((batch) => `
    <div class="list-row">
      <div class="list-row-main"><strong>Lote #${batch.id}</strong><p>${batch.games.length} jogo(s) · alvo ${batch.targetContestNumber ? `#${batch.targetContestNumber}` : "não definido"}</p></div>
      <div class="list-row-value"><strong>${formatDateTime(batch.createdAt)}</strong><small>${lotteryLabel(batch.lottery)}</small></div>
    </div>`).join("") : emptyState("Nenhum lote salvo", "Gere seu primeiro conjunto de jogos para começar o histórico.");

  content.innerHTML = `<div class="stack">
    <section><div class="section-head"><div><h2>Últimos concursos</h2><p>Base atual armazenada no PostgreSQL.</p></div></div><div class="grid cols-3">${lotteryCards}</div></section>
    <section><div class="section-head"><div><h2>Desempenho recente · ${lotteryLabel(render.lottery)}</h2><p>Resumo do último teste histórico salvo.</p></div><button class="link-button" data-go="backtests">Ver testes históricos</button></div>
      <div class="grid cols-4">
        ${metric("ROI", formatPercent(summary.roi), lastBacktest ? `Teste histórico #${lastBacktest.id}` : "Sem teste histórico", typeof summary.roi === "number" ? (summary.roi >= 0 ? "positive" : "negative") : "")}
        ${metric("Cobertura financeira", formatPercent(summary.financialCoverage), "Concursos com rateio conhecido")}
        ${metric("Melhor resultado", summary.bestHits ?? "—", "Maior número de acertos")}
        ${metric("Prêmios", formatCurrency(summary.totalPrizeValue), "Retorno bruto conhecido")}
      </div>
    </section>
    <section><div class="section-head"><div><h2>Jogos recentes · ${lotteryLabel(render.lottery)}</h2><p>Últimos lotes gerados e persistidos.</p></div><button class="link-button" data-go="games">Abrir meus jogos</button></div><div class="panel list">${batchesMarkup}</div></section>
  </div>`;

  installIcons(content);
  content.querySelectorAll("[data-quick-generate]").forEach((button) => button.addEventListener("click", () => {
    state.lottery = button.dataset.quickGenerate;
    lotterySelect.value = state.lottery;
    localStorage.setItem("loto-lab:lottery", state.lottery);
    setView("generate");
  }));
  content.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => setView(button.dataset.go)));
}

async function renderAnalysis(render) {
  const data = await api(`/analysis/${render.lottery}`, { signal: render.signal });
  if (!isCurrentRender(render)) return;
  const latest = data.latestContest;
  const ranked = [...data.numbers].sort((a, b) => b.score - a.score).slice(0, 18);

  const group = (key, label, description) => `<article class="panel analysis-group"><div class="analysis-group-head"><strong>${label}</strong><span>${description}</span></div><div class="number-cloud">${balls(data.tiers[key], { tier: key })}</div></article>`;
  const rows = ranked.map((row) => `<tr>
    <td><strong>${number(row.number)}</strong></td><td><span class="badge ${row.tier === "strong" ? "positive" : row.tier === "cold" ? "" : "warning"}">${row.tier}</span></td>
    <td class="score-cell"><div class="score-line"><div class="score-track"><div class="score-fill" style="width:${Math.max(0, Math.min(100, row.score))}%"></div></div><span class="score-number">${row.score.toFixed(1)}</span></div></td>
    <td>${row.year.toFixed(0)}</td><td>${row.month.toFixed(0)}</td><td>${row.recent10.toFixed(0)}</td><td>${row.recent20.toFixed(0)}</td><td>${row.historical.toFixed(0)}</td>
  </tr>`).join("");

  content.innerHTML = `<div class="stack">
    <div class="grid cols-4">
      ${metric("Concurso de referência", latest ? `#${latest.number}` : "—", latest ? formatDate(latest.date) : "Sem histórico")}
      ${metric("Fortes", data.tiers.strong.length, "Terço superior da classificação", "positive")}
      ${metric("Intermediárias", data.tiers.balanced.length, "Centro da distribuição", "warning")}
      ${metric("Frias", data.tiers.cold.length, "Terço inferior da classificação")}
    </div>
    <section><div class="section-head"><div><h2>Classificação das dezenas</h2><p>Classificação relativa dentro da loteria selecionada.</p></div></div><div class="analysis-groups">${group("strong", "Fortes", "maior pontuação combinada")}${group("balanced", "Intermediárias", "faixa central")}${group("cold", "Frias", "menor pontuação combinada")}</div></section>
    <section><div class="section-head"><div><h2>Dezenas com maior pontuação</h2><p>Componentes normalizados de 0 a 100.</p></div></div><div class="panel table-wrap"><table><thead><tr><th>Dezena</th><th>Grupo</th><th>Pontuação</th><th>Ano</th><th>Mês</th><th>10 últimos</th><th>20 últimos</th><th>Histórico</th></tr></thead><tbody>${rows}</tbody></table></div></section>
  </div>`;
}

async function renderGenerate(render) {
  const latest = await safeApi(`/contests/${render.lottery}/latest`, { signal: render.signal });
  if (!isCurrentRender(render)) return;
  const config = LOTTERIES[render.lottery];
  content.innerHTML = `<div class="stack">
    <section><div class="section-head"><div><h2>Configurar lote</h2><p>O algoritmo usa somente dados anteriores ao concurso alvo.</p></div></div>
      <form class="panel form-panel" id="generate-form">
        <div class="form-grid">
          <div class="field"><label>Loteria</label><input value="${escapeHtml(config.label)}" disabled /></div>
          <div class="field"><label for="game-count">Quantidade de jogos</label><input id="game-count" name="gameCount" type="number" min="1" max="10" value="${config.defaultGames}" /></div>
          <div class="field" id="fixed-field" ${render.lottery !== "lotofacil" ? 'style="display:none"' : ""}><label for="fixed-count">Núcleo fixo</label><select id="fixed-count" name="fixedCount"><option value="8">8 dezenas</option><option value="9">9 dezenas</option><option value="10">10 dezenas</option></select></div>
          <div class="field"><label for="target-contest">Concurso alvo</label><input id="target-contest" name="targetContestNumber" type="number" min="1" value="${latest ? latest.number + 1 : ""}" placeholder="Automático" /></div>
        </div>
        <div class="form-actions"><div><label class="checkbox"><input type="checkbox" name="persist" checked /> Salvar lote em Meus jogos</label><div class="form-note">As dezenas são calculadas pelo core. O frontend apenas envia a configuração.</div></div><button class="button primary" type="submit"><span class="button-icon" data-icon="spark"></span>Gerar jogos</button></div>
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
    result.innerHTML = `<div class="section-head"><div><h2>Lote gerado</h2><p>${generated.batchId ? `Lote #${generated.batchId} salvo` : "Prévia não persistida"} · alvo ${generated.targetContestNumber ? `#${generated.targetContestNumber}` : "automático"}</p></div>${generated.batchId ? '<button class="link-button" data-open-games>Ver em Meus jogos</button>' : ""}</div><div class="game-grid">${generated.games.map((game, index) => gameCard(game, index)).join("")}</div>`;
    result.querySelector("[data-open-games]")?.addEventListener("click", () => setView("games"));
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

async function renderGames(render) {
  const data = await api(`/game-batches/${render.lottery}?limit=20`, { signal: render.signal });
  if (!isCurrentRender(render)) return;
  const batches = data.items || [];
  if (!batches.length) {
    content.innerHTML = emptyState("Nenhum jogo salvo", "Gere um lote para ele aparecer aqui.", '<button class="button primary" type="button" data-go-generate>Gerar agora</button>');
    content.querySelector("[data-go-generate]")?.addEventListener("click", () => setView("generate"));
    return;
  }

  content.innerHTML = `<div class="stack"><div class="section-head"><div><h2>Lotes salvos · ${lotteryLabel(render.lottery)}</h2><p>Os números verdes pertencem ao núcleo compartilhado do lote.</p></div></div>${batches.map(batchMarkup).join("")}<section id="check-result"></section></div>`;
  content.querySelectorAll("[data-check-batch]").forEach((button) => button.addEventListener("click", handleCheckBatch));
}

function batchMarkup(batch) {
  return `<article class="panel batch-card"><div class="batch-head"><div class="batch-head-copy"><strong>Lote #${batch.id}</strong><p>${formatDateTime(batch.createdAt)} · ${batch.games.length} jogo(s) · alvo ${batch.targetContestNumber ? `#${batch.targetContestNumber}` : "não definido"}</p></div><div class="batch-actions"><input class="inline-input" type="number" min="1" value="${batch.targetContestNumber || ""}" placeholder="Concurso" data-contest-input="${batch.id}" /><button class="button compact" type="button" data-check-batch="${batch.id}">Conferir</button></div></div><div class="batch-games">${batch.games.map((game, index) => `<div class="compact-game"><span class="compact-game-index">${index + 1}</span><div class="compact-numbers">${compactNumbers(game)}</div>${game.luckyMonth ? `<span class="badge warning" style="margin-left:auto">${escapeHtml(game.luckyMonth)}</span>` : ""}</div>`).join("")}</div></article>`;
}

async function handleCheckBatch(event) {
  const batchId = Number(event.currentTarget.dataset.checkBatch);
  const input = content.querySelector(`[data-contest-input="${batchId}"]`);
  const contestNumber = Number(input.value);
  if (!Number.isInteger(contestNumber) || contestNumber < 1) {
    toast("Informe o número do concurso para conferir.", "error");
    input.focus();
    return;
  }
  const resultTarget = content.querySelector("#check-result");
  resultTarget.innerHTML = '<div class="loading-state" style="min-height:120px"><span class="spinner"></span><span>Conferindo lote...</span></div>';
  try {
    const result = await api("/games/check", { method: "POST", body: JSON.stringify({ batchId, contestNumber }) });
    const prize = sumKnownMoney(result.checks, "totalPrizeValue");
    const cost = sumKnownMoney(result.checks, "ticketCost");
    const net = prize !== undefined && cost !== undefined ? prize - cost : undefined;
    const best = Math.max(...result.checks.map((check) => check.hits));
    resultTarget.innerHTML = `<div class="result-banner"><h3>Conferência do lote #${batchId} · concurso #${contestNumber}</h3><p>${lotteryLabel(result.batch.lottery)} · ${result.checks.length} jogo(s) conferidos</p><div class="check-grid"><div class="check-card"><strong>${best}</strong><span>melhor pontuação</span></div><div class="check-card"><strong>${formatCurrency(cost)}</strong><span>custo do lote</span></div><div class="check-card"><strong>${formatCurrency(prize)}</strong><span>prêmio conhecido</span></div><div class="check-card"><strong>${formatCurrency(net)}</strong><span>resultado líquido</span></div></div></div><div class="panel list" style="margin-top:12px">${result.checks.map((check, index) => `<div class="list-row"><div class="list-row-main"><strong>Jogo ${index + 1} · ${check.hits} acerto(s)</strong><p>Fixas ${check.fixedHits} · variáveis ${check.variableHits}${check.prizeTier ? ` · ${escapeHtml(check.prizeTier)}` : ""}</p></div><div class="list-row-value"><strong>${formatCurrency(check.totalPrizeValue)}</strong><small>${check.luckyMonthHit ? "Mês da Sorte ✓" : "prêmio"}</small></div></div>`).join("")}</div>`;
    resultTarget.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    resultTarget.innerHTML = `<div class="error-state" style="min-height:140px"><span class="error-code">${escapeHtml(error.code)}</span><strong>Falha na conferência</strong><p>${escapeHtml(error.message)}</p></div>`;
    toast(error.message, "error");
  }
}

async function renderCurrentView() {
  state.renderController?.abort();
  const controller = new AbortController();
  state.renderController = controller;
  const render = {
    token: ++state.renderToken,
    view: state.view,
    lottery: state.lottery,
    signal: controller.signal,
  };

  state.loading = true;
  loading();
  refreshButton.classList.add("is-spinning");
  try {
    if (render.view === "dashboard") await renderDashboard(render);
    else if (render.view === "analysis") await renderAnalysis(render);
    else if (render.view === "generate") await renderGenerate(render);
    else if (render.view === "games") await renderGames(render);
    else if (render.view === "backtests") {
      content.innerHTML = '<div class="loading-state" data-feature-owned="backtests"><span class="spinner"></span><span>Carregando Testes históricos...</span></div>';
    }
  } catch (error) {
    if (error?.name !== "AbortError" && isCurrentRender(render)) errorState(error);
  } finally {
    if (render.token === state.renderToken) {
      state.loading = false;
      refreshButton.classList.remove("is-spinning");
    }
  }
}

document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => setView(item.dataset.view)));
lotterySelect.addEventListener("change", (event) => setLottery(event.target.value));
refreshButton.addEventListener("click", renderCurrentView);
window.addEventListener("hashchange", () => {
  const next = location.hash.replace("#", "");
  if (VIEWS[next] && next !== state.view) setView(next);
});

lotterySelect.value = state.lottery;
installIcons();
checkHealth();
setView(VIEWS[state.view] ? state.view : "dashboard");
