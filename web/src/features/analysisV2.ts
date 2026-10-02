import { api } from "../core/api.js";
import {
  currentMainView,
  onMainViewChanged,
  onViewRendered,
} from "../core/viewLifecycle.js";
import { escapeHtml } from "../shared/escaping.js";
import type {
  AnalysisCycles,
  AnalysisNumberItem,
  AnalysisPayload,
  AnalysisTier,
  AssociationItem,
  RankingMover,
  StructureMethodologyFilter,
  StructureMetric,
  ValidationPeriod,
} from "./analysisV2/types.js";

const root = document.querySelector<HTMLElement>("#content")!;
const lotterySelect = document.querySelector<HTMLSelectElement>("#lottery-select");
const viewSubtitle = document.querySelector<HTMLElement>("#view-subtitle");
const TIER_LABELS: Record<AnalysisTier, string> = {
  strong: "Fortes",
  balanced: "Intermediárias",
  cold: "Frias",
};

type AnalysisMapFilter = "all" | AnalysisTier;

type LotteryCatalogItem = {
  id?: string;
  name?: string;
  family?: string;
  enabled?: boolean;
  capabilities?: {
    analysis?: boolean;
  };
};

type LotteryCatalogPayload = {
  items?: LotteryCatalogItem[];
};

const FLAT_NUMBER_FAMILIES = new Set(["number-draw", "number-draw-secondary"]);

let renderToken = 0;
let currentData: AnalysisPayload | null = null;
let detailReturnFocus: HTMLElement | null = null;
let activeMapFilter: AnalysisMapFilter = "all";

function currentLottery(): string {
  return lotterySelect?.value || "mega-sena";
}

function number(value: number): string {
  return String(value).padStart(2, "0");
}

function decimal(value: unknown, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits).replace(".", ",");
}

function percent(value: unknown, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits).replace(".", ",")}%`;
}

function signed(value: unknown, suffix = ""): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value === 0) return `0${suffix}`;
  return `${value > 0 ? "+" : ""}${decimal(value, Math.abs(value) < 1 ? 2 : 1)}${suffix}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function evidenceCopy(level: string): string {
  if (level === "moderate") return "sinal após correção";
  if (level === "weak") return "sinal fraco";
  return "sem evidência relevante";
}

function trendCopy(trend: string): string {
  if (trend === "rising") return "Em alta";
  if (trend === "falling") return "Em queda";
  if (trend === "stable") return "Estável";
  return "Sem histórico suficiente";
}

function tierClass(tier: AnalysisTier): string {
  return tier === "strong" ? "is-strong" : tier === "balanced" ? "is-balanced" : "is-cold";
}

function metricCard(label: string, value: string | number, detail: string, tone = ""): string {
  return `<article class="panel a2-metric"><span>${escapeHtml(label)}</span><strong class="${tone}">${value}</strong><small>${escapeHtml(detail || "")}</small></article>`;
}

function mapFilterLabel(filter: AnalysisMapFilter): string {
  return filter === "all" ? "Todas" : TIER_LABELS[filter];
}

function mapFilterMarkup(): string {
  const filters: AnalysisMapFilter[] = ["all", "strong", "balanced", "cold"];
  return `<div class="a2-map-filters" aria-label="Filtrar dezenas por grupo">${filters.map((filter) => `
    <button type="button" data-a2-map-filter="${filter}" aria-pressed="${activeMapFilter === filter}" class="${activeMapFilter === filter ? "is-active" : ""}">${mapFilterLabel(filter)}</button>
  `).join("")}</div>`;
}

function detailsBlock(title: string, copy: string, body: string): string {
  return `<details class="a2-technical-block">
    <summary><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></span><b aria-hidden="true">+</b></summary>
    <div class="a2-technical-body">${body}</div>
  </details>`;
}

function qualityWarning(advanced: AnalysisPayload["advanced"]): string {
  const quality = advanced.dataQuality;
  if (!quality) return "";
  const messages: string[] = [];
  if (!quality.continuous) {
    messages.push(`${quality.missingContestCount} concurso(s) ausente(s); métricas sequenciais não atravessam essas lacunas.`);
  }
  if (quality.leftCensored) {
    messages.push(`A base armazenada começa no concurso #${quality.firstStoredContest}; valores que dependem do histórico anterior são tratados como desconhecidos.`);
  }
  if (!messages.length) return "";
  const latestSegment = quality.latestContinuousContests ?? 0;
  messages.push(`A validação usa o trecho contínuo mais recente (${latestSegment} concursos).`);
  return `<div class="a2-warning a2-quality-warning"><strong>Qualidade do histórico</strong><span>${escapeHtml(messages.join(" "))}</span></div>`;
}

