import { api } from "../core/api.js";
import { escapeHtml } from "../shared/escaping.js";
import { formatDateTime } from "../shared/formatters.js";
import { toast } from "../shared/toast.js";

type LotteryId = "mega-sena" | "lotofacil" | "dia-de-sorte";

type StrategyConfig = {
  gameCount?: number;
  warmupContests?: number;
  fixedCount?: number;
  experiment?: string;
  lookbackContests?: number;
  bucketSize?: number;
};

type StrategySummary = {
  id: number;
  slug: string;
  lottery: LotteryId;
  name: string;
  version: number;
  latestVersionId: number;
  methodologyVersion: string;
  updatedAt: string;
  config?: StrategyConfig;
};

type StrategyVersion = {
  id: number;
  version: number;
  methodologyVersion: string;
  createdAt: string;
};

type StrategyListResponse = {
  items?: StrategySummary[];
};

type StrategyVersionsResponse = {
  items?: StrategyVersion[];
};

type SavedStrategy = {
  slug: string;
  version: number;
};

const labels: Record<LotteryId, string> = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
};

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Elemento obrigatório ausente: ${selector}`);
  return element;
}

function requiredPayload<T>(payload: T | null, context: string): T {
  if (payload === null) throw new Error(`Resposta vazia ao ${context}.`);
  return payload;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Erro desconhecido";
}

function isLotteryId(value: string | null): value is LotteryId {
  return value !== null && Object.hasOwn(labels, value);
}

const form = requiredElement<HTMLFormElement>("#strategy-form");
const formTitle = requiredElement<HTMLElement>("#strategy-form-title");
const filter = requiredElement<HTMLSelectElement>("#strategy-filter");
const listRoot = requiredElement<HTMLElement>("#strategy-list");
const countRoot = requiredElement<HTMLElement>("#strategy-count");
const lottery = requiredElement<HTMLSelectElement>("#strategy-lottery");
const slug = requiredElement<HTMLInputElement>("#strategy-slug");
const nameInput = requiredElement<HTMLInputElement>("#strategy-name");
const methodology = requiredElement<HTMLInputElement>("#strategy-methodology");
const games = requiredElement<HTMLInputElement>("#strategy-games");
const warmup = requiredElement<HTMLInputElement>("#strategy-warmup");
const fixed = requiredElement<HTMLInputElement>("#strategy-fixed");
const fixedField = requiredElement<HTMLElement>("#strategy-fixed-field");
const experiment = requiredElement<HTMLSelectElement>("#strategy-experiment");
const lookback = requiredElement<HTMLInputElement>("#strategy-lookback");
const bucket = requiredElement<HTMLInputElement>("#strategy-bucket");
const resetButton = requiredElement<HTMLButtonElement>("#strategy-reset");
const submitButton = requiredElement<HTMLButtonElement>(
  '#strategy-form button[type="submit"]',
);

let strategies: StrategySummary[] = [];
let loadToken = 0;

function syncLotteryFields(): void {
  const isLotofacil = lottery.value === "lotofacil";
  fixedField.hidden = !isLotofacil;
  if (lottery.value !== "mega-sena" && experiment.value === "external-rules") {
    experiment.value = "fixed-core";
  }
  Array.from(experiment.options).forEach((option) => {
    if (option.value === "external-rules") {
      option.disabled = lottery.value !== "mega-sena";
    }
  });
}

function strategyConfig(): StrategyConfig {
  const config: StrategyConfig = {
    gameCount: Number(games.value),
    warmupContests: Number(warmup.value),
    experiment: experiment.value,
    lookbackContests: Number(lookback.value),
    bucketSize: Number(bucket.value),
  };
  if (lottery.value === "lotofacil") config.fixedCount = Number(fixed.value);
  return config;
}

function applyStrategy(strategy: StrategySummary, duplicate = false): void {
  formTitle.textContent = duplicate ? "Duplicar estratégia" : `Nova versão · ${strategy.name}`;
  lottery.value = strategy.lottery;
  slug.value = duplicate ? `${strategy.slug}-copy` : strategy.slug;
  nameInput.value = duplicate ? `${strategy.name} · cópia` : strategy.name;
  methodology.value = strategy.methodologyVersion;
  games.value = String(strategy.config?.gameCount ?? 4);
  warmup.value = String(strategy.config?.warmupContests ?? 20);
  fixed.value = String(strategy.config?.fixedCount ?? 8);
  experiment.value = strategy.config?.experiment ?? "fixed-core";
  lookback.value = String(strategy.config?.lookbackContests ?? 200);
  bucket.value = String(strategy.config?.bucketSize ?? 25);
  slug.readOnly = !duplicate;
  lottery.disabled = !duplicate;
  syncLotteryFields();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetForm(): void {
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

function jobsHref(lotteryId: LotteryId, versionId: number): string {
  return `/jobs?lottery=${encodeURIComponent(lotteryId)}&strategyVersionId=${encodeURIComponent(String(versionId))}`;
}

function renderStrategyCard(strategy: StrategySummary): string {
  const strategyId = escapeHtml(strategy.id);
  const versionId = escapeHtml(strategy.latestVersionId);
  return `
    <article class="panel experiment-card" data-strategy-id="${strategyId}">
      <div class="experiment-card-head">
        <div><h3>${escapeHtml(strategy.name)}</h3><p>${escapeHtml(labels[strategy.lottery] || strategy.lottery)} · ${escapeHtml(strategy.slug)}</p></div>
        <span class="status-pill completed">v${escapeHtml(strategy.version)}</span>
      </div>
      <div class="experiment-meta">
        <span>versão #${versionId}</span>
        <span>metodologia ${escapeHtml(strategy.methodologyVersion)}</span>
        <span>atualizada ${escapeHtml(formatDateTime(strategy.updatedAt))}</span>
      </div>
      <pre class="experiment-config">${escapeHtml(JSON.stringify(strategy.config || {}, null, 2))}</pre>
      <div class="experiment-card-actions">
        <button class="button compact ghost" type="button" data-edit="${strategyId}">Nova versão</button>
        <button class="button compact ghost" type="button" data-duplicate="${strategyId}">Duplicar</button>
        <button class="button compact ghost" type="button" data-versions="${strategyId}">Histórico</button>
        <a class="button compact primary" href="${escapeHtml(jobsHref(strategy.lottery, strategy.latestVersionId))}">Executar</a>
      </div>
      <div class="version-list" data-version-root="${strategyId}" hidden></div>
    </article>`;
}

function renderVersionRow(strategy: StrategySummary, version: StrategyVersion): string {
  return `
      <div class="version-row">
        <strong>v${escapeHtml(version.version)}</strong>
        <span>${escapeHtml(version.methodologyVersion)} · ${escapeHtml(formatDateTime(version.createdAt))}</span>
        <a class="button compact" href="${escapeHtml(jobsHref(strategy.lottery, version.id))}">Executar #${escapeHtml(version.id)}</a>
      </div>`;
}

function renderStrategies(): void {
  countRoot.textContent = `${strategies.length} estratégia(s)`;
  if (!strategies.length) {
    listRoot.innerHTML =
      '<div class="panel experiment-empty">Nenhuma estratégia cadastrada neste filtro.</div>';
    return;
  }
  listRoot.innerHTML = strategies.map(renderStrategyCard).join("");
}

async function loadVersions(strategyId: number): Promise<void> {
  const strategy = strategies.find((item) => item.id === strategyId);
  if (!strategy) return;
  const root = listRoot.querySelector<HTMLElement>(`[data-version-root="${strategyId}"]`);
  if (!root) return;
  if (!root.hidden) {
    root.hidden = true;
    return;
  }

  root.hidden = false;
  root.innerHTML =
    '<div class="loading-state"><span class="spinner"></span><span>Carregando versões...</span></div>';
  try {
    const data = requiredPayload(
      await api<StrategyVersionsResponse>(
        `/strategies/${encodeURIComponent(strategy.slug)}/versions`,
      ),
      "carregar versões da estratégia",
    );
    root.innerHTML = (data.items ?? []).map((version) => renderVersionRow(strategy, version)).join("");
  } catch (error) {
    root.innerHTML = `<div class="job-error">${escapeHtml(errorMessage(error))}</div>`;
  }
}

async function loadStrategies(): Promise<void> {
  const requestedFilter = filter.value;
  const token = ++loadToken;
  listRoot.innerHTML =
    '<div class="loading-state"><span class="spinner"></span><span>Carregando estratégias...</span></div>';
  try {
    const query = requestedFilter ? `?lottery=${encodeURIComponent(requestedFilter)}` : "";
    const data = requiredPayload(
      await api<StrategyListResponse>(`/strategies${query}`),
      "carregar estratégias",
    );
    if (token !== loadToken || filter.value !== requestedFilter) return;
    strategies = data.items ?? [];
    renderStrategies();
  } catch (error) {
    if (token !== loadToken || filter.value !== requestedFilter) return;
    strategies = [];
    countRoot.textContent = "Falha ao carregar";
    listRoot.innerHTML = `<div class="panel experiment-empty job-error">${escapeHtml(errorMessage(error))}</div>`;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  try {
    const saved = requiredPayload(
      await api<SavedStrategy>("/strategies", {
        method: "POST",
        body: JSON.stringify({
          slug: slug.value.trim(),
          lottery: lottery.value,
          name: nameInput.value.trim(),
          methodologyVersion: methodology.value.trim(),
          config: strategyConfig(),
        }),
      }),
      "salvar estratégia",
    );
    toast(`Estratégia ${saved.slug} salva como v${saved.version}.`);
    resetForm();
    await loadStrategies();
  } catch (error) {
    toast(errorMessage(error), "error");
  } finally {
    submitButton.disabled = false;
  }
});

listRoot.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;

  const edit = event.target.closest<HTMLElement>("[data-edit]");
  if (edit) {
    const strategy = strategies.find((item) => item.id === Number(edit.dataset.edit));
    if (strategy) applyStrategy(strategy);
    return;
  }

  const duplicate = event.target.closest<HTMLElement>("[data-duplicate]");
  if (duplicate) {
    const strategy = strategies.find(
      (item) => item.id === Number(duplicate.dataset.duplicate),
    );
    if (strategy) applyStrategy(strategy, true);
    return;
  }

  const versions = event.target.closest<HTMLElement>("[data-versions]");
  if (versions) void loadVersions(Number(versions.dataset.versions));
});

lottery.addEventListener("change", syncLotteryFields);
filter.addEventListener("change", () => {
  void loadStrategies();
});
resetButton.addEventListener("click", resetForm);

const storedLottery = localStorage.getItem("loto-lab:lottery");
if (isLotteryId(storedLottery)) {
  filter.value = storedLottery;
  lottery.value = storedLottery;
}
syncLotteryFields();
void loadStrategies();
