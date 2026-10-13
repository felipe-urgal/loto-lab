import { escapeHtml } from "../../shared/escaping.js";
import { NUMBER_TIERS, supportsExperimental, supportsCoverage, tierByNumber, algorithmSpace, purposeCopy, activeFilterCount } from "./state.js";
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
    const equivalent = rule.drawSize === value ? 1 : Math.round(
      Array.from({ length: rule.drawSize }, (_, index) => (value - index) / (rule.drawSize - index))
        .reduce((total, factor) => total * factor, 1),
    );
    html += `<option value="${value}" ${value === state.betSize ? "selected" : ""}>${value} dezenas · ${formatInteger(equivalent)} apostas simples</option>`;
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
  const tiers = tierByNumber(state.plan);
  const minimum = state.lotteryConfig.minNumber;
  let html = "";
  for (let offset = 0; offset < state.plan.universeSize; offset += 1) {
    const value = minimum + offset;
    const selection = state.purpose === "coverage"
      ? state.coveragePool.has(value) ? "fixed" : "auto"
      : state.fixed.has(value) ? "fixed" : state.excluded.has(value) ? "excluded" : "auto";
    const tier = state.purpose === "coverage" ? "" : tiers.get(value) || "";
    const selectionLabel = state.purpose === "coverage"
      ? selection === "fixed" ? "no pool de cobertura" : "fora do pool de cobertura"
      : selection === "fixed" ? "fixada" : selection === "excluded" ? "excluída" : "automática";
    html += `<button type="button" class="g2-number ${tier ? `is-${tier}` : ""} ${selection !== "auto" ? `is-${selection}` : ""}" data-g2-number="${value}" data-selection="${selection}" aria-label="Dezena ${numberLabel(value)}: ${selectionLabel}">${numberLabel(value)}</button>`;
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
      <div class="g2-plan-stat"><span>Pool explorado pelo motor</span><strong>${formatInteger(algorithm.rawCombinationCapacity)}</strong><small>${algorithm.candidatePoolSize} dezenas no pool · shortlist até ${algorithm.shortlistLimit}</small></div>
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
    <div class="g2-summary-wide"><span>Custo</span><strong>Confirmado na prévia</strong></div>
  </div>`;
}


export function flowMarkup(): string {
  return `<ol class="g2-flow" aria-label="Etapas para gerar jogos">
    <li data-g2-flow-step="configure"><span>1</span><strong>Configurar</strong></li>
    <li data-g2-flow-step="preview"><span>2</span><strong>Gerar prévia</strong></li>
    <li data-g2-flow-step="review"><span>3</span><strong>Revisar</strong></li>
    <li data-g2-flow-step="save"><span>4</span><strong>Salvar</strong></li>
  </ol>`;
}


export function workspaceMarkup(state: GeneratorState): string {
  const hasHistoricalTiers = NUMBER_TIERS.some((tier) => (state.plan.numberTiers[tier] || []).length > 0);
  return `<div class="g2-shell" data-g2-shell data-g2-stage="configure">
    <div class="g2-principle"><strong>Gerar jogos</strong><span>Configure a aposta, gere uma prévia, revise os jogos e salve somente o que você aprovou.</span></div>
    ${flowMarkup()}
    <div class="g2-workspace">
      <div class="g2-main">
        <section class="panel g2-card g2-build-card">
          <div class="g2-card-head"><div><strong>${state.lottery === "super-sete" ? "Monte as colunas" : state.purpose === "coverage" ? "Monte o pool de cobertura" : "Monte suas escolhas"}</strong><span>${state.lottery === "super-sete" ? "As marcações permanecem posicionais por coluna." : state.purpose === "coverage" ? "Clique nas dezenas que devem formar o universo do desdobramento." : "Fixe, exclua ou deixe o motor escolher automaticamente."}</span></div></div>
          ${state.lottery === "super-sete" || state.purpose === "coverage" ? "" : selectionModesMarkup(state)}
          ${state.lottery === "super-sete" ? "" : `<div class="g2-number-legend">
            <span><i class="g2-key"></i> ${state.purpose === "coverage" ? "Fora do pool" : "Automática"}</span><span><i class="g2-key is-fixed"></i> ${state.purpose === "coverage" ? "No pool" : "Fixada"}</span>${state.purpose === "coverage" ? "" : '<span><i class="g2-key is-excluded"></i> Excluída</span>'}
            ${hasHistoricalTiers ? '<span><i class="g2-key is-strong"></i> Forte histórica</span><span><i class="g2-key is-balanced"></i> Intermediária histórica</span><span><i class="g2-key is-cold"></i> Fria histórica</span>' : ""}
          </div>`}
          <div class="g2-number-grid" data-g2-number-grid>${numberGridMarkup(state)}</div>
          <div class="g2-selection-summary" data-g2-selection-summary></div>
        </section>

        <details class="g2-advanced" data-g2-advanced>
          <summary><span>Filtros e auditoria</span><small>Opcional · fechado por padrão</small></summary>
          <div class="g2-advanced-body">
            <section>
              <div class="g2-card-head"><div><strong>Filtros estruturais</strong><span>${state.lottery === "super-sete" ? "Filtros de dezenas não se aplicam a esta modalidade." : "Desligados por padrão. Use somente quando quiser restringir a composição."}</span></div></div>
              <div class="g2-filter-list" data-g2-filters>${state.lottery === "super-sete" ? '<p class="g2-disclaimer">A composição é controlada pelas marcações de cada coluna.</p>' : filtersMarkup(state)}</div>
            </section>
            <details class="g2-subdetails">
              <summary>Metodologia</summary>
              <div class="g2-subdetails-body">${methodologyMarkup(state)}</div>
            </details>
            <details class="g2-subdetails">
              <summary>Espaço combinatório e referências</summary>
              <div class="g2-technical-grid">
                <section class="g2-technical-panel" data-g2-plan>${planMarkup(state)}</section>
                <section class="g2-technical-panel" data-g2-baseline>${baselineMarkup(state)}</section>
              </div>
            </details>
            <div data-g2-explainability-slot></div>
          </div>
        </details>
      </div>

      <aside class="g2-side">
        <section class="panel g2-card g2-config-card">
          <div class="g2-card-head"><div><strong>Configuração</strong><span>Somente o necessário para gerar a prévia.</span></div></div>
          <div class="g2-form-grid">
            <div class="g2-field"><label for="g2-purpose">Finalidade</label><select id="g2-purpose">
              <option value="uniform" ${state.purpose === "uniform" ? "selected" : ""}>Aleatório auditável</option>
              <option value="portfolio" ${state.purpose === "portfolio" ? "selected" : ""}>Carteira diversificada</option>
              <option value="coverage" ${state.purpose === "coverage" ? "selected" : ""} ${supportsCoverage(state.lottery) ? "" : "disabled"}>Cobertura / Desdobramento</option>
              <option value="experimental" ${state.purpose === "experimental" ? "selected" : ""} ${supportsExperimental(state.lottery) ? "" : "disabled"}>Experimental</option>
            </select><small>${escapeHtml(purposeCopy(state.purpose).description)}</small></div>
            <div class="g2-field"><label for="g2-game-count">${state.purpose === "coverage" ? "Limite de jogos" : "Quantidade de jogos"}</label><input id="g2-game-count" type="number" min="1" max="${state.purpose === "coverage" ? 100 : 10}" value="${state.gameCount}" /></div>
            <div class="g2-field"><label for="g2-bet-size">${state.lottery === "mais-milionaria" ? "Números por aposta" : state.lottery === "super-sete" ? "Estrutura" : "Dezenas por aposta"}</label><select id="g2-bet-size" ${state.purpose === "experimental" || (!state.plan.betRule && state.lottery !== "mais-milionaria") ? "disabled" : ""}>${betSizeOptions(state)}</select></div>
            <div class="g2-field"><label for="g2-fixed-count">Núcleo compartilhado</label><select id="g2-fixed-count" ${state.purpose === "coverage" ? "disabled" : ""}>${fixedCountOptions(state)}</select></div>
            <div class="g2-field"><label for="g2-target">Concurso alvo</label><input id="g2-target" type="number" min="1" value="${state.targetContestNumber ?? ""}" /></div>
            ${state.purpose === "coverage" ? `<div class="g2-field"><label for="g2-coverage-target">Subconjunto alvo</label><input id="g2-coverage-target" type="number" min="1" max="${state.betSize}" value="${state.coverageTargetSize}" /><small>Cada subconjunto deste tamanho será contabilizado na cobertura.</small></div><div class="g2-field"><label for="g2-coverage-budget">Orçamento máximo</label><input id="g2-coverage-budget" type="number" min="0" step="0.01" value="${state.coverageBudgetCents === undefined ? "" : (state.coverageBudgetCents / 100).toFixed(2)}" placeholder="Opcional" /><small>Em reais. O motor para antes de ultrapassar o orçamento.</small></div>` : ""}
            ${structuredFieldsMarkup(state)}
          </div>
        </section>

        <section class="panel g2-card g2-summary-card">
          <div class="g2-card-head"><div><strong>Resumo</strong><span>Revise a configuração antes de gerar.</span></div></div>
          <div data-g2-config-summary>${configurationSummaryMarkup(state)}</div>
        </section>

        <section class="panel g2-card g2-action-card">
          <p>A prévia não salva nada. Você verá os jogos e o custo antes de confirmar.</p>
          <button class="button primary" type="button" data-g2-preview>Gerar prévia</button>
          <div class="g2-error" data-g2-error hidden></div>
        </section>
      </aside>
    </div>
    <section class="g2-result" data-g2-result></section>
  </div>`;
}


export function gameMarkup(game: GeneratedGame, index: number): string {
  const fixed = new Set(game.fixedNumbers || []);
  const balls = game.columns
    ? game.columns.map((values, column) => `<span class="ball" title="Coluna ${column + 1}">C${column + 1}:${values.join("·")}</span>`).join("")
    : (game.numbers || []).map((value) => `<span class="ball ${fixed.has(value) ? "is-fixed" : ""}">${numberLabel(value)}</span>`).join("");
  const repeated = game.metadata?.repeatedFromLastContest?.length ?? 0;
  const secondary = game.secondary?.kind === "clovers"
    ? `Trevos · ${game.secondary.values.join(" · ")}`
    : game.secondary?.kind === "favorite-team"
      ? `Time do Coração · ${escapeHtml(game.secondary.values[0] ?? "")}`
      : game.secondary?.kind === "lucky-month"
        ? `Mês da Sorte · ${escapeHtml(game.secondary.values[0] ?? "")}`
        : game.luckyMonth
          ? `Mês da Sorte · ${escapeHtml(game.luckyMonth)}`
          : "";
  return `<article class="panel g2-game">
    <div class="g2-game-head"><strong>Jogo ${index + 1}</strong><span>${game.fixedNumbers?.length ?? 0} núcleo · ${game.variableNumbers?.length ?? 0} variáveis</span></div>
    <div class="draw-numbers">${balls}</div>
    <div class="g2-game-meta"><span>Pares <strong>${game.metadata?.even ?? "—"}</strong></span><span>Ímpares <strong>${game.metadata?.odd ?? "—"}</strong></span><span>Soma <strong>${game.metadata?.sum ?? "—"}</strong></span><span>Repetidas <strong>${repeated}</strong></span></div>
    ${secondary ? `<div class="g2-game-month">${secondary}</div>` : ""}
  </article>`;
}

