const explainabilityRoot = document.querySelector("#content");
let explainabilityObserver;

function currentGenerationView() {
  return location.hash.replace("#", "") === "generate";
}

function numberText(values) {
  return (values || []).map((value) => String(value).padStart(2, "0")).join(" · ") || "—";
}

function explanationCard(title, copy, tone = "neutral") {
  return `<article class="g2-explain-card is-${tone}"><strong>${title}</strong><p>${copy}</p></article>`;
}

function installStepper(shell) {
  if (shell.querySelector("[data-g2-explain-stepper]")) return;
  const stepper = document.createElement("section");
  stepper.className = "g2-explain-stepper";
  stepper.dataset.g2ExplainStepper = "true";
  stepper.setAttribute("aria-label", "Como o lote é construído");
  stepper.innerHTML = `
    <div class="g2-explain-step is-active"><span>1</span><strong>Análise</strong><small>Dados e contexto</small></div>
    <i>→</i>
    <div class="g2-explain-step"><span>2</span><strong>Núcleo fixo</strong><small>Convicção compartilhada</small></div>
    <i>→</i>
    <div class="g2-explain-step"><span>3</span><strong>Variáveis</strong><small>Cobertura e diversidade</small></div>
    <i>→</i>
    <div class="g2-explain-step"><span>4</span><strong>Restrições</strong><small>Estrutura do lote</small></div>
    <i>→</i>
    <div class="g2-explain-step"><span>5</span><strong>Auditoria</strong><small>Entenda o resultado</small></div>`;
  shell.insertBefore(stepper, shell.firstChild);
}

function installEducation(shell) {
  if (shell.querySelector("[data-g2-education]")) return;
  const education = document.createElement("section");
  education.className = "g2-education-grid";
  education.dataset.g2Education = "true";
  education.innerHTML = `
    ${explanationCard("Isto não é previsão", "O Loto Lab organiza escolhas e mede hipóteses. Frequência, atraso e score não mudam a probabilidade matemática individual de uma combinação válida.", "danger")}
    ${explanationCard("Quando o score influencia", "O Score v2 ordena preferências usando desvios em relação ao esperado, levando o tamanho da amostra em conta. Ele continua sendo um sinal exploratório e pode ser testado contra Score v1 e sem score no Laboratório.", "info")}
    ${explanationCard("Quando a cobertura domina", "O motor penaliza reutilização e mistura perfis para reduzir concentração entre jogos. O objetivo é ampliar a cobertura do lote, não criar dezenas mais prováveis.", "accent")}`;
  shell.append(education);
}

function installWhyPanel(shell) {
  const side = shell.querySelector(".g2-side");
  if (!side || side.querySelector("[data-g2-why]")) return;
  const panel = document.createElement("section");
  panel.className = "panel g2-card g2-why";
  panel.dataset.g2Why = "true";
  panel.innerHTML = `
    <div class="g2-card-head"><div><strong>Por que este lote será gerado assim?</strong><span>As decisões do motor ficam explícitas antes da prévia.</span></div></div>
    <ol class="g2-why-list">
      <li><strong>Score v2</strong><span>Compara cada janela com o que seria esperado e reduz a força de diferenças sustentadas por amostras pequenas.</span></li>
      <li><strong>Núcleo compartilhado</strong><span>As fixas combinam perfis complementares; escolhas manuais continuam visíveis e auditáveis.</span></li>
      <li><strong>Variáveis estratificadas</strong><span>O pool reserva espaço para fortes, intermediárias e frias, evitando depender apenas do topo do ranking.</span></li>
      <li><strong>Diversidade do lote</strong><span>Reutilização de variáveis é penalizada para aumentar cobertura entre os cartões.</span></li>
      <li><strong>Filtros são estrutura</strong><span>Paridade, repetição e soma servem para compor cenários; não aumentam a chance individual de um jogo.</span></li>
    </ol>
    <a class="button compact" href="/lab">Validar hipótese no Laboratório</a>`;
  side.prepend(panel);
}

