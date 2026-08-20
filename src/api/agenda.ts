import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { PostgresAgendaRepository } from "../persistence/agendaRepository.js";
import { PostgresNotificationRepository } from "../persistence/notificationRepository.js";
import { NotificationService } from "../notifications/service.js";
import { sendJson } from "./http.js";

export interface AgendaApiOptions {
  pool: Pool;
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
): Promise<boolean> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");
  const corsOrigin = options.corsOrigin ?? process.env.API_CORS_ORIGIN ?? "http://localhost:5173";
  const notifications = new PostgresNotificationRepository(options.pool);

  if (method === "GET" && url.pathname === "/api/v1/agenda") {
    await new NotificationService(options.pool).refresh();
    const unreadOnly = url.searchParams.get("unread") === "true";
    const [agenda, items, unreadCount] = await Promise.all([
      new PostgresAgendaRepository(options.pool).list(),
      notifications.list({ limit: 100, unreadOnly }),
      notifications.unreadCount(),
    ]);
    sendJson(response, 200, { agenda, notifications: items, unreadCount }, corsOrigin);
    return true;
  }

  const readMatch = /^\/api\/v1\/notifications\/(\d+)\/read$/.exec(url.pathname);
  if (method === "POST" && readMatch) {
    const id = parseId(readMatch[1]!);
    const item = id ? await notifications.markRead(id) : undefined;
    if (!item) {
      sendJson(response, 404, { error: { code: "NOTIFICATION_NOT_FOUND", message: "Notification was not found" } }, corsOrigin);
      return true;
    }
    sendJson(response, 200, item, corsOrigin);
    return true;
  }

  if (method === "POST" && url.pathname === "/api/v1/notifications/read-all") {
    const updated = await notifications.markAllRead();
    sendJson(response, 200, { updated, unreadCount: 0 }, corsOrigin);
    return true;
  }

  return false;
}
