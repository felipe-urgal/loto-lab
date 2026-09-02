import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgendaUseCase } from "../application/agenda.js";
import { sendJson } from "./http.js";

export interface AgendaApiOptions {
  corsOrigin?: string;
}

function parseId(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function serveAgenda(
  request: IncomingMessage,
  response: ServerResponse,
  options: AgendaApiOptions,
  agenda: AgendaUseCase,
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:5173";

  if (method === "GET" && url.pathname === "/api/v1/agenda") {
    const unreadOnly = url.searchParams.get("unread") === "true";
    sendJson(response, 200, await agenda.overview(unreadOnly), corsOrigin);
    return true;
  }

  const readMatch = /^\/api\/v1\/notifications\/(\d+)\/read$/.exec(url.pathname);
  if (method === "POST" && readMatch) {
    const id = parseId(readMatch[1]!);
    const item = id ? await agenda.markRead(id) : undefined;
    if (!item) {
      sendJson(response, 404, { error: { code: "NOTIFICATION_NOT_FOUND", message: "Notification was not found" } }, corsOrigin);
      return true;
    }
    sendJson(response, 200, item, corsOrigin);
    return true;
  }

  if (method === "POST" && url.pathname === "/api/v1/notifications/read-all") {
    sendJson(response, 200, await agenda.markAllRead(), corsOrigin);
    return true;
  }

  return false;
}
