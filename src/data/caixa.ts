import type { Contest, ContestPrizeTier, LotteryId } from "../domain/types.js";
import { assertValidContestNumbers } from "../domain/validation.js";
import { recordCaixaRequest } from "../observability/caixaMetrics.js";
import type { ContestSource, LotteryAgendaSnapshot, LotteryAgendaSource } from "./source.js";

const BASE_URL = "https://servicebus2.caixa.gov.br/portaldeloterias/api";
const DEFAULT_TIMEOUT_MS = 12_000;

const endpointByLottery: Record<LotteryId, string> = {
  "mega-sena": "megasena",
  lotofacil: "lotofacil",
  "dia-de-sorte": "diadesorte",
  quina: "quina",
  lotomania: "lotomania",
  "dupla-sena": "duplasena",
  "mais-milionaria": "maismilionaria",
  timemania: "timemania",
  "super-sete": "supersete",
};

interface CaixaPrizeTierResponse {
  descricaoFaixa: string;
  faixa?: number;
  numeroDeGanhadores: number;
  valorPremio: number;
}

interface CaixaContestResponse {
  numero: number;
  dataApuracao: string;
  listaDezenas: string[];
  listaDezenasSegundoSorteio?: string[] | null;
  trevosSorteados?: string[] | null;
  nomeTimeCoracaoMesSorte?: string | null;
  listaRateioPremio?: CaixaPrizeTierResponse[] | null;
  valorArrecadado?: number | null;
  dataProximoConcurso?: string | null;
  numeroConcursoProximo?: number | null;
  valorEstimadoProximoConcurso?: number | null;
  acumulado?: boolean | null;
}

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function toIsoDate(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) throw new Error(`Invalid Caixa date: ${value}`);
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) {
    throw new Error(`Invalid Caixa date: ${value}`);
  }
  return iso;
}

function sanitizeLuckyMonth(value?: string | null): string | undefined {
  if (!value) return undefined;
  const clean = value.replace(/\0/g, "").trim();
  return clean || undefined;
}

function normalizePrizeTiers(
  lottery: LotteryId,
  value?: CaixaPrizeTierResponse[] | null,
): ContestPrizeTier[] | undefined {
  if (!value?.length) return undefined;
  return value.map((tier) => {
    const description = tier.descricaoFaixa?.trim();
    if (!description) throw new Error("Invalid prize-tier description returned by Caixa");
    if (!Number.isInteger(tier.numeroDeGanhadores) || tier.numeroDeGanhadores < 0) {
      throw new Error("Invalid prize-tier winner count returned by Caixa");
    }
    if (!Number.isFinite(tier.valorPremio) || tier.valorPremio < 0) {
      throw new Error("Invalid prize-tier value returned by Caixa");
    }
    const draw = lottery === "dupla-sena"
      ? (tier.faixa !== undefined && tier.faixa >= 5 ? 2 : 1)
      : undefined;
    return {
      description,
      winners: tier.numeroDeGanhadores,
      prizeValue: tier.valorPremio,
      ...(draw ? { draw } : {}),
    };
  });
}

export function normalizeCaixaContest(lottery: LotteryId, payload: CaixaContestResponse): Contest {
  const rawNumbers = payload.listaDezenas.map(Number);
  const numbers = lottery === "super-sete"
    ? rawNumbers
    : [...rawNumbers].sort((a, b) => a - b);
  if (!Number.isInteger(payload.numero) || payload.numero < 1) throw new Error("Invalid contest number returned by Caixa");
  assertValidContestNumbers(lottery, numbers);

  const secondaryText = sanitizeLuckyMonth(payload.nomeTimeCoracaoMesSorte);
  const luckyMonth = lottery === "dia-de-sorte" ? secondaryText : undefined;
  const favoriteTeam = lottery === "timemania" ? secondaryText : undefined;
  const clovers = lottery === "mais-milionaria"
    ? (payload.trevosSorteados ?? []).map(Number).sort((a, b) => a - b)
    : undefined;
  const columns = lottery === "super-sete" ? [...numbers] : undefined;
  if (lottery === "mais-milionaria") {
    if (clovers?.length !== 2 || new Set(clovers).size !== 2 || clovers.some((value) => !Number.isInteger(value) || value < 1 || value > 6)) {
      throw new Error("Invalid trevos returned by Caixa for mais-milionaria");
    }
  }
  if (lottery === "timemania" && !favoriteTeam) throw new Error("Timemania payload is missing Time do Coração");
  const secondary = lottery === "dia-de-sorte" && luckyMonth
    ? { kind: "lucky-month" as const, values: [luckyMonth] }
    : lottery === "mais-milionaria" && clovers
      ? { kind: "clovers" as const, values: clovers }
      : lottery === "timemania" && favoriteTeam
        ? { kind: "favorite-team" as const, values: [favoriteTeam] }
        : undefined;
  const secondDrawNumbers = lottery === "dupla-sena"
    ? (payload.listaDezenasSegundoSorteio ?? []).map(Number).sort((a, b) => a - b)
    : undefined;
  if (lottery === "dupla-sena") {
    assertValidContestNumbers(lottery, secondDrawNumbers ?? []);
  }
  const prizeTiers = normalizePrizeTiers(lottery, payload.listaRateioPremio);
  const amountCollected = payload.valorArrecadado !== undefined && payload.valorArrecadado !== null && Number.isFinite(payload.valorArrecadado) && payload.valorArrecadado >= 0
    ? payload.valorArrecadado
    : undefined;

  return {
    lottery,
    number: payload.numero,
    date: toIsoDate(payload.dataApuracao),
    numbers,
    ...(secondDrawNumbers ? { secondDrawNumbers } : {}),
    ...(luckyMonth ? { luckyMonth } : {}),
    ...(secondary ? { secondary } : {}),
    ...(columns ? { columns } : {}),
    ...(prizeTiers ? { prizeTiers } : {}),
    ...(amountCollected !== undefined ? { amountCollected } : {}),
  };
}

