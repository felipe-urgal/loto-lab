import { api, escapeHtml, onViewRendered } from "./runtime.js";

const root = document.querySelector("#content");
const lotterySelect = document.querySelector("#lottery-select");
const viewSubtitle = document.querySelector("#view-subtitle");
const ACTIVE_TAB_KEY = "loto-lab:analysis-v2-tab";
const TABS = ["ranking", "structure", "dynamics", "combinations", "validation"];
const TAB_LABELS = {
  ranking: "Ranking",
  structure: "Estrutura",
  dynamics: "Dinâmica",
  combinations: "Combinações",
  validation: "Validação",
};
const TIER_LABELS = { strong: "Fortes", balanced: "Intermediárias", cold: "Frias" };
let renderToken = 0;
let currentData;
let detailReturnFocus = null;
const savedTab = localStorage.getItem(ACTIVE_TAB_KEY);
let activeTab = TABS.includes(savedTab) ? savedTab : "ranking";

function currentView() {
  return location.hash.replace("#", "") || "dashboard";
}

function currentLottery() {
  return lotterySelect?.value || "mega-sena";
}

function number(value) {
  return String(value).padStart(2, "0");
}

function decimal(value, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits).replace(".", ",");
}

function percent(value, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits).replace(".", ",")}%`;
}

function signed(value, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value === 0) return `0${suffix}`;
  return `${value > 0 ? "+" : ""}${decimal(value, Math.abs(value) < 1 ? 2 : 1)}${suffix}`;
}

function formatDate(value) {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function evidenceCopy(level) {
  if (level === "moderate") return "sinal após correção";
  if (level === "weak") return "sinal fraco";
  return "sem evidência relevante";
}

function trendCopy(trend) {
  if (trend === "rising") return "Em alta";
  if (trend === "falling") return "Em queda";
  if (trend === "stable") return "Estável";
  return "Sem histórico suficiente";
}

function tierClass(tier) {
  return tier === "strong" ? "is-strong" : tier === "balanced" ? "is-balanced" : "is-cold";
}

function metricCard(label, value, detail, tone = "") {
  return `<article class="panel a2-metric"><span>${escapeHtml(label)}</span><strong class="${tone}">${value}</strong><small>${escapeHtml(detail || "")}</small></article>`;
}

function tabsMarkup() {
  return `<div class="a2-tabs" role="tablist" aria-label="Modos de análise">${TABS.map((tab) => `
    <button type="button" role="tab" id="a2-tab-${tab}" aria-controls="a2-view" tabindex="${activeTab === tab ? "0" : "-1"}" data-a2-tab="${tab}" class="${activeTab === tab ? "is-active" : ""}" aria-selected="${activeTab === tab}">${TAB_LABELS[tab]}</button>
  `).join("")}</div>`;
}

function qualityWarning(advanced) {
  const quality = advanced.dataQuality;
  if (!quality || quality.continuous) return "";
  const latestSegment = quality.latestContinuousContests ?? 0;
  return `<div class="a2-warning a2-quality-warning"><strong>Histórico com lacunas</strong><span>${quality.missingContestCount} concurso(s) ausente(s). Métricas sequenciais ignoram transições incompletas e a validação usa somente o trecho contínuo mais recente (${latestSegment} concursos).</span></div>`;
}

function shellMarkup(data) {
  const advanced = data.advanced;
  const latest = advanced.latestContest;
  const tiers = advanced.ranking.tiers;
  return `<div class="a2-shell">
    <div class="a2-summary grid cols-4">
      ${metricCard("Concurso de referência", latest ? `#${latest.number}` : "—", latest ? formatDate(latest.date) : "Sem histórico")}
      ${metricCard("Fortes", tiers.strong.length, "grupo superior do ranking", "positive")}
      ${metricCard("Intermediárias", tiers.balanced.length, "faixa central", "warning")}
      ${metricCard("Frias", tiers.cold.length, "grupo inferior do ranking")}
    </div>
    <div class="a2-principle"><strong>Observado × esperado</strong><span>${escapeHtml(advanced.model.disclaimer)}</span></div>
    ${qualityWarning(advanced)}
    ${tabsMarkup()}
    <section id="a2-view" role="tabpanel" aria-labelledby="a2-tab-${activeTab}"></section>
    <aside class="a2-detail" id="a2-detail" hidden role="dialog" aria-modal="true" aria-label="Detalhe da dezena" tabindex="-1"></aside>
  </div>`;
}

function ballList(numbers, tier) {
  return numbers.map((value) => `<button class="a2-ball ${tierClass(tier)}" type="button" data-a2-number="${value}" aria-label="Abrir detalhe da dezena ${number(value)}">${number(value)}</button>`).join("");
}

function movementBadge(value) {
  if (value === null || value === undefined) return '<span class="a2-move">—</span>';
  const className = value > 0 ? "positive" : value < 0 ? "negative" : "";
  return `<span class="a2-move ${className}">${value > 0 ? "↑" : value < 0 ? "↓" : "→"} ${Math.abs(value)}</span>`;
}

function delayCopy(item) {
  return item.delay?.current === null || item.delay?.current === undefined
    ? "—"
    : `${item.delay.current} concurso(s)`;
}

function rankingView(data) {
  const advanced = data.advanced;
  const dynamics = [...advanced.ranking.dynamics.items].sort((a, b) => a.rank - b.rank);
  const tierSections = ["strong", "balanced", "cold"].map((tier) => `
    <article class="panel a2-tier-panel">
      <div class="a2-panel-head"><div><strong>${TIER_LABELS[tier]}</strong><span>${tier === "strong" ? "maior score combinado" : tier === "balanced" ? "faixa central" : "menor score combinado"}</span></div><small>${advanced.ranking.tiers[tier].length} dezenas</small></div>
      <div class="a2-ball-cloud">${ballList(advanced.ranking.tiers[tier], tier)}</div>
    </article>`).join("");

  const options = dynamics.map((item) => `<option value="${item.number}">${number(item.number)} · #${item.rank}</option>`).join("");
  return `<div class="a2-stack">
    <section><div class="section-head"><div><h2>Classificação das dezenas</h2><p>Clique em uma dezena para abrir score, frequência, atraso, tendência e robustez.</p></div></div><div class="a2-tier-list">${tierSections}</div></section>
    <section class="panel a2-compare-panel">
      <div class="a2-panel-head"><div><strong>Comparar dezenas</strong><span>Entenda por que duas dezenas ocupam posições diferentes.</span></div></div>
      <div class="a2-compare-controls"><select data-a2-compare-a aria-label="Primeira dezena">${options}</select><select data-a2-compare-b aria-label="Segunda dezena">${options}</select><button class="button compact" type="button" data-a2-compare>Comparar</button></div>
      <div data-a2-compare-result></div>
    </section>
    <section><div class="section-head"><div><h2>Ranking auditável</h2><p>Movimento usa a posição de 10 concursos atrás; robustez perturba todos os pesos em ±10%.</p></div></div>
      <div class="panel table-wrap"><table class="a2-table"><thead><tr><th>#</th><th>Dezena</th><th>Grupo</th><th>Score</th><th>Mov. 10</th><th>Tendência</th><th>Robustez</th><th>Atraso</th></tr></thead><tbody>${dynamics.map((item) => `
        <tr data-a2-number="${item.number}" tabindex="0"><td><strong>${item.rank}</strong></td><td><strong>${number(item.number)}</strong></td><td><span class="a2-tier-chip ${tierClass(item.tier)}">${TIER_LABELS[item.tier]}</span></td><td>${decimal(item.score)}</td><td>${movementBadge(item.movements.ten)}</td><td>${trendCopy(item.trend)}</td><td>${percent(item.weightRobustness.tierStability)}</td><td>${delayCopy(item)}</td></tr>`).join("")}</tbody></table></div>
    </section>
  </div>`;
}

