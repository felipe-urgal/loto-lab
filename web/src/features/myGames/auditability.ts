function validTargetContest(value: number | null | undefined): number | undefined {
  if (!Number.isInteger(value) || Number(value) < 1) return undefined;
  return Number(value);
}

function reportTamper(input: HTMLInputElement, target: number): void {
  input.value = String(target);
  input.setCustomValidity(`Use exatamente o concurso alvo #${target}.`);
  input.reportValidity();
  queueMicrotask(() => input.setCustomValidity(""));
}

export function bindTargetContestAudit(
  form: HTMLFormElement,
  targetContestNumber: number | null | undefined,
): void {
  const target = validTargetContest(targetContestNumber);
  const input = form.querySelector<HTMLInputElement>('input[name="contestNumber"]');
  if (!target || !input) return;

  input.readOnly = true;
  input.min = String(target);
  input.max = String(target);
  input.dataset.auditTargetContest = String(target);
  input.setAttribute("aria-readonly", "true");

  const note = form.querySelector<HTMLElement>(".mg2-form-note");
  if (note) {
    note.textContent = `Para preservar a auditabilidade da geração, esta aposta real deve permanecer vinculada exatamente ao concurso alvo #${target}.`;
  }

  form.addEventListener("submit", (event) => {
    if (Number(input.value) === target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    reportTamper(input, target);
  }, { capture: true });
}
