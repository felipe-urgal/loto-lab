import { escapeHtml } from "../../shared/escaping.js";
import { number, decimal, formatDate, structureCard, filterValidationMarkup, moverList, heatmap, cycleMarkup, associationRow } from "./helpers.js";
import type { AnalysisPayload } from "./types.js";

export function structureView(data: AnalysisPayload): string {
  const structure = data.advanced.structure;
  const metrics = structure.metrics;
  const filter = structure.methodologyFilter;
  const grid = structure.grid;
  return `<div class="a2-stack">
    <section><div class="section-head"><div><h2>Estrutura do sorteio</h2><p>O resultado atual é comparado somente aos concursos anteriores e, quando há modelo exato, à distribuição combinatória.</p></div></div>
      <div class="a2-structure-grid">
        ${structureCard("Repetidas do concurso anterior", metrics.repeated, (value) => decimal(value, 1))}
        ${structureCard("Ímpares", metrics.odd, (value) => decimal(value, 1))}
        ${structureCard("Soma", metrics.sum, (value) => decimal(value, 1))}
        ${structureCard("Faixa baixa", metrics.low, (value) => decimal(value, 1))}
        ${structureCard("Maior sequência consecutiva", metrics.longestRun, (value) => decimal(value, 1))}
        ${metrics.frame ? structureCard("Moldura · Lotofácil", metrics.frame, (value) => decimal(value, 1)) : ""}
      </div>
    </section>
    ${grid ? `<section><div class="section-head"><div><h2>Linhas e colunas</h2><p>Distribuição atual comparada à média dos concursos anteriores da Lotofácil.</p></div></div><div class="grid cols-2"><article class="panel a2-grid-profile"><strong>Linhas</strong>${grid.currentLines.map((value, index) => `<span>L${index + 1}<b>${value}</b><small>média ${decimal(grid.historicalLineMean[index])}</small></span>`).join("")}</article><article class="panel a2-grid-profile"><strong>Colunas</strong>${grid.currentColumns.map((value, index) => `<span>C${index + 1}<b>${value}</b><small>média ${decimal(grid.historicalColumnMean[index])}</small></span>`).join("")}</article></div></section>` : ""}
    <section><div class="section-head"><div><h2>Validador da estrutura metodológica</h2><p>Separa o universo do próximo sorteio da referência histórica condicionada a cada transição.</p></div></div>${filterValidationMarkup(filter)}</section>
  </div>`;
}


export function dynamicsView(data: AnalysisPayload): string {
  const advanced = data.advanced;
  const cycles = advanced.dynamics.cycles;
  const delayed = [...advanced.ranking.dynamics.items]
    .filter((item) => typeof item.delay.current === "number" && typeof item.delay.percentile === "number")
    .sort((a, b) => (b.delay.percentile ?? 0) - (a.delay.percentile ?? 0) || (b.delay.current ?? 0) - (a.delay.current ?? 0))
    .slice(0, 12);
  return `<div class="a2-stack">
    <section><div class="section-head"><div><h2>Movimento da classificação</h2><p>Variação contra o concurso de número exatamente 10 posições antes; referências ausentes não são aproximadas.</p></div></div><div class="grid cols-2"><article class="panel a2-movers"><div class="a2-panel-head"><strong>Maiores altas</strong><span>subiram na classificação</span></div>${moverList(advanced.ranking.dynamics.movers.rising, "up")}</article><article class="panel a2-movers"><div class="a2-panel-head"><strong>Maiores quedas</strong><span>caíram na classificação</span></div>${moverList(advanced.ranking.dynamics.movers.falling, "down")}</article></div></section>
    <section><div class="section-head"><div><h2>Ciclo descritivo</h2><p>Tempo necessário para o conjunto inteiro de dezenas aparecer ao menos uma vez; não é previsão de saída.</p></div></div>${cycleMarkup(cycles)}</section>
    <section><div class="section-head"><div><h2>Atraso em contexto</h2><p>Percentil alto descreve raridade histórica do atraso observado; não significa maior chance no próximo sorteio.</p></div></div><div class="panel a2-delay-list">${delayed.length ? delayed.map((item) => `<button type="button" data-a2-number="${item.number}"><strong>${number(item.number)}</strong><span>${item.delay.current} concurso(s)</span><em>percentil ${Math.round((item.delay.percentile ?? 0) * 100)}</em></button>`).join("") : '<div class="a2-empty">Histórico contínuo suficiente e com início conhecido é necessário para atrasos exatos.</div>'}</div></section>
    <section><div class="section-head"><div><h2>Mapa binário · últimos 30</h2><p>Presença/ausência por concurso para visualizar sequências, blocos e mudanças sem converter o padrão em probabilidade futura.</p></div></div><article class="panel a2-heat-panel">${heatmap(data)}</article></section>
  </div>`;
}


