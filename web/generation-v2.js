const root = document.querySelector("#content");
let lifecycleToken = 0;
let cleanupCurrent = null;

const LOTTERY_FALLBACK = {
  "mega-sena": { label: "Mega-Sena", max: 60, drawSize: 6, defaultGames: 2 },
  lotofacil: { label: "Lotofácil", max: 25, drawSize: 15, defaultGames: 4 },
  "dia-de-sorte": { label: "Dia de Sorte", max: 31, drawSize: 7, defaultGames: 4 },
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function currentView() {
  return location.hash.replace("#", "") || "dashboard";
}

async function postJson(path, body, signal) {
  const response = await fetch(`/api/v1${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Erro HTTP ${response.status}`);
    error.code = payload?.error?.code || "HTTP_ERROR";
    throw error;
  }
  return payload;
}

function formatInteger(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatDecimal(value, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function formatPercent(value, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function numberLabel(value) {
  return String(value).padStart(2, "0");
}

function tierByNumber(plan) {
  const result = new Map();
  for (const tier of ["strong", "balanced", "cold"]) {
    for (const number of plan?.numberTiers?.[tier] || []) result.set(number, tier);
  }
  return result;
}

function constraintPayload(state) {
  const constraints = {};
  if (state.filters.odd.enabled) constraints.odd = { min: state.filters.odd.min, max: state.filters.odd.max };
  if (state.filters.repeated.enabled) constraints.repeated = { min: state.filters.repeated.min, max: state.filters.repeated.max };
  if (state.filters.sum.enabled) constraints.sum = { min: state.filters.sum.min, max: state.filters.sum.max };
  return Object.keys(constraints).length ? constraints : undefined;
}

function requestPayload(state, includeSeed = false) {
  const constraints = constraintPayload(state);
  return {
    lottery: state.lottery,
    gameCount: state.gameCount,
    fixedCount: state.fixedCount,
    targetContestNumber: state.targetContestNumber,
    generationMode: "diversified",
    fixedNumbers: [...state.fixed].sort((a, b) => a - b),
    excludedNumbers: [...state.excluded].sort((a, b) => a - b),
    ...(constraints ? { constraints } : {}),
    ...(includeSeed && state.preview?.generatorOptions?.seed ? { seed: state.preview.generatorOptions.seed } : {}),
  };
}

function planPayload(state) {
  const payload = requestPayload(state);
  delete payload.gameCount;
  delete payload.fixedCount;
  delete payload.generationMode;
  return payload;
}

function rangeOptions(minimum, maximum, selected) {
  let html = "";
  for (let value = minimum; value <= maximum; value += 1) {
    html += `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`;
  }
  return html;
}

function fixedCountOptions(state) {
  return state.plan.methodology.fixedCountOptions.map((value) =>
    `<option value="${value}" ${value === state.fixedCount ? "selected" : ""} ${value < state.fixed.size ? "disabled" : ""}>${value} fixas</option>`,
  ).join("");
}

function filterMarkup(key, title, baseline, state, minimum, maximum, disabled = false) {
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

function sumFilterMarkup(state) {
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

function filtersMarkup(state) {
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

function numberGridMarkup(state) {
  const tiers = tierByNumber(state.plan);
  let html = "";
  for (let value = 1; value <= state.plan.universeSize; value += 1) {
    const selection = state.fixed.has(value) ? "fixed" : state.excluded.has(value) ? "excluded" : "auto";
    const tier = tiers.get(value) || "";
    const selectionLabel = selection === "fixed" ? "fixada" : selection === "excluded" ? "excluída" : "automática";
    html += `<button type="button" class="g2-number ${tier ? `is-${tier}` : ""} ${selection !== "auto" ? `is-${selection}` : ""}" data-g2-number="${value}" data-selection="${selection}" aria-label="Dezena ${numberLabel(value)}: ${selectionLabel}">${numberLabel(value)}</button>`;
  }
  return html;
}

function algorithmSpace(state) {
  return state.plan.algorithmSpaces?.[String(state.fixedCount)] || {
    candidatePoolSize: 0,
    rawCombinationCapacity: 0,
    shortlistLimit: 0,
    variableCount: state.plan.drawSize - state.fixedCount,
  };
}

function planMarkup(state) {
  const plan = state.plan;
  const algorithm = algorithmSpace(state);
  const coverage = Math.max(0, Math.min(1, plan.space.overallCoverage));
  const issue = plan.constraintIssues?.[0];
  return `<div class="g2-card-head"><div><strong>Espaço e funil do motor</strong><span>Matemática global separada do espaço realmente percorrido pelo algoritmo.</span></div></div>
    <div class="g2-plan-grid">
      <div class="g2-plan-stat"><span>Universo matemático</span><strong>${formatInteger(plan.lotteryBaseline.totalCombinations)}</strong><small>todas as combinações simples</small></div>
      <div class="g2-plan-stat"><span>Após seleção manual</span><strong>${formatInteger(plan.space.afterManualSelection)}</strong><small>fixadas/excluídas, antes dos filtros</small></div>
      <div class="g2-plan-stat"><span>Elegíveis matematicamente</span><strong>${formatInteger(plan.space.eligibleCombinations)}</strong><small>atendem aos filtros estruturais</small></div>
      <div class="g2-plan-stat"><span>Pool explorado pelo motor</span><strong>${formatInteger(algorithm.rawCombinationCapacity)}</strong><small>${algorithm.candidatePoolSize} dezenas no pool · shortlist até ${algorithm.shortlistLimit}</small></div>
    </div>
    <div class="g2-space-bar" aria-hidden="true"><span style="width:${Math.max(.2, coverage * 100)}%"></span></div>
    ${issue ? `<p class="g2-error">${escapeHtml(issue)}</p>` : ""}
    <p class="g2-disclaimer"><strong>Importante:</strong> o contador elegível descreve o universo matemático. O motor ranqueia um pool menor por pontuação e diversificação; restringir o espaço não aumenta a probabilidade individual de uma combinação ser sorteada.</p>`;
}

function methodologyMarkup(state) {
  return `<div class="g2-methodology">
    <strong>Metodologia · ${escapeHtml(LOTTERY_FALLBACK[state.lottery].label)}</strong>
    <ul>${state.plan.methodology.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
  </div>`;
}

function baselineMarkup(state) {
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

function selectionModesMarkup(state) {
  const modes = [
    ["fix", "Fixar"],
    ["exclude", "Excluir"],
    ["auto", "Automática"],
  ];
  return `<div class="g2-result-actions" role="group" aria-label="Ação ao clicar nas dezenas">
    ${modes.map(([mode, label]) => `<button class="button compact ${state.selectionMode === mode ? "primary" : ""}" type="button" data-g2-selection-mode="${mode}" aria-pressed="${state.selectionMode === mode ? "true" : "false"}">${label}</button>`).join("")}
  </div>`;
}

function workspaceMarkup(state) {
  return `<div class="g2-shell" data-g2-shell>
    <div class="g2-principle"><strong>Algoritmo calcula; você audita.</strong><span>Configure o lote, veja o universo matemático e o espaço realmente explorado, gere uma prévia congelada e só então salve.</span></div>
    <div class="g2-workspace">
      <div class="g2-main">
        <section class="panel g2-card">
          <div class="g2-card-head"><div><strong>1. Configuração do lote</strong><span>O concurso alvo define o corte histórico usado no plano, nas cores das dezenas e na geração.</span></div></div>
          <div class="g2-form-grid">
            <div class="g2-field"><label for="g2-game-count">Quantidade de jogos</label><input id="g2-game-count" type="number" min="1" max="10" value="${state.gameCount}" /></div>
            <div class="g2-field"><label for="g2-fixed-count">Núcleo compartilhado</label><select id="g2-fixed-count">${fixedCountOptions(state)}</select></div>
            <div class="g2-field"><label for="g2-target">Concurso alvo</label><input id="g2-target" type="number" min="1" value="${state.targetContestNumber ?? ""}" /></div>
          </div>
        </section>

        <section class="panel g2-card">
          <div class="g2-card-head"><div><strong>2. Dezenas</strong><span>Escolha explicitamente a ação e clique nas dezenas. As cores Forte/Intermediária/Fria usam somente o histórico anterior ao alvo.</span></div></div>
          ${selectionModesMarkup(state)}
          <div class="g2-number-legend">
            <span><i class="g2-key"></i> Automática</span><span><i class="g2-key is-fixed"></i> Fixada</span><span><i class="g2-key is-excluded"></i> Excluída</span>
            <span><i class="g2-key is-strong"></i> Forte</span><span><i class="g2-key is-balanced"></i> Intermediária</span><span><i class="g2-key is-cold"></i> Fria</span>
          </div>
          <div class="g2-number-grid" data-g2-number-grid>${numberGridMarkup(state)}</div>
          <div class="g2-selection-summary" data-g2-selection-summary></div>
        </section>

        <section class="panel g2-card">
          <div class="g2-card-head"><div><strong>3. Filtros estruturais</strong><span>Desligados por padrão. As referências abaixo são condicionadas às dezenas manuais atuais.</span></div></div>
          <div class="g2-filter-list" data-g2-filters>${filtersMarkup(state)}</div>
          <div style="margin-top:14px">${methodologyMarkup(state)}</div>
        </section>

        <section class="panel g2-card">
          <div class="g2-actions">
            <div class="g2-actions-copy">A prévia fica congelada por até 24 horas com hash do histórico, configuração, fingerprint dos jogos e chave idempotente. Se o histórico mudar, o save é recusado.</div>
            <button class="button primary" type="button" data-g2-preview>Gerar prévia auditável</button>
          </div>
          <div class="g2-error" data-g2-error hidden></div>
        </section>

        <section data-g2-result></section>
      </div>

      <aside class="g2-side">
        <section class="panel g2-card" data-g2-plan>${planMarkup(state)}</section>
        <section class="panel g2-card" data-g2-baseline>${baselineMarkup(state)}</section>
      </aside>
    </div>
  </div>`;
}

function selectionSummary(state, message = "") {
  const target = root?.querySelector("[data-g2-selection-summary]");
  if (!target) return;
  const fixed = [...state.fixed].sort((a, b) => a - b).map(numberLabel).join(", ") || "nenhuma";
  const excluded = [...state.excluded].sort((a, b) => a - b).map(numberLabel).join(", ") || "nenhuma";
  const modeLabel = state.selectionMode === "fix" ? "Fixar" : state.selectionMode === "exclude" ? "Excluir" : "Automática";
  target.innerHTML = `<span>Ação <strong>${modeLabel}</strong></span><span>Fixadas <strong>${escapeHtml(fixed)}</strong></span><span>Excluídas <strong>${escapeHtml(excluded)}</strong></span>${message ? `<span><strong>${escapeHtml(message)}</strong></span>` : ""}`;
}

function updateModeButtons(state) {
  root?.querySelectorAll("[data-g2-selection-mode]").forEach((button) => {
    const active = button.dataset.g2SelectionMode === state.selectionMode;
    button.classList.toggle("primary", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function updateNumberButtons(state) {
  const tiers = tierByNumber(state.plan);
  root?.querySelectorAll("[data-g2-number]").forEach((button) => {
    const value = Number(button.dataset.g2Number);
    const selection = state.fixed.has(value) ? "fixed" : state.excluded.has(value) ? "excluded" : "auto";
    const tier = tiers.get(value) || "";
    button.dataset.selection = selection;
    button.classList.toggle("is-fixed", selection === "fixed");
    button.classList.toggle("is-excluded", selection === "excluded");
    for (const name of ["strong", "balanced", "cold"]) button.classList.toggle(`is-${name}`, tier === name);
    const label = selection === "fixed" ? "fixada" : selection === "excluded" ? "excluída" : "automática";
    button.setAttribute("aria-label", `Dezena ${numberLabel(value)}: ${label}`);
  });
  const select = root?.querySelector("#g2-fixed-count");
  if (select) [...select.options].forEach((option) => { option.disabled = Number(option.value) < state.fixed.size; });
}

function clearPreview(state) {
  state.preview = null;
  const target = root?.querySelector("[data-g2-result]");
  if (target) target.innerHTML = "";
}

function setError(message = "") {
  const error = root?.querySelector("[data-g2-error]");
  if (!error) return;
  error.hidden = !message;
  error.textContent = message;
}

function gameMarkup(game, index) {
  const fixed = new Set(game.fixedNumbers || []);
  const balls = (game.numbers || []).map((value) => `<span class="ball ${fixed.has(value) ? "is-fixed" : ""}">${numberLabel(value)}</span>`).join("");
  const repeated = game.metadata?.repeatedFromLastContest?.length ?? 0;
  return `<article class="panel g2-game">
    <div class="g2-game-head"><strong>Jogo ${index + 1}</strong><span>${game.fixedNumbers?.length ?? 0} núcleo · ${game.variableNumbers?.length ?? 0} variáveis</span></div>
    <div class="draw-numbers">${balls}</div>
    <div class="g2-game-meta"><span>Pares <strong>${game.metadata?.even ?? "—"}</strong></span><span>Ímpares <strong>${game.metadata?.odd ?? "—"}</strong></span><span>Soma <strong>${game.metadata?.sum ?? "—"}</strong></span><span>Repetidas <strong>${repeated}</strong></span></div>
    ${game.luckyMonth ? `<div class="g2-game-month">Mês da Sorte · ${escapeHtml(game.luckyMonth)}</div>` : ""}
  </article>`;
}

function renderPreview(state) {
  const target = root?.querySelector("[data-g2-result]");
  if (!target || !state.preview) return;
  const preview = state.preview;
  const audit = preview.audit;
  const seed = preview.generatorOptions?.seed || "—";
  const proof = preview.preview?.id || preview.generatorOptions?.previewId || "—";
  target.innerHTML = `<div class="g2-preview">
    <div class="g2-preview-head"><div><h2>4. Prévia auditável</h2><p>Este lote ainda não foi salvo. O servidor congelou os jogos e as provas da revisão usada para gerá-los.</p></div></div>
    <div class="g2-audit-grid">
      <div class="g2-audit"><span>Núcleo compartilhado</span><strong>${audit.sharedCore.map(numberLabel).join(" · ") || "Sem núcleo"}</strong><small>${audit.sharedCore.length} dezenas em todos os jogos</small></div>
      <div class="g2-audit"><span>Cobertura do lote</span><strong>${audit.uniqueNumbers.length} dezenas</strong><small>${audit.uniqueVariableNumbers.length} variáveis distintas</small></div>
      <div class="g2-audit"><span>Sobreposição média</span><strong>${formatDecimal(audit.averagePairwiseOverlap)}</strong><small>mín. ${formatDecimal(audit.minimumPairwiseOverlap)} · máx. ${formatDecimal(audit.maximumPairwiseOverlap)}</small></div>
      <div class="g2-audit"><span>Elegíveis matematicamente</span><strong>${formatInteger(audit.plan.space.eligibleCombinations)}</strong><small>${formatPercent(audit.plan.space.overallCoverage)} do universo</small></div>
    </div>
    <div class="g2-game-grid">${preview.games.map(gameMarkup).join("")}</div>
    <div class="g2-seed"><strong>Seed</strong><code>${escapeHtml(seed)}</code></div>
    <div class="g2-seed"><strong>Preview ID</strong><code>${escapeHtml(proof)}</code></div>
    <div class="g2-result-actions">
      <button class="button" type="button" data-g2-another>Gerar outra prévia</button>
      <button class="button primary" type="button" data-g2-save>Salvar exatamente este lote</button>
      <span class="g2-saved" data-g2-saved hidden></span>
    </div>
  </div>`;

  target.querySelector("[data-g2-another]")?.addEventListener("click", () => void generatePreview(state));
  target.querySelector("[data-g2-save]")?.addEventListener("click", () => void savePreview(state));
}

async function generatePreview(state) {
  const button = root?.querySelector("[data-g2-preview]");
  const another = root?.querySelector("[data-g2-another]");
  if (button) button.disabled = true;
  if (another) another.disabled = true;
  setError("");
  try {
    state.preview = await postJson("/generation/preview", requestPayload(state), state.controller.signal);
    renderPreview(state);
    root?.querySelector("[data-g2-result]")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    setError(error instanceof Error ? error.message : "Falha ao gerar a prévia");
  } finally {
    if (button?.isConnected) button.disabled = false;
    if (another?.isConnected) another.disabled = false;
  }
}

async function savePreview(state) {
  if (!state.preview?.generatorOptions?.seed) return;
  const button = root?.querySelector("[data-g2-save]");
  const saved = root?.querySelector("[data-g2-saved]");
  if (button) button.disabled = true;
  try {
    const response = await postJson("/generation/save", requestPayload(state, true), state.controller.signal);
    if (saved) {
      saved.hidden = false;
      saved.textContent = response.alreadySaved ? `Lote #${response.batchId} já estava salvo.` : `Lote #${response.batchId} salvo em Meus jogos.`;
    }
    if (button) button.textContent = "Lote salvo";
  } catch (error) {
    setError(error instanceof Error ? error.message : "Falha ao salvar o lote");
    if (button) button.disabled = false;
  }
}

function updateRange(state, key, edge, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return;
  state.filters[key][edge] = Math.round(numeric);
  if (state.filters[key].min > state.filters[key].max) {
    if (edge === "min") state.filters[key].max = state.filters[key].min;
    else state.filters[key].min = state.filters[key].max;
  }
  const min = root?.querySelector(`[data-g2-range="${key}:min"]`);
  const max = root?.querySelector(`[data-g2-range="${key}:max"]`);
  if (min) min.value = String(state.filters[key].min);
  if (max) max.value = String(state.filters[key].max);
}

function renderDynamicPlan(state) {
  const planTarget = root?.querySelector("[data-g2-plan]");
  if (planTarget) planTarget.innerHTML = planMarkup(state);
  const baselineTarget = root?.querySelector("[data-g2-baseline]");
  if (baselineTarget) baselineTarget.innerHTML = baselineMarkup(state);
  updateNumberButtons(state);
  const repeatedToggle = root?.querySelector('[data-g2-filter-toggle="repeated"]');
  if (repeatedToggle) repeatedToggle.disabled = !state.plan.dataQuality.previousContestAvailable;
  const filterBaselines = {
    odd: `Esperado ${formatDecimal(state.plan.baseline.expectedOdd)}`,
    repeated: state.plan.dataQuality.previousContestAvailable
      ? `Esperado ${formatDecimal(state.plan.baseline.expectedRepeated)}`
      : `Concurso #${state.plan.dataQuality.expectedPreviousContestNumber ?? "—"} indisponível`,
    sum: `Esperado ${formatDecimal(state.plan.baseline.expectedSum)} · desvio ${formatDecimal(state.plan.baseline.sumStdDev)}`,
  };
  for (const [key, text] of Object.entries(filterBaselines)) {
    const node = root?.querySelector(`[data-g2-filter-baseline="${key}"]`);
    if (node) node.textContent = text;
  }
  const algorithm = algorithmSpace(state);
  const previewButton = root?.querySelector("[data-g2-preview]");
  const invalid = state.plan.space.eligibleCombinations < 1 || algorithm.rawCombinationCapacity < 1 || (state.plan.constraintIssues?.length ?? 0) > 0;
  if (previewButton) previewButton.disabled = invalid;
}

function bindWorkspace(state) {
  selectionSummary(state);
  updateModeButtons(state);
  renderDynamicPlan(state);
  let planTimer;
  let planSequence = 0;

  async function refreshPlan() {
    const sequence = ++planSequence;
    try {
      const plan = await postJson("/generation/plan", planPayload(state), state.controller.signal);
      if (sequence !== planSequence || state.controller.signal.aborted) return;
      state.plan = plan;
      if (!plan.dataQuality.previousContestAvailable && state.filters.repeated.enabled) {
        state.filters.repeated.enabled = false;
        const toggle = root?.querySelector('[data-g2-filter-toggle="repeated"]');
        if (toggle) toggle.checked = false;
        return void refreshPlan();
      }
      renderDynamicPlan(state);
      const issue = plan.constraintIssues?.[0];
      setError(issue || (plan.space.eligibleCombinations < 1 ? "Nenhuma combinação atende à configuração atual." : ""));
    } catch (error) {
      if (state.controller.signal.aborted) return;
      setError(error instanceof Error ? error.message : "Não foi possível recalcular o espaço combinatório");
    }
  }

  function schedulePlan() {
    clearPreview(state);
    clearTimeout(planTimer);
    planTimer = setTimeout(() => void refreshPlan(), 220);
  }

  root?.querySelector("#g2-game-count")?.addEventListener("change", (event) => {
    const value = Math.max(1, Math.min(10, Math.round(Number(event.target.value) || 1)));
    state.gameCount = value;
    event.target.value = String(value);
    clearPreview(state);
  });

  root?.querySelector("#g2-fixed-count")?.addEventListener("change", (event) => {
    const next = Number(event.target.value);
    if (next < state.fixed.size) {
      event.target.value = String(state.fixedCount);
      selectionSummary(state, "Remova algumas dezenas fixadas antes de reduzir o núcleo.");
      return;
    }
    state.fixedCount = next;
    selectionSummary(state);
    clearPreview(state);
    renderDynamicPlan(state);
  });

  root?.querySelector("#g2-target")?.addEventListener("change", (event) => {
    const next = Number(event.target.value);
    if (Number.isInteger(next) && next > 0) {
      state.targetContestNumber = next;
      schedulePlan();
    }
  });

  root?.querySelectorAll("[data-g2-selection-mode]").forEach((button) => button.addEventListener("click", () => {
    state.selectionMode = button.dataset.g2SelectionMode;
    updateModeButtons(state);
    selectionSummary(state);
  }));

  root?.querySelectorAll("[data-g2-number]").forEach((button) => button.addEventListener("click", () => {
    const value = Number(button.dataset.g2Number);
    let message = "";
    if (state.selectionMode === "fix") {
      if (state.fixed.has(value)) {
        state.fixed.delete(value);
      } else if (state.fixedCount === 0) {
        message = "Selecione um núcleo compartilhado maior que zero para fixar dezenas.";
      } else if (state.fixed.size >= state.fixedCount) {
        message = `O núcleo já tem ${state.fixedCount} dezenas fixadas manualmente.`;
      } else {
        state.excluded.delete(value);
        state.fixed.add(value);
      }
    } else if (state.selectionMode === "exclude") {
      state.fixed.delete(value);
      if (state.excluded.has(value)) state.excluded.delete(value);
      else state.excluded.add(value);
    } else {
      state.fixed.delete(value);
      state.excluded.delete(value);
    }
    updateNumberButtons(state);
    selectionSummary(state, message);
    if (!message) schedulePlan();
  }));

  root?.querySelectorAll("[data-g2-filter-toggle]").forEach((toggle) => toggle.addEventListener("change", () => {
    const key = toggle.dataset.g2FilterToggle;
    state.filters[key].enabled = Boolean(toggle.checked);
    const panel = root?.querySelector(`[data-g2-filter="${key}"]`);
    panel?.setAttribute("aria-disabled", state.filters[key].enabled ? "false" : "true");
    root?.querySelectorAll(`[data-g2-range^="${key}:"]`).forEach((control) => { control.disabled = !state.filters[key].enabled; });
    schedulePlan();
  }));

  root?.querySelectorAll("[data-g2-range]").forEach((control) => control.addEventListener("change", () => {
    const [key, edge] = control.dataset.g2Range.split(":");
    updateRange(state, key, edge, control.value);
    schedulePlan();
  }));

  root?.querySelector("[data-g2-preview]")?.addEventListener("click", () => void generatePreview(state));

  state.cleanup = () => {
    clearTimeout(planTimer);
    state.controller.abort();
  };
}

async function mount(detail) {
  const token = ++lifecycleToken;
  cleanupCurrent?.();
  cleanupCurrent = null;
  if (!root || currentView() !== "generate") return;
  const legacyForm = root.querySelector("#generate-form");
  if (!legacyForm) return;

  const lottery = detail?.lottery || document.querySelector("#lottery-select")?.value || "mega-sena";
  const fallback = LOTTERY_FALLBACK[lottery];
  if (!fallback) return;
  const legacyGameCount = Number(legacyForm.querySelector("#game-count")?.value) || fallback.defaultGames;
  const legacyTarget = Number(legacyForm.querySelector("#target-contest")?.value) || undefined;
  const controller = new AbortController();

  try {
    const plan = await postJson("/generation/plan", {
      lottery,
      ...(legacyTarget ? { targetContestNumber: legacyTarget } : {}),
      fixedNumbers: [],
      excludedNumbers: [],
    }, controller.signal);
    if (token !== lifecycleToken || currentView() !== "generate" || controller.signal.aborted) return;

    const preferredSumMin = Math.max(1, Math.round(plan.baseline.expectedSum - plan.baseline.sumStdDev));
    const preferredSumMax = Math.round(plan.baseline.expectedSum + plan.baseline.sumStdDev);
    const state = {
      lottery,
      gameCount: legacyGameCount,
      fixedCount: plan.methodology.defaultFixedCount,
      targetContestNumber: plan.targetContestNumber,
      fixed: new Set(),
      excluded: new Set(),
      selectionMode: "fix",
      filters: {
        odd: { enabled: false, ...plan.methodology.preferredOdd },
        repeated: { enabled: false, ...plan.methodology.preferredRepeated },
        sum: { enabled: false, min: preferredSumMin, max: preferredSumMax },
      },
      plan,
      preview: null,
      controller,
      cleanup: null,
    };

    root.innerHTML = workspaceMarkup(state);
    bindWorkspace(state);
    cleanupCurrent = () => state.cleanup?.();
  } catch (error) {
    controller.abort();
    console.warn("Generator 2.0 unavailable; keeping basic generator", error);
  }
}

window.addEventListener("loto-lab:view-rendered", (event) => {
  if (event.detail?.view === "generate") void mount(event.detail);
  else {
    lifecycleToken += 1;
    cleanupCurrent?.();
    cleanupCurrent = null;
  }
});

window.addEventListener("hashchange", () => {
  if (currentView() !== "generate") {
    lifecycleToken += 1;
    cleanupCurrent?.();
    cleanupCurrent = null;
  }
});