function theoreticalBars(metric) {
  const points = metric?.theoreticalDistribution || [];
  if (!points.length) return "";
  const max = Math.max(...points.map((point) => point.probability), 0.0001);
  return `<div class="a2-distribution" aria-label="Distribuição combinatória">${points.map((point) => `
    <div class="a2-dist-column"><div class="a2-dist-bar"><i style="height:${Math.max(3, (point.probability / max) * 100)}%"></i></div><strong>${point.value}</strong><small>${percent(point.probability, 0)}</small></div>`).join("")}</div>`;
}

function structureCard(label, metric, formatter = decimal) {
  const current = metric?.current;
  const observed = metric?.observed;
  return `<article class="panel a2-structure-card">
    <div class="a2-structure-title"><strong>${escapeHtml(label)}</strong>${metric?.percentile !== undefined ? `<span>percentil ${Math.round(metric.percentile * 100)}</span>` : ""}</div>
    <div class="a2-structure-current">${current === null || current === undefined ? "—" : formatter(current)}</div>
    <div class="a2-observed-expected">
      <span><small>observado · média</small><strong>${observed ? formatter(observed.mean) : "—"}</strong></span>
      <span><small>esperado · matemática</small><strong>${metric?.expectedMean !== undefined ? formatter(metric.expectedMean) : "descritivo"}</strong></span>
      <span><small>diferença atual</small><strong>${metric?.deviationFromExpected !== undefined ? signed(metric.deviationFromExpected) : "—"}</strong></span>
    </div>
    ${theoreticalBars(metric)}
  </article>`;
}

