import { api } from "../core/api.js";
import { currentMainView, onMainViewChanged } from "../core/viewLifecycle.js";

const root = document.querySelector<HTMLElement>("#data-status-bar");
const lotterySelect = document.querySelector<HTMLSelectElement>("#lottery-select");
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh-view");

const labels = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
  quina: "Quina",
  lotomania: "Lotomania",
  "dupla-sena": "Dupla Sena",
  "mais-milionaria": "+Milionária",
  timemania: "Timemania",
  "super-sete": "Super Sete",
} as const;

type LotteryId = keyof typeof labels;

type DataStatusItem = {
  lottery?: string;
  contestCount?: unknown;
  lastContest?: unknown;
  missingContestCount?: unknown;
  financialCoverage?: unknown;
};

type DataStatusPayload = {
  items?: DataStatusItem[];
};

type OperationsStatus = {
  latest?: {
    status?: string;
  };
  stale?: boolean;
  ageMinutes?: unknown;
  autoSyncEnabled?: boolean;
  intervalMinutes?: unknown;
};

type StatusCopy = {
  warning: boolean;
  title: string;
  detail: string;
};

function formatAge(minutes: unknown): string {
  if (!Number.isFinite(Number(minutes))) return "sem execução recente";
  const value = Math.max(0, Math.round(Number(minutes)));
  if (value < 1) return "agora";
  if (value < 60) return `há ${value} min`;
  const hours = Math.floor(value / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}

function finiteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function isLotteryId(value: string | undefined): value is LotteryId {
  return Boolean(value && Object.prototype.hasOwnProperty.call(labels, value));
}

function currentLottery(): LotteryId {
  const value = lotterySelect?.value;
  return isLotteryId(value) ? value : "mega-sena";
}

function statusCopy(
  operations: OperationsStatus | null,
  item: DataStatusItem | undefined,
): StatusCopy {
  const latestStatus = operations?.latest?.status;
  const running = latestStatus === "running";
  const latestFailed = Boolean(latestStatus && !["success", "running"].includes(latestStatus));
  const stale = Boolean(operations?.stale);
  const missing = finiteNumber(item?.missingContestCount);
  const warning = !running && (stale || latestFailed || (missing !== undefined && missing > 0));
  const age = formatAge(operations?.ageMinutes);
  const title = running
    ? "Sincronização em andamento"
    : warning
      ? "Dados precisam de atenção"
      : `Dados atualizados ${age}`;

  if (!item) {
    return {
      warning: true,
      title: "Dados indisponíveis",
      detail: "Não há cobertura registrada para esta loteria.",
    };
  }

  const lastContest = finiteNumber(item.lastContest);
  const contestCount = finiteNumber(item.contestCount);
  const continuity = missing === undefined
    ? "continuidade indisponível"
    : missing > 0
      ? `${formatCount(missing)} concurso(s) faltando`
      : lastContest === undefined
        ? "último concurso indisponível"
        : `histórico até #${formatCount(lastContest)}`;
  const countCopy = contestCount === undefined
    ? "quantidade de concursos indisponível"
    : `${formatCount(contestCount)} concursos`;

  return {
    warning,
    title,
    detail: `${countCopy} · ${continuity}`,
  };
}

async function refreshDataStatus(): Promise<void> {
  if (!root) return;
  if (currentMainView() !== "dashboard") {
    root.hidden = true;
    return;
  }

  root.hidden = false;
  root.innerHTML = '<div class="data-status-compact is-loading"><span class="data-status-dot"></span><span>Verificando dados...</span></div>';

  try {
    const [payload, operations] = await Promise.all([
      api<DataStatusPayload>("/data/status"),
      api<OperationsStatus>("/operations/status").catch(() => null),
    ]);
    const lottery = currentLottery();
    const item = (payload?.items || []).find((candidate) => candidate.lottery === lottery);
    const status = statusCopy(operations, item);
    const auto = operations?.autoSyncEnabled !== false;
    const interval = Number(operations?.intervalMinutes) || 30;

    root.innerHTML = `<div class="data-status-compact ${status.warning ? "is-warning" : ""}" title="${auto ? `Sincronização automática a cada ${interval} min.` : "Sincronização automática desativada."}">
      <span class="data-status-dot"></span>
      <strong>${status.title}</strong>
      <span>${status.detail}</span>
      ${status.warning ? '<button class="data-status-action" type="button" data-status-refresh>Atualizar dados</button>' : ""}
    </div>`;
  } catch {
    root.innerHTML = '<div class="data-status-compact is-warning"><span class="data-status-dot"></span><strong>Status indisponível</strong><span>Não foi possível consultar o estado da base.</span><button class="data-status-action" type="button" data-status-refresh>Atualizar dados</button></div>';
  }
}

root?.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target.closest("[data-status-refresh]") : null;
  if (target) refreshButton?.click();
});

onMainViewChanged(() => {
  void refreshDataStatus();
});
window.addEventListener("loto-lab:data-synced", () => {
  void refreshDataStatus();
});
lotterySelect?.addEventListener("change", () => {
  if (currentMainView() === "dashboard") {
    window.setTimeout(() => {
      void refreshDataStatus();
    }, 0);
  }
});

void refreshDataStatus();
