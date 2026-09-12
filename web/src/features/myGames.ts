import { api } from "../core/api.js";
import { currentMainView, onViewRendered } from "../core/viewLifecycle.js";
import { escapeHtml } from "../shared/escaping.js";
import { toast } from "../shared/toast.js";
import { renderBetForm } from "./myGames/betForm.js";
import { loadComparison } from "./myGames/comparison.js";
import { latestBetByBatch, renderMyGamesMarkup } from "./myGames/presentation.js";
import { createMyGamesUiState } from "./myGames/state.js";
import { errorMessage, requiredElement, requiredPayload } from "./myGames/support.js";
import type { GameBatchResponse, LotteryId, RealBetResponse } from "./myGames/types.js";

type MountOptions = { preserveExpanded?: number | null };

const root = requiredElement<HTMLElement>("#content");
const lotterySelect = requiredElement<HTMLSelectElement>("#lottery-select");
const subtitle = requiredElement<HTMLElement>("#view-subtitle");
const ui = createMyGamesUiState();

function currentLottery(): LotteryId {
  const value = lotterySelect.value;
  return value === "mega-sena" || value === "lotofacil" || value === "dia-de-sorte" ? value : "mega-sena";
}

function renderScreen(data: GameBatchResponse, betData: RealBetResponse): void {
  const items = data.items ?? [];
  const betByBatch = latestBetByBatch(betData.items ?? []);
  root.innerHTML = renderMyGamesMarkup(items, betByBatch, ui.snapshot());
  bindScreen(data, betData);
}

function rerender(data: GameBatchResponse, betData: RealBetResponse): void {
  if (currentMainView() === "games") renderScreen(data, betData);
}

async function hideBatch(batchId: number): Promise<void> {
  await api(`/game-batches/${batchId}/hide`, { method: "POST" });
  if (ui.snapshot().expandedBatchId === batchId) ui.setExpanded(null);
  toast("Lote ocultado. O histórico foi preservado.");
  await mount();
}

async function showBatch(batchId: number): Promise<void> {
  await api(`/game-batches/${batchId}/show`, { method: "POST" });
  ui.setFilter("visible");
  ui.setExpanded(batchId);
  toast("Lote voltou para a lista principal.");
  await mount({ preserveExpanded: batchId });
}

function bindScreen(data: GameBatchResponse, betData: RealBetResponse): void {
  const items = data.items ?? [];
  const batchById = new Map(items.map((batch) => [batch.id, batch]));

  root.querySelectorAll<HTMLButtonElement>("[data-mg2-filter]").forEach((button) => button.addEventListener("click", () => {
    const filter = button.dataset.mg2Filter;
    if (filter === "visible" || filter === "bets" || filter === "generated" || filter === "hidden") {
      ui.setFilter(filter);
    }
    ui.setExpanded(null);
    rerender(data, betData);
  }));

  root.querySelector<HTMLInputElement>("[data-mg2-search]")?.addEventListener("input", (event) => {
    ui.setQuery((event.currentTarget as HTMLInputElement).value);
    rerender(data, betData);
    const input = root.querySelector<HTMLInputElement>("[data-mg2-search]");
    const query = ui.snapshot().query;
    input?.focus();
    input?.setSelectionRange(query.length, query.length);
  });

  root.querySelectorAll<HTMLButtonElement>("[data-mg2-toggle]").forEach((button) => button.addEventListener("click", () => {
    ui.toggleExpanded(Number(button.dataset.mg2Toggle));
    rerender(data, betData);
  }));

  root.querySelectorAll<HTMLButtonElement>("[data-mg2-hide]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try { await hideBatch(Number(button.dataset.mg2Hide)); }
    catch (error) { button.disabled = false; toast(errorMessage(error), "error"); }
  }));

  root.querySelectorAll<HTMLButtonElement>("[data-mg2-show]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    try { await showBatch(Number(button.dataset.mg2Show)); }
    catch (error) { button.disabled = false; toast(errorMessage(error), "error"); }
  }));

  root.querySelectorAll<HTMLButtonElement>("[data-mg2-mark-bet]").forEach((button) => button.addEventListener("click", () => {
    const batchId = Number(button.dataset.mg2MarkBet);
    const batch = batchById.get(batchId);
    const host = root.querySelector<HTMLElement>(`[data-mg2-inline="${batchId}"]`);
    if (batch && host) renderBetForm(host, batch, () => mount({ preserveExpanded: batch.id }));
  }));

  root.querySelectorAll<HTMLButtonElement>("[data-mg2-compare]").forEach((button) => button.addEventListener("click", () => {
    const batchId = Number(button.dataset.mg2Compare);
    const batch = batchById.get(batchId);
    const host = root.querySelector<HTMLElement>(`[data-mg2-comparison-host="${batchId}"]`);
    if (!batch || !host) return;
    if (host.querySelector("[data-mg2-comparison]")) {
      host.innerHTML = "";
      button.textContent = "Comparar concursos";
      return;
    }
    void loadComparison(root, batch, 5);
  }));

  root.querySelectorAll<HTMLButtonElement>("[data-mg2-refresh-bet]").forEach((button) => button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Atualizando...";
    try {
      await api(`/real-bets/${button.dataset.mg2RefreshBet}/check`, { method: "POST" });
      toast("Resultado da aposta atualizado.");
      await mount({ preserveExpanded: ui.snapshot().expandedBatchId });
    } catch (error) {
      button.disabled = false;
      button.textContent = "Atualizar resultado";
      toast(errorMessage(error), "error");
    }
  }));
}

async function mount(options: MountOptions = {}): Promise<void> {
  if (currentMainView() !== "games") return;
  const lottery = currentLottery();
  const token = ui.beginRequest();
  if (options.preserveExpanded !== undefined) ui.setExpanded(options.preserveExpanded);
  subtitle.textContent = "Acompanhe lotes, apostas e resultados sem perder o histórico.";
  root.innerHTML = '<div class="mg2-loading"><span class="spinner"></span><span>Carregando seus jogos...</span></div>';
  try {
    const [dataPayload, betPayload] = await Promise.all([
      api<GameBatchResponse>(`/game-batches/manage/${lottery}?scope=all&limit=200`),
      api<RealBetResponse>(`/real-bets/${lottery}?limit=200`).catch(() => ({ items: [] } as RealBetResponse)),
    ]);
    const data = requiredPayload(dataPayload, "carregar lotes");
    const betData = requiredPayload(betPayload, "carregar apostas reais");
    if (!ui.isCurrentRequest(token) || currentMainView() !== "games" || currentLottery() !== lottery) return;
    renderScreen(data, betData);
  } catch (error) {
    if (!ui.isCurrentRequest(token) || currentMainView() !== "games") return;
    root.innerHTML = `<div class="error-state"><strong>Não foi possível carregar seus jogos</strong><p>${escapeHtml(errorMessage(error))}</p><button class="button" type="button" data-mg2-retry>Tentar novamente</button></div>`;
    root.querySelector<HTMLButtonElement>("[data-mg2-retry]")?.addEventListener("click", () => { void mount(); });
  }
}

let scheduled = false;
function scheduleMount(): void {
  if (scheduled) return;
  scheduled = true;
  window.setTimeout(() => {
    scheduled = false;
    void mount();
  }, 0);
}

onViewRendered(scheduleMount);
lotterySelect.addEventListener("change", () => {
  ui.resetForLotteryChange();
});
document.querySelector<HTMLButtonElement>("#refresh-view")?.addEventListener("click", () => { ui.setExpanded(null); });
window.addEventListener("loto-lab:data-synced", scheduleMount);