export function combinationsView(data: AnalysisPayload): string {
  const combos = data.advanced.combinations;
  const options = data.advanced.ranking.dynamics.items.map((item) => `<option value="${item.number}">${number(item.number)}</option>`).join("");
  const similarity = data.advanced.similarity;
  const enough = (combos.methodology.availableContests ?? 0) >= (combos.methodology.minimumContests ?? 0);
  const unavailable = `<div class="a2-empty">São necessários ao menos ${combos.methodology.minimumContests ?? 20} concursos para explorar associações com significância.</div>`;
  return `<div class="a2-stack">
    <div class="a2-warning"><strong>Exploração, não previsão</strong><span>${escapeHtml(combos.methodology.note)}</span></div>
    <section><div class="section-head"><div><h2>Explorador de duques</h2><p>Frequência conjunta observada comparada ao esperado para um par fixo sob sorteios uniformes.</p></div></div><article class="panel a2-pair-explorer">${enough ? `<div class="a2-pair-controls"><select data-a2-pair-a aria-label="Primeira dezena da dupla">${options}</select><select data-a2-pair-b aria-label="Segunda dezena da dupla">${options}</select><button class="button compact" type="button" data-a2-pair-check>Analisar dupla</button></div><div data-a2-pair-result class="a2-pair-result"></div>` : unavailable}</article></section>
    <section><div class="section-head"><div><h2>Associações que mais desviaram</h2><p>Classificação por escore-z; valor-p exato com Bonferroni aplicado à família de pares.</p></div></div>${enough ? `<div class="grid cols-2"><article class="panel a2-associations"><div class="a2-panel-head"><strong>Acima do esperado</strong><span>maior desvio positivo</span></div>${combos.highlights.positivePairs.slice(0, 8).map(associationRow).join("")}</article><article class="panel a2-associations"><div class="a2-panel-head"><strong>Abaixo do esperado</strong><span>maior desvio negativo</span></div>${combos.highlights.negativePairs.slice(0, 8).map(associationRow).join("")}</article></div>` : unavailable}</section>
    <section><div class="section-head"><div><h2>Trincas exploratórias</h2><p>Binomial exato com Bonferroni aplicado separadamente à família de ${combos.methodology.tripleComparisons.toLocaleString("pt-BR")} trincas possíveis.</p></div></div><article class="panel a2-associations">${enough ? (combos.highlights.positiveTriples.slice(0, 10).map(associationRow).join("") || '<div class="a2-empty">Nenhuma trinca observada.</div>') : unavailable}</article></section>
    <section><div class="section-head"><div><h2>Concursos mais parecidos com o atual</h2><p>Primeiro por quantidade de dezenas em comum; empate resolvido por distância estrutural.</p></div></div><div class="panel a2-similarity">${(similarity.closest || []).map((item) => `<div><strong>#${item.contest}</strong><span>${formatDate(item.date)}</span><em>${item.overlap} em comum</em><small>${item.sharedNumbers.map(number).join(" · ") || "nenhuma"}</small></div>`).join("") || '<div class="a2-empty">Sem histórico suficiente.</div>'}</div></section>
  </div>`;
}

