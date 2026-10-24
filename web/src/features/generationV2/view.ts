import { escapeHtml } from "../../shared/escaping.js";
import { supportsExperimental, supportsCoverage, supportsPayout, algorithmSpace, purposeCopy, activeFilterCount } from "./state.js";
import type { GeneratedGame, GeneratorState, GenerationFilterKey, SelectionMode } from "./types.js";

export function formatInteger(value: unknown): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}


export function formatDecimal(value: unknown, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}


export function formatPercent(value: unknown, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}


export function formatCurrencyCents(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}


export function numberLabel(value: number): string {
  return String(value).padStart(2, "0");
}


export function rangeOptions(minimum: number, maximum: number, selected: number): string {
  let html = "";
  for (let value = minimum; value <= maximum; value += 1) {
    html += `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`;
  }
  return html;
}


export function fixedCountOptions(state: GeneratorState): string {
  return state.plan.methodology.fixedCountOptions.map((value) =>
    `<option value="${value}" ${value === state.fixedCount ? "selected" : ""} ${value < state.fixed.size ? "disabled" : ""}>${value} fixas</option>`,
  ).join("");
}


export function betSizeOptions(state: GeneratorState): string {
  const rule = state.plan.betRule;
  if (!rule && state.lottery === "mais-milionaria") {
    let html = "";
    for (let value = 6; value <= 12; value += 1) {
      html += `<option value="${value}" ${value === state.betSize ? "selected" : ""}>${value} números</option>`;
    }
    return html;
  }
  if (!rule) return `<option value="${state.plan.betSize}" selected>${state.lottery === "super-sete" ? "7 colunas" : `${state.plan.betSize} dezenas`}</option>`;
  let html = "";
  for (let value = rule.minBetSize; value <= rule.maxBetSize; value += 1) {
    html += `<option value="${value}" ${value === state.betSize ? "selected" : ""}>${value}</option>`;
  }
  return html;
}


export function filterMarkup(
  key: GenerationFilterKey,
  title: string,
  baseline: string,
  state: GeneratorState,
  minimum: number,
  maximum: number,
  disabled = false,
): string {
  const filter = state.filters[key];
  const inactive = !filter.enabled || disabled;
  return `<div class="g2-filter" data-g2-filter="${key}" aria-disabled="${inactive ? "true" : "false"}">
    <div class="g2-filter-top">
      <label class="g2-filter-toggle"><input type="checkbox" data-g2-filter-toggle="${key}" ${filter.enabled ? "checked" : ""} ${disabled ? "disabled" : ""} /> ${escapeHtml(title)}</label>
      <span class="g2-filter-baseline" data-g2-filter-baseline="${key}">${escapeHtml(baseline)}</span>
    </div>
    <div class="g2-range">
      <select data-g2-range="${key}:min" aria-label="Mínimo de ${escapeHtml(title)}" ${inactive ? "disabled" : ""}>${rangeOptions(minimum, maximum, filter.min)}</select>
      <span>até</span>
      <select data-g2-range="${key}:max" aria-label="Máximo de ${escapeHtml(title)}" ${inactive ? "disabled" : ""}>${rangeOptions(minimum, maximum, filter.max)}</select>
    </div>
  </div>`;
}


export function sumFilterMarkup(state: GeneratorState): string {
  const filter = state.filters.sum;
  const baseline = state.plan.baseline;
  return `<div class="g2-filter" data-g2-filter="sum" aria-disabled="${filter.enabled ? "false" : "true"}">
    <div class="g2-filter-top">
      <label class="g2-filter-toggle"><input type="checkbox" data-g2-filter-toggle="sum" ${filter.enabled ? "checked" : ""} /> Limitar soma</label>
      <span class="g2-filter-baseline" data-g2-filter-baseline="sum">Esperado ${formatDecimal(baseline.expectedSum)} · desvio ${formatDecimal(baseline.sumStdDev)}</span>
    </div>
    <div class="g2-range">
      <input type="number" data-g2-range="sum:min" value="${filter.min}" aria-label="Soma mínima" ${filter.enabled ? "" : "disabled"} />
      <span>até</span>
      <input type="number" data-g2-range="sum:max" value="${filter.max}" aria-label="Soma máxima" ${filter.enabled ? "" : "disabled"} />
    </div>
  </div>`;
}


