import type { ContestPrizeTier } from "../domain/types.js";
import type {
  DrawResult,
  LotteryProductId,
  SecondarySelection,
} from "../domain/lotteryCatalog.js";
import { CaixaHttpClient, type FetchLike, type SleepLike } from "./caixaHttpClient.js";

const BASE_URL = "https://servicebus2.caixa.gov.br/portaldeloterias/api";
const DEFAULT_TIMEOUT_MS = 12_000;

export const endpointByProduct: Partial<Record<LotteryProductId, string>> = {
  "mega-sena": "megasena",
  lotofacil: "lotofacil",
  "dia-de-sorte": "diadesorte",
  quina: "quina",
  lotomania: "lotomania",
  "dupla-sena": "duplasena",
  "mais-milionaria": "maismilionaria",
  timemania: "timemania",
  "super-sete": "supersete",
  loteca: "loteca",
  federal: "federal",
};

export interface CaixaProductPrizeTierResponse {
  descricaoFaixa: string;
  numeroDeGanhadores: number;
  valorPremio: number;
}

export interface CaixaSportsResultResponse {
  nuSequencial: number;
  nomeEquipeUm: string;
  nomeEquipeDois: string;
  nuGolEquipeUm: number;
  nuGolEquipeDois: number;
}

export interface CaixaProductResponse {
  numero: number;
  dataApuracao: string;
  dataProximoConcurso?: string | null;
  numeroConcursoProximo?: number | null;
  valorEstimadoProximoConcurso?: number | null;
  acumulado?: boolean | null;
  listaDezenas?: string[] | null;
  listaDezenasSegundoSorteio?: string[] | null;
  trevosSorteados?: string[] | null;
  nomeTimeCoracaoMesSorte?: string | null;
  listaResultadoEquipeEsportiva?: CaixaSportsResultResponse[] | null;
  listaRateioPremio?: CaixaProductPrizeTierResponse[] | null;
  valorArrecadado?: number | null;
}

export interface LotteryProductResult {
  product: LotteryProductId;
  contestNumber: number;
  drawDate: string;
  result: DrawResult;
  prizeTiers?: ContestPrizeTier[];
  amountCollected?: number;
  source: {
    provider: "caixa";
    endpoint: string;
  };
}

export interface LotteryProductAgendaSnapshot {
  product: LotteryProductId;
  currentContest: number;
  nextContest?: number;
  nextDrawDate?: string;
  estimatedPrize?: number;
  accumulated?: boolean;
}

export interface LotteryProductSource {
  fetchResult(product: LotteryProductId, contestNumber?: number): Promise<LotteryProductResult>;
  fetchAgenda(product: LotteryProductId): Promise<LotteryProductAgendaSnapshot>;
}

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

function sanitizeText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const clean = value.replace(/\0/g, "").trim();
  return clean || undefined;
}

function requiredNumbers(value: string[] | null | undefined, field: string): number[] {
  if (!value?.length) throw new Error(`Caixa payload is missing ${field}`);
  const numbers = value.map(Number);
  if (numbers.some((number) => !Number.isInteger(number))) {
    throw new Error(`Caixa payload contains invalid ${field}`);
  }
  return numbers;
}