function filterValidationMarkup(filter) {
  const exact = filter.exactUniverse;
  const historical = filter.historical;
  const difference = exact && typeof historical.coverage === "number"
    ? (historical.coverage - exact.coverage) * 100
    : null;
  return `<article class="panel a2-filter-validation">
    <div class="a2-filter-rules"><span>Repetidas <strong>${filter.rules.repeated.min}–${filter.rules.repeated.max}</strong>${filter.rules.repeated.preferredMin !== undefined ? `<small>preferencial ${filter.rules.repeated.preferredMin}–${filter.rules.repeated.preferredMax}</small>` : ""}</span><span>Ímpares <strong>${filter.rules.odd.min}–${filter.rules.odd.max}</strong></span></div>
    <div class="a2-filter-numbers">
      <span><small>Universo que passa</small><strong>${exact ? percent(exact.coverage) : "—"}</strong><em>${exact ? `${exact.passing.toLocaleString("pt-BR")} / ${exact.total.toLocaleString("pt-BR")}` : "sem concurso de referência"}</em></span>
      <span><small>Histórico que passou</small><strong>${percent(historical.coverage)}</strong><em>${historical.total ? `${historical.passing.toLocaleString("pt-BR")} / ${historical.total.toLocaleString("pt-BR")}` : "sem transições contínuas"}</em></span>
      <span><small>Diferença</small><strong>${signed(difference, " p.p.")}</strong><em>histórico − universo</em></span>
    </div>
    <p>${escapeHtml(filter.note)}</p>
  </article>`;
}

function structureView(data) {
  const structure = data.advanced.structure;
  const metrics = structure.metrics;
  const filter = structure.methodologyFilter;
  const grid = structure.grid;
  return `<div class="a2-stack">
    <section><div class="section-head"><div><h2>Estrutura do sorteio</h2><p>O resultado atual é comparado ao histórico e, quando há modelo exato, à distribuição combinatória.</p></div></div>
      <div class="a2-structure-grid">
        ${structureCard("Repetidas do concurso anterior", metrics.repeated, (value) => decimal(value, 1))}
        ${structureCard("Ímpares", metrics.odd, (value) => decimal(value, 1))}
        ${structureCard("Soma", metrics.sum, (value) => decimal(value, 1))}
        ${structureCard("Faixa baixa", metrics.low, (value) => decimal(value, 1))}
        ${structureCard("Maior sequência consecutiva", metrics.longestRun, (value) => decimal(value, 1))}
        ${metrics.frame ? structureCard("Moldura · Lotofácil", metrics.frame, (value) => decimal(value, 1)) : ""}
      </div>
    </section>
    ${grid ? `<section><div class="section-head"><div><h2>Linhas e colunas</h2><p>Distribuição atual comparada à média histórica da Lotofácil.</p></div></div><div class="grid cols-2"><article class="panel a2-grid-profile"><strong>Linhas</strong>${grid.currentLines.map((value, index) => `<span>L${index + 1}<b>${value}</b><small>média ${decimal(grid.historicalLineMean[index])}</small></span>`).join("")}</article><article class="panel a2-grid-profile"><strong>Colunas</strong>${grid.currentColumns.map((value, index) => `<span>C${index + 1}<b>${value}</b><small>média ${decimal(grid.historicalColumnMean[index])}</small></span>`).join("")}</article></div></section>` : ""}
    <section><div class="section-head"><div><h2>Validador da estrutura metodológica</h2><p>Quanto as regras explícitas de repetição + paridade reduzem o universo e quanto preservaram resultados históricos.</p></div></div>${filterValidationMarkup(filter)}</section>
  </div>`;
}

function moverList(items, direction) {
  if (!items?.length) return '<div class="a2-empty">Histórico insuficiente.</div>';
  return `<div class="a2-mover-list">${items.map((item) => `<button type="button" data-a2-number="${item.number}"><strong>${number(item.number)}</strong><span>#${item.rank}</span><em class="${direction === "up" ? "positive" : "negative"}">${direction === "up" ? "↑" : "↓"}${Math.abs(item.movement)}</em></button>`).join("")}</div>`;
}

