import { api } from "../../core/api.js";
import { escapeHtml } from "../../shared/escaping.js";
import { errorMessage, requiredPayload } from "./support.js";
import type { CoverageBenchmarkResponse, GameBatch } from "./types.js";

function percent(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function decimal(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(value);
}

function thresholdRows(result: CoverageBenchmarkResponse): string {
  const drawSize = Math.max(...result.target.atLeast.map((entry) => entry.hits), 0);
  const minimum = Math.max(1, drawSize - 3);
  return result.target.atLeast
    .filter((entry) => entry.hits >= minimum)
    .map((entry) => {
      const baseline = result.randomBaseline.atLeast.find((item) => item.hits === entry.hits)?.probability ?? 0;
      const delta = entry.probability - baseline;
      return `<div class="mg2-result-metrics">
        <div><span>≥ ${entry.hits} acertos</span><strong>${percent(entry.probability)}</strong></div>
        <div><span>Baseline aleatório</span><strong>${percent(baseline)}</strong></div>
        <div><span>Diferença</span><strong>${delta >= 0 ? "+" : ""}${percent(delta)}</strong></div>
        <div><span>Base</span><strong>${result.target.method === "exact" ? "Exata" : "Monte Carlo"}</strong></div>
      </div>`;
    }).join("");
}

function panelMarkup(result: CoverageBenchmarkResponse): string {
  const quality = result.target.quality;
  const method = result.target.method === "exact"
    ? "Cálculo exato"
    : `Monte Carlo · ${result.target.evaluatedDraws.toLocaleString("pt-BR")} amostras`;
  const origin = result.batch.coveringDesign
    ? "Este lote foi produzido por Covering Design."
    : result.batch.generatorPurpose
      ? `Finalidade do gerador: ${escapeHtml(result.batch.generatorPurpose)}.`
      : "Origem do lote não declarada.";
  return `<section class="mg2-comparison" data-mg2-coverage>
    <div class="mg2-comparison-head">
      <div><strong>Simulação de cobertura</strong><p>${escapeHtml(result.target.scope.note)}</p></div>
      <button class="button ghost" type="button" data-mg2-close-coverage>Fechar</button>
    </div>
    <p class="mg2-comparison-note">${origin} A comparação usa um portfólio aleatório com a mesma quantidade e cardinalidade de jogos.</p>
    <div class="mg2-comparison-summary">
      <div><span>Método</span><strong>${method}</strong></div>
      <div><span>Melhor acerto esperado</span><strong>${decimal(result.target.expectedBestHits)}</strong></div>
      <div><span>Baseline aleatório</span><strong>${decimal(result.randomBaseline.expectedBestHits)}</strong></div>
      <div><span>Diferença</span><strong>${result.comparison.expectedBestHitsDelta >= 0 ? "+" : ""}${decimal(result.comparison.expectedBestHitsDelta)}</strong></div>
    </div>
    <details class="mg2-result-details" open>
      <summary>Probabilidades sintéticas por faixa</summary>
      <div class="mg2-official-games">${thresholdRows(result)}</div>
    </details>
    <details class="mg2-result-details">
      <summary>Metodologia e resolução</summary>
      <div class="mg2-official-games">
        <p class="mg2-form-note">Seed: <code>${escapeHtml(result.seed)}</code></p>
        <p class="mg2-form-note">Resolução: ${percent(quality.resolution)} · margem máxima aproximada de 95%: ${percent(quality.maxMarginError95)}.</p>
        <p class="mg2-form-note">${quality.sufficient ? "A amostra atende ao limite de erro configurado." : "A amostra é insuficiente para o limite de erro configurado; interprete probabilidades raras com cautela."}</p>
        <p class="mg2-form-note">A simulação não consulta concursos passados ou futuros e mede somente as dezenas principais do lote.</p>
      </div>
    </details>
  </section>`;
}

export async function loadCoverage(root: HTMLElement, batch: GameBatch): Promise<void> {
  const host = root.querySelector<HTMLElement>(`[data-mg2-coverage-host="${batch.id}"]`);
  if (!host) return;
  host.innerHTML = '<div class="mg2-inline-loading">Simulando cobertura...</div>';
  try {
    const result = requiredPayload(
      await api<CoverageBenchmarkResponse>(`/game-batches/${batch.id}/coverage`),
      "simular cobertura do lote",
    );
    host.innerHTML = panelMarkup(result);
    const trigger = root.querySelector<HTMLButtonElement>(`[data-mg2-coverage="${batch.id}"]`);
    if (trigger) trigger.textContent = "Fechar cobertura";
    host.querySelector<HTMLButtonElement>("[data-mg2-close-coverage]")?.addEventListener("click", () => {
      host.innerHTML = "";
      if (trigger) trigger.textContent = "Simular cobertura";
    });
  } catch (error) {
    host.innerHTML = `<div class="mg2-inline-error"><strong>Simulação indisponível</strong><p>${escapeHtml(errorMessage(error))}</p></div>`;
  }
}
