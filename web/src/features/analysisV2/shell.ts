import { escapeHtml } from "../../shared/escaping.js";
import { formatDate, detailsBlock, qualityWarning, secondaryFieldNotice, type AnalysisMapFilter } from "./helpers.js";
import type { LotteryCatalogItem } from "./helpers.js";
import { numberMapView, technicalRankingView } from "./map.js";
import { structureView, dynamicsView, combinationsView } from "./structure.js";
import { validationView } from "./audit.js";
import type { AnalysisPayload } from "./types.js";

export function shellMarkup(data: AnalysisPayload, catalog: LotteryCatalogItem, lottery: string, activeMapFilter: AnalysisMapFilter): string {
  const advanced = data.advanced;
  const latest = advanced.latestContest;
  return `<div class="a2-shell">
    <header class="a2-analysis-head">
      <div>
        <span class="a2-eyebrow">Mapa das dezenas</span>
        <h2>${escapeHtml(catalog.name || lottery)}</h2>
        <p>Leitura descritiva do histórico. Clique em uma dezena para ver seus indicadores.</p>
      </div>
      <div class="a2-reference"><span>Concurso de referência</span><strong>${latest ? `#${latest.number}` : "—"}</strong><small>${latest ? formatDate(latest.date) : "Sem histórico"}</small></div>
    </header>
    <div class="a2-principle"><strong>Histórico, não previsão</strong><span>${escapeHtml(advanced.model.disclaimer)}</span></div>
    ${secondaryFieldNotice(catalog)}
    ${qualityWarning(advanced)}
    ${numberMapView(data, activeMapFilter)}
    <section class="a2-technical-section" aria-labelledby="a2-technical-title">
      <div class="section-head"><div><h2 id="a2-technical-title">Indicadores e metodologia</h2><p>Detalhes técnicos ficam recolhidos para não competir com o mapa principal.</p></div></div>
      <div class="a2-technical-stack">
        ${detailsBlock("Classificação completa", "Posição, movimento, tendência, robustez e atraso.", technicalRankingView(data))}
        ${detailsBlock("Estrutura e distribuições", "Observado, histórico anterior e referências matemáticas.", structureView(data))}
        ${detailsBlock("Dinâmica histórica", "Movimentos, ciclos, atrasos e mapa binário.", dynamicsView(data))}
        ${detailsBlock("Associações", "Duplas, trincas e concursos parecidos; exploração sem previsão.", combinationsView(data))}
        ${detailsBlock("Validação e metodologia", "Teste fora da amostra, auditoria de aleatoriedade, sensibilidade e proteção anti-leakage.", validationView(data))}
      </div>
    </section>
    <dialog class="a2-detail" id="a2-detail" aria-label="Detalhe da dezena"></dialog>
  </div>`;
}

