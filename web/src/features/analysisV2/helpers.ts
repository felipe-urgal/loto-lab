import type { AnalysisCycles, AnalysisNumberItem, AnalysisPayload, AnalysisTier, AssociationItem, RankingMover, StructureMethodologyFilter, StructureMetric, ValidationPeriod } from "./types.js";
import { escapeHtml } from "../../shared/escaping.js";
const TIER_LABELS: Record<AnalysisTier,string> = { strong: "Fortes", balanced: "Intermediárias", cold: "Frias" };
export type AnalysisMapFilter = "all" | AnalysisTier;
export { TIER_LABELS };
export function number(value: number): string {
  return String(value).padStart(2, "0");
}


export function decimal(value: unknown, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(digits).replace(".", ",");
}


export function percent(value: unknown, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits).replace(".", ",")}%`;
}


export function signed(value: unknown, suffix = ""): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value === 0) return `0${suffix}`;
  return `${value > 0 ? "+" : ""}${decimal(value, Math.abs(value) < 1 ? 2 : 1)}${suffix}`;
}


export function formatDate(value?: string | null): string {
  if (!value) return "—";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}


export function evidenceCopy(level: string): string {
  if (level === "moderate") return "sinal após correção";
  if (level === "weak") return "sinal fraco";
  return "sem evidência relevante";
}


export function trendCopy(trend: string): string {
  if (trend === "rising") return "Em alta";
  if (trend === "falling") return "Em queda";
  if (trend === "stable") return "Estável";
  return "Sem histórico suficiente";
}


export function tierClass(tier: AnalysisTier): string {
  return tier === "strong" ? "is-strong" : tier === "balanced" ? "is-balanced" : "is-cold";
}


export function metricCard(label: string, value: string | number, detail: string, tone = ""): string {
  return `<article class="panel a2-metric"><span>${escapeHtml(label)}</span><strong class="${tone}">${value}</strong><small>${escapeHtml(detail || "")}</small></article>`;
}


export function mapFilterLabel(filter: AnalysisMapFilter): string {
  return filter === "all" ? "Todas" : TIER_LABELS[filter];
}


export function detailsBlock(title: string, copy: string, body: string): string {
  return `<details class="a2-technical-block">
    <summary><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></span><b aria-hidden="true">+</b></summary>
    <div class="a2-technical-body">${body}</div>
  </details>`;
}


export function qualityWarning(advanced: AnalysisPayload["advanced"]): string {
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


export function secondaryFieldNotice(catalog: LotteryCatalogItem): string {
  return catalog.family === "number-draw-secondary"
    ? '<div class="a2-context-note">Este mapa analisa apenas o componente numérico. Campos secundários da modalidade são independentes e não entram nesta classificação.</div>'
    : "";
}


export function movementBadge(value: number | null | undefined): string {
  if (value === null || value === undefined) return '<span class="a2-move">—</span>';
  const className = value > 0 ? "positive" : value < 0 ? "negative" : "";
  return `<span class="a2-move ${className}">${value > 0 ? "↑" : value < 0 ? "↓" : "→"} ${Math.abs(value)}</span>`;
}


export function delayCopy(item: AnalysisNumberItem): string {
  return item.delay.current === null
    ? "—"
    : `${item.delay.current} concurso(s)`;
}


export function theoreticalBars(metric?: StructureMetric | null): string {
  const points = metric?.theoreticalDistribution || [];
  if (!points.length) return "";
  const max = Math.max(...points.map((point) => point.probability), 0.0001);
  return `<div class="a2-distribution" aria-label="Distribuição combinatória">${points.map((point) => `
    <div class="a2-dist-column"><div class="a2-dist-bar"><i style="height:${Math.max(3, (point.probability / max) * 100)}%"></i></div><strong>${point.value}</strong><small>${percent(point.probability, 0)}</small></div>`).join("")}</div>`;
}


export function structureCard(
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


export function filterValidationMarkup(filter: StructureMethodologyFilter): string {
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


export function moverList(items: RankingMover[], direction: "up" | "down"): string {
  if (!items.length) return '<div class="a2-empty">Histórico insuficiente ou concurso de referência ausente.</div>';
  return `<div class="a2-mover-list">${items.map((item) => `<button type="button" data-a2-number="${item.number}"><strong>${number(item.number)}</strong><span>#${item.rank}</span><em class="${direction === "up" ? "positive" : "negative"}">${direction === "up" ? "↑" : "↓"}${Math.abs(item.movement)}</em></button>`).join("")}</div>`;
}


export function heatmap(data: AnalysisPayload): string {
  const rows = data.advanced.dynamics.heatmap || [];
  if (!rows.length) return '<div class="a2-empty">Sem concursos suficientes.</div>';
  const universe = [...data.advanced.ranking.dynamics.items]
    .map((item) => item.number)
    .sort((a, b) => a - b);
  const columns = `54px repeat(${universe.length}, 18px)`;
  return `<div class="a2-heatmap-wrap"><div class="a2-heatmap" style="grid-template-columns:${columns}"><div class="a2-heat-corner">#</div>${universe.map((value) => `<div class="a2-heat-head">${number(value)}</div>`).join("")}${[...rows].reverse().map((row) => { const set = new Set(row.numbers); return `<div class="a2-heat-contest">${row.contest}</div>${universe.map((value) => `<div class="a2-heat-cell ${set.has(value) ? "is-hit" : ""}" title="#${row.contest} · ${number(value)}"></div>`).join("")}`; }).join("")}</div></div>`;
}