function heatmap(data) {
  const rows = data.advanced.dynamics.heatmap || [];
  if (!rows.length) return '<div class="a2-empty">Sem concursos suficientes.</div>';
  const universe = [...data.advanced.ranking.dynamics.items]
    .map((item) => item.number)
    .sort((a, b) => a - b);
  const columns = `54px repeat(${universe.length}, 18px)`;
  return `<div class="a2-heatmap-wrap"><div class="a2-heatmap" style="grid-template-columns:${columns}"><div class="a2-heat-corner">#</div>${universe.map((value) => `<div class="a2-heat-head">${number(value)}</div>`).join("")}${[...rows].reverse().map((row) => { const set = new Set(row.numbers); return `<div class="a2-heat-contest">${row.contest}</div>${universe.map((value) => `<div class="a2-heat-cell ${set.has(value) ? "is-hit" : ""}" title="#${row.contest} · ${number(value)}"></div>`).join("")}`; }).join("")}</div></div>`;
}

function cycleMarkup(cycles) {
  if (!cycles.available) {
    return '<article class="panel a2-cycle"><div class="a2-empty">O ciclo atual cruza uma lacuna do histórico e, por isso, não é exibido como uma medida exata.</div></article>';
  }
  return `<article class="panel a2-cycle"><div>${metricCard("Ciclo atual", cycles.currentLength, `${cycles.seen} dezenas já vistas`)}</div><div class="a2-cycle-copy"><strong>${cycles.missing.length ? `${cycles.missing.length} ainda não vistas` : "ciclo recém-completado"}</strong><div class="a2-ball-cloud">${cycles.missing.map((value) => `<button type="button" data-a2-number="${value}" class="a2-ball">${number(value)}</button>`).join("")}</div><small>Média histórica de duração: ${cycles.historicalLength ? decimal(cycles.historicalLength.mean) : "—"} concursos · ${cycles.completedCount} ciclo(s) completos.</small></div></article>`;
}

function dynamicsView(data) {
  const advanced = data.advanced;
  const cycles = advanced.dynamics.cycles;
  const delayed = [...advanced.ranking.dynamics.items]
    .filter((item) => typeof item.delay?.current === "number" && typeof item.delay?.percentile === "number")
    .sort((a, b) => b.delay.percentile - a.delay.percentile || b.delay.current - a.delay.current)
    .slice(0, 12);
  return `<div class="a2-stack">
    <section><div class="section-head"><div><h2>Movimento do ranking</h2><p>Variação entre a posição atual e a posição de 10 concursos atrás.</p></div></div><div class="grid cols-2"><article class="panel a2-movers"><div class="a2-panel-head"><strong>Maiores altas</strong><span>subiram no ranking</span></div>${moverList(advanced.ranking.dynamics.movers.rising, "up")}</article><article class="panel a2-movers"><div class="a2-panel-head"><strong>Maiores quedas</strong><span>caíram no ranking</span></div>${moverList(advanced.ranking.dynamics.movers.falling, "down")}</article></div></section>
    <section><div class="section-head"><div><h2>Ciclo descritivo</h2><p>Tempo necessário para o conjunto inteiro de dezenas aparecer ao menos uma vez; não é previsão de saída.</p></div></div>${cycleMarkup(cycles)}</section>
    <section><div class="section-head"><div><h2>Atraso em contexto</h2><p>Percentil alto significa que o atraso atual foi pouco frequente no histórico contínuo daquela própria dezena; não significa maior chance no próximo sorteio.</p></div></div><div class="panel a2-delay-list">${delayed.length ? delayed.map((item) => `<button type="button" data-a2-number="${item.number}"><strong>${number(item.number)}</strong><span>${item.delay.current} concurso(s)</span><em>percentil ${Math.round(item.delay.percentile * 100)}</em></button>`).join("") : '<div class="a2-empty">Histórico contínuo insuficiente para calcular atrasos exatos.</div>'}</div></section>
    <section><div class="section-head"><div><h2>Mapa binário · últimos 30</h2><p>Presença/ausência por concurso para visualizar sequências, blocos e mudanças sem converter o padrão em probabilidade futura.</p></div></div><article class="panel a2-heat-panel">${heatmap(data)}</article></section>
  </div>`;
}

function associationRow(item) {
  return `<div class="a2-association-row"><strong>${item.numbers.map(number).join(" · ")}</strong><span>${item.observed} observadas</span><span>${decimal(item.expected)} esperadas</span><span>lift ${decimal(item.lift, 2)}×</span><em class="evidence-${item.evidence}">${evidenceCopy(item.evidence)}</em></div>`;
}

