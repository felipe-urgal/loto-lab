import type { IncomingMessage, ServerResponse } from "node:http";
import type { LotteryId } from "../domain/types.js";

const LOTTERIES: LotteryId[] = ["mega-sena", "lotofacil", "dia-de-sorte"];
const MAX_BODY_BYTES = 1024 * 1024;
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseLottery(value: unknown, field = "lottery"): LotteryId {
  if (typeof value !== "string" || !LOTTERIES.includes(value as LotteryId)) {
    throw new ApiError(400, "INVALID_LOTTERY", `${field} must be one of: ${LOTTERIES.join(", ")}`);
  }
  return value as LotteryId;
}

export function parsePositiveInt(
  value: unknown,
  field: string,
  options: { min?: number; max?: number; defaultValue?: number } = {},
): number {
  if ((value === undefined || value === null || value === "") && options.defaultValue !== undefined) {
    return options.defaultValue;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  const min = options.min ?? 1;
  const max = options.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ApiError(400, "INVALID_ARGUMENT", `${field} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

export function parseOptionalPositiveInt(
  value: unknown,
  field: string,
  options: { min?: number; max?: number } = {},
): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return parsePositiveInt(value, field, options);
}

export function parseBoolean(value: unknown, field: string, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === "") return defaultValue;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new ApiError(400, "INVALID_ARGUMENT", `${field} must be boolean`);
}

function normalizedOrigin(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function requireSameOriginMutation(
  request: IncomingMessage,
  response: ServerResponse,
  expectedOrigin: string,
): boolean {
  const method = request.method ?? "GET";
  if (!MUTATING_METHODS.has(method)) return true;

  const origin = typeof request.headers.origin === "string"
    ? normalizedOrigin(request.headers.origin)
    : undefined;
  const expected = normalizedOrigin(expectedOrigin);
  const fetchSite = request.headers["sec-fetch-site"];
  const crossSite = fetchSite === "cross-site";
  const wrongOrigin = origin !== undefined && expected !== undefined && origin !== expected;

  if (!crossSite && !wrongOrigin) return true;

  response.statusCode = 403;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify({
    error: {
      code: "CROSS_ORIGIN_MUTATION_BLOCKED",
      message: "Cross-origin state-changing requests are not allowed",
    },
  }));
  return false;
}

export async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new ApiError(413, "BODY_TOO_LARGE", "Request body exceeds 1 MB");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};
  const contentType = request.headers["content-type"] ?? "";
  if (!String(contentType).toLowerCase().includes("application/json")) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Request body must use application/json");
  }

  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    if (!isRecord(parsed)) {
      throw new ApiError(400, "INVALID_JSON", "Request body must be a JSON object");
    }
    return parsed;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "INVALID_JSON", "Request body contains invalid JSON");
  }
}

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  corsOrigin: string,
): void {
  const body = JSON.stringify(payload);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.setHeader("Access-Control-Allow-Origin", corsOrigin);
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Vary", "Origin");
  response.end(body);
}

export function sendNoContent(response: ServerResponse, corsOrigin: string): void {
  response.statusCode = 204;
  response.setHeader("Access-Control-Allow-Origin", corsOrigin);
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Vary", "Origin");
  response.end();
}
