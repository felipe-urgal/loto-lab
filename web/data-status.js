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

function formatDateTime(value) {
  if (!value) return "sem sincronização";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatAge(minutes) {
  if (!Number.isFinite(Number(minutes))) return "sem execução";
  const value = Math.max(0, Math.round(Number(minutes)));
  if (value < 1) return "agora";
  if (value < 60) return `há ${value} min`;
  const hours = Math.floor(value / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.floor(hours / 24)} d`;
}

function operationCopy(status) {
  if (!status?.latest) return "Nenhuma sincronização operacional registrada";
  const result = status.latest.status === "success"
    ? "última execução concluída"
    : status.latest.status === "partial"
      ? "última execução parcial"
      : status.latest.status === "running"
        ? "sincronização em andamento"
        : "última execução falhou";
  return `${result} · ${formatAge(status.ageMinutes)}`;
}

function currentScope() {
  const value = lotterySelect?.value;
  return value === "all" || labels[value] ? value : "all";
}

async function runSync(button) {
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "Sincronizando...";
  try {
    const response = await fetch("/api/v1/operations/sync", { method: "POST" });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error?.message || `HTTP ${response.status}`);
    }
    await refreshDataStatus();
    window.dispatchEvent(new CustomEvent("loto-lab:data-synced"));
  } catch (error) {
    button.textContent = error?.message || "Falha ao sincronizar";
    window.setTimeout(() => {
      button.textContent = original;
      button.disabled = false;
    }, 2500);
    return;
  }
  button.textContent = original;
  button.disabled = false;
}

async function refreshDataStatus() {
  if (!root) return;
  const view = location.hash.replace("#", "") || "dashboard";
  if (view !== "dashboard") {
    root.hidden = true;
    return;
  }

  root.hidden = false;
  root.innerHTML = '<div class="data-status-shell"><div class="data-status-item"><span class="data-status-detail">Verificando cobertura histórica...</span></div></div>';

  try {
    const [dataResponse, operationsResponse] = await Promise.all([
      fetch("/api/v1/data/status"),
      fetch("/api/v1/operations/status"),
    ]);
    if (!dataResponse.ok) throw new Error(`HTTP ${dataResponse.status}`);
    const payload = await dataResponse.json();
    const operations = operationsResponse.ok ? await operationsResponse.json() : null;
    const stale = Boolean(operations?.stale);
    const auto = operations?.autoSyncEnabled !== false;
    const scope = currentScope();
    const items = (payload.items || []).filter((item) => scope === "all" || item.lottery === scope);

    root.innerHTML = `
      <div class="data-ops-row ${stale ? "is-warning" : ""}">
        <div class="data-ops-copy">
          <strong>${stale ? "Sincronização precisa de atenção" : "Dados operacionais atualizados"}</strong>
          <span>${operationCopy(operations)} · automático ${auto ? `a cada ${operations?.intervalMinutes || 30} min` : "desativado"}</span>
        </div>
        <button class="data-sync-button" type="button">Sincronizar agora</button>
      </div>
      <div class="data-status-shell ${scope === "all" ? "" : "is-focused"}">${items.map((item) => {
        const warning = item.missingContestCount > 0;
        const detail = warning
          ? `${item.missingContestCount} concurso(s) faltando até #${item.lastContest || 0}`
          : `Histórico contínuo até #${item.lastContest || 0}`;
        return `<article class="data-status-item ${warning ? "is-warning" : ""}">
          <span class="data-status-name">${labels[item.lottery] || item.lottery}</span>
          <span class="data-status-count">${item.contestCount} concursos</span>
          <span class="data-status-detail">${detail} · financeiro ${formatPercent(item.financialCoverage)} · ${formatDateTime(item.lastUpdatedAt)}</span>
        </article>`;
      }).join("")}</div>`;

    root.querySelector(".data-sync-button")?.addEventListener("click", (event) => {
      void runSync(event.currentTarget);
    });
  } catch {
    root.innerHTML = '<div class="data-status-shell"><div class="data-status-item is-warning"><span class="data-status-detail">Não foi possível consultar o estado operacional da base.</span></div></div>';
  }
}

window.addEventListener("hashchange", refreshDataStatus);
lotterySelect?.addEventListener("change", () => {
  if ((location.hash.replace("#", "") || "dashboard") === "dashboard") {
    window.setTimeout(refreshDataStatus, 0);
  }
});
document.querySelector("#refresh-view")?.addEventListener("click", () => {
  window.setTimeout(refreshDataStatus, 0);
});

refreshDataStatus();