function combinationsView(data) {
  const combos = data.advanced.combinations;
  const options = data.advanced.ranking.dynamics.items.map((item) => `<option value="${item.number}">${number(item.number)}</option>`).join("");
  const similarity = data.advanced.similarity;
  return `<div class="a2-stack">
    <div class="a2-warning"><strong>Exploração, não previsão</strong><span>${escapeHtml(combos.methodology.note)}</span></div>
    <section><div class="section-head"><div><h2>Explorador de duques</h2><p>Frequência conjunta observada comparada ao esperado para um par fixo sob sorteios uniformes.</p></div></div><article class="panel a2-pair-explorer"><div class="a2-pair-controls"><select data-a2-pair-a aria-label="Primeira dezena da dupla">${options}</select><select data-a2-pair-b aria-label="Segunda dezena da dupla">${options}</select><button class="button compact" type="button" data-a2-pair-check>Analisar dupla</button></div><div data-a2-pair-result class="a2-pair-result"></div></article></section>
    <section><div class="section-head"><div><h2>Associações que mais desviaram</h2><p>Ranking por z-score; evidência usa p-value binomial exato ajustado por ${combos.methodology.pairComparisons.toLocaleString("pt-BR")} pares testados.</p></div></div><div class="grid cols-2"><article class="panel a2-associations"><div class="a2-panel-head"><strong>Acima do esperado</strong><span>maior desvio positivo</span></div>${combos.highlights.positivePairs.slice(0, 8).map(associationRow).join("")}</article><article class="panel a2-associations"><div class="a2-panel-head"><strong>Abaixo do esperado</strong><span>maior desvio negativo</span></div>${combos.highlights.negativePairs.slice(0, 8).map(associationRow).join("")}</article></div></section>
    <section><div class="section-head"><div><h2>Trincas exploratórias</h2><p>As maiores ocorrências relativas usam binomial exato e correção sobre ${combos.methodology.tripleComparisons.toLocaleString("pt-BR")} trincas possíveis.</p></div></div><article class="panel a2-associations">${combos.highlights.positiveTriples.slice(0, 10).map(associationRow).join("") || '<div class="a2-empty">Sem histórico suficiente.</div>'}</article></section>
    <section><div class="section-head"><div><h2>Concursos mais parecidos com o atual</h2><p>Primeiro por quantidade de dezenas em comum; empate resolvido por distância estrutural.</p></div></div><div class="panel a2-similarity">${(similarity.closest || []).map((item) => `<div><strong>#${item.contest}</strong><span>${formatDate(item.date)}</span><em>${item.overlap} em comum</em><small>${item.sharedNumbers.map(number).join(" · ") || "nenhuma"}</small></div>`).join("") || '<div class="a2-empty">Sem histórico suficiente.</div>'}</div></section>
  </div>`;
}

function validationCards(period) {
  if (!period?.rounds) return '<div class="a2-empty">São necessários ao menos 20 concursos contínuos antes do primeiro alvo de validação.</div>';
  return period.tiers.map((tier) => {
    const tone = tier.difference > 0 ? "positive" : tier.difference < 0 ? "negative" : "";
    return `<article class="panel a2-validation-card"><div class="a2-panel-head"><strong>${TIER_LABELS[tier.tier]}</strong><span class="evidence-${tier.evidence}">${evidenceCopy(tier.evidence)}</span></div><div class="a2-validation-rates"><span><small>observado</small><strong>${percent(tier.observedRate)}</strong></span><span><small>esperado</small><strong>${percent(tier.expectedRate)}</strong></span><span><small>diferença</small><strong class="${tone}">${signed(tier.difference * 100, " p.p.")}</strong></span></div><p>${tier.observedHits} dezenas observadas · ${decimal(tier.expectedHits)} esperadas · p ajustado ${decimal(tier.adjustedPValue, 4)}</p></article>`;
  }).join("");
}

function robustnessRows(data) {
  return [...data.advanced.ranking.dynamics.items]
    .sort((a, b) => a.rank - b.rank)
    .map((item) => `<tr data-a2-number="${item.number}" tabindex="0"><td><strong>${number(item.number)}</strong></td><td>#${item.rank}</td><td>${TIER_LABELS[item.tier]}</td><td>${percent(item.weightRobustness.tierStability)}</td><td>${percent(item.weightRobustness.strongShare)}</td><td>${item.weightRobustness.scenarioCount ? `#${item.weightRobustness.rankRange[0]}–#${item.weightRobustness.rankRange[1]}` : "—"}</td></tr>`).join("");
}

