import { escapeHtml } from "../../shared/escaping.js";
import { batchMeta, gameNumbers, hitText, money } from "./formatting.js";
import type { Game, GameBatch, MyGamesFilter, RealBet, RealBetGame } from "./types.js";

type StatusTone = "muted" | "neutral" | "success" | "warning";

type RenderState = {
  filter: MyGamesFilter;
  query: string;
  expandedBatchId: number | null;
};

export function latestBetByBatch(items: RealBet[]): Map<number, RealBet> {
  const map = new Map<number, RealBet>();
  for (const bet of items) {
    if (!map.has(bet.batchId)) map.set(bet.batchId, bet);
  }
  return map;
}

function statusFor(batch: GameBatch, bet: RealBet | undefined): { label: string; tone: StatusTone } {
  if (batch.archivedAt) return { label: "Oculto", tone: "muted" };
  if (!bet) return { label: "Gerado", tone: "neutral" };
  if (bet.status === "checked") return { label: "Conferido", tone: "success" };
  if (bet.status === "awaiting_result") return { label: "Aguardando resultado", tone: "warning" };
  return { label: "Apostado", tone: "success" };
}

function gameRow(game: Game, index: number): string {
  return `<div class="mg2-game">
    <div class="mg2-game-index">Jogo ${index + 1}</div>
    <div class="mg2-numbers">${gameNumbers(game)}</div>
    ${game.luckyMonth ? `<span class="mg2-month">${escapeHtml(game.luckyMonth)}</span>` : ""}
  </div>`;
}

function batchTrailing(batch: GameBatch, bet: RealBet | undefined): string {
  if (batch.archivedAt) {
    return `<div class="mg2-trailing-copy"><strong>Fora da lista principal</strong><span>histórico preservado</span></div>`;
  }
  if (!bet) {
    return `<div class="mg2-trailing-copy"><strong>${batch.games.length} jogo${batch.games.length === 1 ? "" : "s"}</strong><span>somente gerado</span></div>`;
  }
  if (bet.status === "checked") {
    if (bet.netResult === undefined || bet.netResult === null) {
      return `<div class="mg2-trailing-copy"><strong>Conferido</strong><span>financeiro indisponível</span></div>`;
    }
    const result = bet.netResult;
    return `<div class="mg2-trailing-copy"><strong class="${result >= 0 ? "is-positive" : "is-negative"}">${money(result)}</strong><span>resultado líquido</span></div>`;
  }
  return `<div class="mg2-trailing-copy"><strong>${money(bet.actualCost)}</strong><span>valor apostado</span></div>`;
}

function officialBetMarkup(bet: RealBet | undefined): string {
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

  const checkedGames = (bet.games ?? []).filter(
    (item): item is RealBetGame & { checkResult: NonNullable<RealBetGame["checkResult"]> } => item.checkResult != null,
  );
  const best = checkedGames.length ? Math.max(...checkedGames.map((item) => item.checkResult.hits || 0)) : 0;
  const prizeKnown = bet.totalPrizeValue !== undefined && bet.totalPrizeValue !== null;
  const netKnown = bet.netResult !== undefined && bet.netResult !== null;
  const netClass = netKnown ? (bet.netResult! >= 0 ? "is-positive" : "is-negative") : "";
  return `<section class="mg2-official" data-mg2-official>
    <div class="mg2-official-head">
      <div><strong>Resultado da aposta · concurso #${bet.contestNumber}</strong><p>${checkedGames.length} jogo${checkedGames.length === 1 ? "" : "s"} efetivamente apostado${checkedGames.length === 1 ? "" : "s"}</p></div>
      <span class="mg2-status is-success">Conferência oficial</span>
    </div>
    <div class="mg2-result-metrics">
      <div><span>Melhor jogo</span><strong>${hitText(best)}</strong></div>
      <div><span>Custo real</span><strong>${money(bet.actualCost)}</strong></div>
      <div><span>Prêmio</span><strong>${prizeKnown ? money(bet.totalPrizeValue) : "—"}</strong></div>
      <div><span>Resultado</span><strong class="${netClass}">${netKnown ? money(bet.netResult) : "—"}</strong></div>
    </div>
    ${!prizeKnown || !netKnown ? `<p class="mg2-form-note">O concurso foi conferido, mas o rateio financeiro ainda não está disponível na base.</p>` : ""}
    <details class="mg2-result-details">
      <summary>Ver jogos apostados</summary>
      <div class="mg2-official-games">
        ${checkedGames.map((item) => `<div class="mg2-official-game">
          <div class="mg2-official-game-head"><strong>Jogo ${item.batchPosition}</strong><span>${hitText(item.checkResult.hits)} · ${item.prizeValue === undefined || item.prizeValue === null ? "—" : money(item.prizeValue)}</span></div>
          <div class="mg2-numbers">${gameNumbers(item.game, { matchedNumbers: item.checkResult.matchedNumbers })}</div>
          ${item.game.luckyMonth ? `<span class="mg2-month">Mês da Sorte: ${escapeHtml(item.game.luckyMonth)}${item.checkResult.luckyMonthHit ? " · acertou" : ""}</span>` : ""}
        </div>`).join("")}
      </div>
    </details>
  </section>`;
}

