const root = document.querySelector("#data-status-bar");
const lotterySelect = document.querySelector("#lottery-select");
const labels = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
};

function formatPercent(value) {
  return `${Math.round((Number(value) || 0) * 100)}%`;
}

function formatAge(minutes) {
  if (!Number.isFinite(Number(minutes))) return "sem execução recente";
  const value = Math.max(0, Math.round(Number(minutes)));
  if (value < 1) return "agora";
  if (value < 60) return `há ${value} min`;
  const hours = Math.floor(value / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}

function formatCount(value) {
  return new Intl.NumberFormat("pt-BR").format(Number(value) || 0);
}

function currentScope() {
  const value = lotterySelect?.value;
  return value === "all" || labels[value] ? value : "all";
}

function statusCopy(operations, items, scope) {
  const latestStatus = operations?.latest?.status;
  const running = latestStatus === "running";
  const latestFailed = latestStatus && !["success", "running"].includes(latestStatus);
  const stale = Boolean(operations?.stale);
  const missing = items.reduce((total, item) => total + Number(item.missingContestCount || 0), 0);
  const warning = !running && (stale || latestFailed || missing > 0);
  const age = formatAge(operations?.ageMinutes);
  const title = running
    ? "Sincronização em andamento"
    : warning
      ? "Dados precisam de atenção"
      : `Dados atualizados ${age}`;

  if (scope !== "all") {
    const item = items[0];
    if (!item) return { warning: true, title: "Dados indisponíveis", detail: "Não há cobertura registrada para esta loteria." };
    const continuity = item.missingContestCount > 0
      ? `${formatCount(item.missingContestCount)} concurso(s) faltando`
      : `histórico até #${item.lastContest || 0}`;
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

async function refreshDataStatus() {
  if (!root) return;
  const view = location.hash.replace("#", "") || "dashboard";
  if (view !== "dashboard") {
    root.hidden = true;
    return;
  }

  root.hidden = false;
  root.innerHTML = '<div class="data-status-compact is-loading"><span class="data-status-dot"></span><span>Verificando dados...</span></div>';

  try {
    const [dataResponse, operationsResponse] = await Promise.all([
      fetch("/api/v1/data/status"),
      fetch("/api/v1/operations/status"),
    ]);
    if (!dataResponse.ok) throw new Error(`HTTP ${dataResponse.status}`);
    const payload = await dataResponse.json();
    const operations = operationsResponse.ok ? await operationsResponse.json() : null;
    const scope = currentScope();
    const items = (payload.items || []).filter((item) => scope === "all" || item.lottery === scope);
    const status = statusCopy(operations, items, scope);
    const auto = operations?.autoSyncEnabled !== false;
    const interval = operations?.intervalMinutes || 30;

    root.innerHTML = `<div class="data-status-compact ${status.warning ? "is-warning" : ""}" title="${auto ? `Sincronização automática a cada ${interval} min.` : "Sincronização automática desativada."}">
      <span class="data-status-dot"></span>
      <strong>${status.title}</strong>
      <span>${status.detail}</span>
    </div>`;
  } catch {
    root.innerHTML = '<div class="data-status-compact is-warning"><span class="data-status-dot"></span><strong>Status indisponível</strong><span>Não foi possível consultar o estado da base.</span></div>';
  }
}

window.addEventListener("hashchange", refreshDataStatus);
window.addEventListener("loto-lab:data-synced", refreshDataStatus);
lotterySelect?.addEventListener("change", () => {
  if ((location.hash.replace("#", "") || "dashboard") === "dashboard") {
    window.setTimeout(refreshDataStatus, 0);
  }
});

refreshDataStatus();
