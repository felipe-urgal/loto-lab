function parsePtBrNumber(value: unknown): number | null {
  const normalized = String(value ?? "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function baselineSumRange(shell: HTMLElement): { min: number; max: number } | null {
  const text = shell.querySelector<HTMLElement>('[data-g2-filter-baseline="sum"]')?.textContent || "";
  const match = text.match(/Esperado\s+([\d.,-]+)\s+·\s+desvio\s+([\d.,-]+)/i);
  if (!match) return null;

  const expected = parsePtBrNumber(match[1]);
  const deviation = parsePtBrNumber(match[2]);
  if (expected === null || deviation === null) return null;

  return {
    min: Math.max(1, Math.round(expected - deviation)),
    max: Math.round(expected + deviation),
  };
}

function syncConditionedSumDefaults(shell: HTMLElement): void {
  if (shell.dataset.g2SumCustomized === "true") return;

  const toggle = shell.querySelector<HTMLInputElement>('[data-g2-filter-toggle="sum"]');
  if (!toggle || toggle.checked) return;

  const minInput = shell.querySelector<HTMLInputElement>('[data-g2-range="sum:min"]');
  const maxInput = shell.querySelector<HTMLInputElement>('[data-g2-range="sum:max"]');
  const range = baselineSumRange(shell);
  if (!minInput || !maxInput || !range) return;
  if (Number(minInput.value) === range.min && Number(maxInput.value) === range.max) return;

  // generationV2 owns request state. Reuse its change handlers instead of
  // duplicating plan/request state in this additive layer.
  maxInput.value = String(range.max);
  maxInput.dispatchEvent(new Event("change", { bubbles: true }));
  minInput.value = String(range.min);
  minInput.dispatchEvent(new Event("change", { bubbles: true }));
}

export function installGenerationReadiness(shell: HTMLElement): () => void {
  if (shell.dataset.g2ReadinessReady === "true") return () => undefined;
  shell.dataset.g2ReadinessReady = "true";

  const listeners = new AbortController();

  shell.querySelectorAll<HTMLInputElement>('[data-g2-range^="sum:"]').forEach((input) => {
    input.addEventListener("change", (event) => {
      if (event.isTrusted) shell.dataset.g2SumCustomized = "true";
    }, { signal: listeners.signal });
  });

  const sumToggle = shell.querySelector<HTMLInputElement>('[data-g2-filter-toggle="sum"]');
  sumToggle?.addEventListener("change", (event) => {
    if (event.isTrusted && sumToggle.checked) {
      // Once the user explicitly enables the current range, preserve that
      // intentional choice across later conditioned-plan recalculations.
      shell.dataset.g2SumCustomized = "true";
    }
  }, { signal: listeners.signal });

  syncConditionedSumDefaults(shell);
  const observer = new MutationObserver(() => syncConditionedSumDefaults(shell));
  observer.observe(shell, { childList: true, subtree: true, characterData: true });

  return () => {
    listeners.abort();
    observer.disconnect();
    delete shell.dataset.g2ReadinessReady;
  };
}