function validationView(data) {
  const validation = data.advanced.validation;
  const initial = [...validation.periods].reverse().find((period) => period.rounds > 0) || validation.periods[0];
  return `<div class="a2-stack">
    <div class="a2-validation-principle"><strong>Teste fora da amostra</strong><span>${escapeHtml(validation.methodology.note)}</span></div>
    <section><div class="section-head"><div><h2>Fortes × intermediárias × frias</h2><p>O ranking de cada rodada é congelado antes de olhar o concurso seguinte.</p></div><label class="a2-window-control">Período<select data-a2-validation-window>${validation.periods.map((period) => `<option value="${period.window}" ${period.window === initial.window ? "selected" : ""}>últimos ${period.window} · ${period.rounds} válidos</option>`).join("")}</select></label></div><div class="a2-validation-grid" data-a2-validation-cards>${validationCards(initial)}</div></section>
    <section><div class="section-head"><div><h2>Sensibilidade dos pesos</h2><p>Cada peso é perturbado em -10%, 0 e +10%, depois normalizado; são 243 cenários por dezena quando há histórico.</p></div></div><div class="panel table-wrap"><table class="a2-table"><thead><tr><th>Dezena</th><th>Rank</th><th>Grupo</th><th>Mesmo grupo</th><th>Forte nos cenários</th><th>Faixa de rank</th></tr></thead><tbody>${robustnessRows(data)}</tbody></table></div></section>
    <section><article class="panel a2-method-card"><strong>Como ler esta aba</strong><p>Um grupo aparecer acima do esperado em uma janela não basta para concluir capacidade preditiva. O Loto Lab mostra o desvio, a incerteza e a correção estatística; resultados instáveis entre janelas devem ser tratados como observação, não como regra.</p><div><span>Warmup <b>${validation.methodology.warmupContests}</b></span><span>Anti-leakage <b>${validation.methodology.leakageProtection ? "ativo" : "não"}</b></span><span>Trecho contínuo <b>${validation.sourceContests}</b></span><span>Correção <b>${validation.methodology.correction}</b></span></div></article></section>
  </div>`;
}

function renderTab() {
  if (!currentData || !root || currentView() !== "analysis") return;
  const target = root.querySelector("#a2-view");
  if (!target) return;
  target.setAttribute("aria-labelledby", `a2-tab-${activeTab}`);
  if (activeTab === "ranking") target.innerHTML = rankingView(currentData);
  else if (activeTab === "structure") target.innerHTML = structureView(currentData);
  else if (activeTab === "dynamics") target.innerHTML = dynamicsView(currentData);
  else if (activeTab === "combinations") target.innerHTML = combinationsView(currentData);
  else target.innerHTML = validationView(currentData);
  bindTabInteractions();
}

