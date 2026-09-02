import { api } from "../../core/api.js";
import { escapeHtml } from "../../shared/escaping.js";
import { contestDate, gameNumbers, hitText, numberLabel } from "./formatting.js";
import { errorMessage, requiredPayload } from "./support.js";
import type { ComparisonItem, ComparisonResponse, GameBatch } from "./types.js";

function drawNumbers(item: ComparisonItem): string {
  const matched = new Set(item.matchedAnyNumbers ?? []);
  return item.numbers.map((value) => `<span class="mg2-draw-number ${matched.has(value) ? "is-used" : ""}">${numberLabel(value)}</span>`).join("");
}

function gameMarkup(batch: GameBatch, item: ComparisonItem): string {
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

function contestMarkup(batch: GameBatch, item: ComparisonItem, index: number): string {
  return `<details class="mg2-compare-contest" ${index === 0 ? "open" : ""}>
    <summary>
      <div class="mg2-compare-contest-meta"><strong>#${item.contestNumber}</strong><span>${escapeHtml(contestDate(item.date))}</span></div>
      <div class="mg2-draw-numbers">${drawNumbers(item)}</div>
      <div class="mg2-compare-hit-summary">${item.games.map((check) => `<span class="${check.hits === item.bestHits && check.hits > 0 ? "is-best" : ""}">J${check.position} · ${check.hits}/${item.numbers.length}</span>`).join("")}</div>
    </summary>
    <div class="mg2-compare-detail">
      ${item.luckyMonth ? `<p class="mg2-compare-month">Mês da Sorte sorteado: <strong>${escapeHtml(item.luckyMonth)}</strong></p>` : ""}
      ${gameMarkup(batch, item)}
    </div>
  </details>`;
}

function panelMarkup(batch: GameBatch, result: ComparisonResponse, count: number): string {
  const summary = result.summary ?? {};
  const items = result.items ?? [];
  const counts = [3, 5, 10, 20];
  return `<section class="mg2-comparison" data-mg2-comparison>
    <div class="mg2-comparison-head"><div><strong>Comparar concursos</strong><p>Veja como este mesmo lote se comporta em resultados a partir do alvo. Esta análise não altera apostas nem histórico financeiro.</p></div><button class="button ghost" type="button" data-mg2-close-comparison>Fechar</button></div>
    <div class="mg2-comparison-controls">
      <label><span>A partir do concurso</span><input type="number" min="1" step="1" value="${result.startContestNumber}" data-mg2-compare-start /></label>
      <div class="mg2-counts" role="group" aria-label="Quantidade de concursos">${counts.map((value) => `<button type="button" class="mg2-count ${count === value ? "is-active" : ""}" data-mg2-compare-count="${value}" aria-pressed="${count === value}">${value}</button>`).join("")}</div>
      <button class="button" type="button" data-mg2-compare-load>Atualizar</button>
    </div>
    ${result.scope?.note ? `<p class="mg2-comparison-note">${escapeHtml(result.scope.note)}</p>` : ""}
    ${items.length ? `<div class="mg2-comparison-summary">
        <div><span>Concursos</span><strong>${summary.contestCount ?? 0}</strong></div>
        <div><span>Melhor resultado</span><strong>${hitText(summary.bestHits)}</strong></div>
        <div><span>Melhor concurso</span><strong>${summary.bestContestNumber ? `#${summary.bestContestNumber}` : "—"}</strong></div>
        <div><span>Média do melhor jogo</span><strong>${Number(summary.averageBestHits || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong></div>
      </div>
      <div class="mg2-comparison-legend"><span><i class="is-hit"></i> acerto</span><span><i class="is-fixed"></i> núcleo fixo</span><span>Abra um concurso para ver jogo por jogo.</span></div>
      <div class="mg2-comparison-list">${items.map((item, index) => contestMarkup(batch, item, index)).join("")}</div>`
      : `<div class="mg2-comparison-empty"><strong>Nenhum resultado disponível ainda</strong><p>Não há concursos armazenados a partir de #${result.startContestNumber}. Quando novos resultados forem sincronizados, eles aparecerão aqui.</p></div>`}
  </section>`;
}

export async function loadComparison(root: HTMLElement, batch: GameBatch, count = 5, startContest?: number): Promise<void> {
  const host = root.querySelector<HTMLElement>(`[data-mg2-comparison-host="${batch.id}"]`);
  if (!host) return;
  const query = new URLSearchParams({ count: String(count) });
  if (startContest) query.set("startContest", String(startContest));
  host.innerHTML = '<div class="mg2-inline-loading">Carregando comparação...</div>';
  try {
    const result = requiredPayload(await api<ComparisonResponse>(`/game-batches/${batch.id}/comparison?${query.toString()}`), "carregar comparação do lote");
    host.innerHTML = panelMarkup(batch, result, count);
    bindPanel(root, host, batch, count);
    const trigger = root.querySelector<HTMLButtonElement>(`[data-mg2-compare="${batch.id}"]`);
    if (trigger) trigger.textContent = "Fechar comparação";
  } catch (error) {
    host.innerHTML = `<div class="mg2-inline-error"><strong>Comparação indisponível</strong><p>${escapeHtml(errorMessage(error))}</p></div>`;
  }
}

function bindPanel(root: HTMLElement, host: HTMLElement, batch: GameBatch, currentCount: number): void {
  host.querySelector<HTMLButtonElement>("[data-mg2-close-comparison]")?.addEventListener("click", () => {
    host.innerHTML = "";
    const trigger = root.querySelector<HTMLButtonElement>(`[data-mg2-compare="${batch.id}"]`);
    if (trigger) trigger.textContent = "Comparar concursos";
  });
  const readStart = (): number | undefined => Number(host.querySelector<HTMLInputElement>("[data-mg2-compare-start]")?.value || 0) || undefined;
  host.querySelectorAll<HTMLButtonElement>("[data-mg2-compare-count]").forEach((button) => button.addEventListener("click", () => {
    void loadComparison(root, batch, Number(button.dataset.mg2CompareCount), readStart());
  }));
  host.querySelector<HTMLButtonElement>("[data-mg2-compare-load]")?.addEventListener("click", () => {
    void loadComparison(root, batch, currentCount, readStart());
  });
}
