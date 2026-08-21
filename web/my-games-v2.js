import {
  api,
  escapeHtml,
  formatCurrency,
  formatDateTime,
  onViewRendered,
  toast,
} from "./runtime.js";

const root = document.querySelector("#content");
const lotterySelect = document.querySelector("#lottery-select");
const subtitle = document.querySelector("#view-subtitle");

const ui = {
  filter: "visible",
  query: "",
  expandedBatchId: null,
  requestToken: 0,
};

function currentView() {
  return location.hash.replace("#", "") || "dashboard";
}

function currentLottery() {
  return lotterySelect?.value || "mega-sena";
}

function money(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? formatCurrency(numeric) : "—";
}

function number(value) {
  return String(value).padStart(2, "0");
}

function hitText(value) {
  const hits = Number(value) || 0;
  return `${hits} acerto${hits === 1 ? "" : "s"}`;
}

function contestDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("pt-BR") : value;
}

function latestBetByBatch(items) {
  const map = new Map();
  for (const bet of items || []) {
    if (!map.has(bet.batchId)) map.set(bet.batchId, bet);
  }
  return map;
}

function statusFor(batch, bet) {
  if (batch.archivedAt) return { key: "hidden", label: "Oculto", tone: "muted" };
  if (!bet) return { key: "generated", label: "Gerado", tone: "neutral" };
  if (bet.status === "checked") return { key: "checked", label: "Conferido", tone: "success" };
  if (bet.status === "awaiting_result") return { key: "waiting", label: "Aguardando resultado", tone: "warning" };
  return { key: "placed", label: "Apostado", tone: "success" };
}

function batchMeta(batch) {
  return `${batch.games.length} jogo${batch.games.length === 1 ? "" : "s"} · alvo ${batch.targetContestNumber ? `#${batch.targetContestNumber}` : "não definido"} · ${formatDateTime(batch.createdAt)}`;
}

function gameNumbers(game, options = {}) {
  const fixed = new Set(game.fixedNumbers || []);
  const matched = new Set(options.matchedNumbers || []);
  return (game.numbers || []).map((value) => {
    const classes = ["mg2-number"];
    if (fixed.has(value)) classes.push("is-fixed");
    if (matched.has(value)) classes.push("is-match");
    return `<span class="${classes.join(" ")}">${number(value)}</span>`;
  }).join("");
}

function gameRow(game, index) {
  return `<div class="mg2-game">
    <div class="mg2-game-index">Jogo ${index + 1}</div>
    <div class="mg2-numbers">${gameNumbers(game)}</div>
    ${game.luckyMonth ? `<span class="mg2-month">${escapeHtml(game.luckyMonth)}</span>` : ""}
  </div>`;
}

function batchTrailing(batch, bet) {
  if (batch.archivedAt) {
    return `<div class="mg2-trailing-copy"><strong>Fora da lista principal</strong><span>histórico preservado</span></div>`;
  }
  if (!bet) {
    return `<div class="mg2-trailing-copy"><strong>${batch.games.length} jogo${batch.games.length === 1 ? "" : "s"}</strong><span>somente gerado</span></div>`;
  }
  if (bet.status === "checked") {
    const result = Number(bet.netResult || 0);
    return `<div class="mg2-trailing-copy"><strong class="${result >= 0 ? "is-positive" : "is-negative"}">${money(result)}</strong><span>resultado líquido</span></div>`;
  }
  return `<div class="mg2-trailing-copy"><strong>${money(bet.actualCost)}</strong><span>valor apostado</span></div>`;
}