function numberDetailMarkup(item) {
  const contributions = Object.entries(item.contribution);
  const total = contributions.reduce((sum, [, value]) => sum + value, 0) || 1;
  const delay = item.delay.current === null ? "—" : item.delay.current;
  const delayDetail = item.delay.percentile === null ? "histórico contínuo insuficiente" : `percentil ${Math.round(item.delay.percentile * 100)}`;
  const streak = item.streak === null ? "—" : item.streak;
  return `<div class="a2-detail-head"><div><span>Dezena ${number(item.number)}</span><h2>#${item.rank} · ${decimal(item.score)}</h2><div><span class="a2-tier-chip ${tierClass(item.tier)}">${TIER_LABELS[item.tier]}</span><span>${trendCopy(item.trend)}</span></div></div><button type="button" data-a2-detail-close aria-label="Fechar detalhe">×</button></div>
    <div class="a2-detail-grid">${metricCard("Movimento 10", item.movements.ten === null ? "—" : `${item.movements.ten > 0 ? "+" : ""}${item.movements.ten}`, "posições")}${metricCard("Robustez", percent(item.weightRobustness.tierStability), item.weightRobustness.scenarioCount ? `rank #${item.weightRobustness.rankRange[0]}–#${item.weightRobustness.rankRange[1]}` : "sem histórico")}${metricCard("Atraso", delay, delayDetail)}${metricCard("Sequência atual", streak, "concursos consecutivos presente")}</div>
    <section class="a2-detail-section"><strong>Decomposição do score</strong><p>Quanto cada janela contribui para o score final com os pesos atuais.</p><div class="a2-contributions">${contributions.map(([key, value]) => `<div><span>${key}</span><i><b style="width:${Math.max(2, (value / total) * 100)}%"></b></i><strong>${decimal(value)}</strong></div>`).join("")}</div></section>
    <section class="a2-detail-section"><strong>Frequência observada</strong><div class="a2-frequency-grid">${Object.entries(item.frequency).map(([key, value]) => `<span><small>${key}</small><strong>${value.count}</strong><em>${percent(value.rate)}</em></span>`).join("")}</div></section>
    <section class="a2-detail-section"><strong>Posição no tempo</strong><div class="a2-frequency-grid"><span><small>1 concurso</small><strong>${item.previousRanks.one ? `#${item.previousRanks.one}` : "—"}</strong></span><span><small>5 concursos</small><strong>${item.previousRanks.five ? `#${item.previousRanks.five}` : "—"}</strong></span><span><small>10 concursos</small><strong>${item.previousRanks.ten ? `#${item.previousRanks.ten}` : "—"}</strong></span><span><small>20 concursos</small><strong>${item.previousRanks.twenty ? `#${item.previousRanks.twenty}` : "—"}</strong></span></div></section>
    <div class="a2-detail-warning">Atraso e frequência são descrições históricas. Eles não aumentam nem reduzem a chance matemática individual desta dezena no próximo sorteio.</div>`;
}

function closeNumberDetail() {
  const detail = root?.querySelector("#a2-detail");
  if (!detail || detail.hidden) return;
  detail.hidden = true;
  document.body.classList.remove("a2-detail-open");
  if (detailReturnFocus?.isConnected) detailReturnFocus.focus();
  detailReturnFocus = null;
}

function trapDetailFocus(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeNumberDetail();
    return;
  }
  if (event.key !== "Tab") return;
  const detail = event.currentTarget;
  const focusable = [...detail.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((node) => !node.disabled && !node.hidden);
  if (!focusable.length) {
    event.preventDefault();
    detail.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openNumberDetail(value, trigger) {
  const item = currentData?.advanced?.ranking?.dynamics?.items?.find((candidate) => candidate.number === Number(value));
  const detail = root?.querySelector("#a2-detail");
  if (!item || !detail) return;
  detailReturnFocus = trigger instanceof HTMLElement ? trigger : document.activeElement;
  detail.innerHTML = numberDetailMarkup(item);
  detail.hidden = false;
  document.body.classList.add("a2-detail-open");
  detail.addEventListener("keydown", trapDetailFocus);
  detail.querySelector("[data-a2-detail-close]")?.addEventListener("click", closeNumberDetail);
  detail.querySelector("[data-a2-detail-close]")?.focus();
}

function compareNumbers() {
  const a = Number(root.querySelector("[data-a2-compare-a]")?.value);
  const b = Number(root.querySelector("[data-a2-compare-b]")?.value);
  const result = root.querySelector("[data-a2-compare-result]");
  const items = currentData?.advanced?.ranking?.dynamics?.items || [];
  const first = items.find((item) => item.number === a);
  const second = items.find((item) => item.number === b);
  if (!result || !first || !second || a === b) {
    if (result) result.innerHTML = '<div class="a2-empty">Selecione duas dezenas diferentes.</div>';
    return;
  }
  const rows = [
    ["Score", decimal(first.score), decimal(second.score)],
    ["Ranking", `#${first.rank}`, `#${second.rank}`],
    ["Grupo", TIER_LABELS[first.tier], TIER_LABELS[second.tier]],
    ["Movimento 10", first.movements.ten ?? "—", second.movements.ten ?? "—"],
    ["Ano", decimal(first.components.year), decimal(second.components.year)],
    ["Mês", decimal(first.components.month), decimal(second.components.month)],
    ["Últimos 10", decimal(first.components.recent10), decimal(second.components.recent10)],
    ["Últimos 20", decimal(first.components.recent20), decimal(second.components.recent20)],
    ["Histórico", decimal(first.components.historical), decimal(second.components.historical)],
    ["Robustez", percent(first.weightRobustness.tierStability), percent(second.weightRobustness.tierStability)],
  ];
  result.innerHTML = `<div class="a2-compare-table"><div><strong>Indicador</strong><strong>${number(a)}</strong><strong>${number(b)}</strong></div>${rows.map((row) => `<div><span>${row[0]}</span><b>${row[1]}</b><b>${row[2]}</b></div>`).join("")}</div>`;
}

