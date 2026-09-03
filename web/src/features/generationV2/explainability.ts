function explanationCard(title: string, copy: string, tone = "neutral"): string {
  return `<article class="g2-explain-card is-${tone}"><strong>${title}</strong><p>${copy}</p></article>`;
}

function installStepper(shell: HTMLElement): void {
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

function installEducation(shell: HTMLElement): void {
  if (shell.querySelector("[data-g2-education]")) return;

  const education = document.createElement("section");
  education.className = "g2-education-grid";
  education.dataset.g2Education = "true";
  education.innerHTML = `
    ${explanationCard("Isto não é previsão", "O Loto Lab organiza escolhas e mede hipóteses. Frequência, atraso e pontuação não mudam a probabilidade matemática individual de uma combinação válida.", "danger")}
    ${explanationCard("Quando a pontuação influencia", "A Pontuação v2 ordena preferências usando desvios em relação ao esperado, levando o tamanho da amostra em conta. Ela continua sendo um sinal exploratório e pode ser testada contra Pontuação v1 e sem pontuação no Laboratório.", "info")}
    ${explanationCard("Quando a cobertura domina", "O motor penaliza reutilização e mistura perfis para reduzir concentração entre jogos. O objetivo é ampliar a cobertura do lote, não criar dezenas mais prováveis.", "accent")}`;
  shell.append(education);
}

function installWhyPanel(shell: HTMLElement): void {
  const side = shell.querySelector<HTMLElement>(".g2-side");
  if (!side || side.querySelector("[data-g2-why]")) return;

  const panel = document.createElement("section");
  panel.className = "panel g2-card g2-why";
  panel.dataset.g2Why = "true";
  panel.innerHTML = `
    <div class="g2-card-head"><div><strong>Por que este lote será gerado assim?</strong><span>As decisões do motor ficam explícitas antes da prévia.</span></div></div>
    <ol class="g2-why-list">
      <li><strong>Pontuação v2</strong><span>Compara cada janela com o que seria esperado e reduz a força de diferenças sustentadas por amostras pequenas.</span></li>
      <li><strong>Núcleo compartilhado</strong><span>As fixas combinam perfis complementares; escolhas manuais continuam visíveis e auditáveis.</span></li>
      <li><strong>Variáveis estratificadas</strong><span>O conjunto reserva espaço para fortes, intermediárias e frias, evitando depender apenas do topo da classificação.</span></li>
      <li><strong>Diversidade do lote</strong><span>Reutilização de variáveis é penalizada para aumentar cobertura entre os cartões.</span></li>
      <li><strong>Filtros são estrutura</strong><span>Paridade, repetição e soma servem para compor cenários; não aumentam a chance individual de um jogo.</span></li>
    </ol>
    <a class="button compact" href="/lab">Validar hipótese no Laboratório</a>`;
  side.prepend(panel);
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

  const rationale = document.createElement("section");
  rationale.className = "panel g2-card g2-preview-rationale";
  rationale.innerHTML = `
    <div class="g2-card-head"><div><strong>Por que este lote foi aceito?</strong><span>A prévia passou pelo mesmo funil que será persistido.</span></div></div>
    <div class="g2-rationale-grid">
      <div><strong>✓ Núcleo</strong><span>Compartilhado conforme a configuração escolhida.</span></div>
      <div><strong>✓ Variáveis</strong><span>Selecionadas por pontuação + diversidade, com penalização de reutilização.</span></div>
      <div><strong>✓ Restrições</strong><span>Todos os jogos respeitam os filtros habilitados e o perfil padrão aplicável.</span></div>
      <div><strong>✓ Auditoria</strong><span>Semente, histórico e assinatura permitem reproduzir exatamente a prévia.</span></div>
    </div>`;
  preview.append(rationale);
}

export function installGenerationExplainability(shell: HTMLElement): () => void {
  const principle = shell.querySelector<HTMLElement>(".g2-principle");
  if (principle) {
    principle.innerHTML = "<strong>Gerar Jogos</strong><span>O sistema compõe jogos com metodologia, cobertura e diversificação controlada. Não é previsão: cada etapa abaixo mostra como o lote foi construído e o que ela significa.</span>";
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