function normalizePrizeTiers(value?: CaixaProductPrizeTierResponse[] | null): ContestPrizeTier[] | undefined {
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

function secondary(kind: SecondarySelection["kind"], values: string[] | number[]): SecondarySelection {
  if (kind === "clovers") return { kind, values: values as number[] };
  return { kind, values: values as string[] };
}

function normalizeSports(payload: CaixaProductResponse): DrawResult {
  const rows = [...(payload.listaResultadoEquipeEsportiva ?? [])]
    .sort((left, right) => left.nuSequencial - right.nuSequencial);
  if (rows.length !== 14) throw new Error("Loteca payload must contain exactly 14 matches");
  return {
    family: "sports-prediction",
    mode: "result",
    outcomes: rows.map((row) => {
      if (!Number.isInteger(row.nuGolEquipeUm) || !Number.isInteger(row.nuGolEquipeDois)) {
        throw new Error("Loteca payload contains invalid match score");
      }
      if (row.nuGolEquipeUm > row.nuGolEquipeDois) return "home";
      if (row.nuGolEquipeUm < row.nuGolEquipeDois) return "away";
      return "draw";
    }),
  };
}

export function normalizeCaixaProductResult(
  product: LotteryProductId,
  payload: CaixaProductResponse,
): LotteryProductResult {
  const endpoint = endpointByProduct[product];
  if (!endpoint) {
    throw new Error(`No verified Caixa contest endpoint for ${product}`);
  }
  if (!Number.isInteger(payload.numero) || payload.numero < 1) {
    throw new Error("Invalid contest number returned by Caixa");
  }

  let result: DrawResult;
  switch (product) {
    case "mega-sena":
    case "lotofacil":
    case "quina":
    case "lotomania":
      result = { family: "number-draw", numbers: requiredNumbers(payload.listaDezenas, "listaDezenas") };
      break;
    case "dia-de-sorte": {
      const month = sanitizeText(payload.nomeTimeCoracaoMesSorte);
      if (!month) throw new Error("Dia de Sorte payload is missing lucky month");
      result = {
        family: "number-draw-secondary",
        numbers: requiredNumbers(payload.listaDezenas, "listaDezenas"),
        secondary: secondary("lucky-month", [month]),
      };
      break;
    }
    case "dupla-sena":
      result = {
        family: "dual-number-draw",
        draws: [
          requiredNumbers(payload.listaDezenas, "listaDezenas"),
          requiredNumbers(payload.listaDezenasSegundoSorteio, "listaDezenasSegundoSorteio"),
        ],
      };
      break;
    case "mais-milionaria":
      result = {
        family: "number-draw-secondary",
        numbers: requiredNumbers(payload.listaDezenas, "listaDezenas"),
        secondary: secondary("clovers", requiredNumbers(payload.trevosSorteados, "trevosSorteados")),
      };
      break;
    case "timemania": {
      const team = sanitizeText(payload.nomeTimeCoracaoMesSorte);
      if (!team) throw new Error("Timemania payload is missing favorite team");
      result = {
        family: "number-draw-secondary",
        numbers: requiredNumbers(payload.listaDezenas, "listaDezenas"),
        secondary: secondary("favorite-team", [team]),
      };
      break;
    }
    case "super-sete":
      result = {
        family: "column-draw",
        columns: requiredNumbers(payload.listaDezenas, "listaDezenas"),
      };
      break;
    case "loteca":
      result = normalizeSports(payload);
      break;
    case "federal": {
      const tickets = requiredNumbers(payload.listaDezenas, "listaDezenas");
      if (tickets.length !== 5) throw new Error("Federal payload must contain exactly five main prizes");
      result = {
        family: "ticket-draw",
        prizes: payload.listaDezenas!.map((ticketNumber, index) => ({
          position: index + 1,
          ticketNumber,
        })),
      };
      break;
    }
    case "lotogol":
    case "instantanea":
      throw new Error(`No verified Caixa contest endpoint for ${product}`);
    default: {
      const exhaustive: never = product;
      throw new Error(`Unsupported Caixa product: ${exhaustive}`);
    }
  }

  const prizeTiers = normalizePrizeTiers(payload.listaRateioPremio);
  const amountCollected = payload.valorArrecadado !== undefined
    && payload.valorArrecadado !== null
    && Number.isFinite(payload.valorArrecadado)
    && payload.valorArrecadado >= 0
    ? payload.valorArrecadado
    : undefined;

  return {
    product,
    contestNumber: payload.numero,
    drawDate: toIsoDate(payload.dataApuracao),
    result,
    ...(prizeTiers ? { prizeTiers } : {}),
    ...(amountCollected !== undefined ? { amountCollected } : {}),
    source: {
      provider: "caixa",
      endpoint: `${BASE_URL}/${endpoint}/${payload.numero}`,
    },
  };
}

export function normalizeCaixaProductAgenda(
  product: LotteryProductId,
  payload: CaixaProductResponse,
): LotteryProductAgendaSnapshot {
  if (!endpointByProduct[product]) {
    throw new Error(`No verified Caixa contest endpoint for ${product}`);
  }
  if (!Number.isInteger(payload.numero) || payload.numero < 1) {
    throw new Error("Invalid contest number returned by Caixa");
  }

  const nextContest = Number.isInteger(payload.numeroConcursoProximo)
    && Number(payload.numeroConcursoProximo) > 0
    ? Number(payload.numeroConcursoProximo)
    : undefined;
  const nextDrawDate = payload.dataProximoConcurso
    ? toIsoDate(payload.dataProximoConcurso)
    : undefined;
  const estimatedPrize = payload.valorEstimadoProximoConcurso !== undefined
    && payload.valorEstimadoProximoConcurso !== null
    && Number.isFinite(payload.valorEstimadoProximoConcurso)
    && payload.valorEstimadoProximoConcurso >= 0
    ? payload.valorEstimadoProximoConcurso
    : undefined;

  return {
    product,
    currentContest: payload.numero,
    ...(nextContest !== undefined ? { nextContest } : {}),
    ...(nextDrawDate ? { nextDrawDate } : {}),
    ...(estimatedPrize !== undefined ? { estimatedPrize } : {}),
    ...(payload.acumulado !== undefined && payload.acumulado !== null
      ? { accumulated: Boolean(payload.acumulado) }
      : {}),
  };
}

export class CaixaProductSource implements LotteryProductSource {
  private readonly http: CaixaHttpClient;

  constructor(
    fetchImpl: FetchLike = fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    sleep?: SleepLike,
  ) {
    this.http = new CaixaHttpClient(
      fetchImpl,
      { totalTimeoutMs: timeoutMs },
      sleep,
    );
  }

  private async fetchPayload(
    product: LotteryProductId,
    contestNumber?: number,
  ): Promise<CaixaProductResponse> {
    const endpoint = endpointByProduct[product];
    if (!endpoint) throw new Error(`No verified Caixa contest endpoint for ${product}`);
    if (contestNumber !== undefined && (!Number.isInteger(contestNumber) || contestNumber < 1)) {
      throw new Error("contestNumber must be a positive integer");
    }

    const url = `${BASE_URL}/${endpoint}${contestNumber ? `/${contestNumber}` : ""}`;
    return this.http.getJson<CaixaProductResponse>(url, product);
  }

  async fetchResult(product: LotteryProductId, contestNumber?: number): Promise<LotteryProductResult> {
    return normalizeCaixaProductResult(product, await this.fetchPayload(product, contestNumber));
  }

  async fetchAgenda(product: LotteryProductId): Promise<LotteryProductAgendaSnapshot> {
    return normalizeCaixaProductAgenda(product, await this.fetchPayload(product));
  }
}
