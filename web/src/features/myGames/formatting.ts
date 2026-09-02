import { escapeHtml } from "../../shared/escaping.js";
import { formatCurrency, formatDateTime } from "../../shared/formatters.js";
import type { Game, GameBatch } from "./types.js";

export function money(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? formatCurrency(value) : "—";
}

export function numberLabel(value: number): string {
  return String(value).padStart(2, "0");
}

export function hitText(value: number | undefined): string {
  const hits = value ?? 0;
  return `${hits} acerto${hits === 1 ? "" : "s"}`;
}

export function contestDate(value: string | undefined): string {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("pt-BR") : value;
}

export function batchMeta(batch: GameBatch): string {
  return `${batch.games.length} jogo${batch.games.length === 1 ? "" : "s"} · alvo ${batch.targetContestNumber ? `#${batch.targetContestNumber}` : "não definido"} · ${formatDateTime(batch.createdAt)}`;
}

export function gameNumbers(game: Game, options: { matchedNumbers?: number[] } = {}): string {
  const fixed = new Set(game.fixedNumbers ?? []);
  const matched = new Set(options.matchedNumbers ?? []);
  return game.numbers.map((value) => {
    const classes = ["mg2-number"];
    if (fixed.has(value)) classes.push("is-fixed");
    if (matched.has(value)) classes.push("is-match");
    return `<span class="${classes.join(" ")}">${numberLabel(value)}</span>`;
  }).join("");
}

export function escapedLuckyMonth(game: Game): string {
  return game.luckyMonth ? escapeHtml(game.luckyMonth) : "";
}