function officialBetMarkup(bet) {
  if (!bet) return "";

  if (bet.status !== "checked") {
    return `<section class="mg2-official is-pending" data-mg2-official>
      <div class="mg2-official-head">
        <div><strong>Resultado da aposta</strong><p>Concurso #${bet.contestNumber} · custo real ${money(bet.actualCost)}</p></div>
        <span class="mg2-status is-warning">Aguardando resultado</span>
      </div>
      <div class="mg2-official-pending">
        <p>A conferência financeira só será registrada quando o resultado oficial desse concurso estiver disponível.</p>
        <button class="button" type="button" data-mg2-refresh-bet="${bet.id}">Atualizar resultado</button>
      </div>
    </section>`;
  }

  const checkedGames = (bet.games || []).filter((item) => item.checkResult);
  const best = checkedGames.length ? Math.max(...checkedGames.map((item) => Number(item.checkResult.hits || 0))) : 0;
  const prize = Number(bet.totalPrizeValue || 0);
  const net = Number(bet.netResult || 0);
  return `<section class="mg2-official" data-mg2-official>
    <div class="mg2-official-head">
      <div><strong>Resultado da aposta · concurso #${bet.contestNumber}</strong><p>${checkedGames.length} jogo${checkedGames.length === 1 ? "" : "s"} efetivamente apostado${checkedGames.length === 1 ? "" : "s"}</p></div>
      <span class="mg2-status is-success">Conferência oficial</span>
    </div>
    <div class="mg2-result-metrics">
      <div><span>Melhor jogo</span><strong>${hitText(best)}</strong></div>
      <div><span>Custo real</span><strong>${money(bet.actualCost)}</strong></div>
      <div><span>Prêmio</span><strong>${money(prize)}</strong></div>
      <div><span>Resultado</span><strong class="${net >= 0 ? "is-positive" : "is-negative"}">${money(net)}</strong></div>
    </div>
    <details class="mg2-result-details">
      <summary>Ver jogos apostados</summary>
      <div class="mg2-official-games">
        ${checkedGames.map((item) => `<div class="mg2-official-game">
          <div class="mg2-official-game-head"><strong>Jogo ${item.batchPosition}</strong><span>${hitText(item.checkResult.hits)} · ${money(item.prizeValue || 0)}</span></div>
          <div class="mg2-numbers">${gameNumbers(item.game, { matchedNumbers: item.checkResult.matchedNumbers })}</div>
          ${item.game.luckyMonth ? `<span class="mg2-month">Mês da Sorte: ${escapeHtml(item.game.luckyMonth)}${item.checkResult.luckyMonthHit ? " · acertou" : ""}</span>` : ""}
        </div>`).join("")}
      </div>
    </details>
  </section>`;
}

function batchMarkup(batch, bet) {
  const status = statusFor(batch, bet);
  const expanded = ui.expandedBatchId === batch.id;
  return `<article class="mg2-batch ${expanded ? "is-expanded" : ""}" data-mg2-batch="${batch.id}">
    <button class="mg2-summary" type="button" data-mg2-toggle="${batch.id}" aria-expanded="${expanded}" aria-controls="mg2-detail-${batch.id}">
      <div class="mg2-summary-main">
        <div class="mg2-title-line"><strong>Lote #${batch.id}</strong><span class="mg2-status is-${status.tone}">${status.label}</span></div>
        <p>${escapeHtml(batchMeta(batch))}</p>
      </div>
      <div class="mg2-summary-end">
        ${batchTrailing(batch, bet)}
        <span class="mg2-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m8 10 4 4 4-4"/></svg></span>
      </div>
    </button>
    <div class="mg2-detail" id="mg2-detail-${batch.id}" ${expanded ? "" : "hidden"}>
      <div class="mg2-games">${batch.games.map(gameRow).join("")}</div>
      ${officialBetMarkup(bet)}
      <div class="mg2-detail-actions">
        ${batch.archivedAt ? `
          <button class="button" type="button" data-mg2-show="${batch.id}">Mostrar novamente</button>
        ` : `
          ${bet ? "" : `<button class="button primary" type="button" data-mg2-mark-bet="${batch.id}">Marcar como apostado</button>`}
          <button class="button" type="button" data-mg2-compare="${batch.id}">Comparar concursos</button>
          <button class="button ghost mg2-hide-action" type="button" data-mg2-hide="${batch.id}">Ocultar lote</button>
        `}
      </div>
      <div class="mg2-inline-host" data-mg2-inline="${batch.id}"></div>
      <div class="mg2-comparison-host" data-mg2-comparison-host="${batch.id}"></div>
    </div>
  </article>`;
}

function emptyMarkup(filter) {
  const copy = filter === "hidden"
    ? "Nenhum lote foi ocultado."
    : "Nenhum lote corresponde a este filtro.";
  return `<div class="mg2-empty"><strong>Nada por aqui</strong><p>${copy}</p></div>`;
}