function randomnessAuditView(data: AnalysisPayload): string {
  const audit = data.advanced.randomnessAudit;
  const scope = audit.scope;
  if (!audit.available) {
    return `<div class="a2-warning"><strong>Evidência insuficiente</strong><span>A auditoria exige pelo menos 50 concursos contínuos e comparáveis. O segmento atual contém ${scope.analyzedContests}.</span></div>
      <p class="a2-context-note">${escapeHtml(audit.methodology.note)}</p>`;
  }

  const statusLabel = audit.status === "investigate"
    ? "Há sinais para investigar"
    : "Compatível com o baseline testado";
  const statusDetail = audit.status === "investigate"
    ? "Um ou mais testes ficaram fora do esperado após correção por múltiplas comparações. Isso pede verificação de dados e metodologia; não implica previsibilidade."
    : "Nenhum dos testes aplicados apresentou desvio relevante após correção. Isso não prova aleatoriedade; apenas indica compatibilidade com os testes executados.";
  const signalNumbers = audit.perNumber.filter((item) => item.status === "investigate");

  return `<div class="a2-comparison-summary">
      <div><span>Status</span><strong>${escapeHtml(statusLabel)}</strong></div>
      <div><span>Período</span><strong>#${scope.firstContest ?? "—"}–#${scope.lastContest ?? "—"}</strong></div>
      <div><span>Amostra</span><strong>${scope.analyzedContests} concursos</strong></div>
      <div><span>Baseline nulo</span><strong>${audit.methodology.samples} simulações</strong></div>
    </div>
    <p class="a2-context-note">${escapeHtml(statusDetail)}</p>
    ${scope.excludedBeforeSegment > 0 ? `<div class="a2-warning"><strong>Escopo protegido</strong><span>${scope.excludedBeforeSegment} concurso(s) anterior(es) ficaram fora da auditoria por gap ou mudança de cardinalidade. Nenhum teste sequencial atravessa essa quebra.</span></div>` : ""}
    <div class="a2-technical-stack">
      ${audit.metrics.map((metric) => `<article class="panel a2-metric">
        <span>${escapeHtml(metric.label)}</span>
        <strong>${metric.status === "investigate" ? "Investigar" : "Compatível"}</strong>
        <small>observado ${decimal(metric.observed, 4)} · nulo P05–P95 ${decimal(metric.nullP05, 4)}–${decimal(metric.nullP95, 4)} · p ajustado ${decimal(metric.adjustedPValue, 4)}</small>
        <p class="a2-form-note"><strong>H0:</strong> ${escapeHtml(metric.nullHypothesis)}</p>
        <p class="a2-form-note">${escapeHtml(metric.limitation)}</p>
      </article>`).join("")}
    </div>
    <details class="a2-result-details">
      <summary>Frequência por dezena</summary>
      <div class="a2-technical-body">
        <p class="a2-context-note">Teste binomial exato por dezena com Bonferroni em toda a família. Ausência de sinal não transforma frequência histórica em previsão.</p>
        ${signalNumbers.length
          ? `<div class="a2-context-note"><strong>Sinais após correção:</strong> ${signalNumbers.map((item) => `${number(item.number)} (${item.observed} vs. ${decimal(item.expected, 1)} esperados; p aj. ${decimal(item.adjustedPValue, 4)})`).join(", ")}</div>`
          : '<div class="a2-context-note">Nenhuma dezena apresentou desvio relevante após correção múltipla.</div>'}
      </div>
    </details>
    <details class="a2-result-details">
      <summary>Reprodutibilidade e metodologia</summary>
      <div class="a2-technical-body">
        <p class="a2-form-note">Versão: ${escapeHtml(audit.version)} · seed: <code>${escapeHtml(audit.methodology.seed)}</code></p>
        <p class="a2-form-note">Resolução mínima do p empírico: ${decimal(audit.methodology.pValueResolution, 6)} · correção: ${escapeHtml(audit.methodology.correction)}</p>
        <p class="a2-form-note">${escapeHtml(audit.methodology.note)}</p>
      </div>
    </details>`;
}