export function cycleMarkup(cycles: AnalysisCycles): string {
  if (!cycles.available) {
    return '<article class="panel a2-cycle"><div class="a2-empty">O início exato do ciclo não é conhecido por causa de uma lacuna ou porque a base armazenada começa depois do concurso #1.</div></article>';
  }
  return `<article class="panel a2-cycle"><div>${metricCard("Ciclo atual", cycles.currentLength, `${cycles.seen} dezenas já vistas`)}</div><div class="a2-cycle-copy"><strong>${cycles.missing.length ? `${cycles.missing.length} ainda não vistas` : "ciclo recém-completado"}</strong><div class="a2-ball-cloud">${cycles.missing.map((value) => `<button type="button" data-a2-number="${value}" class="a2-ball">${number(value)}</button>`).join("")}</div><small>Média histórica de duração: ${cycles.historicalLength ? decimal(cycles.historicalLength.mean) : "—"} concursos · ${cycles.completedCount} ciclo(s) completos com início conhecido.</small></div></article>`;
}


export function associationRow(item: AssociationItem): string {
  return `<div class="a2-association-row"><strong>${item.numbers.map(number).join(" · ")}</strong><span>${item.observed} observadas</span><span>${decimal(item.expected)} esperadas</span><span>razão obs./esp. ${decimal(item.lift, 2)}×</span><em class="evidence-${item.evidence}">${evidenceCopy(item.evidence)}</em></div>`;
}


export function validationCards(period?: ValidationPeriod): string {
  if (!period?.rounds) return '<div class="a2-empty">São necessários ao menos 20 concursos contínuos antes do primeiro alvo de validação.</div>';
  const evidenceEligible = period.evidenceEligible !== false;
  return period.tiers.map((tier) => {
    const tone = tier.difference > 0 ? "positive" : tier.difference < 0 ? "negative" : "";
    const evidence = evidenceEligible ? evidenceCopy(tier.evidence) : "amostra insuficiente para classificar evidência";
    return `<article class="panel a2-validation-card"><div class="a2-panel-head"><strong>${TIER_LABELS[tier.tier]}</strong><span class="evidence-${evidenceEligible ? tier.evidence : "none"}">${evidence}</span></div><div class="a2-validation-rates"><span><small>observado</small><strong>${percent(tier.observedRate)}</strong></span><span><small>esperado</small><strong>${percent(tier.expectedRate)}</strong></span><span><small>diferença</small><strong class="${tone}">${signed(tier.difference * 100, " p.p.")}</strong></span></div><p>${tier.observedHits} dezenas observadas · ${decimal(tier.expectedHits)} esperadas · p ajustado ${decimal(tier.adjustedPValue, 4)}${evidenceEligible ? "" : " · selo de evidência suprimido"}</p></article>`;
  }).join("");
}


export function robustnessRows(data: AnalysisPayload): string {
  return [...data.advanced.ranking.dynamics.items]
    .sort((a, b) => a.rank - b.rank)
    .map((item) => `<tr data-a2-number="${item.number}" tabindex="0"><td><strong>${number(item.number)}</strong></td><td>#${item.rank}</td><td>${TIER_LABELS[item.tier]}</td><td>${percent(item.weightRobustness.tierStability)}</td><td>${percent(item.weightRobustness.strongShare)}</td><td>${item.weightRobustness.scenarioCount ? `#${item.weightRobustness.rankRange[0]}–#${item.weightRobustness.rankRange[1]}` : "—"}</td></tr>`).join("");
}

