const root = document.querySelector("#content");
const lotterySelect = document.querySelector("#lottery-select");
const latestCache = new Map();
let scheduled = false;

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

function currentLottery() {
  return lotterySelect?.value || "mega-sena";
}

function getLatest(lottery, force = false) {
  if (force) latestCache.delete(lottery);
  if (!latestCache.has(lottery)) {
    const pending = fetch(`/api/v1/contests/${lottery}/latest`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .catch(() => {
        latestCache.delete(lottery);
        return undefined;
      });
    latestCache.set(lottery, pending);
  }
  return latestCache.get(lottery);
}

function tierLabel(tier) {
  return tier === "strong" ? "Forte" : tier === "balanced" ? "Intermediária" : "Fria";
}

function tierBadgeClass(tier) {
  return tier === "strong" ? "positive" : tier === "balanced" ? "warning" : "";
}

async function refineAnalysis() {
  const table = root?.querySelector(".table-wrap table");
  if (!table || table.dataset.analysisRefined === "true" || table.dataset.analysisRefined === "loading") return;
  table.dataset.analysisRefined = "loading";

  const lottery = currentLottery();
  let data;
  try {
    const response = await fetch(`/api/v1/analysis/${lottery}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch {
    if (table.isConnected) delete table.dataset.analysisRefined;
    return;
  }

  if (currentView() !== "analysis" || currentLottery() !== lottery || !table.isConnected) {
    if (table.isConnected) delete table.dataset.analysisRefined;
    return;
  }
  table.dataset.analysisRefined = "true";

  const topByScore = new Set([...data.numbers]
    .sort((a, b) => b.score - a.score || a.number - b.number)
    .slice(0, 5)
    .map((row) => row.number));

  const tableWrap = table.closest(".table-wrap");
  const refinement = document.createElement("div");
  refinement.className = "analysis-refinement";
  refinement.dataset.analysisRefined = "true";
  refinement.innerHTML = `
    <div class="analysis-toolbar">
      <div>
        <strong style="font-size:11px">Explorar ranking</strong>
        <div class="form-note">A classificação é relativa ao período e à distribuição atual.</div>
      </div>
      <div class="analysis-toolbar-controls">
        <label class="field"><span>Grupo</span><select data-analysis-filter>
          <option value="strong">Fortes</option>
          <option value="balanced">Intermediárias</option>
          <option value="cold">Frias</option>
          <option value="all">Todas</option>
        </select></label>
        <label class="field"><span>Ordenar por</span><select data-analysis-sort>
          <option value="score">Score</option>
          <option value="year">Ano</option>
          <option value="month">Mês</option>
          <option value="recent10">10 últimos</option>
          <option value="recent20">20 últimos</option>
          <option value="historical">Histórico</option>
        </select></label>
      </div>
    </div>
    <details class="score-explainer">
      <summary>Como o score é calculado?</summary>
      <p>Pesos atuais: ano ${(data.weights.year * 100).toFixed(0)}%, últimos 20 ${(data.weights.recent20 * 100).toFixed(0)}%, mês ${(data.weights.month * 100).toFixed(0)}%, histórico ${(data.weights.historical * 100).toFixed(0)}% e últimos 10 ${(data.weights.recent10 * 100).toFixed(0)}%. Cada componente é normalizado antes da combinação.</p>
    </details>
    <div class="methodology-note"><strong>Leitura correta:</strong> “forte”, “intermediária” e “fria” são posições relativas no ranking. Frequência histórica não aumenta a probabilidade individual de uma dezena no próximo sorteio.</div>`;
  tableWrap.parentElement.insertBefore(refinement, tableWrap);

  const tbody = table.querySelector("tbody");
  const filter = refinement.querySelector("[data-analysis-filter]");
  const sort = refinement.querySelector("[data-analysis-sort]");

  function renderRows() {
    const filterValue = filter.value;
    const sortKey = sort.value;
    const rows = [...data.numbers]
      .filter((row) => filterValue === "all" || row.tier === filterValue)
      .sort((a, b) => (b[sortKey] ?? 0) - (a[sortKey] ?? 0) || b.score - a.score || a.number - b.number);

    tbody.innerHTML = rows.map((row) => `
      <tr class="${topByScore.has(row.number) ? "is-top-five" : ""}">
        <td><strong>${String(row.number).padStart(2, "0")}</strong></td>
        <td><span class="badge ${tierBadgeClass(row.tier)}">${tierLabel(row.tier)}</span></td>
        <td class="score-cell"><div class="score-line"><div class="score-track"><div class="score-fill" style="width:${Math.max(0, Math.min(100, row.score))}%"></div></div><span class="score-number">${row.score.toFixed(1)}</span></div></td>
        <td>${row.year.toFixed(0)}</td><td>${row.month.toFixed(0)}</td><td>${row.recent10.toFixed(0)}</td><td>${row.recent20.toFixed(0)}</td><td>${row.historical.toFixed(0)}</td>
      </tr>`).join("");
  }

  filter.addEventListener("change", renderRows);
  sort.addEventListener("change", renderRows);
  renderRows();
}

function strategyCopy(lottery, fixedCount) {
  if (lottery === "mega-sena") return "Estratégia padrão · 3 fixas + 3 variáveis";
  if (lottery === "lotofacil") return `Estratégia padrão · ${fixedCount} fixas + ${15 - fixedCount} variáveis`;
  return "Estratégia padrão · 3 fixas + 4 variáveis + Mês da Sorte";
}

function decorateGeneratedResult(form) {
  const result = root?.querySelector("#generated-result");
  const grid = result?.querySelector(".game-grid");
  if (!grid) return;

  if (!result.querySelector(".generation-summary")) {
    const fixed = [...grid.querySelectorAll(".game-card:first-child .ball.is-fixed")].map((node) => node.textContent.trim());
    const summary = document.createElement("div");
    summary.className = "generation-summary";
    summary.innerHTML = `
      <div class="generation-summary-copy"><strong>Núcleo compartilhado</strong><span>${fixed.length ? fixed.map(escapeHtml).join(" · ") : "sem núcleo fixo"}</span></div>
      <div class="generation-legend"><span><i class="legend-swatch fixed"></i>fixa</span><span><i class="legend-swatch"></i>variável</span></div>`;
    grid.parentElement.insertBefore(summary, grid);
  }

  const submit = form?.querySelector("button[type=submit]");
  if (submit && !submit.disabled && !submit.querySelector(".spinner") && submit.textContent.trim() === "Gerar jogos") {
    submit.textContent = "Gerar novamente";
  }
}

function refineGenerate() {
  const form = root?.querySelector("#generate-form");
  if (!form) return;

  decorateGeneratedResult(form);
  if (form.dataset.uiRefined === "true") return;
  form.dataset.uiRefined = "true";
  form.classList.add("generate-form-refined");

  const lotteryField = [...form.querySelectorAll(".field")].find((field) => field.querySelector("label")?.textContent.trim() === "Loteria");
  lotteryField?.remove();

  const target = form.querySelector("#target-contest");
  if (target) {
    const help = document.createElement("small");
    help.className = "field-help";
    const previous = Number(target.value) - 1;
    help.textContent = previous > 0 ? `Calculado a partir do último concurso #${previous}.` : "Preenchido automaticamente quando há histórico.";
    target.parentElement.append(help);
  }

  const strategy = document.createElement("div");
  strategy.className = "generation-strategy";
  const grid = form.querySelector(".form-grid");
  grid.insertAdjacentElement("afterend", strategy);
  const fixedSelect = form.querySelector("#fixed-count");

  function updateStrategy() {
    const fixedCount = Number(fixedSelect?.value || 8);
    strategy.innerHTML = `<strong>${escapeHtml(strategyCopy(currentLottery(), fixedCount))}</strong><span>As variantes experimentais ficam no Laboratório.</span>`;
  }

  fixedSelect?.addEventListener("change", updateStrategy);
  updateStrategy();
}

async function refineGames() {
  const cards = [...(root?.querySelectorAll(".batch-card") || [])];
  if (!cards.length) return;
  const lottery = currentLottery();
  const latest = await getLatest(lottery);
  if (!latest || currentView() !== "games" || currentLottery() !== lottery) return;

  const sectionCopy = root.querySelector(".section-head p");
  if (sectionCopy && !sectionCopy.dataset.latestAdded) {
    sectionCopy.dataset.latestAdded = "true";
    sectionCopy.textContent += ` Último resultado na base: #${latest.number}.`;
  }

  for (const card of cards) {
    if (!card.isConnected || card.dataset.pendingRefined === "true") continue;
    card.dataset.pendingRefined = "true";
    const input = card.querySelector("[data-contest-input]");
    const button = card.querySelector("[data-check-batch]");
    const copy = card.querySelector(".batch-head-copy");
    if (!input || !button || !copy) continue;

    const badge = document.createElement("span");
    badge.className = "batch-pending";
    badge.textContent = "Resultado ainda não disponível";
    badge.hidden = true;
    copy.append(badge);

    function updatePending() {
      const value = Number(input.value);
      const pending = Number.isInteger(value) && value > latest.number;
      card.classList.toggle("is-pending", pending);
      badge.hidden = !pending;
    }

    input.addEventListener("input", updatePending);
    button.addEventListener("click", (event) => {
      const value = Number(input.value);
      if (!Number.isInteger(value) || value <= latest.number) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const resultTarget = root.querySelector("#check-result");
      if (resultTarget) {
        resultTarget.innerHTML = `<div class="pending-state"><div><strong>Aguardando resultado do concurso #${value}</strong><p>O lote está salvo e pronto para conferência. Depois que o resultado entrar na base, volte aqui e clique em Conferir novamente.</p></div></div>`;
        resultTarget.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, { capture: true });
    updatePending();
  }
}

function refineBacktests() {
  const form = root?.querySelector("#backtest-form");
  if (!form || form.dataset.uiRefined === "true") return;
  form.dataset.uiRefined = "true";

  const start = form.querySelector("#bt-start");
  const end = form.querySelector("#bt-end");
  const endNumber = Number(end?.value);
  if (start && !start.value && Number.isInteger(endNumber) && endNumber > 0) {
    start.value = String(Math.max(1, endNumber - 99));
    const note = document.createElement("div");
    note.className = "backtest-default-note";
    note.textContent = "Padrão: últimos 100 concursos. Limpe este campo para testar todo o histórico disponível.";
    start.parentElement.append(note);
  }
}

async function refine() {
  const view = currentView();
  if (view === "analysis") await refineAnalysis();
  else if (view === "generate") refineGenerate();
  else if (view === "games") await refineGames();
  else if (view === "backtests") refineBacktests();
}

function scheduleRefine() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(async () => {
    scheduled = false;
    await refine();
  }, 0);
}

if (root) {
  new MutationObserver(scheduleRefine).observe(root, { childList: true, subtree: true });
}
window.addEventListener("hashchange", scheduleRefine);
lotterySelect?.addEventListener("change", () => {
  latestCache.clear();
  scheduleRefine();
});
document.querySelector("#refresh-view")?.addEventListener("click", () => {
  latestCache.delete(currentLottery());
  scheduleRefine();
});
window.addEventListener("loto-lab:data-synced", () => {
  latestCache.clear();
  scheduleRefine();
});
scheduleRefine();