export function filtersMarkup(state: GeneratorState): string {
  const repeatedExpected = state.plan.baseline.expectedRepeated;
  const repeatedUnavailable = !state.plan.dataQuality.previousContestAvailable;
  return `${filterMarkup("odd", "Faixa de ímpares", `Esperado ${formatDecimal(state.plan.baseline.expectedOdd)}`, state, 0, state.plan.drawSize)}
    ${filterMarkup(
      "repeated",
      "Repetidas do concurso anterior",
      repeatedUnavailable ? `Concurso #${state.plan.dataQuality.expectedPreviousContestNumber ?? "—"} indisponível` : `Esperado ${formatDecimal(repeatedExpected)}`,
      state,
      0,
      state.plan.drawSize,
      repeatedUnavailable,
    )}
    ${sumFilterMarkup(state)}`;
}


export function numberGridMarkup(state: GeneratorState): string {
  if (state.lottery === "super-sete") {
    return `<div class="g2-columns-note">Super Sete usa 7 colunas posicionais. Os dígitos são gerados e exibidos por coluna, sem serem tratados como dezenas.</div>`;
  }
  const minimum = state.lotteryConfig.minNumber;
  let html = "";
  for (let offset = 0; offset < state.plan.universeSize; offset += 1) {
    const value = minimum + offset;
    const selection = state.purpose === "coverage"
      ? state.coveragePool.has(value) ? "fixed" : "auto"
      : state.fixed.has(value) ? "fixed" : state.excluded.has(value) ? "excluded" : "auto";
    const selectionLabel = state.purpose === "coverage"
      ? selection === "fixed" ? "no pool de cobertura" : "fora do pool de cobertura"
      : selection === "fixed" ? "fixada" : selection === "excluded" ? "excluída" : "automática";
    html += `<button type="button" class="g2-number ${selection !== "auto" ? `is-${selection}` : ""}" data-g2-number="${value}" data-selection="${selection}" aria-label="Dezena ${numberLabel(value)}: ${selectionLabel}">${numberLabel(value)}</button>`;
  }
  return html;
}


export function planMarkup(state: GeneratorState): string {
  const plan = state.plan;
  const algorithm = algorithmSpace(state);
  const purpose = purposeCopy(state.purpose);
  const coverage = Math.max(0, Math.min(1, plan.space.overallCoverage));
  const issue = plan.constraintIssues[0];
  return `<div class="g2-card-head"><div><strong>Espaço e funil do motor</strong><span>Matemática global separada do espaço realmente percorrido pelo algoritmo.</span></div></div>
    <div class="g2-plan-grid">
      <div class="g2-plan-stat"><span>Universo matemático</span><strong>${formatInteger(plan.lotteryBaseline.totalCombinations)}</strong><small>todas as combinações simples</small></div>
      <div class="g2-plan-stat"><span>Após seleção manual</span><strong>${formatInteger(plan.space.afterManualSelection)}</strong><small>fixadas/excluídas, antes dos filtros</small></div>
      <div class="g2-plan-stat"><span>Elegíveis matematicamente</span><strong>${formatInteger(plan.space.eligibleCombinations)}</strong><small>atendem aos filtros estruturais</small></div>
      ${state.purpose === "experimental" ? `<div class="g2-plan-stat"><span>Pool explorado pelo motor</span><strong>${formatInteger(algorithm.rawCombinationCapacity)}</strong><small>${algorithm.candidatePoolSize} dezenas no pool · shortlist até ${algorithm.shortlistLimit}</small></div>` : `<div class="g2-plan-stat"><span>Modo de geração</span><strong>${escapeHtml(purpose.label)}</strong><small>${escapeHtml(purpose.description)}</small></div>`}
    </div>
    <div class="g2-space-bar" aria-hidden="true"><span style="width:${Math.max(.2, coverage * 100)}%"></span></div>
    ${issue ? `<p class="g2-error">${escapeHtml(issue)}</p>` : ""}
    <p class="g2-disclaimer"><strong>${escapeHtml(purpose.label)}:</strong> ${escapeHtml(purpose.disclaimer)}</p>`;
}


export function methodologyMarkup(state: GeneratorState): string {
  return `<div class="g2-methodology">
    <strong>Metodologia · ${escapeHtml(state.lotteryConfig.name)}</strong>
    <ul>${state.plan.methodology.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
  </div>`;
}


export function baselineMarkup(state: GeneratorState): string {
  const plan = state.plan;
  const conditional = plan.baseline;
  const lottery = plan.lotteryBaseline;
  const reference = plan.dataQuality.previousContestAvailable ? `#${plan.referenceContestNumber}` : "indisponível";
  const gaps = plan.dataQuality.historyGapCount;
  return `<div class="g2-card-head"><div><strong>Referência condicionada</strong><span>Referências após fixadas/excluídas; a referência original da loteria aparece abaixo.</span></div></div>
    <div class="g2-plan-grid">
      <div class="g2-plan-stat"><span>Ímpares esperados</span><strong>${formatDecimal(conditional.expectedOdd)}</strong><small>loteria sem seleção: ${formatDecimal(lottery.expectedOdd)}</small></div>
      <div class="g2-plan-stat"><span>Repetidas esperadas</span><strong>${conditional.expectedRepeated === null ? "—" : formatDecimal(conditional.expectedRepeated)}</strong><small>loteria: ${lottery.expectedRepeated === null ? "—" : formatDecimal(lottery.expectedRepeated)} · referência ${reference}</small></div>
      <div class="g2-plan-stat"><span>Soma esperada</span><strong>${formatDecimal(conditional.expectedSum)}</strong><small>loteria: ${formatDecimal(lottery.expectedSum)} · desvio cond. ${formatDecimal(conditional.sumStdDev)}</small></div>
      <div class="g2-plan-stat"><span>Histórico usado</span><strong>${formatInteger(plan.historyCount)}</strong><small>${gaps ? `${formatInteger(gaps)} concurso(s) ausente(s) no histórico` : "sequência armazenada sem gaps internos"}</small></div>
    </div>
    ${!plan.dataQuality.previousContestAvailable ? `<p class="g2-disclaimer"><strong>Repetição indisponível:</strong> falta o concurso #${escapeHtml(plan.dataQuality.expectedPreviousContestNumber ?? "—")}. Nenhum concurso mais antigo é usado como substituto.</p>` : ""}`;
}


