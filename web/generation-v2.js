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

async function getJson(path, signal) {
  const response = await fetch(`/api/v1${path}`, { signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || `Erro HTTP ${response.status}`);
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

function tierByNumber(analysis) {
  return new Map((analysis?.numbers || []).map((row) => [row.number, row.tier]));
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
    `<option value="${value}" ${value === state.fixedCount ? "selected" : ""} ${value < state.fixed.size ? "disabled" : ""}>${value} ${value === 1 ? "fixa" : "fixas"}</option>`,
  ).join("");
}

function filterMarkup(key, title, baseline, state, minimum, maximum, unit = "") {
  const filter = state.filters[key];
  return `<div class="g2-filter" data-g2-filter="${key}" aria-disabled="${filter.enabled ? "false" : "true"}">
    <div class="g2-filter-top">
      <label class="g2-filter-toggle"><input type="checkbox" data-g2-filter-toggle="${key}" ${filter.enabled ? "checked" : ""} /> ${escapeHtml(title)}</label>
      <span class="g2-filter-baseline">${escapeHtml(baseline)}</span>
    </div>
    <div class="g2-range">
      <select data-g2-range="${key}:min" aria-label="Mínimo de ${escapeHtml(title)}">${rangeOptions(minimum, maximum, filter.min)}</select>
      <span>até</span>
      <select data-g2-range="${key}:max" aria-label="Máximo de ${escapeHtml(title)}">${rangeOptions(minimum, maximum, filter.max)}</select>
    </div>
    ${unit ? `<div class="g2-selection-summary">Faixa em ${escapeHtml(unit)}</div>` : ""}
  </div>`;
}

function sumFilterMarkup(state) {
  const filter = state.filters.sum;
  const expected = state.plan.baseline.expectedSum;
  const deviation = state.plan.baseline.sumStdDev;
  return `<div class="g2-filter" data-g2-filter="sum" aria-disabled="${filter.enabled ? "false" : "true"}">
    <div class="g2-filter-top">
      <label class="g2-filter-toggle"><input type="checkbox" data-g2-filter-toggle="sum" ${filter.enabled ? "checked" : ""} /> Limitar soma</label>
      <span class="g2-filter-baseline">Esperado ${formatDecimal(expected)} · desvio ${formatDecimal(deviation)}</span>
    </div>
    <div class="g2-range">
      <input type="number" data-g2-range="sum:min" value="${filter.min}" aria-label="Soma mínima" />
      <span>até</span>
      <input type="number" data-g2-range="sum:max" value="${filter.max}" aria-label="Soma máxima" />
    </div>
  </div>`;
}

function numberGridMarkup(state) {
  const tiers = tierByNumber(state.analysis);
  let html = "";
  for (let value = 1; value <= state.plan.universeSize; value += 1) {
    const selection = state.fixed.has(value) ? "fixed" : state.excluded.has(value) ? "excluded" : "auto";
    const tier = tiers.get(value) || "";
    const selectionLabel = selection === "fixed" ? "fixada" : selection === "excluded" ? "excluída" : "automática";
    html += `<button type="button" class="g2-number ${tier ? `is-${tier}` : ""} ${selection !== "auto" ? `is-${selection}` : ""}" data-g2-number="${value}" data-selection="${selection}" aria-label="Dezena ${numberLabel(value)}: ${selectionLabel}">${numberLabel(value)}</button>`;
  }
  return html;
}

function planMarkup(state) {
  const plan = state.plan;
  const coverage = Math.max(0, Math.min(1, plan.space.overallCoverage));
  return `<div class="g2-card-head"><div><strong>Espaço combinatório</strong><span>Contagem exata para a configuração atual.</span></div></div>
    <div class="g2-plan-grid">
      <div class="g2-plan-stat"><span>Universo total</span><strong>${formatInteger(plan.baseline.totalCombinations)}</strong><small>combinações válidas da loteria</small></div>
      <div class="g2-plan-stat"><span>Após fixar/excluir</span><strong>${formatInteger(plan.space.afterManualSelection)}</strong><small>antes dos filtros estruturais</small></div>
      <div class="g2-plan-stat"><span>Elegíveis</span><strong>${formatInteger(plan.space.eligibleCombinations)}</strong><small>atendem aos filtros ativos</small></div>
      <div class="g2-plan-stat"><span>Cobertura do universo</span><strong>${formatPercent(plan.space.overallCoverage)}</strong><small>${formatPercent(plan.space.structuralCoverage)} após a seleção manual</small></div>
    </div>
    <div class="g2-space-bar" aria-hidden="true"><span style="width:${Math.max(.2, coverage * 100)}%"></span></div>
    <p class="g2-disclaimer"><strong>Importante:</strong> restringir o espaço organiza a seleção, mas não aumenta a probabilidade matemática individual de uma combinação válida ser sorteada.</p>`;
}

function methodologyMarkup(state) {
  return `<div class="g2-methodology">
    <strong>Metodologia · ${escapeHtml(LOTTERY_FALLBACK[state.lottery].label)}</strong>
    <ul>${state.plan.methodology.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>
  </div>`;
}

function workspaceMarkup(state) {
  const profile = state.plan.methodology;
  const repeatedExpected = state.plan.baseline.expectedRepeated;
  return `<div class="g2-shell" data-g2-shell>
    <div class="g2-principle"><strong>Algoritmo calcula; você audita.</strong><span>Configure o lote, veja exatamente quanto cada escolha restringe o universo, gere uma prévia reproduzível e só então salve o lote escolhido.</span></div>
    <div class="g2-workspace">
      <div class="g2-main">
        <section class="panel g2-card">
          <div class="g2-card-head"><div><strong>1. Configuração do lote</strong><span>O concurso alvo define o corte histórico; nenhuma informação futura entra no cálculo.</span></div></div>
          <div class="g2-form-grid">
            <div class="g2-field"><label for="g2-game-count">Quantidade de jogos</label><input id="g2-game-count" type="number" min="1" max="10" value="${state.gameCount}" /></div>
            <div class="g2-field"><label for="g2-fixed-count">Núcleo compartilhado</label><select id="g2-fixed-count">${fixedCountOptions(state)}</select></div>
            <div class="g2-field"><label for="g2-target">Concurso alvo</label><input id="g2-target" type="number" min="1" value="${state.targetContestNumber ?? ""}" /></div>
          </div>
        </section>

        <section class="panel g2-card">
          <div class="g2-card-head"><div><strong>2. Dezenas</strong><span>Clique para alternar entre automática, fixada e excluída. O restante do núcleo é completado pelo algoritmo.</span></div></div>
          <div class="g2-number-legend">
            <span><i class="g2-key"></i> Automática</span><span><i class="g2-key is-fixed"></i> Fixada</span><span><i class="g2-key is-excluded"></i> Excluída</span>
            <span><i class="g2-key is-strong"></i> Forte</span><span><i class="g2-key is-balanced"></i> Intermediária</span><span><i class="g2-key is-cold"></i> Fria</span>
          </div>
          <div class="g2-number-grid" data-g2-number-grid>${numberGridMarkup(state)}</div>
          <div class="g2-selection-summary" data-g2-selection-summary></div>
        </section>

        <section class="panel g2-card">
          <div class="g2-card-head"><div><strong>3. Filtros estruturais</strong><span>Desligados por padrão. Ative somente quando quiser impor uma restrição rígida ao espaço de combinações.</span></div></div>
          <div class="g2-filter-list">
            ${filterMarkup("odd", "Faixa de ímpares", `Esperado ${formatDecimal(state.plan.baseline.expectedOdd)}`, state, 0, state.plan.drawSize)}
            ${filterMarkup("repeated", "Repetidas do concurso anterior", repeatedExpected === null ? "Sem concurso de referência" : `Esperado ${formatDecimal(repeatedExpected)}`, state, 0, state.plan.drawSize)}
            ${sumFilterMarkup(state)}
          </div>
          <div style="margin-top:14px">${methodologyMarkup(state)}</div>
        </section>

        <section class="panel g2-card">
          <div class="g2-actions">
            <div class="g2-actions-copy">A prévia não entra em <strong>Meus jogos</strong>. Ela recebe uma seed e pode ser reproduzida exatamente antes de você decidir salvar.</div>
            <button class="button primary" type="button" data-g2-preview>Gerar prévia auditável</button>
          </div>
          <div class="g2-error" data-g2-error hidden></div>
        </section>

        <section data-g2-result></section>
      </div>

      <aside class="g2-side">
        <section class="panel g2-card" data-g2-plan>${planMarkup(state)}</section>
        <section class="panel g2-card">
          <div class="g2-card-head"><div><strong>Baseline atual</strong><span>Referências matemáticas, não previsões.</span></div></div>
          <div class="g2-plan-grid">
            <div class="g2-plan-stat"><span>Ímpares esperados</span><strong>${formatDecimal(state.plan.baseline.expectedOdd)}</strong><small>em ${state.plan.drawSize} dezenas</small></div>
            <div class="g2-plan-stat"><span>Repetidas esperadas</span><strong>${repeatedExpected === null ? "—" : formatDecimal(repeatedExpected)}</strong><small>contra o concurso #${state.plan.referenceContestNumber ?? "—"}</small></div>
            <div class="g2-plan-stat"><span>Soma esperada</span><strong>${formatDecimal(state.plan.baseline.expectedSum)}</strong><small>desvio ${formatDecimal(state.plan.baseline.sumStdDev)}</small></div>
            <div class="g2-plan-stat"><span>Histórico usado</span><strong>${formatInteger(state.plan.historyCount)}</strong><small>concursos anteriores ao alvo</small></div>
          </div>
        </section>
      </aside>
    </div>
  </div>`;
}

function selectionSummary(state, message = "") {
  const target = root?.querySelector("[data-g2-selection-summary]");
  if (!target) return;
  const fixed = [...state.fixed].sort((a, b) => a - b).map(numberLabel).join(", ") || "nenhuma";
  const excluded = [...state.excluded].sort((a, b) => a - b).map(numberLabel).join(", ") || "nenhuma";
  target.innerHTML = `<span>Fixadas <strong>${escapeHtml(fixed)}</strong></span><span>Excluídas <strong>${escapeHtml(excluded)}</strong></span>${message ? `<span><strong>${escapeHtml(message)}</strong></span>` : ""}`;
}

function updateNumberButtons(state) {
  root?.querySelectorAll("[data-g2-number]").forEach((button) => {
    const value = Number(button.dataset.g2Number);
    const selection = state.fixed.has(value) ? "fixed" : state.excluded.has(value) ? "excluded" : "auto";
    button.dataset.selection = selection;
    button.classList.toggle("is-fixed", selection === "fixed");
    button.classList.toggle("is-excluded", selection === "excluded");
    const label = selection === "fixed" ? "fixada" : selection === "excluded" ? "excluída" : "automática";
    button.setAttribute("aria-label", `Dezena ${numberLabel(value)}: ${label}`);
  });
  const select = root?.querySelector("#g2-fixed-count");
  if (select) {
    [...select.options].forEach((option) => { option.disabled = Number(option.value) < state.fixed.size; });
  }
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
  target.innerHTML = `<div class="g2-preview">
    <div class="g2-preview-head"><div><h2>4. Prévia auditável</h2><p>Este lote ainda não foi salvo. Revise a cobertura e as estruturas antes de persistir.</p></div></div>
    <div class="g2-audit-grid">
      <div class="g2-audit"><span>Núcleo compartilhado</span><strong>${audit.sharedCore.map(numberLabel).join(" · ") || "Sem núcleo"}</strong><small>${audit.sharedCore.length} dezenas em todos os jogos</small></div>
      <div class="g2-audit"><span>Cobertura do lote</span><strong>${audit.uniqueNumbers.length} dezenas</strong><small>${audit.uniqueVariableNumbers.length} variáveis distintas</small></div>
      <div class="g2-audit"><span>Sobreposição média</span><strong>${formatDecimal(audit.averagePairwiseOverlap)}</strong><small>mín. ${formatDecimal(audit.minimumPairwiseOverlap)} · máx. ${formatDecimal(audit.maximumPairwiseOverlap)}</small></div>
      <div class="g2-audit"><span>Espaço elegível</span><strong>${formatInteger(audit.plan.space.eligibleCombinations)}</strong><small>${formatPercent(audit.plan.space.overallCoverage)} do universo</small></div>
    </div>
    <div class="g2-game-grid">${preview.games.map(gameMarkup).join("")}</div>
    <div class="g2-seed"><strong>Seed reproduzível</strong><code>${escapeHtml(seed)}</code></div>
    <div class="g2-result-actions">
      <button class="button" type="button" data-g2-another>Gerar outra prévia</button>
      <button class="button primary" type="button" data-g2-save>Salvar este lote</button>
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
    if (button) button.disabled = false;
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

function updateFilterState(rootNode, state, key) {
  const filter = state.filters[key];
  const toggle = rootNode.querySelector(`[data-g2-filter-toggle="${key}"]`);
  filter.enabled = Boolean(toggle?.checked);
  const panel = rootNode.querySelector(`[data-g2-filter="${key}"]`);
  panel?.setAttribute("aria-disabled", filter.enabled ? "false" : "true");
}

function updateRange(state, key, edge, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return;
  state.filters[key][edge] = Math.round(numeric);
  if (state.filters[key].min > state.filters[key].max) {
    if (edge === "min") state.filters[key].max = state.filters[key].min;
    else state.filters[key].min = state.filters[key].max;
  }
}

function bindWorkspace(state) {
  selectionSummary(state);
  let planTimer;
  let planSequence = 0;

  async function refreshPlan() {
    const sequence = ++planSequence;
    try {
      const plan = await postJson("/generation/plan", planPayload(state), state.controller.signal);
      if (sequence !== planSequence || state.controller.signal.aborted) return;
      state.plan = plan;
      const target = root?.querySelector("[data-g2-plan]");
      if (target) target.innerHTML = planMarkup(state);
      const previewButton = root?.querySelector("[data-g2-preview]");
      if (previewButton) previewButton.disabled = plan.space.eligibleCombinations < 1;
      setError(plan.space.eligibleCombinations < 1 ? "Nenhuma combinação atende à configuração atual." : "");
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

  root?.querySelector("#g2-game-count")?.addEventListener("input", (event) => {
    state.gameCount = Math.max(1, Math.min(10, Number(event.target.value) || 1));
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
  });

  root?.querySelector("#g2-target")?.addEventListener("change", (event) => {
    const next = Number(event.target.value);
    if (Number.isInteger(next) && next > 0) {
      state.targetContestNumber = next;
      schedulePlan();
    }
  });

  root?.querySelectorAll("[data-g2-number]").forEach((button) => button.addEventListener("click", () => {
    const value = Number(button.dataset.g2Number);
    if (state.fixed.has(value)) {
      state.fixed.delete(value);
      state.excluded.add(value);
    } else if (state.excluded.has(value)) {
      state.excluded.delete(value);
    } else if (state.fixedCount === 0) {
      state.excluded.add(value);
    } else if (state.fixed.size < state.fixedCount) {
      state.fixed.add(value);
    } else {
      selectionSummary(state, `O núcleo já tem ${state.fixedCount} dezenas fixadas manualmente.`);
      return;
    }
    updateNumberButtons(state);
    selectionSummary(state);
    schedulePlan();
  }));

  root?.querySelectorAll("[data-g2-filter-toggle]").forEach((toggle) => toggle.addEventListener("change", () => {
    updateFilterState(root, state, toggle.dataset.g2FilterToggle);
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
    const [analysis, plan] = await Promise.all([
      getJson(`/analysis/${lottery}`, controller.signal),
      postJson("/generation/plan", {
        lottery,
        ...(legacyTarget ? { targetContestNumber: legacyTarget } : {}),
        fixedNumbers: [],
        excludedNumbers: [],
      }, controller.signal),
    ]);
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
      filters: {
        odd: { enabled: false, ...plan.methodology.preferredOdd },
        repeated: { enabled: false, ...plan.methodology.preferredRepeated },
        sum: { enabled: false, min: preferredSumMin, max: preferredSumMax },
      },
      analysis,
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
    // Degradação graciosa: se a camada v2 não estiver disponível, preservamos
    // integralmente o formulário básico já renderizado pelo app principal.
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