function decoratePreview(shell) {
  const preview = shell.querySelector(".g2-preview");
  if (!preview || preview.dataset.explainabilityReady === "true") return;
  preview.dataset.explainabilityReady = "true";

  const auditGrid = preview.querySelector(".g2-audit-grid");
  if (auditGrid) {
    const title = document.createElement("div");
    title.className = "g2-preview-explain-title";
    title.innerHTML = `<strong>Auditoria do lote</strong><span>Leia o conjunto como um portfólio: núcleo, amplitude e sobreposição importam mais do que um cartão isolado.</span>`;
    auditGrid.before(title);
  }

  preview.querySelectorAll(".g2-game").forEach((gameCard) => {
    if (gameCard.querySelector(".g2-game-reason")) return;
    const fixed = [...gameCard.querySelectorAll(".ball.is-fixed")].map((node) => node.textContent?.trim()).filter(Boolean);
    const variable = [...gameCard.querySelectorAll(".ball:not(.is-fixed)")].map((node) => node.textContent?.trim()).filter(Boolean);
    const meta = [...gameCard.querySelectorAll(".g2-game-meta span")].map((node) => node.textContent?.replace(/\s+/g, " ").trim()).filter(Boolean);
    const reason = document.createElement("div");
    reason.className = "g2-game-reason";
    reason.innerHTML = `<strong>Como ler este jogo</strong><p><b>Núcleo:</b> ${fixed.join(" · ") || "sem núcleo"}. <b>Variáveis:</b> ${variable.join(" · ") || "—"}. ${meta.join(" · ")}.</p>`;
    gameCard.append(reason);
  });

  const rationale = document.createElement("section");
  rationale.className = "panel g2-card g2-preview-rationale";
  rationale.innerHTML = `
    <div class="g2-card-head"><div><strong>Por que este lote foi aceito?</strong><span>A prévia passou pelo mesmo funil que será persistido.</span></div></div>
    <div class="g2-rationale-grid">
      <div><strong>✓ Núcleo</strong><span>Compartilhado conforme a configuração escolhida.</span></div>
      <div><strong>✓ Variáveis</strong><span>Selecionadas por score + diversidade, com penalização de reutilização.</span></div>
      <div><strong>✓ Restrições</strong><span>Todos os jogos respeitam os filtros habilitados.</span></div>
      <div><strong>✓ Auditoria</strong><span>Seed, histórico e fingerprint permitem reproduzir exatamente a prévia.</span></div>
    </div>`;
  preview.append(rationale);
}

function enhanceGeneration() {
  if (!currentGenerationView() || !explainabilityRoot) return;
  const shell = explainabilityRoot.querySelector(".g2-shell");
  if (!shell) return;
  const principle = shell.querySelector(".g2-principle");
  if (principle) {
    principle.innerHTML = `<strong>Gerar Jogos</strong><span>O sistema compõe jogos com metodologia, cobertura e diversificação controlada. Não é previsão: cada etapa abaixo mostra como o lote foi construído e o que ela significa.</span>`;
  }
  installStepper(shell);
  installWhyPanel(shell);
  installEducation(shell);
  decoratePreview(shell);

  explainabilityObserver?.disconnect();
  explainabilityObserver = new MutationObserver(() => decoratePreview(shell));
  const result = shell.querySelector("[data-g2-result]");
  if (result) explainabilityObserver.observe(result, { childList: true, subtree: true });
}

window.addEventListener("loto-lab:view-rendered", (event) => {
  if (event.detail?.view !== "generate") {
    explainabilityObserver?.disconnect();
    return;
  }
  requestAnimationFrame(() => requestAnimationFrame(enhanceGeneration));
});

window.addEventListener("hashchange", () => {
  if (!currentGenerationView()) explainabilityObserver?.disconnect();
});
