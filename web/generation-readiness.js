const readinessRoot = document.querySelector("#content");
let readinessObserver;
let readinessToken = 0;

function isGenerateView() {
  return location.hash.replace("#", "") === "generate";
}

function parsePtBrNumber(value) {
  const normalized = String(value ?? "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function baselineSumRange(shell) {
  const text = shell.querySelector('[data-g2-filter-baseline="sum"]')?.textContent || "";
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

function syncConditionedSumDefaults(shell) {
  if (shell.dataset.g2SumCustomized === "true") return;
  const toggle = shell.querySelector('[data-g2-filter-toggle="sum"]');
  if (!toggle || toggle.checked) return;

  const minInput = shell.querySelector('[data-g2-range="sum:min"]');
  const maxInput = shell.querySelector('[data-g2-range="sum:max"]');
  const range = baselineSumRange(shell);
  if (!minInput || !maxInput || !range) return;
  if (Number(minInput.value) === range.min && Number(maxInput.value) === range.max) return;

  // generation-v2 owns the actual request state. Update through its existing
  // change listeners instead of duplicating state or request construction here.
  maxInput.value = String(range.max);
  maxInput.dispatchEvent(new Event("change", { bubbles: true }));
  minInput.value = String(range.min);
  minInput.dispatchEvent(new Event("change", { bubbles: true }));
}

function installReadiness(shell) {
  if (shell.dataset.g2ReadinessReady === "true") return;
  shell.dataset.g2ReadinessReady = "true";

  shell.querySelectorAll('[data-g2-range^="sum:"]').forEach((input) => {
    input.addEventListener("change", (event) => {
      if (event.isTrusted) shell.dataset.g2SumCustomized = "true";
    });
  });
  shell.querySelector('[data-g2-filter-toggle="sum"]')?.addEventListener("change", (event) => {
    if (event.isTrusted && event.currentTarget?.checked) {
      // Once the user explicitly enables the current range, treat it as an
      // intentional choice and preserve it across later plan recalculations.
      shell.dataset.g2SumCustomized = "true";
    }
  });

  syncConditionedSumDefaults(shell);
  readinessObserver?.disconnect();
  readinessObserver = new MutationObserver(() => syncConditionedSumDefaults(shell));
  readinessObserver.observe(shell, { childList: true, subtree: true, characterData: true });
}

function scheduleReadiness() {
  const token = ++readinessToken;
  readinessObserver?.disconnect();
  if (!readinessRoot || !isGenerateView()) return;

  let frame = 0;
  const wait = () => {
    if (token !== readinessToken || !isGenerateView()) return;
    const shell = readinessRoot.querySelector(".g2-shell");
    if (shell) {
      installReadiness(shell);
      return;
    }
    frame += 1;
    if (frame < 120) requestAnimationFrame(wait);
  };
  requestAnimationFrame(wait);
}

window.addEventListener("loto-lab:view-rendered", (event) => {
  if (event.detail?.view === "generate") scheduleReadiness();
  else {
    readinessToken += 1;
    readinessObserver?.disconnect();
  }
});

window.addEventListener("hashchange", () => {
  if (!isGenerateView()) {
    readinessToken += 1;
    readinessObserver?.disconnect();
  }
});
