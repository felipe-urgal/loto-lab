import { escapeHtml } from "../../shared/escaping.js";
import { number, decimal, validationCards, robustnessRows } from "./helpers.js";
import type { AnalysisPayload } from "./types.js";

export function randomnessAuditView(data: AnalysisPayload): string {
  const audit = data.advanced.randomnessAudit;
  const scope = audit.scope;
  if (!audit.available) {
    return `<div class="a2-warning"><strong>Evidência insuficiente</strong><span>A auditoria exige pelo menos 50 concursos contínuos e comparáveis. O segmento atual contém ${scope.analyzedContests}.</span></div>
      <p class="a2-context-note">${escapeHtml(audit.methodology.note)}</p>`;
  }

  const statusLabel = audit.status === "investigate"
    ? "Há sinais para investigar"
    : "Compatível com o baseline testado";
  const statusDetail = audit.status === "investigate"
    ? "Um ou mais testes ficaram fora do esperado após correção por múltiplas comparações. Isso pede verificação de dados e metodologia; não implica previsibilidade."
    : "Nenhum dos testes aplicados apresentou desvio relevante após correção. Isso não prova aleatoriedade; apenas indica compatibilidade com os testes executados.";
  const signalNumbers = audit.perNumber.filter((item) => item.status === "investigate");

  return `<div class="a2-comparison-summary">
      <div><span>Status</span><strong>${escapeHtml(statusLabel)}</strong></div>
      <div><span>Período</span><strong>#${scope.firstContest ?? "—"}–#${scope.lastContest ?? "—"}</strong></div>
      <div><span>Amostra</span><strong>${scope.analyzedContests} concursos</strong></div>
      <div><span>Baseline nulo</span><strong>${audit.methodology.samples} simulações</strong></div>
    </div>
    <p class="a2-context-note">${escapeHtml(statusDetail)}</p>
    ${scope.excludedBeforeSegment > 0 ? `<div class="a2-warning"><strong>Escopo protegido</strong><span>${scope.excludedBeforeSegment} concurso(s) anterior(es) ficaram fora da auditoria por gap ou mudança de cardinalidade. Nenhum teste sequencial atravessa essa quebra.</span></div>` : ""}
    <div class="a2-technical-stack">
      ${audit.metrics.map((metric) => `<article class="panel a2-metric">
        <span>${escapeHtml(metric.label)}</span>
        <strong>${metric.status === "investigate" ? "Investigar" : "Compatível"}</strong>
        <small>observado ${decimal(metric.observed, 4)} · nulo P05–P95 ${decimal(metric.nullP05, 4)}–${decimal(metric.nullP95, 4)} · p ajustado ${decimal(metric.adjustedPValue, 4)}</small>
        <p class="a2-form-note"><strong>H0:</strong> ${escapeHtml(metric.nullHypothesis)}</p>
        <p class="a2-form-note">${escapeHtml(metric.limitation)}</p>
      </article>`).join("")}
    </div>
    <details class="a2-result-details">
      <summary>Frequência por dezena</summary>
      <div class="a2-technical-body">
        <p class="a2-context-note">Teste binomial exato por dezena com Bonferroni em toda a família. Ausência de sinal não transforma frequência histórica em previsão.</p>
        ${signalNumbers.length
          ? `<div class="a2-context-note"><strong>Sinais após correção:</strong> ${signalNumbers.map((item) => `${number(item.number)} (${item.observed} vs. ${decimal(item.expected, 1)} esperados; p aj. ${decimal(item.adjustedPValue, 4)})`).join(", ")}</div>`
          : '<div class="a2-context-note">Nenhuma dezena apresentou desvio relevante após correção múltipla.</div>'}
      </div>
    </details>
    <details class="a2-result-details">
      <summary>Reprodutibilidade e metodologia</summary>
      <div class="a2-technical-body">
        <p class="a2-form-note">Versão: ${escapeHtml(audit.version)} · seed: <code>${escapeHtml(audit.methodology.seed)}</code></p>
        <p class="a2-form-note">Resolução mínima do p empírico: ${decimal(audit.methodology.pValueResolution, 6)} · correção: ${escapeHtml(audit.methodology.correction)}</p>
        <p class="a2-form-note">${escapeHtml(audit.methodology.note)}</p>
      </div>
    </details>`;
}


export function validationView(data: AnalysisPayload): string {
  const validation = data.advanced.validation;
  const initial = [...validation.periods].reverse().find((period) => period.rounds > 0) || validation.periods[0];
  return `<div class="a2-stack">
    <div class="a2-validation-principle"><strong>Teste fora da amostra</strong><span>${escapeHtml(validation.methodology.note)}</span></div>
    <section><div class="section-head"><div><h2>Fortes × intermediárias × frias</h2><p>A classificação de cada rodada é congelada antes de olhar o concurso seguinte. Selos de evidência exigem pelo menos ${validation.methodology.minimumEvidenceRounds ?? 30} alvos válidos.</p></div><label class="a2-window-control">Período<select data-a2-validation-window>${validation.periods.map((period) => `<option value="${period.window}" ${period.window === initial?.window ? "selected" : ""}>últimos ${period.window} · ${period.rounds} válidos</option>`).join("")}</select></label></div><div class="a2-validation-grid" data-a2-validation-cards>${validationCards(initial)}</div></section>
    <section><div class="section-head"><div><h2>Sensibilidade dos pesos</h2><p>Cada peso é perturbado em -10%, 0 e +10%, depois normalizado; são 243 cenários por dezena quando há histórico.</p></div></div><div class="panel table-wrap"><table class="a2-table"><thead><tr><th>Dezena</th><th>Posição</th><th>Grupo</th><th>Mesmo grupo</th><th>Forte nos cenários</th><th>Faixa de posição</th></tr></thead><tbody>${robustnessRows(data)}</tbody></table></div></section>
    <section><div class="section-head"><div><h2>Auditoria de aleatoriedade</h2><p>Compatibilidade estatística e integridade temporal do histórico; não é previsão.</p></div></div>${randomnessAuditView(data)}</section>
    <section><article class="panel a2-method-card"><strong>Como ler esta aba</strong><p>Um grupo aparecer acima do esperado em uma janela não basta para concluir capacidade preditiva. O Loto Lab mostra o desvio, a incerteza e a correção estatística; resultados instáveis entre janelas devem ser tratados como observação, não como regra.</p><div><span>Aquecimento <b>${validation.methodology.warmupContests}</b></span><span>Evidência mín. <b>${validation.methodology.minimumEvidenceRounds ?? 30} alvos</b></span><span>Anti-leakage <b>${validation.methodology.leakageProtection ? "ativo" : "não"}</b></span><span>Trecho contínuo <b>${validation.sourceContests}</b></span><span>Correção <b>${validation.methodology.correction}</b></span></div></article></section>
  </div>`;
}

