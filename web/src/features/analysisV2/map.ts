import { number, decimal, percent, trendCopy, tierClass, metricCard, mapFilterLabel, movementBadge, delayCopy, TIER_LABELS, type AnalysisMapFilter } from "./helpers.js";
import type { AnalysisNumberItem, AnalysisPayload } from "./types.js";

export function mapFilterMarkup(activeMapFilter: AnalysisMapFilter): string {
  const filters: AnalysisMapFilter[] = ["all", "strong", "balanced", "cold"];
  return `<div class="a2-map-filters" aria-label="Filtrar dezenas por grupo">${filters.map((filter) => `
    <button type="button" data-a2-map-filter="${filter}" aria-pressed="${activeMapFilter === filter}" class="${activeMapFilter === filter ? "is-active" : ""}">${mapFilterLabel(filter)}</button>
  `).join("")}</div>`;
}


export function numberMapView(data: AnalysisPayload, activeMapFilter: AnalysisMapFilter): string {
  const items = [...data.advanced.ranking.dynamics.items].sort((a, b) => a.number - b.number);
  const ranked = [...items].sort((a, b) => a.rank - b.rank);
  const options = ranked.map((item) => `<option value="${item.number}">${number(item.number)} · #${item.rank}</option>`).join("");
  return `<section class="a2-map-section" aria-labelledby="a2-map-title">
    <div class="a2-map-toolbar">
      <div><h2 id="a2-map-title">Dezenas</h2><p>Grupos são relativos ao histórico analisado e não alteram a chance matemática do próximo sorteio.</p></div>
      ${mapFilterMarkup(activeMapFilter)}
    </div>
    <div class="a2-map-legend" aria-label="Legenda dos grupos">
      <span class="is-strong">Forte</span><span class="is-balanced">Intermediária</span><span class="is-cold">Fria</span>
    </div>
    <div class="a2-number-map" data-a2-number-map>
      ${items.map((item) => `<button class="a2-map-number ${tierClass(item.tier)}" type="button" data-a2-number="${item.number}" data-a2-tier="${item.tier}" aria-label="Dezena ${number(item.number)}, ${TIER_LABELS[item.tier]}, posição ${item.rank}">
        <strong>${number(item.number)}</strong><span>${TIER_LABELS[item.tier]}</span>
      </button>`).join("")}
    </div>
    <article class="a2-compare-panel">
      <div class="a2-panel-head"><div><strong>Comparar dezenas</strong><span>Compare indicadores sem sair do mapa.</span></div></div>
      <div class="a2-compare-controls"><select data-a2-compare-a aria-label="Primeira dezena">${options}</select><select data-a2-compare-b aria-label="Segunda dezena">${options}</select><button class="button compact" type="button" data-a2-compare>Comparar</button></div>
      <div data-a2-compare-result></div>
    </article>
  </section>`;
}


export function technicalRankingView(data: AnalysisPayload): string {
  const dynamics = [...data.advanced.ranking.dynamics.items].sort((a, b) => a.rank - b.rank);
  return `<div class="a2-stack">
    <section>
      <div class="section-head"><div><h2>Classificação auditável</h2><p>Movimento usa o concurso exatamente 10 posições antes; referências ausentes não são aproximadas.</p></div></div>
      <div class="panel table-wrap"><table class="a2-table"><thead><tr><th>#</th><th>Dezena</th><th>Grupo</th><th>Pontuação</th><th>Mov. 10</th><th>Tendência</th><th>Robustez</th><th>Atraso</th></tr></thead><tbody>${dynamics.map((item) => `
        <tr data-a2-number="${item.number}" tabindex="0"><td><strong>${item.rank}</strong></td><td><strong>${number(item.number)}</strong></td><td><span class="a2-tier-chip ${tierClass(item.tier)}">${TIER_LABELS[item.tier]}</span></td><td>${decimal(item.score)}</td><td>${movementBadge(item.movements.ten)}</td><td>${trendCopy(item.trend)}</td><td>${percent(item.weightRobustness.tierStability)}</td><td>${delayCopy(item)}</td></tr>`).join("")}</tbody></table></div>
    </section>
  </div>`;
}


export function numberDetailMarkup(item: AnalysisNumberItem): string {
  const contributions = Object.entries(item.contribution);
  const total = contributions.reduce((sum, [, value]) => sum + value, 0) || 1;
  const delay = item.delay.current === null ? "—" : item.delay.current;
  const delayDetail = item.delay.percentile === null ? "histórico contínuo insuficiente" : `percentil ${Math.round(item.delay.percentile * 100)}`;
  const streak = item.streak === null ? "—" : item.streak;
  return `<div class="a2-detail-head"><div><span>Dezena ${number(item.number)}</span><h2>#${item.rank} · ${decimal(item.score)}</h2><div><span class="a2-tier-chip ${tierClass(item.tier)}">${TIER_LABELS[item.tier]}</span><span>${trendCopy(item.trend)}</span></div></div><button type="button" data-a2-detail-close aria-label="Fechar detalhe">×</button></div>
    <div class="a2-detail-grid">${metricCard("Movimento 10", item.movements.ten === null ? "—" : `${item.movements.ten > 0 ? "+" : ""}${item.movements.ten}`, "posições")}${metricCard("Robustez", percent(item.weightRobustness.tierStability), item.weightRobustness.scenarioCount ? `posição #${item.weightRobustness.rankRange[0]}–#${item.weightRobustness.rankRange[1]}` : "sem histórico")}${metricCard("Atraso", delay, delayDetail)}${metricCard("Sequência atual", streak, "concursos consecutivos presente")}</div>
    <section class="a2-detail-section"><strong>Decomposição da pontuação</strong><p>Quanto cada janela contribui para a pontuação final com os pesos atuais.</p><div class="a2-contributions">${contributions.map(([key, value]) => `<div><span>${key}</span><i><b style="width:${Math.max(2, (value / total) * 100)}%"></b></i><strong>${decimal(value)}</strong></div>`).join("")}</div></section>
    <section class="a2-detail-section"><strong>Frequência observada</strong><div class="a2-frequency-grid">${Object.entries(item.frequency).map(([key, value]) => `<span><small>${key}</small><strong>${value.count}</strong><em>${percent(value.rate)}</em></span>`).join("")}</div></section>
    <section class="a2-detail-section"><strong>Posição no tempo</strong><div class="a2-frequency-grid"><span><small>1 concurso</small><strong>${item.previousRanks.one ? `#${item.previousRanks.one}` : "—"}</strong></span><span><small>5 concursos</small><strong>${item.previousRanks.five ? `#${item.previousRanks.five}` : "—"}</strong></span><span><small>10 concursos</small><strong>${item.previousRanks.ten ? `#${item.previousRanks.ten}` : "—"}</strong></span><span><small>20 concursos</small><strong>${item.previousRanks.twenty ? `#${item.previousRanks.twenty}` : "—"}</strong></span></div></section>
    <div class="a2-detail-warning">Atraso e frequência são descrições históricas. Eles não aumentam nem reduzem a chance matemática individual desta dezena no próximo sorteio.</div>`;
}