export function normalizeCaixaAgenda(lottery: LotteryId, payload: CaixaContestResponse): LotteryAgendaSnapshot {
  const nextContest = payload.numeroConcursoProximo;
  if (!Number.isInteger(payload.numero) || payload.numero < 1 || !Number.isInteger(nextContest) || Number(nextContest) < 1) {
    throw new Error(`Invalid agenda returned by Caixa for ${lottery}`);
  }
  const nextDrawDate = payload.dataProximoConcurso ? toIsoDate(payload.dataProximoConcurso) : undefined;
  const estimatedPrize = payload.valorEstimadoProximoConcurso !== undefined && payload.valorEstimadoProximoConcurso !== null && Number.isFinite(payload.valorEstimadoProximoConcurso) && payload.valorEstimadoProximoConcurso >= 0
    ? payload.valorEstimadoProximoConcurso
    : undefined;
  return {
    lottery,
    currentContest: payload.numero,
    nextContest: Number(nextContest),
    ...(nextDrawDate ? { nextDrawDate } : {}),
    ...(estimatedPrize !== undefined ? { estimatedPrize } : {}),
    accumulated: Boolean(payload.acumulado),
  };
}

export class CaixaContestSource implements ContestSource, LotteryAgendaSource {
  private readonly timeoutMs: number;

  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60_000) {
      throw new Error("Caixa timeout must be between 1000 and 60000 ms");
    }
    this.timeoutMs = timeoutMs;
  }

  private async fetchPayload(lottery: LotteryId, contestNumber?: number): Promise<CaixaContestResponse> {
    if (contestNumber !== undefined && (!Number.isInteger(contestNumber) || contestNumber < 1)) {
      throw new Error("contestNumber must be a positive integer");
    }
    const endpoint = endpointByLottery[lottery];
    const url = `${BASE_URL}/${endpoint}${contestNumber ? `/${contestNumber}` : ""}`;
    const startedAt = performance.now();

    try {
      const response = await this.fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) throw new Error(`Caixa request failed (${response.status}) for ${lottery}`);
      const payload = (await response.json()) as CaixaContestResponse;
      recordCaixaRequest("success", performance.now() - startedAt);
      return payload;
    } catch (error) {
      const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      recordCaixaRequest(timeout ? "timeout" : "error", performance.now() - startedAt);
      if (timeout) throw new Error(`Caixa request timed out for ${lottery}`);
      throw error;
    }
  }

  async fetchContest(lottery: LotteryId, contestNumber?: number): Promise<Contest> {
    return normalizeCaixaContest(lottery, await this.fetchPayload(lottery, contestNumber));
  }

  async fetchAgenda(lottery: LotteryId): Promise<LotteryAgendaSnapshot> {
    return normalizeCaixaAgenda(lottery, await this.fetchPayload(lottery));
  }

  async fetchContestRange(lottery: LotteryId, startContest: number, endContest: number): Promise<Contest[]> {
    if (!Number.isInteger(startContest) || !Number.isInteger(endContest) || startContest < 1 || endContest < startContest) {
      throw new Error("Invalid contest range");
    }
    const contests: Contest[] = [];
    for (let contest = startContest; contest <= endContest; contest += 1) contests.push(await this.fetchContest(lottery, contest));
    return contests;
  }
}
