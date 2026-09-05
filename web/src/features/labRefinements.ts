const message = document.querySelector<HTMLElement>("#lab-message");
const results = document.querySelector<HTMLElement>("#lab-results");
const ranking = document.querySelector<HTMLElement>("#lab-ranking");
const basis = document.querySelector<HTMLElement>("#lab-basis");
const metric = document.querySelector<HTMLSelectElement>("#lab-metric");
const chart = document.querySelector<HTMLElement>("#lab-chart");
let scheduled = false;

function primaryValues(): string[] {
  return Array.from(ranking?.querySelectorAll<HTMLElement>(".lab-primary-metric strong") ?? [])
    .map((node) => node.textContent?.trim() ?? "")
    .filter(Boolean);
}

function allEqual(values: string[]): boolean {
  return values.length > 1 && values.every((value) => value === values[0]);
}

function refineTie(): void {
  if (!results || results.hidden || !ranking) return;
  const values = primaryValues();
  const tied = allEqual(values);
  const cards = Array.from(ranking.querySelectorAll<HTMLElement>(".lab-strategy-card"));
  const firstBadge = cards[0]?.querySelector<HTMLElement>(".badge");

  if (tied) {
    const basisName = basis?.textContent?.includes("ROI") ? "ROI" : "taxa de premiação";
    if (basis) basis.textContent = `Empate em ${basisName} · desempate por acertos médios`;
    if (firstBadge) firstBadge.textContent = "desempate por acertos";

    const firstCard = cards[0];
    if (firstCard && !firstCard.querySelector(".lab-tie-note")) {
      const note = document.createElement("div");
      note.className = "lab-tie-note";
      note.textContent = `As estratégias empataram em ${basisName}; a ordem usa os critérios secundários do mesmo período.`;
      firstCard.append(note);
    }
  }
}

function refineMetric(): void {
  if (!results || results.hidden || !metric || results.dataset.autoMetric === "done") return;
  const values = primaryValues();
  if (!allEqual(values)) {
    results.dataset.autoMetric = "done";
    return;
  }

  const current = metric.value;
  if (current === "roi" || current === "prizeRate") {
    metric.value = "averageHitsPerGame";
    metric.dispatchEvent(new Event("change", { bubbles: true }));
    const head = document.querySelector<HTMLElement>(".lab-chart-head > div");
    if (head && !head.querySelector(".lab-chart-auto-note")) {
      const note = document.createElement("div");
      note.className = "lab-chart-auto-note";
      note.textContent = "A métrica de classificação não variou neste período; o gráfico abriu em média de acertos para facilitar a comparação.";
      head.append(note);
    }
  }
  results.dataset.autoMetric = "done";
}

function refineAxisLabels(): void {
  const labels = Array.from(chart?.querySelectorAll<SVGTextElement>("svg text.lab-chart-axis") ?? [])
    .filter((node) => (node.textContent?.trim() ?? "").startsWith("#"));
  if (!labels.length) return;
  labels[0]?.setAttribute("text-anchor", "start");
  labels.at(-1)?.setAttribute("text-anchor", "end");
}

function refine(): void {
  if (message?.hidden) message.style.display = "none";
  else if (message) message.style.removeProperty("display");
  refineTie();
  refineMetric();
  refineAxisLabels();
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    refine();
  });
}

if (document.body) {
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden"],
  });
}
metric?.addEventListener("change", () => setTimeout(refineAxisLabels, 0));
schedule();