function renderToolbar(items, betByBatch) {
  const visible = items.filter((batch) => !batch.archivedAt);
  const hidden = items.filter((batch) => batch.archivedAt);
  const bets = visible.filter((batch) => betByBatch.has(batch.id));
  const generated = visible.filter((batch) => !betByBatch.has(batch.id));
  const filters = [
    ["visible", "Todos", visible.length],
    ["bets", "Apostados", bets.length],
    ["generated", "Gerados", generated.length],
    ["hidden", "Ocultos", hidden.length],
  ];

  return `<div class="mg2-toolbar">
    <div class="mg2-filters" role="group" aria-label="Filtrar lotes">
      ${filters.map(([key, label, count]) => `<button class="mg2-filter ${ui.filter === key ? "is-active" : ""}" type="button" data-mg2-filter="${key}" aria-pressed="${ui.filter === key}">${label}<span>${count}</span></button>`).join("")}
    </div>
    <label class="mg2-search">
      <span class="sr-only">Buscar lote ou concurso</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input type="search" value="${escapeHtml(ui.query)}" placeholder="Buscar lote ou concurso" data-mg2-search />
    </label>
  </div>`;
}

function visibleItems(items, betByBatch) {
  const normalized = ui.query.trim().toLowerCase();
  return items.filter((batch) => {
    const bet = betByBatch.get(batch.id);
    const filterMatch = ui.filter === "hidden"
      ? Boolean(batch.archivedAt)
      : !batch.archivedAt && (
        ui.filter === "visible"
        || (ui.filter === "bets" && Boolean(bet))
        || (ui.filter === "generated" && !bet)
      );
    if (!filterMatch) return false;
    if (!normalized) return true;
    return `${batch.id} ${batch.targetContestNumber || ""} ${bet?.contestNumber || ""}`.toLowerCase().includes(normalized);
  });
}

function renderScreen(data, betData) {
  const items = data.items || [];
  const betByBatch = latestBetByBatch(betData.items || []);
  const shown = visibleItems(items, betByBatch);

  root.innerHTML = `<div class="mg2-shell" data-my-games-v2>
    ${renderToolbar(items, betByBatch)}
    <div class="mg2-list" data-mg2-list>
      ${shown.length ? shown.map((batch) => batchMarkup(batch, betByBatch.get(batch.id))).join("") : emptyMarkup(ui.filter)}
    </div>
  </div>`;

  bindScreen(data, betData);
}

function rerender(data, betData) {
  if (currentView() !== "games") return;
  renderScreen(data, betData);
}

function renderBetForm(host, batch) {
  const minimumContest = Number(batch.targetContestNumber || 1);
  host.innerHTML = `<form class="mg2-form" data-mg2-bet-form>
    <div class="mg2-form-head"><strong>Registrar aposta do lote #${batch.id}</strong><p>Marque somente os jogos realmente apostados. O financeiro ficará vinculado apenas a esse concurso.</p></div>
    <div class="mg2-bet-games">
      ${batch.games.map((game, index) => `<label class="mg2-bet-game"><input type="checkbox" name="gamePosition" value="${index + 1}" checked /><span>Jogo ${index + 1}</span><div class="mg2-mini-numbers">${(game.numbers || []).map((value) => `<b>${number(value)}</b>`).join("")}</div></label>`).join("")}
    </div>
    <div class="mg2-form-grid">
      <label><span>Concurso apostado</span><input name="contestNumber" type="number" min="${minimumContest}" required value="${escapeHtml(batch.targetContestNumber || "")}" /></label>
      <label><span>Valor gasto</span><input name="actualCost" type="number" min="0.01" step="0.01" required placeholder="Ex.: 12,00" /></label>
    </div>
    ${batch.targetContestNumber ? `<p class="mg2-form-note">Para preservar o contexto da geração, o concurso apostado não pode ser anterior ao alvo #${batch.targetContestNumber}.</p>` : ""}
    <div class="mg2-form-actions"><button class="button ghost" type="button" data-mg2-cancel-form>Cancelar</button><button class="button primary" type="submit">Confirmar aposta</button></div>
  </form>`;

  host.querySelector("[data-mg2-cancel-form]")?.addEventListener("click", () => { host.innerHTML = ""; });
  host.querySelector("form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector("button[type=submit]");
    const values = new FormData(form);
    const gamePositions = values.getAll("gamePosition").map(Number);
    if (!gamePositions.length) {
      toast("Selecione ao menos um jogo apostado.", "error");
      return;
    }
    const contestNumber = Number(values.get("contestNumber"));
    if (batch.targetContestNumber && contestNumber < batch.targetContestNumber) {
      toast(`Use o concurso alvo #${batch.targetContestNumber} ou um concurso posterior.`, "error");
      return;
    }
    submit.disabled = true;
    submit.textContent = "Salvando...";
    try {
      await api("/real-bets", {
        method: "POST",
        body: JSON.stringify({
          batchId: batch.id,
          contestNumber,
          actualCost: Number(values.get("actualCost")),
          gamePositions,
        }),
      });
      toast("Aposta registrada.");
      await mount({ preserveExpanded: batch.id });
    } catch (error) {
      submit.disabled = false;
      submit.textContent = "Tentar novamente";
      toast(error.message, "error");
    }
  });
}

