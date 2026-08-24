function lockTargetContest(form) {
  const input = form.querySelector('input[name="contestNumber"]');
  if (!input) return;
  const rawTarget = input.getAttribute("value")?.trim();
  if (!rawTarget) return;

  const target = Number(rawTarget);
  if (!Number.isInteger(target) || target < 1) return;

  input.readOnly = true;
  input.min = String(target);
  input.max = String(target);
  input.dataset.auditTargetContest = String(target);
  input.setAttribute("aria-readonly", "true");

  const note = form.querySelector(".mg2-form-note");
  if (note) {
    note.textContent = `Para preservar a auditabilidade da geração, esta aposta real deve permanecer vinculada exatamente ao concurso alvo #${target}.`;
  }
}

function hardenForms(root = document) {
  root.querySelectorAll?.("[data-mg2-bet-form]").forEach(lockTargetContest);
}

const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches?.("[data-mg2-bet-form]")) lockTargetContest(node);
      hardenForms(node);
    }
  }
});

observer.observe(document.documentElement, { childList: true, subtree: true });
hardenForms();

// Capture before the feature form handler so a DOM-tampered target cannot send
// an inconsistent request even though the backend independently enforces it.
document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches("[data-mg2-bet-form]")) return;
  const input = form.querySelector('input[name="contestNumber"][data-audit-target-contest]');
  if (!input) return;
  const target = Number(input.dataset.auditTargetContest);
  if (Number(input.value) === target) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  input.value = String(target);
  input.setCustomValidity(`Use exatamente o concurso alvo #${target}.`);
  input.reportValidity();
  queueMicrotask(() => input.setCustomValidity(""));
}, true);
