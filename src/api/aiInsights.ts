import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiServerOptions } from "./app.js";
import { ApiError, parseLottery, parsePositiveInt, readJsonBody, sendJson } from "./http.js";
import { AiInsightService } from "../ai/service.js";
import { OpenAiInterpretationProvider, OpenAiProviderError } from "../ai/openai.js";
import type { AiInsightFocus, AiInterpretationProvider } from "../ai/types.js";
import { AI_DISCLAIMER } from "../ai/types.js";

export interface AiApiOptions extends ApiServerOptions {
  aiProvider?: AiInterpretationProvider;
}

const FOCUSES: AiInsightFocus[] = ["overview", "analysis", "strategy", "real-performance"];

function parseFocus(value: unknown): AiInsightFocus {
  const focus = value ?? "overview";
  if (typeof focus !== "string" || !FOCUSES.includes(focus as AiInsightFocus)) {
    throw new ApiError(400, "INVALID_AI_FOCUS", `focus must be one of: ${FOCUSES.join(", ")}`);
  }
  return focus as AiInsightFocus;
}

export async function serveAiInsights(
  request: IncomingMessage,
  response: ServerResponse,
  options: AiApiOptions,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/$/, "") : url.pathname;
  if (!pathname.startsWith("/api/v1/ai")) return false;

  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://127.0.0.1:3000";
  const provider = options.aiProvider ?? new OpenAiInterpretationProvider();
  const service = new AiInsightService(options.pool, provider);

  try {
    if (method === "GET" && pathname === "/api/v1/ai/status") {
      sendJson(response, 200, { ...service.status(), disclaimer: AI_DISCLAIMER }, corsOrigin);
      return true;
    }

    if (method === "POST" && pathname === "/api/v1/ai/insights") {
      if (!provider.isConfigured()) {
        throw new ApiError(503, "AI_NOT_CONFIGURED", "Configure OPENAI_API_KEY to enable AI interpretation");
      }
      const body = await readJsonBody(request);
      const lottery = parseLottery(body.lottery);
      const focus = parseFocus(body.focus);
      const insight = await service.generate(lottery, focus);
      sendJson(response, 201, { ...insight, disclaimer: AI_DISCLAIMER }, corsOrigin);
      return true;
    }

    const match = /^\/api\/v1\/ai\/insights\/([^/]+)$/.exec(pathname);
    if (method === "GET" && match) {
      const lottery = parseLottery(match[1]);
      const limit = parsePositiveInt(url.searchParams.get("limit"), "limit", {
        min: 1,
        max: 50,
        defaultValue: 10,
      });
      const items = await service.history(lottery, limit);
      sendJson(response, 200, { items, disclaimer: AI_DISCLAIMER }, corsOrigin);
      return true;
    }

    throw new ApiError(404, "ROUTE_NOT_FOUND", `${method} ${pathname} was not found`);
  } catch (error) {
    if (error instanceof ApiError) {
      sendJson(response, error.statusCode, { error: { code: error.code, message: error.message } }, corsOrigin);
      return true;
    }
    if (error instanceof OpenAiProviderError) {
      const status = error.code === "AI_NOT_CONFIGURED" ? 503 : 502;
      sendJson(response, status, { error: { code: error.code, message: error.message } }, corsOrigin);
      return true;
    }
    console.error("Loto Lab AI request failed", error);
    sendJson(response, 500, { error: { code: "INTERNAL_ERROR", message: "Unexpected AI server error" } }, corsOrigin);
    return true;
  }
}