function comparisonDrawNumbers(item) {
  const matched = new Set(item.matchedAnyNumbers || []);
  return (item.numbers || []).map((value) => `<span class="mg2-draw-number ${matched.has(value) ? "is-used" : ""}">${number(value)}</span>`).join("");
}

function comparisonGameMarkup(batch, item) {
  return item.games.map((check) => {
    const game = batch.games[check.position - 1];
    if (!game) return "";
    return `<div class="mg2-compare-game">
      <div class="mg2-compare-game-head"><strong>Jogo ${check.position}</strong><span>${check.hits}/${item.numbers.length} · ${hitText(check.hits)}</span></div>
      <div class="mg2-numbers">${gameNumbers(game, { matchedNumbers: check.matchedNumbers })}</div>
      ${game.luckyMonth ? `<span class="mg2-month">Mês da Sorte: ${escapeHtml(game.luckyMonth)}${check.luckyMonthHit ? " · acertou" : ""}</span>` : ""}
    </div>`;
  }).join("");
}

function comparisonContestMarkup(batch, item, index) {
  return `<details class="mg2-compare-contest" ${index === 0 ? "open" : ""}>
    <summary>
      <div class="mg2-compare-contest-meta"><strong>#${item.contestNumber}</strong><span>${contestDate(item.date)}</span></div>
      <div class="mg2-draw-numbers">${comparisonDrawNumbers(item)}</div>
      <div class="mg2-compare-hit-summary">${item.games.map((check) => `<span class="${check.hits === item.bestHits && check.hits > 0 ? "is-best" : ""}">J${check.position} · ${check.hits}/${item.numbers.length}</span>`).join("")}</div>
    </summary>
    <div class="mg2-compare-detail">
      ${item.luckyMonth ? `<p class="mg2-compare-month">Mês da Sorte sorteado: <strong>${escapeHtml(item.luckyMonth)}</strong></p>` : ""}
      ${comparisonGameMarkup(batch, item)}
    </div>
  </details>`;
}

