import { api, ApiError } from "../core/api.js";
import { isLotteryId, type LotteryId } from "../core/mainContext.js";
import { readLotteryPreference, writeLotteryPreference } from "../core/lotteryPreference.js";
import { emitViewRendered } from "../core/viewLifecycle.js";
import { recentContestsMarkup } from "./generatorPresentation.js";
import "./generationV2.js";

type SyncRun = { status?: string; finishedAt?: string; startedAt?: string };
type SyncStatus = { latest?: SyncRun; sync?: { running?: boolean } };
const root = document.querySelector<HTMLElement>("#content")!;
const recent = document.querySelector<HTMLElement>("#recent-results")!;
const syncButton = document.querySelector<HTMLButtonElement>("#sync-results")!;
const syncStatus = document.querySelector<HTMLElement>("#sync-status")!;
let lottery: LotteryId = "mega-sena";
try { lottery = readLotteryPreference() || lottery; } catch { /* Preference is optional. */ }
let historyController: AbortController | undefined;
let syncTimer: ReturnType<typeof setTimeout> | undefined;
let syncSequence = 0;
let watchingSync = false;
const pageController = new AbortController();

function normalizeRoute(): void {
  if (location.hash !== "#generate") history.replaceState(null, "", `${location.pathname}${location.search}#generate`);
}

function mountGenerator(): void {
  root.setAttribute("aria-busy", "true");
  root.innerHTML = '<div class="loading-state" role="status">Preparando suas combinações…</div>';
  emitViewRendered({ view: "generate", lottery });
}

async function loadRecent(): Promise<void> {
  historyController?.abort();
  const controller = historyController = new AbortController();
  recent.setAttribute("aria-busy", "true");
  recent.innerHTML = '<p class="loading-state">Buscando os últimos concursos…</p>';
  try {
    const response = await api<{ items: Parameters<typeof recentContestsMarkup>[0] }>(`/contests/${lottery}?limit=40&order=desc`, { signal: controller.signal });
    if (controller.signal.aborted) return;
    const items = response?.items || [];
    const month = items[0]?.date.slice(0, 7);
    recent.innerHTML = recentContestsMarkup(items.filter(item => item.date.startsWith(month!)));
  } catch {
    if (controller.signal.aborted) return;
    recent.innerHTML = '<div class="history-empty" role="alert"><strong>Os resultados não carregaram.</strong><p>Você pode continuar no gerador e tentar buscar os concursos novamente.</p><button class="button" type="button" data-history-retry>Tentar novamente</button></div>';
  } finally {
    if (!controller.signal.aborted) recent.setAttribute("aria-busy", "false");
  }
}

function setSyncing(value: boolean): void {
  syncButton.disabled = value;
  syncButton.classList.toggle("is-syncing", value);
  const label = syncButton.querySelector("span");
  if (label) label.textContent = value ? "Sincronizando…" : "Sincronizar resultados";
}

function syncFinished(run: SyncRun, refresh = true): void {
  setSyncing(false);
  if (run.status === "failed" || run.status === "abandoned") {
    syncStatus.textContent = "A sincronização não terminou. Tente novamente mais tarde.";
    return;
  }
  if (run.status === "partial") syncStatus.textContent = "Sincronização parcial. Alguns resultados precisam de uma nova tentativa.";
  else if (refresh) syncStatus.textContent = "Resultados sincronizados!";
  else if (run.finishedAt) {
    const date = new Date(run.finishedAt);
    if (Number.isFinite(date.getTime())) syncStatus.textContent = `Última sincronização: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)}`;
  }
  if (refresh) {
    void loadRecent();
    window.dispatchEvent(new CustomEvent("loto-lab:data-synced"));
  }
}

async function readSyncStatus(): Promise<void> {
  const sequence = ++syncSequence;
  try {
    const status = await api<SyncStatus>("/operations/status", { signal: pageController.signal });
    if (sequence !== syncSequence || pageController.signal.aborted) return;
    const running = status?.sync?.running || status?.latest?.status === "running";
    if (running) {
      watchingSync = true;
      setSyncing(true);
      syncStatus.textContent = "Atualizando os resultados. Você pode continuar criando jogos.";
      syncTimer = setTimeout(() => void readSyncStatus(), 2500);
    } else if (status?.latest) {
      syncFinished(status.latest, watchingSync);
      watchingSync = false;
    } else {
      setSyncing(false);
      syncStatus.textContent = "Sincronize para buscar os resultados mais recentes.";
    }
  } catch {
    if (sequence !== syncSequence || pageController.signal.aborted) return;
    setSyncing(false);
    syncStatus.textContent = "Status de atualização indisponível.";
  }
}

syncButton.addEventListener("click", async () => {
  if (syncButton.disabled) return;
  ++syncSequence;
  if (syncTimer) clearTimeout(syncTimer);
  setSyncing(true);
  syncStatus.textContent = "Buscando os resultados. Isso pode levar um momento.";
  try {
    const run = await api<SyncRun>("/operations/sync", { method: "POST", body: "{}", signal: pageController.signal });
    if (run?.status === "running") {
      watchingSync = true;
      void readSyncStatus();
    } else if (run) syncFinished(run);
    else throw new Error("Resposta vazia");
  } catch (error) {
    if (pageController.signal.aborted) return;
    if (error instanceof ApiError && error.status === 409) {
      watchingSync = true;
      void readSyncStatus();
      return;
    }
    setSyncing(false);
    syncStatus.textContent = error instanceof ApiError && error.status === 429
      ? "Aguarde alguns minutos antes de sincronizar novamente."
      : "Não foi possível sincronizar agora. Seus jogos continuam disponíveis.";
  }
});

document.addEventListener("change", event => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) || target.id !== "lottery-select" || !isLotteryId(target.value) || target.value === lottery) return;
  lottery = target.value;
  try { writeLotteryPreference(lottery); } catch { /* Preference is optional. */ }
  mountGenerator();
  void loadRecent();
});
document.querySelector(".skip-link")?.addEventListener("click", event => {
  event.preventDefault();
  root.focus();
  root.scrollIntoView({ block: "start" });
});
document.addEventListener("click", event => {
  const target = event.target instanceof Element ? event.target.closest("button") : null;
  if (target?.hasAttribute("data-history-retry")) void loadRecent();
  if (target?.hasAttribute("data-g2-retry")) mountGenerator();
});
window.addEventListener("loto-lab:generator-ready", event => {
  const detail = (event as CustomEvent<{ name?: string; lottery?: string }>).detail;
  if (detail.lottery && isLotteryId(detail.lottery) && detail.lottery !== lottery) {
    lottery = detail.lottery;
    try { writeLotteryPreference(lottery); } catch { /* Preference is optional. */ }
    void loadRecent();
  }
  const label = document.querySelector("#recent-modality");
  if (label) label.textContent = detail.name || "";
});
window.addEventListener("hashchange", () => {
  if (location.hash === "#generate") return;
  normalizeRoute();
  mountGenerator();
});
window.addEventListener("pagehide", event => {
  ++syncSequence;
  if (!event.persisted) pageController.abort();
  historyController?.abort();
  if (syncTimer) clearTimeout(syncTimer);
});
window.addEventListener("pageshow", event => {
  if (!event.persisted) return;
  void loadRecent();
  void readSyncStatus();
});
normalizeRoute();
mountGenerator();
void loadRecent();
void readSyncStatus();
