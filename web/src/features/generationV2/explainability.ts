function explanationCard(title: string, copy: string, tone = "neutral"): string {
  return `<article class="g2-explain-card is-${tone}"><strong>${title}</strong><p>${copy}</p></article>`;
}

function installStepper(shell: HTMLElement): void {
  // The four-step product journey is rendered by the functional owner.
  // Keep this hook so the explainability layer never creates a competing technical stepper.
  if (shell.querySelector(".g2-flow")) return;
}

function installEducation(shell: HTMLElement): void {
  if (shell.querySelector("[data-g2-education]")) return;
  const slot = shell.querySelector<HTMLElement>("[data-g2-explainability-slot]");
  if (!slot) return;

  const education = document.createElement("details");
  education.className = "g2-help";
  education.dataset.g2Education = "true";
  education.innerHTML = `
    <summary>Como interpretar este gerador</summary>
    <div class="g2-education-grid">
      ${explanationCard("Isto não é previsão", "O Loto Lab organiza escolhas e mede hipóteses. Frequência, atraso e pontuação não mudam a probabilidade matemática individual de uma combinação válida.", "danger")}
      ${explanationCard("Aleatório auditável", "Amostragem uniforme usa seed reproduzível e não usa frequência ou pontuação histórica para preferir dezenas.", "info")}
      ${explanationCard("Carteira e Experimental", "Carteira reduz concentração entre jogos. Experimental pode usar sinais históricos explicitamente identificados e deve ser interpretado como hipótese.", "accent")}
    </div>`;
  slot.append(education);
}

function installWhyPanel(shell: HTMLElement): void {
  if (shell.querySelector("[data-g2-why]")) return;
  const slot = shell.querySelector<HTMLElement>("[data-g2-explainability-slot]");
  if (!slot) return;

  const purpose = shell.querySelector<HTMLSelectElement>("#g2-purpose")?.value;
  const purposeCopy = purpose === "experimental"
    ? "A estratégia experimental pode usar evidência histórica; versão e auditoria continuam registradas na prévia."
    : purpose === "portfolio"
      ? "A carteira parte de candidatos válidos e reduz sobreposição entre jogos sem usar score histórico."
      : purpose === "coverage"
        ? "O desdobramento usa Greedy Set Cover para cobrir subconjuntos do pool. Cobertura completa é uma garantia combinatória condicional, não previsão."
        : "A geração aleatória é uniforme dentro do espaço válido e reproduzível pela seed.";

  const panel = document.createElement("details");
  panel.className = "g2-help";
  panel.dataset.g2Why = "true";
  panel.innerHTML = `
    <summary>Como o motor usa esta configuração</summary>
    <div class="g2-help-body">
      <p>${purposeCopy}</p>
      <p>Fixadas, excluídas e filtros estruturais restringem o espaço de combinações; não aumentam a probabilidade individual de um jogo válido.</p>
    </div>`;
  slot.append(panel);
}

function repeatedCount(gameCard: Element): number | null {
  const row = [...gameCard.querySelectorAll<HTMLElement>(".g2-game-meta span")]
    .find((node) => node.textContent?.trim().startsWith("Repetidas"));
  const value = Number(row?.querySelector<HTMLElement>("strong")?.textContent);
  return Number.isInteger(value) ? value : null;
}

function installLotofacilReadiness(preview: HTMLElement): void {
  if (document.querySelector<HTMLSelectElement>("#lottery-select")?.value !== "lotofacil") return;
  if (preview.querySelector("[data-g2-lotofacil-readiness]")) return;

  const repeated = [...preview.querySelectorAll<HTMLElement>(".g2-game")]
    .map(repeatedCount)
    .filter((value): value is number => value !== null);
  if (repeated.length === 0) return;

  const acceptable = repeated.filter((value) => value >= 7 && value <= 11).length;
  const preferred = repeated.filter((value) => value >= 8 && value <= 10).length;
  const allAcceptable = acceptable === repeated.length;
  const panel = document.createElement("section");
  panel.className = "panel g2-card g2-preview-rationale";
  panel.dataset.g2LotofacilReadiness = "true";
  panel.innerHTML = `
    <div class="g2-card-head"><div><strong>${allAcceptable ? "✓" : "⚠"} Perfil da Lotofácil</strong><span>Conferência da repetição em relação ao concurso imediatamente anterior.</span></div></div>
    <div class="g2-rationale-grid">
      <div><strong>${acceptable}/${repeated.length} na faixa aceitável</strong><span>A metodologia padrão usa 7–11 repetidas como regra de proteção ampla.</span></div>
      <div><strong>${preferred}/${repeated.length} na faixa preferida</strong><span>8–10 continua sendo uma preferência de composição, não uma promessa de desempenho.</span></div>
      <div><strong>Repetidas por jogo</strong><span>${repeated.join(" · ")}</span></div>
      <div><strong>${allAcceptable ? "Perfil padrão respeitado" : "Perfil padrão alterado"}</strong><span>${allAcceptable ? "O lote permanece dentro do perfil documentado." : "Um filtro explícito pode ter sobrescrito a regra de proteção padrão; revise antes de salvar."}</span></div>
    </div>`;

  const actions = preview.querySelector<HTMLElement>(".g2-result-actions");
  if (actions) actions.before(panel);
  else preview.append(panel);
}

