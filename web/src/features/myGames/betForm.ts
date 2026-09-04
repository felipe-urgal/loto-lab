import { api } from "../../core/api.js";
import { toast } from "../../shared/toast.js";
import { bindTargetContestAudit } from "./auditability.js";
import { numberLabel } from "./formatting.js";
import { errorMessage } from "./support.js";
import type { GameBatch } from "./types.js";

function formMarkup(batch: GameBatch): string {
  const minimumContest = Number(batch.targetContestNumber || 1);
  return `<form class="mg2-form" data-mg2-bet-form>
    <div class="mg2-form-head"><strong>Registrar aposta do lote #${batch.id}</strong><p>Marque somente os jogos realmente apostados. O financeiro ficará vinculado apenas a esse concurso.</p></div>
    <div class="mg2-bet-games">
      ${batch.games.map((game, index) => `<label class="mg2-bet-game"><input type="checkbox" name="gamePosition" value="${index + 1}" checked /><span>Jogo ${index + 1}</span><div class="mg2-mini-numbers">${game.numbers.map((value) => `<b>${numberLabel(value)}</b>`).join("")}</div></label>`).join("")}
    </div>
    <div class="mg2-form-grid">
      <label><span>Concurso apostado</span><input name="contestNumber" type="number" min="${minimumContest}" required value="${batch.targetContestNumber ?? ""}" /></label>
      <label><span>Valor gasto</span><input name="actualCost" type="number" min="0.01" step="0.01" required placeholder="Ex.: 12,00" /></label>
    </div>
    ${batch.targetContestNumber ? `<p class="mg2-form-note">A aposta real deve permanecer vinculada ao concurso alvo #${batch.targetContestNumber}.</p>` : ""}
    <div class="mg2-form-actions"><button class="button ghost" type="button" data-mg2-cancel-form>Cancelar</button><button class="button primary" type="submit">Confirmar aposta</button></div>
  </form>`;
}

function contestMatchesTarget(batch: GameBatch, contestNumber: number): boolean {
  return !batch.targetContestNumber || contestNumber === batch.targetContestNumber;
}

async function saveBet(form: HTMLFormElement, batch: GameBatch, onSaved: () => Promise<void>): Promise<void> {
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!submit) return;
  const values = new FormData(form);
  const gamePositions = values.getAll("gamePosition").map(Number);
  if (!gamePositions.length) {
    toast("Selecione ao menos um jogo apostado.", "error");
    return;
  }

  const contestNumber = Number(values.get("contestNumber"));
  if (!contestMatchesTarget(batch, contestNumber)) {
    toast(`Use exatamente o concurso alvo #${batch.targetContestNumber}.`, "error");
    return;
  }

  submit.disabled = true;
  submit.textContent = "Salvando...";
  try {
    await api("/real-bets", {
      method: "POST",
      body: JSON.stringify({ batchId: batch.id, contestNumber, actualCost: Number(values.get("actualCost")), gamePositions }),
    });
    toast("Aposta registrada.");
    await onSaved();
  } catch (error) {
    submit.disabled = false;
    submit.textContent = "Tentar novamente";
    toast(errorMessage(error), "error");
  }
}

export function renderBetForm(host: HTMLElement, batch: GameBatch, onSaved: () => Promise<void>): void {
  host.innerHTML = formMarkup(batch);
  host.querySelector<HTMLButtonElement>("[data-mg2-cancel-form]")?.addEventListener("click", () => { host.innerHTML = ""; });
  const form = host.querySelector<HTMLFormElement>("form");
  if (!form) return;

  bindTargetContestAudit(form, batch.targetContestNumber);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveBet(form, batch, onSaved);
  });
}