function pairCheck() {
  const a = Number(root.querySelector("[data-a2-pair-a]")?.value);
  const b = Number(root.querySelector("[data-a2-pair-b]")?.value);
  const target = root.querySelector("[data-a2-pair-result]");
  if (!target) return;
  if (a === b) {
    target.innerHTML = '<div class="a2-empty">Escolha duas dezenas diferentes.</div>';
    return;
  }
  const pair = currentData.advanced.combinations.pairs.find((item) => item.numbers.includes(a) && item.numbers.includes(b));
  if (!pair) {
    target.innerHTML = '<div class="a2-empty">Par não encontrado.</div>';
    return;
  }
  target.innerHTML = `<div class="a2-pair-stat"><strong>${number(a)} + ${number(b)}</strong><span><small>observado</small><b>${pair.observed}</b></span><span><small>esperado</small><b>${decimal(pair.expected)}</b></span><span><small>lift</small><b>${decimal(pair.lift, 2)}×</b></span><span><small>z-score</small><b>${decimal(pair.zScore, 2)}</b></span><em class="evidence-${pair.evidence}">${evidenceCopy(pair.evidence)} · p exato ajustado ${decimal(pair.adjustedPValue, 4)}</em></div>`;
}

function chooseDistinctDefaults(firstSelector, secondSelector) {
  const first = root.querySelector(firstSelector);
  const second = root.querySelector(secondSelector);
  if (!first || !second || second.options.length < 2) return;
  if (first.value === second.value) second.selectedIndex = 1;
}

function bindTabInteractions() {
  root.querySelectorAll("[data-a2-number]").forEach((node) => {
    node.addEventListener("click", () => openNumberDetail(node.dataset.a2Number, node));
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openNumberDetail(node.dataset.a2Number, node);
      }
    });
  });
  chooseDistinctDefaults("[data-a2-compare-a]", "[data-a2-compare-b]");
  chooseDistinctDefaults("[data-a2-pair-a]", "[data-a2-pair-b]");
  root.querySelector("[data-a2-compare]")?.addEventListener("click", compareNumbers);
  root.querySelector("[data-a2-pair-check]")?.addEventListener("click", pairCheck);
  root.querySelector("[data-a2-validation-window]")?.addEventListener("change", (event) => {
    const period = currentData.advanced.validation.periods.find((candidate) => candidate.window === Number(event.target.value));
    const target = root.querySelector("[data-a2-validation-cards]");
    if (period && target) target.innerHTML = validationCards(period);
  });
}

function activateTab(tab, focus = false) {
  if (!TABS.includes(tab)) return;
  activeTab = tab;
  localStorage.setItem(ACTIVE_TAB_KEY, activeTab);
  root.querySelectorAll("[data-a2-tab]").forEach((item) => {
    const selected = item.dataset.a2Tab === activeTab;
    item.classList.toggle("is-active", selected);
    item.setAttribute("aria-selected", String(selected));
    item.setAttribute("tabindex", selected ? "0" : "-1");
    if (selected && focus) item.focus();
  });
  closeNumberDetail();
  renderTab();
}

function bindShellInteractions() {
  const tabs = [...root.querySelectorAll("[data-a2-tab]")];
  tabs.forEach((button, index) => {
    button.addEventListener("click", () => activateTab(button.dataset.a2Tab));
    button.addEventListener("keydown", (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;
      activateTab(tabs[nextIndex].dataset.a2Tab, true);
    });
  });
}

function showFallbackNotice(error) {
  if (!root || currentView() !== "analysis") return;
  root.querySelector("[data-analysis-v2-fallback]")?.remove();
  const notice = document.createElement("div");
  notice.className = "a2-warning a2-fallback-notice";
  notice.dataset.analysisV2Fallback = "";
  notice.innerHTML = `<strong>Análises avançadas indisponíveis</strong><span>A visão básica foi preservada. ${escapeHtml(error?.message || "Tente atualizar novamente em alguns instantes.")}</span>`;
  root.prepend(notice);
}

async function renderAnalysisV2() {
  if (!root || currentView() !== "analysis") return;
  const lottery = currentLottery();
  const token = ++renderToken;
  try {
    const data = await api(`/analysis/${lottery}`);
    if (token !== renderToken || currentView() !== "analysis" || currentLottery() !== lottery) return;
    if (!data.advanced) return;
    currentData = data;
    if (viewSubtitle) viewSubtitle.textContent = "Ranking, estrutura, dinâmica, combinações e validação estatística.";
    root.innerHTML = shellMarkup(data);
    bindShellInteractions();
    renderTab();
  } catch (error) {
    if (token !== renderToken || currentView() !== "analysis") return;
    showFallbackNotice(error);
  }
}

onViewRendered(({ view }) => {
  if (view === "analysis") void renderAnalysisV2();
});

window.addEventListener("loto-lab:data-synced", () => {
  if (currentView() === "analysis") void renderAnalysisV2();
});
