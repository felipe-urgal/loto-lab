import type { Contest, ContestPrizeTier, LotteryId } from "../domain/types.js";
import { getLotteryConfig } from "../lotteries/config.js";
import type { ContestSource, LotteryAgendaSnapshot, LotteryAgendaSource } from "./source.js";

const BASE_URL = "https://servicebus2.caixa.gov.br/portaldeloterias/api";
const DEFAULT_TIMEOUT_MS = 12_000;

const endpointByLottery: Record<LotteryId, string> = {
  "mega-sena": "megasena",
  lotofacil: "lotofacil",
  "dia-de-sorte": "diadesorte",
};

interface CaixaPrizeTierResponse {
  descricaoFaixa: string;
  numeroDeGanhadores: number;
  valorPremio: number;
}

interface CaixaContestResponse {
  numero: number;
  dataApuracao: string;
  listaDezenas: string[];
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
  return `${year}-${month}-${day}`;
}

function sanitizeLuckyMonth(value?: string | null): string | undefined {
  if (!value) return undefined;
  const clean = value.replace(/\0/g, "").trim();
  return clean || undefined;
}

function normalizePrizeTiers(value?: CaixaPrizeTierResponse[] | null): ContestPrizeTier[] | undefined {
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
    return { description, winners: tier.numeroDeGanhadores, prizeValue: tier.valorPremio };
  });
}

export function normalizeCaixaContest(lottery: LotteryId, payload: CaixaContestResponse): Contest {
  const config = getLotteryConfig(lottery);
  const numbers = payload.listaDezenas.map(Number).sort((a, b) => a - b);
  if (!Number.isInteger(payload.numero) || payload.numero < 1) throw new Error("Invalid contest number returned by Caixa");
  if (numbers.length !== config.drawSize) throw new Error(`Expected ${config.drawSize} numbers for ${lottery}, received ${numbers.length}`);
  if (numbers.some((number) => !Number.isInteger(number) || number < config.minNumber || number > config.maxNumber)) {
    throw new Error(`Invalid drawn number returned by Caixa for ${lottery}`);
  }
  if (new Set(numbers).size !== numbers.length) throw new Error(`Duplicated drawn number returned by Caixa for ${lottery}`);

  const luckyMonth = lottery === "dia-de-sorte" ? sanitizeLuckyMonth(payload.nomeTimeCoracaoMesSorte) : undefined;
  const prizeTiers = normalizePrizeTiers(payload.listaRateioPremio);
  const amountCollected = payload.valorArrecadado !== undefined && payload.valorArrecadado !== null && Number.isFinite(payload.valorArrecadado) && payload.valorArrecadado >= 0
    ? payload.valorArrecadado
    : undefined;

  return {
    lottery,
    number: payload.numero,
    date: toIsoDate(payload.dataApuracao),
    numbers,
    ...(luckyMonth ? { luckyMonth } : {}),
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

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new Error(`Caixa request timed out for ${lottery}`);
      }
      throw error;
    }

    if (!response.ok) throw new Error(`Caixa request failed (${response.status}) for ${lottery}`);
    return (await response.json()) as CaixaContestResponse;
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