export function selectionModesMarkup(state: GeneratorState): string {
  const modes: Array<[SelectionMode, string]> = [
    ["fix", "Fixar"],
    ["exclude", "Excluir"],
    ["auto", "Automática"],
  ];
  return `<div class="g2-result-actions" role="group" aria-label="Ação ao clicar nas dezenas">
    ${modes.map(([mode, label]) => `<button class="button compact ${state.selectionMode === mode ? "primary" : ""}" type="button" data-g2-selection-mode="${mode}" aria-pressed="${state.selectionMode === mode ? "true" : "false"}">${label}</button>`).join("")}
  </div>`;
}


export function structuredFieldsMarkup(state: GeneratorState): string {
  if (state.lottery === "mais-milionaria") {
    return `<div class="g2-field"><label for="g2-clover-count">Trevos por aposta</label><select id="g2-clover-count">${[2, 3, 4, 5, 6].map((value) => `<option value="${value}" ${value === state.cloverCount ? "selected" : ""}>${value} trevos</option>`).join("")}</select><small>Trevos permanecem separados dos números.</small></div>`;
  }
  if (state.lottery === "timemania") {
    return `<div class="g2-field"><label for="g2-favorite-team">Time do Coração</label><input id="g2-favorite-team" type="text" maxlength="120" value="${escapeHtml(state.favoriteTeam)}" placeholder="Informe o time" /><small>Campo obrigatório e independente das 10 dezenas.</small></div>`;
  }
  if (state.lottery === "super-sete") {
    return `<div class="g2-field" style="grid-column:1/-1"><label>Marcações por coluna</label><div class="g2-range">${state.columnMarks.map((count, index) => `<label>C${index + 1}<select data-g2-column-mark="${index}">${[1, 2, 3].map((value) => `<option value="${value}" ${value === count ? "selected" : ""}>${value}</option>`).join("")}</select></label>`).join("")}</div><small>7–14 marcações: 1–2 por coluna. 15–21: 2–3 por coluna.</small></div>`;
  }
  return "";
}


export function structuredSummary(state: GeneratorState): string {
  if (state.lottery === "mais-milionaria") return `${state.cloverCount} trevos por aposta`;
  if (state.lottery === "timemania") return state.favoriteTeam.trim() ? `Time: ${escapeHtml(state.favoriteTeam.trim())}` : "Time do Coração pendente";
  if (state.lottery === "super-sete") return `${state.columnMarks.reduce((sum, value) => sum + value, 0)} marcações em 7 colunas`;
  return "";
}


