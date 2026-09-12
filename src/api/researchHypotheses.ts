import type { IncomingMessage, ServerResponse } from "node:http";
import {
  ResearchBacktestEvidenceNotFoundError,
  ResearchEvidenceLotteryMismatchError,
  ResearchHypothesisDecisionEvidenceRequiredError,
  ResearchHypothesisDecisionReasonInvalidError,
  ResearchHypothesisNotFoundError,
  ResearchHypothesisNotOpenError,
  type ResearchHypothesisDecision,
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

const researchHypothesisDecisions = new Set<ResearchHypothesisDecision>([
  "inconclusive",
  "rejected",
  "continue-testing",
  "applied-experimentally",
]);

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

function parseResearchHypothesisDecision(value: unknown): ResearchHypothesisDecision {
  if (typeof value !== "string" || !researchHypothesisDecisions.has(value as ResearchHypothesisDecision)) {
    throw new ApiError(
      400,
      "INVALID_ARGUMENT",
      "decision must be one of: inconclusive, rejected, continue-testing, applied-experimentally",
    );
  }
  return value as ResearchHypothesisDecision;
}

function mapResearchError(error: unknown): ApiError | undefined {
  if (error instanceof ApiError) return error;
  if (error instanceof ResearchHypothesisNotFoundError) {
    return new ApiError(404, error.code, error.message);
  }
  if (error instanceof ResearchBacktestEvidenceNotFoundError) {
    return new ApiError(404, error.code, error.message);
  }
  if (error instanceof ResearchHypothesisDecisionReasonInvalidError) {
    return new ApiError(400, error.code, error.message);
  }
  if (error instanceof ResearchHypothesisNotOpenError) {
    return new ApiError(409, error.code, error.message);
  }
  if (error instanceof ResearchHypothesisDecisionEvidenceRequiredError) {
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
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
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

    const decisionMatch = /^\/api\/v1\/research\/hypotheses\/(\d+)\/decision$/.exec(pathname);
    if (method === "POST" && decisionMatch) {
      const hypothesisId = parsePositiveInt(decisionMatch[1], "hypothesisId");
      const body = await readJsonBody(request);
      const decision = parseResearchHypothesisDecision(body.decision);
      const reason = requiredString(body.reason, "reason", 4000);
      const decided = await hypotheses.decide(hypothesisId, { decision, reason });
      sendJson(response, 200, decided, corsOrigin);
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

    const applicationsMatch = /^\/api\/v1\/research\/hypotheses\/(\d+)\/applications\/real-bets$/.exec(pathname);
    if (method === "GET" && applicationsMatch) {
      const hypothesisId = parsePositiveInt(applicationsMatch[1], "hypothesisId");
      sendJson(
        response,
        200,
        { items: await hypotheses.listRealBetApplications(hypothesisId) },
        corsOrigin,
      );
      return true;
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
