import type { Contest, LotteryId } from "../domain/types.js";
import { getLotteryConfig } from "../lotteries/config.js";
import type { ContestSource } from "./source.js";

const BASE_URL = "https://servicebus2.caixa.gov.br/portaldeloterias/api";

const endpointByLottery: Record<LotteryId, string> = {
  "mega-sena": "megasena",
  lotofacil: "lotofacil",
  "dia-de-sorte": "diadesorte",
};

interface CaixaContestResponse {
  numero: number;
  dataApuracao: string;
  listaDezenas: string[];
  nomeTimeCoracaoMesSorte?: string | null;
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

export function normalizeCaixaContest(
  lottery: LotteryId,
  payload: CaixaContestResponse,
): Contest {
  const config = getLotteryConfig(lottery);
  const numbers = payload.listaDezenas.map(Number).sort((a, b) => a - b);

  if (!Number.isInteger(payload.numero) || payload.numero < 1) {
    throw new Error("Invalid contest number returned by Caixa");
  }
  if (numbers.length !== config.drawSize) {
    throw new Error(
      `Expected ${config.drawSize} numbers for ${lottery}, received ${numbers.length}`,
    );
  }
  if (
    numbers.some(
      (number) =>
        !Number.isInteger(number) ||
        number < config.minNumber ||
        number > config.maxNumber,
    )
  ) {
    throw new Error(`Invalid drawn number returned by Caixa for ${lottery}`);
  }
  if (new Set(numbers).size !== numbers.length) {
    throw new Error(`Duplicated drawn number returned by Caixa for ${lottery}`);
  }

  const luckyMonth =
    lottery === "dia-de-sorte"
      ? sanitizeLuckyMonth(payload.nomeTimeCoracaoMesSorte)
      : undefined;

  return {
    lottery,
    number: payload.numero,
    date: toIsoDate(payload.dataApuracao),
    numbers,
    ...(luckyMonth ? { luckyMonth } : {}),
  };
}

export class CaixaContestSource implements ContestSource {
  constructor(private readonly fetchImpl: FetchLike = fetch) {}

  async fetchContest(lottery: LotteryId, contestNumber?: number): Promise<Contest> {
    if (
      contestNumber !== undefined &&
      (!Number.isInteger(contestNumber) || contestNumber < 1)
    ) {
      throw new Error("contestNumber must be a positive integer");
    }

    const endpoint = endpointByLottery[lottery];
    const url = `${BASE_URL}/${endpoint}${contestNumber ? `/${contestNumber}` : ""}`;
    const response = await this.fetchImpl(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`Caixa request failed (${response.status}) for ${lottery}`);
    }

    const payload = (await response.json()) as CaixaContestResponse;
    return normalizeCaixaContest(lottery, payload);
  }

  async fetchContestRange(
    lottery: LotteryId,
    startContest: number,
    endContest: number,
  ): Promise<Contest[]> {
    if (
      !Number.isInteger(startContest) ||
      !Number.isInteger(endContest) ||
      startContest < 1 ||
      endContest < startContest
    ) {
      throw new Error("Invalid contest range");
    }

    const contests: Contest[] = [];
    for (let contest = startContest; contest <= endContest; contest += 1) {
      contests.push(await this.fetchContest(lottery, contest));
    }
    return contests;
  }
}
