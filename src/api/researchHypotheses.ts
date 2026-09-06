import type { IncomingMessage, ServerResponse } from "node:http";
import {
  ResearchBacktestEvidenceNotFoundError,
  ResearchEvidenceLotteryMismatchError,
  ResearchHypothesisNotFoundError,
  ResearchHypothesisNotOpenError,
  type ResearchHypothesesUseCase,
} from "../application/researchHypotheses.js";
import type { ApiServerOptions } from "./app.js";
import {
  ApiError,
  parseLottery,
  parsePositiveInt,
  readJsonBody,
  sendJson,
  sendNoContent,
} from "./http.js";

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "INVALID_ARGUMENT", `${field} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new ApiError(
      400,
      "INVALID_ARGUMENT",
      `${field} must be a non-empty string up to ${maxLength} characters`,
    );
  }
  return normalized;
}

function mapResearchError(error: unknown): ApiError | undefined {
  if (error instanceof ApiError) return error;
  if (error instanceof ResearchHypothesisNotFoundError) {
    return new ApiError(404, error.code, error.message);
  }
  if (error instanceof ResearchBacktestEvidenceNotFoundError) {
    return new ApiError(404, error.code, error.message);
  }
  if (error instanceof ResearchHypothesisNotOpenError) {
    return new ApiError(409, error.code, error.message);
  }
  if (error instanceof ResearchEvidenceLotteryMismatchError) {
    return new ApiError(409, error.code, error.message);
  }
  return undefined;
}

export async function serveResearchHypotheses(
  request: IncomingMessage,
  response: ServerResponse,
  options: ApiServerOptions,
  hypotheses: ResearchHypothesesUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? request.url?.split("?")[0]?.replace(/\/$/, "") ?? url.pathname : url.pathname;
  const collectionPath = "/api/v1/research/hypotheses";
  if (pathname !== collectionPath && !pathname.startsWith(`${collectionPath}/`)) return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:3000";

  try {
    if (method === "OPTIONS") {
      sendNoContent(response, corsOrigin);
      return true;
    }

    if (method === "POST" && pathname === collectionPath) {
      const body = await readJsonBody(request);
      const title = requiredString(body.title, "title", 160);
      const description = requiredString(body.description, "description", 4000);
      const lottery = body.lottery === undefined || body.lottery === null
        ? null
        : parseLottery(body.lottery);
      const created = await hypotheses.create({ title, description, lottery });
      sendJson(response, 201, created, corsOrigin);
      return true;
    }

    if (method === "GET" && pathname === collectionPath) {
      const lotteryParam = url.searchParams.get("lottery");
      const lottery = lotteryParam === null ? undefined : parseLottery(lotteryParam);
      const limit = parsePositiveInt(url.searchParams.get("limit"), "limit", {
        defaultValue: 50,
        max: 100,
      });
      sendJson(response, 200, { items: await hypotheses.list({ lottery, limit }) }, corsOrigin);
      return true;
    }

    const evidenceMatch = /^\/api\/v1\/research\/hypotheses\/(\d+)\/evidence\/backtests$/.exec(pathname);
    if (evidenceMatch) {
      const hypothesisId = parsePositiveInt(evidenceMatch[1], "hypothesisId");
      if (method === "POST") {
        const body = await readJsonBody(request);
        const backtestRunId = parsePositiveInt(body.backtestRunId, "backtestRunId");
        const evidence = await hypotheses.linkBacktestEvidence(hypothesisId, backtestRunId);
        sendJson(response, 201, evidence, corsOrigin);
        return true;
      }
      if (method === "GET") {
        sendJson(
          response,
          200,
          { items: await hypotheses.listBacktestEvidence(hypothesisId) },
          corsOrigin,
        );
        return true;
      }
    }

    const itemMatch = /^\/api\/v1\/research\/hypotheses\/(\d+)$/.exec(pathname);
    if (method === "GET" && itemMatch) {
      const id = parsePositiveInt(itemMatch[1], "hypothesisId");
      const hypothesis = await hypotheses.get(id);
      if (!hypothesis) {
        throw new ApiError(404, "RESEARCH_HYPOTHESIS_NOT_FOUND", `Research hypothesis ${id} was not found`);
      }
      sendJson(response, 200, hypothesis, corsOrigin);
      return true;
    }

    throw new ApiError(404, "ROUTE_NOT_FOUND", `${method} ${pathname} was not found`);
  } catch (error) {
    const mapped = mapResearchError(error);
    if (mapped) {
      sendJson(
        response,
        mapped.statusCode,
        { error: { code: mapped.code, message: mapped.message } },
        corsOrigin,
      );
      return true;
    }
    throw error;
  }
}
