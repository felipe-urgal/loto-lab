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

function gameNumbers(game) {
  const fixed = new Set(game.fixedNumbers || []);
  return (game.numbers || []).map((value) => `
    <span class="mg2-number ${fixed.has(value) ? "is-fixed" : ""}">${number(value)}</span>
  `).join("");
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

function batchMarkup(batch, bet) {
  const status = statusFor(batch, bet);
  const expanded = ui.expandedBatchId === batch.id;
  const contestNumber = bet?.contestNumber || batch.targetContestNumber || "";
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
      <div class="mg2-detail-actions">
        ${batch.archivedAt ? `
          <button class="button" type="button" data-mg2-show="${batch.id}">Mostrar novamente</button>
        ` : `
          ${bet ? "" : `<button class="button primary" type="button" data-mg2-mark-bet="${batch.id}">Marcar como apostado</button>`}
          <div class="mg2-check-control">
            <label for="mg2-contest-${batch.id}">Concurso</label>
            <input id="mg2-contest-${batch.id}" type="number" min="1" value="${escapeHtml(contestNumber)}" data-mg2-contest="${batch.id}" />
            <button class="button" type="button" data-mg2-check="${batch.id}">${bet?.status === "checked" ? "Rever conferência" : "Conferir resultado"}</button>
          </div>
          <button class="button ghost mg2-hide-action" type="button" data-mg2-hide="${batch.id}">Ocultar lote</button>
        `}
      </div>
      <div class="mg2-inline-host" data-mg2-inline="${batch.id}"></div>
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
  host.innerHTML = `<form class="mg2-form" data-mg2-bet-form>
    <div class="mg2-form-head"><strong>Registrar aposta do lote #${batch.id}</strong><p>Marque somente os jogos que realmente foram apostados.</p></div>
    <div class="mg2-bet-games">
      ${batch.games.map((game, index) => `<label class="mg2-bet-game"><input type="checkbox" name="gamePosition" value="${index + 1}" checked /><span>Jogo ${index + 1}</span><div class="mg2-mini-numbers">${(game.numbers || []).map((value) => `<b>${number(value)}</b>`).join("")}</div></label>`).join("")}
    </div>
    <div class="mg2-form-grid">
      <label><span>Concurso</span><input name="contestNumber" type="number" min="1" required value="${escapeHtml(batch.targetContestNumber || "")}" /></label>
      <label><span>Valor gasto</span><input name="actualCost" type="number" min="0.01" step="0.01" required placeholder="Ex.: 12,00" /></label>
    </div>
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
    submit.disabled = true;
    submit.textContent = "Salvando...";
    try {
      await api("/real-bets", {
        method: "POST",
        body: JSON.stringify({
          batchId: batch.id,
          contestNumber: Number(values.get("contestNumber")),
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

function checkResultMarkup(result, contestNumber) {
  const checks = result.checks || [];
  const prize = checks.reduce((sum, check) => sum + Number(check.totalPrizeValue || 0), 0);
  const cost = checks.reduce((sum, check) => sum + Number(check.ticketCost || 0), 0);
  const best = checks.length ? Math.max(...checks.map((check) => Number(check.hits || 0))) : 0;
  const net = prize - cost;
  return `<section class="mg2-result">
    <div class="mg2-result-head"><div><strong>Concurso #${contestNumber}</strong><p>${checks.length} jogo${checks.length === 1 ? "" : "s"} conferido${checks.length === 1 ? "" : "s"}</p></div><span class="mg2-status ${net >= 0 ? "is-success" : "is-muted"}">Conferência concluída</span></div>
    <div class="mg2-result-metrics">
      <div><span>Melhor jogo</span><strong>${best} acerto${best === 1 ? "" : "s"}</strong></div>
      <div><span>Custo</span><strong>${money(cost)}</strong></div>
      <div><span>Prêmio</span><strong>${money(prize)}</strong></div>
      <div><span>Resultado</span><strong class="${net >= 0 ? "is-positive" : "is-negative"}">${money(net)}</strong></div>
    </div>
    <details class="mg2-result-details"><summary>Ver resultado por jogo</summary><div class="mg2-result-games">${checks.map((check, index) => `<div><span>Jogo ${index + 1} · ${check.hits} acerto${check.hits === 1 ? "" : "s"}</span><strong>${money(check.totalPrizeValue || 0)}</strong></div>`).join("")}</div></details>
  </section>`;
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

  root.querySelectorAll("[data-mg2-check]").forEach((button) => button.addEventListener("click", async () => {
    const batchId = Number(button.dataset.mg2Check);
    const input = root.querySelector(`[data-mg2-contest="${batchId}"]`);
    const contestNumber = Number(input?.value || 0);
    const host = root.querySelector(`[data-mg2-inline="${batchId}"]`);
    if (!Number.isInteger(contestNumber) || contestNumber < 1) {
      toast("Informe um concurso válido para conferir.", "error");
      input?.focus();
      return;
    }
    button.disabled = true;
    button.textContent = "Conferindo...";
    if (host) host.innerHTML = '<div class="mg2-inline-loading">Conferindo resultado...</div>';
    try {
      const result = await api("/games/check", {
        method: "POST",
        body: JSON.stringify({ batchId, contestNumber }),
      });
      if (host) host.innerHTML = checkResultMarkup(result, contestNumber);
    } catch (error) {
      if (host) host.innerHTML = `<div class="mg2-inline-error"><strong>Resultado indisponível</strong><p>${escapeHtml(error.message)}</p></div>`;
    } finally {
      button.disabled = false;
      button.textContent = "Rever conferência";
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
