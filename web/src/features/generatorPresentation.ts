import { escapeHtml } from "../shared/escaping.js";

type RecentContest = {
  number: number;
  date: string;
  numbers: number[];
  secondDrawNumbers?: number[];
  columns?: number[];
  luckyMonth?: string;
  secondary?: { kind: string; values: Array<string | number> };
};

function numbersMarkup(numbers: number[]): string {
  return numbers.map(value => `<span class="recent-ball">${Number.isInteger(value) ? String(value).padStart(2, "0") : "—"}</span>`).join("");
}

export function recentContestsMarkup(items: RecentContest[]): string {
  if (!items.length) return '<div class="history-empty"><strong>Ainda não há resultados por aqui.</strong><p>Sincronize os resultados para carregar os concursos desta modalidade.</p></div>';
  return items.map(contest => {
    const date = new Date(`${contest.date.slice(0, 10)}T12:00:00Z`);
    const formatted = Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date) : "Data indisponível";
    const first = contest.columns?.length
      ? contest.columns.map((value, index) => `<span class="recent-ball column-ball">C${index + 1}:${value}</span>`).join("")
      : numbersMarkup(contest.numbers);
    const second = contest.secondDrawNumbers?.length ? `<div class="recent-secondary"><span>2º sorteio</span>${numbersMarkup(contest.secondDrawNumbers)}</div>` : "";
    const secondary = contest.secondary?.values.join(" · ") || contest.luckyMonth;
    return `<article class="recent-row"><h3>Concurso #${escapeHtml(contest.number)}</h3><time datetime="${escapeHtml(contest.date)}">${formatted}</time><div class="recent-numbers">${first}${second}${secondary ? `<span class="recent-secondary">${escapeHtml(secondary)}</span>` : ""}</div></article>`;
  }).join("");
}
