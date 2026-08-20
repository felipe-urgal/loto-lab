const root = document.querySelector("#data-status-bar");
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
    const response = await fetch("/api/v1/data/status");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    root.innerHTML = `<div class="data-status-shell">${(payload.items || []).map((item) => {
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
  } catch {
    root.innerHTML = '<div class="data-status-shell"><div class="data-status-item is-warning"><span class="data-status-detail">Não foi possível consultar a cobertura histórica.</span></div></div>';
  }
}

window.addEventListener("hashchange", refreshDataStatus);
document.querySelector("#refresh-view")?.addEventListener("click", () => {
  window.setTimeout(refreshDataStatus, 0);
});

refreshDataStatus();
