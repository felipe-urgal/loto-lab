import { escapeHtml } from "../../shared/escaping.js";

type PayoutRecord = Record<string, unknown>;

function numberList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry)) : [];
}

function percentDelta(index: number): string {
  const delta = Math.round((index - 1) * 100);
  return `${delta >= 0 ? "+" : "−"}${Math.abs(delta)}%`;
}

/** Bloco "Retorno esperado estimado" da prévia do modo Prêmio máximo; vazio para os demais modos. */
export function payoutSummaryMarkup(generatorOptions: Record<string, unknown>): string {
  const payout = generatorOptions.payout;
  if (typeof payout !== "object" || payout === null) return "";
  const report = payout as PayoutRecord;
  const evIndex = numberList(report.evIndex);
  const shareIndex = numberList(report.shareIndex);
  const average = typeof report.averageEvIndex === "number" ? report.averageEvIndex : undefined;
  const averageShare = typeof report.averageShareIndex === "number" ? report.averageShareIndex : undefined;

  let headline: string;
  let games: number[];
  if (average !== undefined) {
    headline = `Retorno esperado médio do lote: <strong>${percentDelta(average)}</strong> em relação a um jogo aleatório.`;
    games = evIndex;
  } else if (averageShare !== undefined && averageShare > 0) {
    headline = `Co-ganhadores esperados na sena: <strong>≈ ${(1 / averageShare).toFixed(1).replace(".", ",")}× menos</strong> que um jogo aleatório.`;
    games = shareIndex.map((index) => 1 / index);
  } else {
    return "";
  }
  const chips = games
    .map((index, position) => {
      const label = average !== undefined ? percentDelta(index) : `${index.toFixed(1).replace(".", ",")}×`;
      return `<li><span>Jogo ${position + 1}</span><strong>${label}</strong></li>`;
    })
    .join("");

  const age = typeof report.modelAge === "object" && report.modelAge !== null ? (report.modelAge as PayoutRecord) : undefined;
  const ageContests = typeof age?.ageContests === "number" ? age.ageContests : 0;
  const warning = age?.stale === true
    ? `<p class="g2-payout-warning" role="note">O modelo foi ajustado há ${escapeHtml(String(ageContests))} concursos. Reajuste recomendado (<code>scripts/fit*Model.mjs</code>) antes de confiar nesta estimativa.</p>`
    : "";
  const model = typeof report.model === "string"
    ? report.model
    : typeof report.popularityModel === "string"
      ? report.popularityModel
      : "";
  const fit = typeof report.fitThroughContest === "number" ? ` · ajustado até o concurso #${report.fitThroughContest}` : "";

  return `<section class="panel g2-card g2-payout" data-g2-payout aria-label="Retorno esperado estimado">
    <div class="g2-card-head"><div><strong>Retorno esperado estimado</strong><span>${escapeHtml(model)}${escapeHtml(fit)}</span></div></div>
    <p>${headline}</p>
    <ul class="g2-payout-games">${chips}</ul>
    <p class="g2-payout-note">Estimativa do modelo, não garantia: a chance de acertar não muda e o retorno total da loteria continua abaixo de 100% da arrecadação.</p>
    ${warning}
  </section>`;
}
