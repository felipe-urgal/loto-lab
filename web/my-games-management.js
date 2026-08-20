const root = document.querySelector("#content");
const lotterySelect = document.querySelector("#lottery-select");
let scheduled = false;
let managementCache;

function currentView() {
  return location.hash.replace("#", "") || "dashboard";
}

function currentLottery() {
  return lotterySelect?.value || "mega-sena";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

async function api(path, options = {}) {
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers: options.body
      ? { "Content-Type": "application/json", ...(options.headers || {}) }
      : options.headers,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Erro HTTP ${response.status}`);
    error.code = payload?.error?.code || "HTTP_ERROR";
    throw error;
  }
  return payload;
}

async function loadManagement(force = false) {
  const lottery = currentLottery();
  if (force || !managementCache || managementCache.lottery !== lottery) {
    const data = await api(`/game-batches/manage/${lottery}?scope=all&limit=200`);
    managementCache = { lottery, data };
  }
  return managementCache.data;
}

function batchSignature(batch) {
  const games = (batch.games || []).map((game) => {
    const numbers = [...(game.numbers || [])].sort((a, b) => a - b).join("-");
    return `${numbers}:${game.luckyMonth || ""}`;
  }).join("|");
  return `${batch.targetContestNumber || 0}:${games}`;
}

function duplicateArchiveIds(items) {
  const seen = new Set();
  const duplicates = [];
  for (const batch of items) {
    if (batch.archivedAt || batch.hasRealBet) continue;
    const signature = batchSignature(batch);
    if (seen.has(signature)) duplicates.push(batch.id);
    else seen.add(signature);
  }
  return duplicates;
}

function archivedMarkup(batch) {
  return `<article class="panel archived-batch-row" data-archived-batch="${batch.id}">
    <div>
      <strong>Lote #${batch.id}</strong>
      <p>${formatDateTime(batch.createdAt)} · ${batch.games.length} jogo(s) · alvo ${batch.targetContestNumber ? `#${batch.targetContestNumber}` : "não definido"}</p>
    </div>
    <div class="archived-batch-actions">
      <span class="archive-date">Arquivado ${formatDateTime(batch.archivedAt)}</span>
      <button class="button compact" type="button" data-restore-batch="${batch.id}">Restaurar</button>
    </div>
  </article>`;
}

function applyCardFilter(stack, filter, query, metadata) {
  const normalized = query.trim().toLowerCase();
  stack.querySelectorAll(".batch-card").forEach((card) => {
    const batchId = Number(card.querySelector("[data-check-batch]")?.dataset.checkBatch);
    const batch = metadata.get(batchId);
    if (!batch) return;
    const haystack = `${batch.id} ${batch.targetContestNumber || ""}`.toLowerCase();
    const queryMatches = !normalized || haystack.includes(normalized);
    const filterMatches = filter === "active"
      || (filter === "real" && batch.hasRealBet)
      || (filter === "generated" && !batch.hasRealBet);
    card.hidden = !(queryMatches && filterMatches);
  });
}

function bindCardControls(stack, metadata) {
  stack.querySelectorAll(".batch-card").forEach((card) => {
    if (card.dataset.managementBound === "true") return;
    const checkButton = card.querySelector("[data-check-batch]");
    const batchId = Number(checkButton?.dataset.checkBatch);
    const batch = metadata.get(batchId);
    if (!batch) return;
    card.dataset.managementBound = "true";
    card.classList.add("is-collapsed");

    const actions = card.querySelector(".batch-actions");
    if (!actions) return;

    const toggle = document.createElement("button");
    toggle.className = "button compact ghost batch-toggle";
    toggle.type = "button";
    toggle.textContent = "Ver jogos";
    toggle.addEventListener("click", () => {
      const collapsed = card.classList.toggle("is-collapsed");
      toggle.textContent = collapsed ? "Ver jogos" : "Ocultar jogos";
    });
    actions.prepend(toggle);

    if (!batch.hasRealBet) {
      const archive = document.createElement("button");
      archive.className = "button compact ghost archive-batch";
      archive.type = "button";
      archive.textContent = "Arquivar";
      archive.addEventListener("click", async () => {
        archive.disabled = true;
        archive.textContent = "Arquivando...";
        try {
          await api(`/game-batches/${batchId}/archive`, { method: "POST" });
          managementCache = undefined;
          document.querySelector("#refresh-view")?.click();
        } catch (error) {
          archive.disabled = false;
          archive.textContent = error.code === "BATCH_HAS_REAL_BET" ? "Lote apostado" : "Tentar novamente";
        }
      });
      actions.append(archive);
    } else {
      const badge = document.createElement("span");
      badge.className = "managed-batch-badge";
      badge.textContent = "Aposta real";
      actions.append(badge);
    }
  });
}

async function enhanceGames() {
  if (!root || currentView() !== "games") return;
  const stack = root.querySelector(":scope > .stack");
  if (!stack || stack.dataset.gamesManagement === "true") return;
  const cards = [...stack.querySelectorAll(".batch-card")];
  if (!cards.length) return;

  const lottery = currentLottery();
  let data;
  try {
    data = await loadManagement();
  } catch {
    return;
  }
  if (currentView() !== "games" || currentLottery() !== lottery || !stack.isConnected) return;

  stack.dataset.gamesManagement = "true";
  const metadata = new Map((data.items || []).map((batch) => [batch.id, batch]));
  const active = (data.items || []).filter((batch) => !batch.archivedAt);
  const archived = (data.items || []).filter((batch) => batch.archivedAt);
  const counts = data.counts || {};
  const activeCount = Number.isInteger(counts.active) ? counts.active : active.length;
  const archivedCount = Number.isInteger(counts.archived) ? counts.archived : archived.length;
  const realCount = Number.isInteger(counts.realBets)
    ? counts.realBets
    : active.filter((batch) => batch.hasRealBet).length;
  const generatedCount = Math.max(0, activeCount - realCount);
  const duplicateIds = duplicateArchiveIds(data.items || []);

  const toolbar = document.createElement("section");
  toolbar.className = "panel my-games-management";
  toolbar.innerHTML = `
    <div class="my-games-management-copy">
      <strong>Organizar lotes</strong>
      <p>Mostramos os lotes recentes de forma compacta. Arquivar não apaga histórico e pode ser desfeito.</p>
    </div>
    <div class="my-games-management-row">
      <div class="batch-filter-tabs" role="tablist" aria-label="Filtrar lotes">
        <button class="batch-filter is-active" type="button" data-batch-filter="active">Ativos <span>${activeCount}</span></button>
        <button class="batch-filter" type="button" data-batch-filter="real">Apostados <span>${realCount}</span></button>
        <button class="batch-filter" type="button" data-batch-filter="generated">Só gerados <span>${generatedCount}</span></button>
        <button class="batch-filter" type="button" data-batch-filter="archived">Arquivados <span>${archivedCount}</span></button>
      </div>
      <div class="batch-management-actions">
        <input class="batch-search" type="search" placeholder="Lote ou concurso" aria-label="Buscar lote ou concurso" />
        <button class="button compact ghost" type="button" data-archive-duplicates ${duplicateIds.length ? "" : "disabled"}>Arquivar duplicados${duplicateIds.length ? ` (${duplicateIds.length})` : ""}</button>
      </div>
    </div>
    <div class="archived-batches" hidden></div>`;

  const sectionHead = stack.querySelector(":scope > .section-head");
  if (sectionHead) sectionHead.insertAdjacentElement("afterend", toolbar);
  else stack.prepend(toolbar);

  bindCardControls(stack, metadata);

  let filter = "active";
  const search = toolbar.querySelector(".batch-search");
  const archivedHost = toolbar.querySelector(".archived-batches");

  function apply() {
    const isArchived = filter === "archived";
    cards.forEach((card) => { if (isArchived) card.hidden = true; });
    archivedHost.hidden = !isArchived;
    search.disabled = isArchived;
    if (isArchived) {
      archivedHost.innerHTML = archived.length
        ? archived.map(archivedMarkup).join("")
        : '<div class="empty-state compact"><strong>Nenhum lote arquivado</strong><p>Os lotes arquivados aparecerão aqui.</p></div>';
      archivedHost.querySelectorAll("[data-restore-batch]").forEach((button) => button.addEventListener("click", async () => {
        button.disabled = true;
        button.textContent = "Restaurando...";
        try {
          await api(`/game-batches/${button.dataset.restoreBatch}/restore`, { method: "POST" });
          managementCache = undefined;
          document.querySelector("#refresh-view")?.click();
        } catch {
          button.disabled = false;
          button.textContent = "Tentar novamente";
        }
      }));
      return;
    }
    applyCardFilter(stack, filter, search.value, metadata);
  }

  toolbar.querySelectorAll("[data-batch-filter]").forEach((button) => button.addEventListener("click", () => {
    filter = button.dataset.batchFilter;
    toolbar.querySelectorAll("[data-batch-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
    apply();
  }));
  search.addEventListener("input", apply);

  toolbar.querySelector("[data-archive-duplicates]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    if (!duplicateIds.length || !confirm(`Arquivar ${duplicateIds.length} lote(s) duplicado(s) antigo(s)? O lote mais recente de cada combinação será mantido.`)) return;
    button.disabled = true;
    button.textContent = "Arquivando...";
    try {
      for (const id of duplicateIds) {
        try {
          await api(`/game-batches/${id}/archive`, { method: "POST" });
        } catch (error) {
          if (error.code !== "BATCH_HAS_REAL_BET") throw error;
        }
      }
      managementCache = undefined;
      document.querySelector("#refresh-view")?.click();
    } catch {
      button.disabled = false;
      button.textContent = "Tentar novamente";
    }
  });

  apply();
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(async () => {
    scheduled = false;
    await enhanceGames();
  }, 0);
}

if (root) new MutationObserver(scheduleEnhance).observe(root, { childList: true, subtree: true });
window.addEventListener("hashchange", () => {
  managementCache = undefined;
  scheduleEnhance();
});
lotterySelect?.addEventListener("change", () => {
  managementCache = undefined;
  scheduleEnhance();
});
scheduleEnhance();