function secondaryFieldNotice(catalog: LotteryCatalogItem): string {
  return catalog.family === "number-draw-secondary"
    ? '<div class="a2-context-note">Este mapa analisa apenas o componente numérico. Campos secundários da modalidade são independentes e não entram nesta classificação.</div>'
    : "";
}

function shellMarkup(data: AnalysisPayload, catalog: LotteryCatalogItem): string {
  const advanced = data.advanced;
  const latest = advanced.latestContest;
  return `<div class="a2-shell">
    <header class="a2-analysis-head">
      <div>
        <span class="a2-eyebrow">Mapa das dezenas</span>
        <h2>${escapeHtml(catalog.name || currentLottery())}</h2>
        <p>Leitura descritiva do histórico. Clique em uma dezena para ver seus indicadores.</p>
      </div>
      <div class="a2-reference"><span>Concurso de referência</span><strong>${latest ? `#${latest.number}` : "—"}</strong><small>${latest ? formatDate(latest.date) : "Sem histórico"}</small></div>
    </header>
    <div class="a2-principle"><strong>Histórico, não previsão</strong><span>${escapeHtml(advanced.model.disclaimer)}</span></div>
    ${secondaryFieldNotice(catalog)}
    ${qualityWarning(advanced)}
    ${numberMapView(data)}
    <section class="a2-technical-section" aria-labelledby="a2-technical-title">
      <div class="section-head"><div><h2 id="a2-technical-title">Indicadores e metodologia</h2><p>Detalhes técnicos ficam recolhidos para não competir com o mapa principal.</p></div></div>
      <div class="a2-technical-stack">
        ${detailsBlock("Classificação completa", "Posição, movimento, tendência, robustez e atraso.", technicalRankingView(data))}
        ${detailsBlock("Estrutura e distribuições", "Observado, histórico anterior e referências matemáticas.", structureView(data))}
        ${detailsBlock("Dinâmica histórica", "Movimentos, ciclos, atrasos e mapa binário.", dynamicsView(data))}
        ${detailsBlock("Associações", "Duplas, trincas e concursos parecidos; exploração sem previsão.", combinationsView(data))}
        ${detailsBlock("Auditoria de aleatoriedade", "Compatibilidade estatística, integridade temporal e baseline sintético; não é previsão.", randomnessAuditView(data))}
        ${detailsBlock("Validação e metodologia", "Teste fora da amostra, sensibilidade e proteção anti-leakage.", validationView(data))}
      </div>
    </section>
    <dialog class="a2-detail" id="a2-detail" aria-label="Detalhe da dezena"></dialog>
  </div>`;
}

function numberMapView(data: AnalysisPayload): string {
  const items = [...data.advanced.ranking.dynamics.items].sort((a, b) => a.number - b.number);
  const ranked = [...items].sort((a, b) => a.rank - b.rank);
  const options = ranked.map((item) => `<option value="${item.number}">${number(item.number)} · #${item.rank}</option>`).join("");
  return `<section class="a2-map-section" aria-labelledby="a2-map-title">
    <div class="a2-map-toolbar">
      <div><h2 id="a2-map-title">Dezenas</h2><p>Grupos são relativos ao histórico analisado e não alteram a chance matemática do próximo sorteio.</p></div>
      ${mapFilterMarkup()}
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

function technicalRankingView(data: AnalysisPayload): string {
  const dynamics = [...data.advanced.ranking.dynamics.items].sort((a, b) => a.rank - b.rank);
  return `<div class="a2-stack">
    <section>
      <div class="section-head"><div><h2>Classificação auditável</h2><p>Movimento usa o concurso exatamente 10 posições antes; referências ausentes não são aproximadas.</p></div></div>
      <div class="panel table-wrap"><table class="a2-table"><thead><tr><th>#</th><th>Dezena</th><th>Grupo</th><th>Pontuação</th><th>Mov. 10</th><th>Tendência</th><th>Robustez</th><th>Atraso</th></tr></thead><tbody>${dynamics.map((item) => `
        <tr data-a2-number="${item.number}" tabindex="0"><td><strong>${item.rank}</strong></td><td><strong>${number(item.number)}</strong></td><td><span class="a2-tier-chip ${tierClass(item.tier)}">${TIER_LABELS[item.tier]}</span></td><td>${decimal(item.score)}</td><td>${movementBadge(item.movements.ten)}</td><td>${trendCopy(item.trend)}</td><td>${percent(item.weightRobustness.tierStability)}</td><td>${delayCopy(item)}</td></tr>`).join("")}</tbody></table></div>
    </section>
  </div>`;
}

