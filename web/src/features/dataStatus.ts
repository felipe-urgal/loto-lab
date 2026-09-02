import { api } from "../core/api.js";
import { currentMainView, onMainViewChanged } from "../core/viewLifecycle.js";

const root = document.querySelector<HTMLElement>("#data-status-bar");
const lotterySelect = document.querySelector<HTMLSelectElement>("#lottery-select");
const labels = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
} as const;

type LotteryId = keyof typeof labels;
type Scope = "all" | LotteryId;

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

function formatPercent(value: unknown): string {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatAge(minutes: unknown): string {
  if (!Number.isFinite(Number(minutes))) return "sem execução recente";
  const value = Math.max(0, Math.round(Number(minutes)));
  if (value < 1) return "agora";
  if (value < 60) return `há ${value} min`;
  const hours = Math.floor(value / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}

function formatCount(value: unknown): string {
  return new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
}

function isLotteryId(value: string | undefined): value is LotteryId {
  return Boolean(value && Object.prototype.hasOwnProperty.call(labels, value));
}

function currentScope(): Scope {
  const value = lotterySelect?.value;
  return value === "all" || isLotteryId(value) ? value : "all";
}

function statusCopy(
  operations: OperationsStatus | null,
  items: DataStatusItem[],
  scope: Scope,
): StatusCopy {
  const latestStatus = operations?.latest?.status;
  const running = latestStatus === "running";
  const latestFailed = Boolean(latestStatus && !["success", "running"].includes(latestStatus));
  const stale = Boolean(operations?.stale);
  const missing = items.reduce(
    (total, item) => total + Number(item.missingContestCount || 0),
    0,
  );
  const warning = !running && (stale || latestFailed || missing > 0);
  const age = formatAge(operations?.ageMinutes);
  const title = running
    ? "Sincronização em andamento"
    : warning
      ? "Dados precisam de atenção"
      : `Dados atualizados ${age}`;

  if (scope !== "all") {
    const item = items[0];
    if (!item) {
      return {
        warning: true,
        title: "Dados indisponíveis",
        detail: "Não há cobertura registrada para esta loteria.",
      };
    }
    const continuity = Number(item.missingContestCount || 0) > 0
      ? `${formatCount(item.missingContestCount)} concurso(s) faltando`
      : `histórico até #${Number(item.lastContest) || 0}`;
    return {
      warning,
      title,
      detail: `${formatCount(item.contestCount)} concursos · ${continuity} · cobertura ${formatPercent(item.financialCoverage)}`,
    };
  }

  const contests = items.reduce((total, item) => total + Number(item.contestCount || 0), 0);
  return {
    warning,
    title,
    detail: `${items.length} loterias · ${formatCount(contests)} concursos`,
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
    const scope = currentScope();
    const items = (payload?.items || []).filter(
      (item) => scope === "all" || item.lottery === scope,
    );
    const status = statusCopy(operations, items, scope);
    const auto = operations?.autoSyncEnabled !== false;
    const interval = Number(operations?.intervalMinutes) || 30;

    root.innerHTML = `<div class="data-status-compact ${status.warning ? "is-warning" : ""}" title="${auto ? `Sincronização automática a cada ${interval} min.` : "Sincronização automática desativada."}">
      <span class="data-status-dot"></span>
      <strong>${status.title}</strong>
      <span>${status.detail}</span>
    </div>`;
  } catch {
    root.innerHTML = '<div class="data-status-compact is-warning"><span class="data-status-dot"></span><strong>Status indisponível</strong><span>Não foi possível consultar o estado da base.</span></div>';
  }
}

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