function comparisonPanelMarkup(batch, result, count) {
  const summary = result.summary || {};
  const minimum = Number(result.scope?.minimumContestNumber || 1);
  const counts = [3, 5, 10, 20];
  const hasItems = (result.items || []).length > 0;
  return `<section class="mg2-comparison" data-mg2-comparison>
    <div class="mg2-comparison-head">
      <div>
        <strong>Comparar concursos</strong>
        <p>Veja como este mesmo lote se comporta em resultados a partir do alvo. Esta análise não altera apostas nem histórico financeiro.</p>
      </div>
      <button class="button ghost" type="button" data-mg2-close-comparison>Fechar</button>
    </div>
    <div class="mg2-comparison-controls">
      <label><span>A partir do concurso</span><input type="number" min="${minimum}" value="${result.startContestNumber}" data-mg2-compare-start /></label>
      <div class="mg2-counts" role="group" aria-label="Quantidade de concursos">
        ${counts.map((value) => `<button type="button" class="mg2-count ${count === value ? "is-active" : ""}" data-mg2-compare-count="${value}" aria-pressed="${count === value}">${value}</button>`).join("")}
      </div>
      <button class="button" type="button" data-mg2-compare-load>Atualizar</button>
    </div>
    ${result.scope?.note ? `<p class="mg2-comparison-note">${escapeHtml(result.scope.note)}</p>` : ""}
    ${hasItems ? `
      <div class="mg2-comparison-summary">
        <div><span>Concursos</span><strong>${summary.contestCount}</strong></div>
        <div><span>Melhor resultado</span><strong>${hitText(summary.bestHits)}</strong></div>
        <div><span>Melhor concurso</span><strong>${summary.bestContestNumber ? `#${summary.bestContestNumber}` : "—"}</strong></div>
        <div><span>Média do melhor jogo</span><strong>${Number(summary.averageBestHits || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong></div>
      </div>
      <div class="mg2-comparison-legend"><span><i class="is-hit"></i> acerto</span><span><i class="is-fixed"></i> núcleo fixo</span><span>Abra um concurso para ver jogo por jogo.</span></div>
      <div class="mg2-comparison-list">${result.items.map((item, index) => comparisonContestMarkup(batch, item, index)).join("")}</div>
    ` : `<div class="mg2-comparison-empty"><strong>Nenhum resultado disponível ainda</strong><p>Não há concursos armazenados a partir de #${result.startContestNumber}. Quando novos resultados forem sincronizados, eles aparecerão aqui.</p></div>`}
  </section>`;
}

async function loadComparison(batch, count = 5, startContest) {
  const host = root.querySelector(`[data-mg2-comparison-host="${batch.id}"]`);
  if (!host) return;
  const query = new URLSearchParams({ count: String(count) });
  if (startContest) query.set("startContest", String(startContest));
  host.innerHTML = '<div class="mg2-inline-loading">Carregando comparação...</div>';
  try {
    const result = await api(`/game-batches/${batch.id}/comparison?${query.toString()}`);
    host.innerHTML = comparisonPanelMarkup(batch, result, count);
    bindComparisonPanel(host, batch, count);
    const trigger = root.querySelector(`[data-mg2-compare="${batch.id}"]`);
    if (trigger) trigger.textContent = "Fechar comparação";
  } catch (error) {
    host.innerHTML = `<div class="mg2-inline-error"><strong>Comparação indisponível</strong><p>${escapeHtml(error.message)}</p></div>`;
  }
}

function bindComparisonPanel(host, batch, currentCount) {
  host.querySelector("[data-mg2-close-comparison]")?.addEventListener("click", () => {
    host.innerHTML = "";
    const trigger = root.querySelector(`[data-mg2-compare="${batch.id}"]`);
    if (trigger) trigger.textContent = "Comparar concursos";
  });

  const readStart = () => Number(host.querySelector("[data-mg2-compare-start]")?.value || 0) || undefined;
  host.querySelectorAll("[data-mg2-compare-count]").forEach((button) => button.addEventListener("click", () => {
    void loadComparison(batch, Number(button.dataset.mg2CompareCount), readStart());
  }));
  host.querySelector("[data-mg2-compare-load]")?.addEventListener("click", () => {
    void loadComparison(batch, currentCount, readStart());
  });
}

async function hideBatch(batchId) {
  await api(`/game-batches/${batchId}/hide`, { method: "POST" });
  if (ui.expandedBatchId === batchId) ui.expandedBatchId = null;
  toast("Lote ocultado. O histórico foi preservado.");
  await mount();
}

async function showBatch(batchId) {
  await api(`/game-batches/${batchId}/show`, { method: "POST" });
  ui.filter = "visible";
  ui.expandedBatchId = batchId;
  toast("Lote voltou para a lista principal.");
  await mount({ preserveExpanded: batchId });
}

function bindScreen(data, betData) {
  const items = data.items || [];
  const batchById = new Map(items.map((batch) => [batch.id, batch]));

  root.querySelectorAll("[data-mg2-filter]").forEach((button) => button.addEventListener("click", () => {
    ui.filter = button.dataset.mg2Filter;
    ui.expandedBatchId = null;
    rerender(data, betData);
  }));

  root.querySelector("[data-mg2-search]")?.addEventListener("input", (event) => {
    ui.query = event.target.value;
    rerender(data, betData);
    const input = root.querySelector("[data-mg2-search]");
    input?.focus();
    input?.setSelectionRange(ui.query.length, ui.query.length);
  });

  root.querySelectorAll("[data-mg2-toggle]").forEach((button) => button.addEventListener("click", () => {
    const batchId = Number(button.dataset.mg2Toggle);
    ui.expandedBatchId = ui.expandedBatchId === batchId ? null : batchId;
    rerender(data, betData);
  }));

  root.querySelectorAll("[data-mg2-hide]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try { await hideBatch(Number(button.dataset.mg2Hide)); }
    catch (error) { button.disabled = false; toast(error.message, "error"); }
  }));

  root.querySelectorAll("[data-mg2-show]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try { await showBatch(Number(button.dataset.mg2Show)); }
    catch (error) { button.disabled = false; toast(error.message, "error"); }
  }));

  root.querySelectorAll("[data-mg2-mark-bet]").forEach((button) => button.addEventListener("click", () => {
    const batchId = Number(button.dataset.mg2MarkBet);
    const batch = batchById.get(batchId);
    const host = root.querySelector(`[data-mg2-inline="${batchId}"]`);
    if (batch && host) renderBetForm(host, batch);
  }));

  root.querySelectorAll("[data-mg2-compare]").forEach((button) => button.addEventListener("click", () => {
    const batchId = Number(button.dataset.mg2Compare);
    const batch = batchById.get(batchId);
    const host = root.querySelector(`[data-mg2-comparison-host="${batchId}"]`);
    if (!batch || !host) return;
    if (host.querySelector("[data-mg2-comparison]")) {
      host.innerHTML = "";
      button.textContent = "Comparar concursos";
      return;
    }
    void loadComparison(batch, 5);
  }));

  root.querySelectorAll("[data-mg2-refresh-bet]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Atualizando...";
    try {
      await api(`/real-bets/${button.dataset.mg2RefreshBet}/check`, { method: "POST" });
      toast("Resultado da aposta atualizado.");
      await mount({ preserveExpanded: ui.expandedBatchId });
    } catch (error) {
      button.disabled = false;
      button.textContent = "Atualizar resultado";
      toast(error.message, "error");
    }
  }));
}

async function mount(options = {}) {
  if (!root || currentView() !== "games") return;
  const lottery = currentLottery();
  const token = ++ui.requestToken;
  if (options.preserveExpanded) ui.expandedBatchId = options.preserveExpanded;
  subtitle.textContent = "Acompanhe lotes, apostas e resultados sem perder o histórico.";

  root.innerHTML = '<div class="mg2-loading"><span class="spinner"></span><span>Carregando seus jogos...</span></div>';
  try {
    const [data, betData] = await Promise.all([
      api(`/game-batches/manage/${lottery}?scope=all&limit=200`),
      api(`/real-bets/${lottery}?limit=200`).catch(() => ({ items: [] })),
    ]);
    if (token !== ui.requestToken || currentView() !== "games" || currentLottery() !== lottery) return;
    renderScreen(data, betData);
  } catch (error) {
    if (token !== ui.requestToken || currentView() !== "games") return;
    root.innerHTML = `<div class="error-state"><strong>Não foi possível carregar seus jogos</strong><p>${escapeHtml(error.message)}</p><button class="button" type="button" data-mg2-retry>Tentar novamente</button></div>`;
    root.querySelector("[data-mg2-retry]")?.addEventListener("click", () => mount());
  }
}

let scheduled = false;
function scheduleMount() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    void mount();
  }, 0);
}

onViewRendered(scheduleMount);
lotterySelect?.addEventListener("change", () => {
  ui.filter = "visible";
  ui.query = "";
  ui.expandedBatchId = null;
});
document.querySelector("#refresh-view")?.addEventListener("click", () => { ui.expandedBatchId = null; });
window.addEventListener("loto-lab:data-synced", scheduleMount);
scheduleMount();