function movementBadge(value: number | null | undefined): string {
  if (value === null || value === undefined) return '<span class="a2-move">—</span>';
  const className = value > 0 ? "positive" : value < 0 ? "negative" : "";
  return `<span class="a2-move ${className}">${value > 0 ? "↑" : value < 0 ? "↓" : "→"} ${Math.abs(value)}</span>`;
}

function delayCopy(item: AnalysisNumberItem): string {
  return item.delay.current === null
    ? "—"
    : `${item.delay.current} concurso(s)`;
}

function theoreticalBars(metric?: StructureMetric | null): string {
  const points = metric?.theoreticalDistribution || [];
  if (!points.length) return "";
  const max = Math.max(...points.map((point) => point.probability), 0.0001);
  return `<div class="a2-distribution" aria-label="Distribuição combinatória">${points.map((point) => `
    <div class="a2-dist-column"><div class="a2-dist-bar"><i style="height:${Math.max(3, (point.probability / max) * 100)}%"></i></div><strong>${point.value}</strong><small>${percent(point.probability, 0)}</small></div>`).join("")}</div>`;
}

function structureCard(
  label: string,
  metric: StructureMetric | null | undefined,
  formatter: (value: number) => string = (value) => decimal(value),
): string {
  const current = metric?.current;
  const observed = metric?.observed;
  return `<article class="panel a2-structure-card">
    <div class="a2-structure-title"><strong>${escapeHtml(label)}</strong>${metric?.percentile !== undefined ? `<span>percentil ${Math.round(metric.percentile * 100)}</span>` : ""}</div>
    <div class="a2-structure-current">${current === null || current === undefined ? "—" : formatter(current)}</div>
    <div class="a2-observed-expected">
      <span><small>histórico anterior · média</small><strong>${observed ? formatter(observed.mean) : "—"}</strong></span>
      <span><small>esperado · matemática</small><strong>${metric?.expectedMean !== undefined ? formatter(metric.expectedMean) : "descritivo"}</strong></span>
      <span><small>diferença atual</small><strong>${metric?.deviationFromExpected !== undefined ? signed(metric.deviationFromExpected) : "—"}</strong></span>
    </div>
    ${theoreticalBars(metric)}
  </article>`;
}

function filterValidationMarkup(filter: StructureMethodologyFilter): string {
  const next = filter.nextContestUniverse || filter.exactUniverse;
  const historical = filter.historical;
  const expected = filter.historicalExpected;
  const difference = expected && typeof historical.coverage === "number"
    ? (historical.coverage - expected.coverage) * 100
    : null;
  return `<article class="panel a2-filter-validation">
    <div class="a2-filter-rules"><span>Repetidas <strong>${filter.rules.repeated.min}–${filter.rules.repeated.max}</strong>${filter.rules.repeated.preferredMin !== undefined ? `<small>preferencial ${filter.rules.repeated.preferredMin}–${filter.rules.repeated.preferredMax}</small>` : ""}</span><span>Ímpares <strong>${filter.rules.odd.min}–${filter.rules.odd.max}</strong></span></div>
    <div class="a2-filter-numbers">
      <span><small>Próximo concurso · universo</small><strong>${next ? percent(next.coverage) : "—"}</strong><em>${next ? `${next.passing.toLocaleString("pt-BR")} / ${next.total.toLocaleString("pt-BR")}` : "sem concurso de referência"}</em></span>
      <span><small>Histórico observado</small><strong>${percent(historical.coverage)}</strong><em>${historical.total ? `${historical.passing.toLocaleString("pt-BR")} / ${historical.total.toLocaleString("pt-BR")}` : "sem transições contínuas"}</em></span>
      <span><small>Histórico esperado</small><strong>${expected ? percent(expected.coverage) : "—"}</strong><em>${expected ? `faixa ${percent(expected.minCoverage)}–${percent(expected.maxCoverage)}` : "sem referência histórica"}</em></span>
      <span><small>Diferença histórica</small><strong>${signed(difference, " p.p.")}</strong><em>observado − esperado comparável</em></span>
    </div>
    <p>${escapeHtml(filter.note)}</p>
  </article>`;
}

