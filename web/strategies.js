import { api, escapeHtml, formatDateTime, toast } from "./runtime.js";

const LABELS = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
};

const form = document.querySelector("#strategy-form");
const formTitle = document.querySelector("#strategy-form-title");
const filter = document.querySelector("#strategy-filter");
const listRoot = document.querySelector("#strategy-list");
const countRoot = document.querySelector("#strategy-count");
const lottery = document.querySelector("#strategy-lottery");
const slug = document.querySelector("#strategy-slug");
const name = document.querySelector("#strategy-name");
const methodology = document.querySelector("#strategy-methodology");
const games = document.querySelector("#strategy-games");
const warmup = document.querySelector("#strategy-warmup");
const fixed = document.querySelector("#strategy-fixed");
const fixedField = document.querySelector("#strategy-fixed-field");
const experiment = document.querySelector("#strategy-experiment");
const lookback = document.querySelector("#strategy-lookback");
const bucket = document.querySelector("#strategy-bucket");
const resetButton = document.querySelector("#strategy-reset");

let strategies = [];
let loadToken = 0;

function syncLotteryFields() {
  const isLotofacil = lottery.value === "lotofacil";
  fixedField.hidden = !isLotofacil;
  if (lottery.value !== "mega-sena" && experiment.value === "external-rules") {
    experiment.value = "fixed-core";
  }
  [...experiment.options].forEach((option) => {
    if (option.value === "external-rules") option.disabled = lottery.value !== "mega-sena";
  });
}

function strategyConfig() {
  const config = {
    gameCount: Number(games.value),
    warmupContests: Number(warmup.value),
    experiment: experiment.value,
    lookbackContests: Number(lookback.value),
    bucketSize: Number(bucket.value),
  };
  if (lottery.value === "lotofacil") config.fixedCount = Number(fixed.value);
  return config;
}

