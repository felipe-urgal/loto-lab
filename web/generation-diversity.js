const root = document.querySelector("#content");
let scheduled = false;

function currentView() {
  return location.hash.replace("#", "") || "dashboard";
}

async function decorateAudit(result) {
  if (!result || result.dataset.generationAudit === "loading" || result.dataset.generationAudit === "done") return;
  const match = result.textContent.match(/Lote\s+#(\d+)/i);
  if (!match) return;

  result.dataset.generationAudit = "loading";
  try {
    const response = await fetch(`/api/v1/game-batches/id/${match[1]}`);
    if (!response.ok) throw new Error();
    const batch = await response.json();
    const mode = batch.generatorOptions?.generationMode;
    const seed = batch.generatorOptions?.seed;
    if (mode !== "diversified" || !seed || !result.isConnected) {
      result.dataset.generationAudit = "done";
      return;
    }

    if (!result.querySelector(".generation-audit")) {
      const target = result.querySelector(".generation-summary") || result.querySelector(".game-grid");
      const audit = document.createElement("div");
      audit.className = "generation-audit";
      audit.innerHTML = `
        <div>
          <strong>Lote diversificado e reproduzível</strong>
          <span>A seed registrada permite reconstruir exatamente este lote.</span>
        </div>
        <code title="${seed}">${seed.slice(0, 8)}…${seed.slice(-6)}</code>`;
      target?.insertAdjacentElement("afterend", audit);
    }
    result.dataset.generationAudit = "done";
  } catch {
    result.dataset.generationAudit = "";
  }
}

function decorateForm() {
  const form = root?.querySelector("#generate-form");
  if (!form) return;

  if (!form.querySelector(".generation-mode-card")) {
    const actions = form.querySelector(".form-actions");
    const card = document.createElement("div");
    card.className = "generation-mode-card";
    card.innerHTML = `
      <div class="generation-mode-badge">Modo real · diversificado</div>
      <div>
        <strong>Cada nova geração explora outras combinações de alta pontuação.</strong>
        <p>O núcleo da estratégia permanece calculado pelo mesmo histórico. As variáveis são escolhidas de forma ponderada entre as melhores combinações válidas. Backtests e Laboratório continuam determinísticos.</p>
      </div>`;
    actions?.insertAdjacentElement("beforebegin", card);
  }

  void decorateAudit(root.querySelector("#generated-result"));
}

function refine() {
  if (currentView() === "generate") decorateForm();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    refine();
  }, 0);
}

if (root) new MutationObserver(schedule).observe(root, { childList: true, subtree: true });
window.addEventListener("hashchange", schedule);
schedule();