function decoratePreview(shell: HTMLElement): void {
  const preview = shell.querySelector<HTMLElement>(".g2-preview");
  if (!preview || preview.dataset.explainabilityReady === "true") return;
  preview.dataset.explainabilityReady = "true";

  const auditGrid = preview.querySelector<HTMLElement>(".g2-audit-grid");
  if (auditGrid) {
    const title = document.createElement("div");
    title.className = "g2-preview-explain-title";
    title.innerHTML = "<strong>Auditoria do lote</strong><span>Leia o conjunto como um portfólio: núcleo, amplitude e sobreposição importam mais do que um cartão isolado.</span>";
    auditGrid.before(title);
  }

  preview.querySelectorAll<HTMLElement>(".g2-game").forEach((gameCard) => {
    if (gameCard.querySelector(".g2-game-reason")) return;

    const fixed = [...gameCard.querySelectorAll<HTMLElement>(".ball.is-fixed")]
      .map((node) => node.textContent?.trim())
      .filter((value): value is string => Boolean(value));
    const variable = [...gameCard.querySelectorAll<HTMLElement>(".ball:not(.is-fixed)")]
      .map((node) => node.textContent?.trim())
      .filter((value): value is string => Boolean(value));
    const meta = [...gameCard.querySelectorAll<HTMLElement>(".g2-game-meta span")]
      .map((node) => node.textContent?.replace(/\s+/g, " ").trim())
      .filter((value): value is string => Boolean(value));

    const reason = document.createElement("div");
    reason.className = "g2-game-reason";
    reason.innerHTML = "<strong>Como ler este jogo</strong>";

    const copy = document.createElement("p");
    const fixedLabel = document.createElement("b");
    fixedLabel.textContent = "Núcleo:";
    const variableLabel = document.createElement("b");
    variableLabel.textContent = "Variáveis:";
    copy.append(
      fixedLabel,
      ` ${fixed.join(" · ") || "sem núcleo"}. `,
      variableLabel,
      ` ${variable.join(" · ") || "—"}. ${meta.join(" · ")}.`,
    );
    reason.append(copy);
    gameCard.append(reason);
  });

  installLotofacilReadiness(preview);

  const purpose = shell.querySelector<HTMLSelectElement>("#g2-purpose")?.value;
  const selectionRationale = purpose === "experimental"
    ? "A seleção respeitou a estratégia experimental declarada e sua evidência versionada."
    : purpose === "portfolio"
      ? "A seleção priorizou diversidade entre jogos sem score histórico."
      : purpose === "coverage"
        ? "A seleção priorizou ganho de cobertura dos subconjuntos ainda descobertos, com desempate determinístico."
        : "A seleção foi uniforme dentro do espaço válido, sem score histórico.";

  const rationale = document.createElement("section");
  rationale.className = "panel g2-card g2-preview-rationale";
  rationale.innerHTML = `
    <div class="g2-card-head"><div><strong>Por que este lote foi aceito?</strong><span>A prévia passou pelo mesmo funil que será persistido.</span></div></div>
    <div class="g2-rationale-grid">
      <div><strong>✓ Núcleo</strong><span>Compartilhado conforme a configuração escolhida.</span></div>
      <div><strong>✓ Seleção</strong><span>${selectionRationale}</span></div>
      <div><strong>✓ Restrições</strong><span>Todos os jogos respeitam os filtros habilitados e o perfil padrão aplicável.</span></div>
      <div><strong>✓ Auditoria</strong><span>Semente, histórico e assinatura permitem reproduzir exatamente a prévia.</span></div>
    </div>`;
  preview.append(rationale);
}

export function installGenerationExplainability(shell: HTMLElement): () => void {
  const principle = shell.querySelector<HTMLElement>(".g2-principle");
  if (principle) {
    principle.innerHTML = "<strong>Gerar jogos</strong><span>Configure, gere uma prévia, revise e salve. Auditoria e metodologia ficam disponíveis sob demanda.</span>";
  }

  installStepper(shell);
  installWhyPanel(shell);
  installEducation(shell);
  decoratePreview(shell);

  const observer = new MutationObserver(() => decoratePreview(shell));
  const result = shell.querySelector<HTMLElement>("[data-g2-result]");
  if (result) observer.observe(result, { childList: true, subtree: true });

  return () => observer.disconnect();
}
