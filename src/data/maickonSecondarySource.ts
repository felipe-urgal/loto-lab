import type { LotteryId } from "../domain/types.js";
import type { SecondaryContestSnapshot, SecondaryContestSource } from "./secondarySource.js";

export type SecondaryFetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const ROOT = "https://raw.githubusercontent.com/maickon/free-apiloterias/refs/heads/master/database";
const DEFAULT_TIMEOUT_MS = 5_000;

const pathByLottery: Partial<Record<LotteryId, string>> = {
  "mega-sena": "megasena",
  lotofacil: "lotofacil",
};

interface MaickonPayload {
  numero: number;
  dataApuracao: string;
  listaDezenas: string[];
}

export class SecondarySourceUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SecondarySourceUnavailableError";
  }
}

export class SecondarySourceInvalidResponseError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SecondarySourceInvalidResponseError";
  }
}

function toIsoDate(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) throw new Error("invalid draw date");
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) {
    throw new Error("invalid draw date");
  }
  return iso;
}

function normalize(
  lottery: LotteryId,
  payload: MaickonPayload,
  url: string,
  fetchedAt: string,
): SecondaryContestSnapshot {
  const expected = lottery === "mega-sena" ? 6 : 15;
  if (!Number.isInteger(payload.numero) || payload.numero < 1) throw new Error("invalid contest number");
  if (!Array.isArray(payload.listaDezenas) || payload.listaDezenas.length !== expected) {
    throw new Error("invalid number count");
  }
  const numbers = payload.listaDezenas.map(Number).sort((a, b) => a - b);
  if (numbers.some((value) => !Number.isInteger(value)) || new Set(numbers).size !== numbers.length) {
    throw new Error("invalid numbers");
  }
  return {
    lottery,
    contestNumber: payload.numero,
    drawDate: toIsoDate(payload.dataApuracao),
    numbers,
    source: {
      provider: "maickon/free-apiloterias",
      repository: "maickon/free-apiloterias",
      ref: "master",
      url,
      fetchedAt,
    },
  };
}

export class MaickonSecondaryContestSource implements SecondaryContestSource {
  readonly provider = "maickon/free-apiloterias";
  constructor(
    private readonly fetchImpl: SecondaryFetchLike = fetch,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 500 || timeoutMs > 15_000) {
      throw new Error("Secondary source timeout must be between 500 and 15000 ms");
    }
  }

  supports(lottery: LotteryId): boolean {
    return Boolean(pathByLottery[lottery]);
  }

  async latestContestNumber(lottery: LotteryId): Promise<number> {
    return (await this.fetchFile(lottery, "ultimo.json")).contestNumber;
  }

  async fetchContest(lottery: LotteryId, contestNumber: number): Promise<SecondaryContestSnapshot | undefined> {
    if (!Number.isInteger(contestNumber) || contestNumber < 1) {
      throw new Error("contestNumber must be a positive integer");
    }
    try {
      return await this.fetchFile(lottery, `${contestNumber}.json`);
    } catch (error) {
      if (error instanceof ResponseNotFoundError) return undefined;
      throw error;
    }
  }

  private async fetchFile(lottery: LotteryId, filename: string): Promise<SecondaryContestSnapshot> {
    const path = pathByLottery[lottery];
    if (!path) throw new Error(`Secondary source does not support ${lottery}`);
    const url = `${ROOT}/${path}/${filename}`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new SecondarySourceUnavailableError(`Secondary source unavailable for ${lottery}`, { cause: error });
    }
    if (response.status === 404) throw new ResponseNotFoundError();
    if (!response.ok) {
      throw new SecondarySourceUnavailableError(
        `Secondary source failed (${response.status}) for ${lottery}`,
      );
    }
    try {
      const payload = await response.json() as MaickonPayload;
      return normalize(lottery, payload, url, this.now());
    } catch (error) {
      throw new SecondarySourceInvalidResponseError(
        `Secondary source returned invalid payload for ${lottery}`,
        { cause: error },
      );
    }
  }
}

class ResponseNotFoundError extends Error {}
