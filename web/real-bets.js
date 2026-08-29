import {
  api,
  escapeHtml,
  formatCurrency,
  formatDateTime,
  formatPercent,
  onViewRendered,
} from "./runtime.js";

const root = document.querySelector("#content");
const lotterySelect = document.querySelector("#lottery-select");
const cache = new Map();
let scheduled = false;

function currentView() {
  return location.hash.replace("#", "") || "dashboard";
}

function currentLottery() {
  return lotterySelect?.value || "mega-sena";
}

function load(lottery, force = false) {
  if (force) cache.delete(lottery);
  if (!cache.has(lottery)) {
    cache.set(lottery, api(`/real-bets/${lottery}?limit=50`).catch((error) => {
      cache.delete(lottery);
      throw error;
    }));
  }
  return cache.get(lottery);
}

function metric(label, value, detail = "", tone = "") {
  return `<article class="panel metric-card"><span class="metric-label">${escapeHtml(label)}</span><strong class="metric-value ${tone}">${value}</strong><span class="metric-detail">${escapeHtml(detail)}</span></article>`;
}

function statusInfo(status) {
  if (status === "checked") return { label: "Conferido", className: "is-checked" };
  if (status === "awaiting_result") return { label: "Aguardando resultado", className: "is-waiting" };
  if (status === "placed") return { label: "Apostado", className: "" };
  return { label: "Planejado", className: "" };
}

async function refineDashboard() {
  if (!root || root.querySelector(".real-performance-section")) return;
  const lottery = currentLottery();
  let data;
  try {
    data = await load(lottery);
  } catch {
    return;
  }
  if (
    currentView() !== "dashboard"
    || currentLottery() !== lottery
    || root.querySelector(".real-performance-section")
  ) return;

  const sections = [...root.querySelectorAll(":scope > .stack > section")];
  if (sections.length < 2) return;
  const summary = data.summary || {};
  const section = document.createElement("section");
  section.className = "real-performance-section";
  const roiTone = typeof summary.roi === "number" ? (summary.roi >= 0 ? "positive" : "negative") : "";
  section.innerHTML = `
    <div class="section-head">
      <div><h2>Desempenho real</h2><p>Apenas apostas marcadas como realmente realizadas · não inclui testes históricos.</p></div>
    </div>
    <div class="grid cols-4">
      ${metric("ROI real", formatPercent(summary.roi), `${summary.checkedBets || 0} aposta(s) conferida(s)`, roiTone)}
      ${metric("Gasto real", formatCurrency(summary.actualCost || 0), `${summary.pendingBets || 0} aguardando resultado`)}
      ${metric("Prêmios reais", formatCurrency(summary.totalPrizeValue || 0), "Retorno das apostas conferidas")}
      ${metric("Resultado líquido", formatCurrency(summary.netResult || 0), "Prêmios menos custo conferido", (summary.netResult || 0) >= 0 ? "positive" : "negative")}
    </div>`;
  sections[1].insertAdjacentElement("afterend", section);
}

function betSummaryMarkup(bet) {
  const status = statusInfo(bet.status);
  const netTone = typeof bet.netResult === "number" ? (bet.netResult >= 0 ? "positive" : "negative") : "";
  return `
    <span class="real-bet-status ${status.className}">${status.label}</span>
    <div class="real-bet-summary">
      <span><strong>${bet.games.length}</strong> jogo(s) realmente apostado(s)</span>
      <span>Concurso <strong>#${bet.contestNumber}</strong></span>
      <span>Gasto <strong>${formatCurrency(bet.actualCost)}</strong></span>
      ${bet.status === "checked" ? `<span>Prêmio <strong>${formatCurrency(bet.totalPrizeValue || 0)}</strong></span><span>Resultado <strong class="${netTone}">${formatCurrency(bet.netResult || 0)}</strong></span>` : ""}
    </div>`;
}