function applyStrategy(strategy, duplicate = false) {
  formTitle.textContent = duplicate ? "Duplicar estratégia" : `Nova versão · ${strategy.name}`;
  lottery.value = strategy.lottery;
  slug.value = duplicate ? `${strategy.slug}-copy` : strategy.slug;
  name.value = duplicate ? `${strategy.name} · cópia` : strategy.name;
  methodology.value = strategy.methodologyVersion;
  games.value = strategy.config?.gameCount ?? 4;
  warmup.value = strategy.config?.warmupContests ?? 20;
  fixed.value = strategy.config?.fixedCount ?? 8;
  experiment.value = strategy.config?.experiment ?? "fixed-core";
  lookback.value = strategy.config?.lookbackContests ?? 200;
  bucket.value = strategy.config?.bucketSize ?? 25;
  slug.readOnly = !duplicate;
  lottery.disabled = !duplicate;
  syncLotteryFields();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetForm() {
  form.reset();
  formTitle.textContent = "Nova estratégia";
  slug.readOnly = false;
  lottery.disabled = false;
  methodology.value = "v1";
  games.value = "4";
  warmup.value = "20";
  lookback.value = "200";
  bucket.value = "25";
  syncLotteryFields();
}

function renderStrategies() {
  countRoot.textContent = `${strategies.length} estratégia(s)`;
  if (!strategies.length) {
    listRoot.innerHTML = '<div class="panel experiment-empty">Nenhuma estratégia cadastrada neste filtro.</div>';
    return;
  }

  listRoot.innerHTML = strategies.map((strategy) => `
    <article class="panel experiment-card" data-strategy-id="${strategy.id}">
      <div class="experiment-card-head">
        <div><h3>${escapeHtml(strategy.name)}</h3><p>${escapeHtml(LABELS[strategy.lottery])} · ${escapeHtml(strategy.slug)}</p></div>
        <span class="status-pill completed">v${strategy.version}</span>
      </div>
      <div class="experiment-meta">
        <span>versão #${strategy.latestVersionId}</span>
        <span>metodologia ${escapeHtml(strategy.methodologyVersion)}</span>
        <span>atualizada ${escapeHtml(formatDateTime(strategy.updatedAt))}</span>
      </div>
      <pre class="experiment-config">${escapeHtml(JSON.stringify(strategy.config || {}, null, 2))}</pre>
      <div class="experiment-card-actions">
        <button class="button compact ghost" type="button" data-edit="${strategy.id}">Nova versão</button>
        <button class="button compact ghost" type="button" data-duplicate="${strategy.id}">Duplicar</button>
        <button class="button compact ghost" type="button" data-versions="${strategy.id}">Histórico</button>
        <a class="button compact primary" href="/jobs?lottery=${encodeURIComponent(strategy.lottery)}&strategyVersionId=${strategy.latestVersionId}">Executar</a>
      </div>
      <div class="version-list" data-version-root="${strategy.id}" hidden></div>
    </article>
  `).join("");
}

async function loadVersions(strategyId) {
  const strategy = strategies.find((item) => item.id === strategyId);
  if (!strategy) return;
  const root = listRoot.querySelector(`[data-version-root="${strategyId}"]`);
  if (!root) return;
  if (!root.hidden) {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  root.innerHTML = '<div class="loading-state"><span class="spinner"></span><span>Carregando versões...</span></div>';
  try {
    const data = await api(`/strategies/${encodeURIComponent(strategy.slug)}/versions`);
    root.innerHTML = data.items.map((version) => `
      <div class="version-row">
        <strong>v${version.version}</strong>
        <span>${escapeHtml(version.methodologyVersion)} · ${escapeHtml(formatDateTime(version.createdAt))}</span>
        <a class="button compact" href="/jobs?lottery=${encodeURIComponent(strategy.lottery)}&strategyVersionId=${version.id}">Executar #${version.id}</a>
      </div>
    `).join("");
  } catch (error) {
    root.innerHTML = `<div class="job-error">${escapeHtml(error.message)}</div>`;
  }
}

async function loadStrategies() {
  const requestedFilter = filter.value;
  const token = ++loadToken;
  listRoot.innerHTML = '<div class="loading-state"><span class="spinner"></span><span>Carregando estratégias...</span></div>';
  try {
    const query = requestedFilter ? `?lottery=${encodeURIComponent(requestedFilter)}` : "";
    const data = await api(`/strategies${query}`);
    if (token !== loadToken || filter.value !== requestedFilter) return;
    strategies = data.items || [];
    renderStrategies();
  } catch (error) {
    if (token !== loadToken || filter.value !== requestedFilter) return;
    strategies = [];
    countRoot.textContent = "Falha ao carregar";
    listRoot.innerHTML = `<div class="panel experiment-empty job-error">${escapeHtml(error.message)}</div>`;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const saved = await api("/strategies", {
      method: "POST",
      body: JSON.stringify({
        slug: slug.value.trim(),
        lottery: lottery.value,
        name: name.value.trim(),
        methodologyVersion: methodology.value.trim(),
        config: strategyConfig(),
      }),
    });
    toast(`Estratégia ${saved.slug} salva como v${saved.version}.`);
    resetForm();
    await loadStrategies();
  } catch (error) {
    toast(error.message, "error");
  } finally {
    submit.disabled = false;
  }
});

listRoot.addEventListener("click", (event) => {
  const edit = event.target.closest("[data-edit]");
  if (edit) {
    const strategy = strategies.find((item) => item.id === Number(edit.dataset.edit));
    if (strategy) applyStrategy(strategy);
    return;
  }
  const duplicate = event.target.closest("[data-duplicate]");
  if (duplicate) {
    const strategy = strategies.find((item) => item.id === Number(duplicate.dataset.duplicate));
    if (strategy) applyStrategy(strategy, true);
    return;
  }
  const versions = event.target.closest("[data-versions]");
  if (versions) void loadVersions(Number(versions.dataset.versions));
});

lottery.addEventListener("change", syncLotteryFields);
filter.addEventListener("change", () => { void loadStrategies(); });
resetButton.addEventListener("click", resetForm);

const storedLottery = localStorage.getItem("loto-lab:lottery");
if (storedLottery && LABELS[storedLottery]) {
  filter.value = storedLottery;
  lottery.value = storedLottery;
}
syncLotteryFields();
void loadStrategies();