function batchMarkup(batch: GameBatch, bet: RealBet | undefined, state: RenderState): string {
  const status = statusFor(batch, bet);
  const expanded = state.expandedBatchId === batch.id;
  return `<article class="mg2-batch ${expanded ? "is-expanded" : ""}" data-mg2-batch="${batch.id}">
    <button class="mg2-summary" type="button" data-mg2-toggle="${batch.id}" aria-expanded="${expanded}" aria-controls="mg2-detail-${batch.id}">
      <div class="mg2-summary-main">
        <div class="mg2-title-line"><strong>Lote #${batch.id}</strong><span class="mg2-status is-${status.tone}">${status.label}</span></div>
        <p>${escapeHtml(batchMeta(batch))}</p>
      </div>
      <div class="mg2-summary-end">${batchTrailing(batch, bet)}<span class="mg2-chevron" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m8 10 4 4 4-4"/></svg></span></div>
    </button>
    <div class="mg2-detail" id="mg2-detail-${batch.id}" ${expanded ? "" : "hidden"}>
      <div class="mg2-games">${batch.games.map(gameRow).join("")}</div>
      ${officialBetMarkup(bet)}
      <div class="mg2-detail-actions">
        ${batch.archivedAt
          ? `<button class="button" type="button" data-mg2-show="${batch.id}">Mostrar novamente</button>`
          : `${bet ? "" : `<button class="button primary" type="button" data-mg2-mark-bet="${batch.id}">Marcar como apostado</button>`}
          <button class="button" type="button" data-mg2-compare="${batch.id}">Comparar concursos</button>
          <button class="button ghost mg2-hide-action" type="button" data-mg2-hide="${batch.id}">Ocultar lote</button>`}
      </div>
      <div class="mg2-inline-host" data-mg2-inline="${batch.id}"></div>
      <div class="mg2-comparison-host" data-mg2-comparison-host="${batch.id}"></div>
    </div>
  </article>`;
}

function renderToolbar(items: GameBatch[], betByBatch: Map<number, RealBet>, state: RenderState): string {
  const visible = items.filter((batch) => !batch.archivedAt);
  const hidden = items.filter((batch) => batch.archivedAt);
  const bets = visible.filter((batch) => betByBatch.has(batch.id));
  const generated = visible.filter((batch) => !betByBatch.has(batch.id));
  const filters: Array<[MyGamesFilter, string, number]> = [
    ["visible", "Todos", visible.length],
    ["bets", "Apostados", bets.length],
    ["generated", "Gerados", generated.length],
    ["hidden", "Ocultos", hidden.length],
  ];
  return `<div class="mg2-toolbar">
    <div class="mg2-filters" role="group" aria-label="Filtrar lotes">
      ${filters.map(([key, label, count]) => `<button class="mg2-filter ${state.filter === key ? "is-active" : ""}" type="button" data-mg2-filter="${key}" aria-pressed="${state.filter === key}">${label}<span>${count}</span></button>`).join("")}
    </div>
    <label class="mg2-search"><span class="sr-only">Buscar lote ou concurso</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input type="search" value="${escapeHtml(state.query)}" placeholder="Buscar lote ou concurso" data-mg2-search /></label>
  </div>`;
}

function visibleItems(items: GameBatch[], betByBatch: Map<number, RealBet>, state: RenderState): GameBatch[] {
  const normalized = state.query.trim().toLowerCase();
  return items.filter((batch) => {
    const bet = betByBatch.get(batch.id);
    const filterMatch = state.filter === "hidden"
      ? Boolean(batch.archivedAt)
      : !batch.archivedAt && (state.filter === "visible" || (state.filter === "bets" && Boolean(bet)) || (state.filter === "generated" && !bet));
    if (!filterMatch) return false;
    if (!normalized) return true;
    return `${batch.id} ${batch.targetContestNumber ?? ""} ${bet?.contestNumber ?? ""}`.toLowerCase().includes(normalized);
  });
}

export function renderMyGamesMarkup(items: GameBatch[], betByBatch: Map<number, RealBet>, state: RenderState): string {
  const shown = visibleItems(items, betByBatch, state);
  const emptyCopy = state.filter === "hidden" ? "Nenhum lote foi ocultado." : "Nenhum lote corresponde a este filtro.";
  return `<div class="mg2-shell" data-my-games-v2>
    ${renderToolbar(items, betByBatch, state)}
    <div class="mg2-list" data-mg2-list>
      ${shown.length ? shown.map((batch) => batchMarkup(batch, betByBatch.get(batch.id), state)).join("") : `<div class="mg2-empty"><strong>Nada por aqui</strong><p>${emptyCopy}</p></div>`}
    </div>
  </div>`;
}