function realBetHistory(data) {
  if (!data.items?.length) return "";
  return `<section class="real-bet-history">
    <div class="section-head"><div><h2>Apostas reais</h2><p>Histórico separado dos lotes apenas gerados e dos testes históricos.</p></div></div>
    <div class="panel list">${data.items.map((bet) => {
      const info = statusInfo(bet.status);
      const value = bet.status === "checked" ? (bet.netResult || 0) : undefined;
      const tone = typeof value === "number" ? (value >= 0 ? "positive" : "negative") : "";
      return `<div class="list-row"><div class="list-row-main"><strong>Aposta #${bet.id} · concurso #${bet.contestNumber}</strong><p>${bet.games.length} jogo(s) · ${formatDateTime(bet.playedAt)} · ${info.label}</p></div><div class="list-row-value"><strong class="${tone}">${bet.status === "checked" ? formatCurrency(value) : formatCurrency(bet.actualCost)}</strong><small>${bet.status === "checked" ? "resultado líquido" : "gasto registrado"}</small></div></div>`;
    }).join("")}</div>
  </section>`;
}

function compactGameMarkup(row, index) {
  const numbers = [...row.querySelectorAll(".compact-number")].map((node) => node.textContent.trim()).join(" ");
  return `<label class="real-bet-game-option"><input type="checkbox" name="gamePosition" value="${index + 1}" checked /><strong>Jogo ${index + 1}</strong><span class="compact-numbers">${escapeHtml(numbers)}</span></label>`;
}

function openBetForm(card, batchId) {
  card.querySelector(".real-bet-form")?.remove();
  const lottery = currentLottery();
  const gameRows = [...card.querySelectorAll(".compact-game")];
  const contestInput = card.querySelector(`[data-contest-input="${batchId}"]`);
  const contestNumber = Number(contestInput?.value || 0);
  const form = document.createElement("form");
  form.className = "real-bet-form";
  form.innerHTML = `
    <div class="real-bet-form-head"><div><strong>Marcar lote #${batchId} como apostado</strong><p>Selecione somente os jogos que você realmente registrou na lotérica/app.</p></div></div>
    <div class="real-bet-games">${gameRows.map(compactGameMarkup).join("")}</div>
    <div class="real-bet-form-grid">
      <label class="field"><span>Concurso</span><input name="contestNumber" type="number" min="1" required value="${Number.isInteger(contestNumber) && contestNumber > 0 ? contestNumber : ""}" /></label>
      <label class="field"><span>Valor efetivamente gasto</span><input name="actualCost" type="number" min="0.01" step="0.01" required placeholder="Ex.: 12,00" /></label>
    </div>
    <div class="real-bet-form-actions"><button class="button ghost" type="button" data-cancel-real-bet>Cancelar</button><button class="button primary" type="submit">Confirmar aposta</button></div>`;
  card.append(form);

  form.querySelector("[data-cancel-real-bet]").addEventListener("click", () => form.remove());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = form.querySelector("button[type=submit]");
    const data = new FormData(form);
    const gamePositions = data.getAll("gamePosition").map(Number);
    if (!gamePositions.length) {
      submit.textContent = "Selecione ao menos um jogo";
      setTimeout(() => { if (submit.isConnected) submit.textContent = "Confirmar aposta"; }, 1800);
      return;
    }
    submit.disabled = true;
    submit.textContent = "Salvando...";
    form.querySelector("[data-real-bet-error]")?.remove();
    try {
      await api("/real-bets", {
        method: "POST",
        body: JSON.stringify({
          batchId,
          contestNumber: Number(data.get("contestNumber")),
          actualCost: Number(data.get("actualCost")),
          gamePositions,
        }),
      });
      cache.delete(lottery);
      if (form.isConnected && currentView() === "games" && currentLottery() === lottery) {
        document.querySelector("#refresh-view")?.click();
      }
    } catch (error) {
      if (!form.isConnected) return;
      submit.disabled = false;
      submit.textContent = error.code === "REAL_BET_ALREADY_EXISTS" ? "Lote já marcado" : "Tentar novamente";
      const message = document.createElement("p");
      message.className = "form-note";
      message.dataset.realBetError = "true";
      message.textContent = error.message;
      form.querySelector(".real-bet-form-actions")?.insertAdjacentElement("beforebegin", message);
    }
  });
}

async function refineGames() {
  if (!root) return;
  const cards = [...root.querySelectorAll(".batch-card")];
  if (!cards.length) return;
  const lottery = currentLottery();
  let data;
  try {
    data = await load(lottery);
  } catch {
    return;
  }
  if (currentView() !== "games" || currentLottery() !== lottery) return;

  const byBatch = new Map((data.items || []).map((bet) => [bet.batchId, bet]));
  for (const card of cards) {
    if (!card.isConnected || card.dataset.realBetRefined === "true") continue;
    card.dataset.realBetRefined = "true";
    const checkButton = card.querySelector("[data-check-batch]");
    const batchId = Number(checkButton?.dataset.checkBatch);
    if (!batchId) continue;
    const bet = byBatch.get(batchId);
    const copy = card.querySelector(".batch-head-copy");
    const actions = card.querySelector(".batch-actions");

    if (bet) {
      copy?.insertAdjacentHTML("beforeend", betSummaryMarkup(bet));
      continue;
    }

    if (actions) {
      const button = document.createElement("button");
      button.className = "button compact";
      button.type = "button";
      button.textContent = "Marcar como apostado";
      button.addEventListener("click", () => openBetForm(card, batchId));
      actions.append(button);
    }
  }

  if (!root.querySelector(".real-bet-history") && data.items?.length) {
    const checkResult = root.querySelector("#check-result");
    if (checkResult) checkResult.insertAdjacentHTML("afterend", realBetHistory(data));
  }
}

async function refine() {
  const view = currentView();
  if (view === "dashboard") await refineDashboard();
  else if (view === "games") await refineGames();
}

function scheduleRefine() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(async () => {
    scheduled = false;
    await refine();
  }, 0);
}

function invalidateCurrentLottery() {
  cache.delete(currentLottery());
}

onViewRendered(scheduleRefine);
lotterySelect?.addEventListener("change", () => {
  cache.clear();
});
document.querySelector("#refresh-view")?.addEventListener("click", invalidateCurrentLottery);
window.addEventListener("loto-lab:data-synced", () => {
  cache.clear();
  scheduleRefine();
});
scheduleRefine();