function structureView(data: AnalysisPayload): string {
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

function moverList(items: RankingMover[], direction: "up" | "down"): string {
  if (!items.length) return '<div class="a2-empty">Histórico insuficiente ou concurso de referência ausente.</div>';
  return `<div class="a2-mover-list">${items.map((item) => `<button type="button" data-a2-number="${item.number}"><strong>${number(item.number)}</strong><span>#${item.rank}</span><em class="${direction === "up" ? "positive" : "negative"}">${direction === "up" ? "↑" : "↓"}${Math.abs(item.movement)}</em></button>`).join("")}</div>`;
}

function heatmap(data: AnalysisPayload): string {
  const rows = data.advanced.dynamics.heatmap || [];
  if (!rows.length) return '<div class="a2-empty">Sem concursos suficientes.</div>';
  const universe = [...data.advanced.ranking.dynamics.items]
    .map((item) => item.number)
    .sort((a, b) => a - b);
  const columns = `54px repeat(${universe.length}, 18px)`;
  return `<div class="a2-heatmap-wrap"><div class="a2-heatmap" style="grid-template-columns:${columns}"><div class="a2-heat-corner">#</div>${universe.map((value) => `<div class="a2-heat-head">${number(value)}</div>`).join("")}${[...rows].reverse().map((row) => { const set = new Set(row.numbers); return `<div class="a2-heat-contest">${row.contest}</div>${universe.map((value) => `<div class="a2-heat-cell ${set.has(value) ? "is-hit" : ""}" title="#${row.contest} · ${number(value)}"></div>`).join("")}`; }).join("")}</div></div>`;
}

function cycleMarkup(cycles: AnalysisCycles): string {
  if (!cycles.available) {
    return '<article class="panel a2-cycle"><div class="a2-empty">O início exato do ciclo não é conhecido por causa de uma lacuna ou porque a base armazenada começa depois do concurso #1.</div></article>';
  }
  return `<article class="panel a2-cycle"><div>${metricCard("Ciclo atual", cycles.currentLength, `${cycles.seen} dezenas já vistas`)}</div><div class="a2-cycle-copy"><strong>${cycles.missing.length ? `${cycles.missing.length} ainda não vistas` : "ciclo recém-completado"}</strong><div class="a2-ball-cloud">${cycles.missing.map((value) => `<button type="button" data-a2-number="${value}" class="a2-ball">${number(value)}</button>`).join("")}</div><small>Média histórica de duração: ${cycles.historicalLength ? decimal(cycles.historicalLength.mean) : "—"} concursos · ${cycles.completedCount} ciclo(s) completos com início conhecido.</small></div></article>`;
}

function dynamicsView(data: AnalysisPayload): string {
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

function associationRow(item: AssociationItem): string {
  return `<div class="a2-association-row"><strong>${item.numbers.map(number).join(" · ")}</strong><span>${item.observed} observadas</span><span>${decimal(item.expected)} esperadas</span><span>razão obs./esp. ${decimal(item.lift, 2)}×</span><em class="evidence-${item.evidence}">${evidenceCopy(item.evidence)}</em></div>`;
}

function combinationsView(data: AnalysisPayload): string {
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

function validationCards(period?: ValidationPeriod): string {
  if (!period?.rounds) return '<div class="a2-empty">São necessários ao menos 20 concursos contínuos antes do primeiro alvo de validação.</div>';
  const evidenceEligible = period.evidenceEligible !== false;
  return period.tiers.map((tier) => {
    const tone = tier.difference > 0 ? "positive" : tier.difference < 0 ? "negative" : "";
    const evidence = evidenceEligible ? evidenceCopy(tier.evidence) : "amostra insuficiente para classificar evidência";
    return `<article class="panel a2-validation-card"><div class="a2-panel-head"><strong>${TIER_LABELS[tier.tier]}</strong><span class="evidence-${evidenceEligible ? tier.evidence : "none"}">${evidence}</span></div><div class="a2-validation-rates"><span><small>observado</small><strong>${percent(tier.observedRate)}</strong></span><span><small>esperado</small><strong>${percent(tier.expectedRate)}</strong></span><span><small>diferença</small><strong class="${tone}">${signed(tier.difference * 100, " p.p.")}</strong></span></div><p>${tier.observedHits} dezenas observadas · ${decimal(tier.expectedHits)} esperadas · p ajustado ${decimal(tier.adjustedPValue, 4)}${evidenceEligible ? "" : " · selo de evidência suprimido"}</p></article>`;
  }).join("");
}

function robustnessRows(data: AnalysisPayload): string {
  return [...data.advanced.ranking.dynamics.items]
    .sort((a, b) => a.rank - b.rank)
    .map((item) => `<tr data-a2-number="${item.number}" tabindex="0"><td><strong>${number(item.number)}</strong></td><td>#${item.rank}</td><td>${TIER_LABELS[item.tier]}</td><td>${percent(item.weightRobustness.tierStability)}</td><td>${percent(item.weightRobustness.strongShare)}</td><td>${item.weightRobustness.scenarioCount ? `#${item.weightRobustness.rankRange[0]}–#${item.weightRobustness.rankRange[1]}` : "—"}</td></tr>`).join("");
}

function validationView(data: AnalysisPayload): string {
  const validation = data.advanced.validation;
  const initial = [...validation.periods].reverse().find((period) => period.rounds > 0) || validation.periods[0];
  return `<div class="a2-stack">
    <div class="a2-validation-principle"><strong>Teste fora da amostra</strong><span>${escapeHtml(validation.methodology.note)}</span></div>
    <section><div class="section-head"><div><h2>Fortes × intermediárias × frias</h2><p>A classificação de cada rodada é congelada antes de olhar o concurso seguinte. Selos de evidência exigem pelo menos ${validation.methodology.minimumEvidenceRounds ?? 30} alvos válidos.</p></div><label class="a2-window-control">Período<select data-a2-validation-window>${validation.periods.map((period) => `<option value="${period.window}" ${period.window === initial?.window ? "selected" : ""}>últimos ${period.window} · ${period.rounds} válidos</option>`).join("")}</select></label></div><div class="a2-validation-grid" data-a2-validation-cards>${validationCards(initial)}</div></section>
    <section><div class="section-head"><div><h2>Sensibilidade dos pesos</h2><p>Cada peso é perturbado em -10%, 0 e +10%, depois normalizado; são 243 cenários por dezena quando há histórico.</p></div></div><div class="panel table-wrap"><table class="a2-table"><thead><tr><th>Dezena</th><th>Posição</th><th>Grupo</th><th>Mesmo grupo</th><th>Forte nos cenários</th><th>Faixa de posição</th></tr></thead><tbody>${robustnessRows(data)}</tbody></table></div></section>
    <section><article class="panel a2-method-card"><strong>Como ler esta aba</strong><p>Um grupo aparecer acima do esperado em uma janela não basta para concluir capacidade preditiva. O Loto Lab mostra o desvio, a incerteza e a correção estatística; resultados instáveis entre janelas devem ser tratados como observação, não como regra.</p><div><span>Aquecimento <b>${validation.methodology.warmupContests}</b></span><span>Evidência mín. <b>${validation.methodology.minimumEvidenceRounds ?? 30} alvos</b></span><span>Anti-leakage <b>${validation.methodology.leakageProtection ? "ativo" : "não"}</b></span><span>Trecho contínuo <b>${validation.sourceContests}</b></span><span>Correção <b>${validation.methodology.correction}</b></span></div></article></section>
  </div>`;
}

function numberDetailMarkup(item: AnalysisNumberItem): string {
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

function cleanupDetailState({ restoreFocus = true }: { restoreFocus?: boolean } = {}): void {
  document.body.classList.remove("a2-detail-open");
  if (restoreFocus && detailReturnFocus?.isConnected) detailReturnFocus.focus();
  detailReturnFocus = null;
}

function closeNumberDetail({ restoreFocus = true }: { restoreFocus?: boolean } = {}): void {
  const detail = root.querySelector<HTMLDialogElement>("#a2-detail");
  if (detail?.open) detail.close();
  cleanupDetailState({ restoreFocus });
}

function openNumberDetail(value: string | undefined, trigger: EventTarget | null): void {
  const item = currentData?.advanced.ranking.dynamics.items.find((candidate) => candidate.number === Number(value));
  const detail = root.querySelector<HTMLDialogElement>("#a2-detail");
  if (!item || !detail) return;
  detailReturnFocus = trigger instanceof HTMLElement
    ? trigger
    : document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  detail.innerHTML = numberDetailMarkup(item);
  document.body.classList.add("a2-detail-open");
  if (!detail.open) detail.showModal();
  const closeButton = detail.querySelector<HTMLButtonElement>("[data-a2-detail-close]");
  closeButton?.addEventListener("click", () => closeNumberDetail(), { once: true });
  closeButton?.focus();
}

function compareNumbers(): void {
  const a = Number(root.querySelector<HTMLSelectElement>("[data-a2-compare-a]")?.value);
  const b = Number(root.querySelector<HTMLSelectElement>("[data-a2-compare-b]")?.value);
  const result = root.querySelector<HTMLElement>("[data-a2-compare-result]");
  const items = currentData?.advanced.ranking.dynamics.items || [];
  const first = items.find((item) => item.number === a);
  const second = items.find((item) => item.number === b);
  if (!result || !first || !second || a === b) {
    if (result) result.innerHTML = '<div class="a2-empty">Selecione duas dezenas diferentes.</div>';
    return;
  }
  const rows: Array<[string, string | number, string | number]> = [
    ["Pontuação", decimal(first.score), decimal(second.score)],
    ["Classificação", `#${first.rank}`, `#${second.rank}`],
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

function pairCheck(): void {
  const a = Number(root.querySelector<HTMLSelectElement>("[data-a2-pair-a]")?.value);
  const b = Number(root.querySelector<HTMLSelectElement>("[data-a2-pair-b]")?.value);
  const target = root.querySelector<HTMLElement>("[data-a2-pair-result]");
  if (!target) return;
  if (a === b) {
    target.innerHTML = '<div class="a2-empty">Escolha duas dezenas diferentes.</div>';
    return;
  }
  const pair = currentData?.advanced.combinations.pairs.find((item) => item.numbers.includes(a) && item.numbers.includes(b));
  if (!pair) {
    target.innerHTML = '<div class="a2-empty">Par indisponível para a amostra atual.</div>';
    return;
  }
  target.innerHTML = `<div class="a2-pair-stat"><strong>${number(a)} + ${number(b)}</strong><span><small>observado</small><b>${pair.observed}</b></span><span><small>esperado</small><b>${decimal(pair.expected)}</b></span><span><small>razão obs./esp.</small><b>${decimal(pair.lift, 2)}×</b></span><span><small>escore-z</small><b>${decimal(pair.zScore, 2)}</b></span><em class="evidence-${pair.evidence}">${evidenceCopy(pair.evidence)} · p exato ajustado ${decimal(pair.adjustedPValue, 4)}</em></div>`;
}

function chooseDistinctDefaults(firstSelector: string, secondSelector: string): void {
  const first = root.querySelector<HTMLSelectElement>(firstSelector);
  const second = root.querySelector<HTMLSelectElement>(secondSelector);
  if (!first || !second || second.options.length < 2) return;
  if (first.value === second.value) second.selectedIndex = 1;
}

function applyMapFilter(filter: AnalysisMapFilter): void {
  activeMapFilter = filter;
  root.querySelectorAll<HTMLButtonElement>("[data-a2-map-filter]").forEach((button) => {
    const selected = button.dataset.a2MapFilter === filter;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  root.querySelectorAll<HTMLElement>(".a2-map-number").forEach((button) => {
    button.hidden = filter !== "all" && button.dataset.a2Tier !== filter;
  });
}

function bindAnalysisInteractions(): void {
  root.querySelectorAll<HTMLElement>("[data-a2-number]").forEach((node) => {
    node.addEventListener("click", () => openNumberDetail(node.dataset.a2Number, node));
    node.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openNumberDetail(node.dataset.a2Number, node);
      }
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-a2-map-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const filter = button.dataset.a2MapFilter;
      if (filter === "all" || filter === "strong" || filter === "balanced" || filter === "cold") {
        applyMapFilter(filter);
      }
    });
  });
  chooseDistinctDefaults("[data-a2-compare-a]", "[data-a2-compare-b]");
  chooseDistinctDefaults("[data-a2-pair-a]", "[data-a2-pair-b]");
  root.querySelector("[data-a2-compare]")?.addEventListener("click", compareNumbers);
  root.querySelector("[data-a2-pair-check]")?.addEventListener("click", pairCheck);
  root.querySelector<HTMLSelectElement>("[data-a2-validation-window]")?.addEventListener("change", (event) => {
    const select = event.target;
    if (!(select instanceof HTMLSelectElement)) return;
    const period = currentData?.advanced.validation.periods.find((candidate) => candidate.window === Number(select.value));
    const target = root.querySelector<HTMLElement>("[data-a2-validation-cards]");
    if (period && target) target.innerHTML = validationCards(period);
  });
}

function bindShellInteractions(): void {
  bindAnalysisInteractions();
  applyMapFilter(activeMapFilter);

  const detail = root.querySelector<HTMLDialogElement>("#a2-detail");
  detail?.addEventListener("close", () => cleanupDetailState());
  detail?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeNumberDetail();
  });
  detail?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeNumberDetail();
    }
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "Tente atualizar novamente em alguns instantes.";
}

function showFallbackNotice(error: unknown): void {
  if (currentMainView() !== "analysis") return;
  root.innerHTML = `<div class="a2-shell"><div class="a2-warning a2-fallback-notice" data-analysis-v2-fallback><strong>Análises indisponíveis</strong><span>${escapeHtml(errorMessage(error))}</span></div></div>`;
}

function renderUnsupportedAnalysis(catalog: LotteryCatalogItem): void {
  const familyCopy = catalog.family === "column-draw"
    ? "Esta modalidade usa colunas independentes; tratá-la como um conjunto plano de dezenas produziria uma leitura incorreta."
    : catalog.family === "dual-number-draw"
      ? "Esta modalidade possui dois sorteios por concurso; o mapa único de dezenas não representa corretamente essa estrutura."
      : "Esta modalidade não possui análise numérica compatível com esta superfície.";
  currentData = null;
  closeNumberDetail({ restoreFocus: false });
  root.innerHTML = `<div class="a2-shell"><section class="a2-unavailable"><span class="a2-eyebrow">Análise por modalidade</span><h2>${escapeHtml(catalog.name || currentLottery())}</h2><p>${escapeHtml(familyCopy)}</p><strong>Nenhum indicador incompatível foi exibido.</strong></section></div>`;
  if (viewSubtitle) viewSubtitle.textContent = "Indicadores aparecem somente quando a estrutura da modalidade é compatível.";
}

async function renderAnalysisV2(): Promise<void> {
  if (currentMainView() !== "analysis") return;
  const lottery = currentLottery();
  const token = ++renderToken;
  try {
    const catalogPayload = await api<LotteryCatalogPayload>("/lotteries");
    if (token !== renderToken || currentMainView() !== "analysis" || currentLottery() !== lottery) return;
    const catalog = (catalogPayload?.items || []).find((item) => item.id === lottery);
    if (!catalog || catalog.enabled === false || catalog.capabilities?.analysis === false || !FLAT_NUMBER_FAMILIES.has(catalog.family || "")) {
      renderUnsupportedAnalysis(catalog || { id: lottery, name: lottery, family: "unsupported" });
      return;
    }

    const data = await api<AnalysisPayload>(`/analysis/${lottery}/advanced`);
    if (token !== renderToken || currentMainView() !== "analysis" || currentLottery() !== lottery) return;
    if (!data?.advanced) return;
    currentData = data;
    activeMapFilter = "all";
    if (viewSubtitle) viewSubtitle.textContent = "Dezenas e indicadores históricos da modalidade selecionada.";
    closeNumberDetail({ restoreFocus: false });
    root.innerHTML = shellMarkup(data, catalog);
    bindShellInteractions();
  } catch (error) {
    if (token !== renderToken || currentMainView() !== "analysis") return;
    showFallbackNotice(error);
  }
}

onViewRendered(({ view }) => {
  if (view === "analysis") void renderAnalysisV2();
  else closeNumberDetail({ restoreFocus: false });
});

onMainViewChanged((view) => {
  if (view !== "analysis") closeNumberDetail({ restoreFocus: false });
});

window.addEventListener("loto-lab:data-synced", () => {
  if (currentMainView() === "analysis") void renderAnalysisV2();
});