export function configurationSummaryMarkup(state: GeneratorState): string {
  const purpose = purposeCopy(state.purpose);
  const extra = structuredSummary(state);
  const filters = activeFilterCount(state);
  return `<div class="g2-summary-list">
    <div><span>Finalidade</span><strong>${escapeHtml(purpose.label)}</strong></div>
    <div><span>Jogos</span><strong>${state.gameCount}</strong></div>
    <div><span>${state.lottery === "super-sete" ? "Estrutura" : "Aposta"}</span><strong>${state.lottery === "super-sete" ? "7 colunas" : `${state.betSize} dezenas`}</strong></div>
    <div><span>${state.purpose === "coverage" ? "Pool" : "Núcleo"}</span><strong>${state.purpose === "coverage" ? `${state.coveragePool.size} dezenas` : state.fixedCount ? `${state.fixedCount} compartilhadas` : "Sem núcleo"}</strong></div>
    <div><span>Concurso alvo</span><strong>${state.targetContestNumber ? `#${state.targetContestNumber}` : "Automático"}</strong></div>
    <div><span>Filtros</span><strong>${filters ? `${filters} ativo(s)` : "Nenhum"}</strong></div>
    ${extra ? `<div class="g2-summary-wide"><span>Modalidade</span><strong>${extra}</strong></div>` : ""}
  </div>`;
}


export function icon(name: string): string {
  return `<img class="icon" src="/assets/icons/${name}.svg" alt="" width="22" height="22" />`;
}

export function emptyGamesMarkup(): string {
  return `<div class="section-heading"><h2><img class="coral-spark" src="/assets/images/coral-spark.webp" width="36" height="40" alt="" />Seus jogos</h2></div><div class="games-empty"><strong>Um clique, novas possibilidades.</strong><p>Escolha a modalidade e toque em Gerar jogos para começar.</p></div>`;
}

export function selectionBrief(state: GeneratorState): string {
  if (state.purpose === "coverage") return `${state.coveragePool.size} dezenas no pool`;
  const describe = (values: Set<number>, singular: string, plural: string): string => {
    if (!values.size) return "";
    const label = values.size <= 3 ? [...values].sort((a, b) => a - b).map(numberLabel).join(" e ") : String(values.size);
    return `${label} ${values.size === 1 ? singular : plural}`;
  };
  return [describe(state.fixed, "fixada", "fixadas"), describe(state.excluded, "excluída", "excluídas")].filter(Boolean).join(" · ") || "Personalização opcional";
}

export function workspaceMarkup(state: GeneratorState): string {
  const catalog = state.lotteryCatalog || [state.lotteryConfig];
  const selection = selectionBrief(state);
  return `<div class="g2-shell" data-g2-shell data-g2-stage="configure">
    <section class="g2-controls" aria-label="Configuração dos jogos">
      <div class="g2-field modality-field"><label for="lottery-select">Modalidade</label><select id="lottery-select">${catalog.filter(item => item.enabled !== false && item.capabilities?.simulation !== false).map(item => `<option value="${escapeHtml(item.id)}" ${item.id === state.lottery ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div>
      <div class="g2-field"><label for="g2-purpose">Modo de geração</label><select id="g2-purpose"><option value="uniform" ${state.purpose === "uniform" ? "selected" : ""}>Aleatório</option><option value="portfolio" ${state.purpose === "portfolio" ? "selected" : ""}>Diversificado</option>${supportsPayout(state.lottery) ? `<option value="payout" ${state.purpose === "payout" ? "selected" : ""}>Prêmio máximo</option>` : ""}${supportsCoverage(state.lottery) ? `<option value="coverage" ${state.purpose === "coverage" ? "selected" : ""}>Desdobramento</option>` : ""}${supportsExperimental(state.lottery) ? `<option value="experimental" ${state.purpose === "experimental" ? "selected" : ""}>Experimental</option>` : ""}</select></div>
      <div class="g2-field quantity-field"><label for="g2-game-count">Jogos</label><div class="stepper"><button type="button" data-g2-step="-1" aria-label="Diminuir quantidade de jogos">${icon("minus")}</button><input id="g2-game-count" type="number" min="1" max="${state.purpose === "coverage" ? 100 : 10}" value="${state.gameCount}" /><button type="button" data-g2-step="1" aria-label="Aumentar quantidade de jogos">${icon("plus")}</button></div></div>
      <div class="g2-field size-field"><label for="g2-bet-size">${state.lottery === "super-sete" ? "Estrutura" : "Dezenas por jogo"}</label><select id="g2-bet-size" ${state.purpose === "experimental" || state.purpose === "payout" || (!state.plan.betRule && state.lottery !== "mais-milionaria") ? "disabled" : ""}>${betSizeOptions(state)}</select></div>
      <button class="button primary generate-button" type="button" data-g2-preview>${icon("star-four")}<span>Gerar jogos</span>${icon("arrow-right")}</button>
    </section>
    ${structuredFieldsMarkup(state) ? `<div class="structured-fields">${structuredFieldsMarkup(state)}</div>` : ""}
    <div class="g2-error" data-g2-error role="alert" hidden></div>
    <details class="g2-customize" data-g2-customize ${state.purpose === "coverage" ? "open" : ""}>
      <summary>${icon("sliders-horizontal")}<strong>Personalizar dezenas e filtros</strong>${icon("caret-down")}<span data-g2-selection-brief>${selection}</span></summary>
      <div class="customize-body">
        <section class="number-workspace"><div class="g2-card-head"><strong>${state.purpose === "coverage" ? "Monte seu pool de cobertura" : state.lottery === "super-sete" ? "Suas colunas" : "Do seu jeito"}</strong><p>${state.purpose === "coverage" ? "Selecione as dezenas que podem compor o desdobramento." : "Fixe as dezenas que entram nos jogos, exclua outras ou deixe a escolha automática."}</p></div>
          ${state.lottery === "super-sete" || state.purpose === "coverage" ? "" : selectionModesMarkup(state)}
          <div class="g2-number-grid" data-g2-number-grid>${numberGridMarkup(state)}</div>
          <div class="g2-selection-summary" data-g2-selection-summary aria-live="polite"></div>
        </section>
        <section class="preferences-workspace"><h3>Mais possibilidades</h3>
          ${state.purpose === "experimental" ? `<div class="g2-field"><label for="g2-fixed-count">Dezenas compartilhadas entre jogos</label><select id="g2-fixed-count">${fixedCountOptions(state)}</select></div>` : ""}
          <div class="g2-field"><label for="g2-target">Concurso de referência</label><input id="g2-target" type="number" min="1" value="${state.targetContestNumber ?? ""}" placeholder="Próximo concurso" /></div>
          ${state.purpose === "coverage" ? `<div class="g2-field"><label for="g2-coverage-target">Tamanho dos subconjuntos</label><input id="g2-coverage-target" type="number" min="1" max="${state.betSize}" value="${state.coverageTargetSize}" /></div>` : ""}
          ${state.lottery === "super-sete" ? "" : `<details class="g2-subdetails"><summary>Filtros de composição</summary><div class="g2-filter-list">${filtersMarkup(state)}</div></details>`}
          <details class="g2-subdetails"><summary>Metodologia e referências</summary><div class="g2-technical-grid">${methodologyMarkup(state)}<section data-g2-plan>${planMarkup(state)}</section><section data-g2-baseline>${baselineMarkup(state)}</section></div></details>
          <div data-g2-generated-audit></div>
        </section>
      </div>
    </details>
    <section class="g2-result" data-g2-result aria-live="polite">${emptyGamesMarkup()}</section>
  </div>`;
}

export function gamesToText(games: GeneratedGame[]): string {
  return games.map((game, index) => {
    const numbers = game.columns
      ? game.columns.map((values, column) => `C${column + 1}: ${values.join(", ")}`).join(" | ")
      : (game.numbers || []).map(numberLabel).join(" ");
    const secondary = game.secondary?.values.join(", ") || game.luckyMonth || "";
    return `Jogo ${String(index + 1).padStart(2, "0")}: ${numbers}${secondary ? ` | ${secondary}` : ""}`;
  }).join("\n");
}

export function gameMarkup(game: GeneratedGame, index: number): string {
  const fixed = new Set(game.fixedNumbers || []);
  const balls = game.columns
    ? game.columns.map((values, column) => `<span class="ball column-ball" aria-label="Coluna ${column + 1}: ${values.join(", ")}">C${column + 1}:${values.join("·")}</span>`).join("")
    : (game.numbers || []).map(value => `<span class="ball ${fixed.has(value) ? "is-fixed" : ""}" ${fixed.has(value) ? 'aria-label="Dezena fixada '+numberLabel(value)+'"' : ""}>${numberLabel(value)}${fixed.has(value) ? icon("push-pin") : ""}</span>`).join("");
  const secondary = game.secondary?.kind === "clovers"
    ? `Trevos · ${game.secondary.values.join(" · ")}`
    : game.secondary?.kind === "favorite-team"
      ? `Time do Coração · ${escapeHtml(game.secondary.values[0] ?? "")}`
      : game.secondary?.kind === "lucky-month"
        ? `Mês da Sorte · ${escapeHtml(game.secondary.values[0] ?? "")}`
        : game.luckyMonth ? `Mês da Sorte · ${escapeHtml(game.luckyMonth)}` : "";
  return `<article class="g2-game"><h3>Jogo ${String(index + 1).padStart(2, "0")}</h3><div class="draw-numbers">${balls}</div>${secondary ? `<p class="g2-game-month">${secondary}</p>` : ""}</article>`;
}
