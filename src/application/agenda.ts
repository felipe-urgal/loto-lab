import type { LotteryId } from "../domain/types.js";

export interface AgendaItem {
  lottery: LotteryId;
  currentContest: number;
  nextContest: number;
  nextDrawDate?: string;
  estimatedPrize?: number;
  accumulated: boolean;
  updatedAt: string;
}

export type AgendaNotificationType =
  | "next-contest"
  | "bet-awaiting"
  | "result-available"
  | "bet-checked"
  | "bet-prize"
  | "operation-warning";

export type AgendaNotificationSeverity = "info" | "success" | "warning" | "error";

export interface AgendaNotification {
  id: number;
  eventKey: string;
  type: AgendaNotificationType;
  lottery?: LotteryId;
  severity: AgendaNotificationSeverity;
  title: string;
  body: string;
  actionHref?: string;
  metadata: Record<string, unknown>;
  readAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgendaReader {
  list(): Promise<AgendaItem[]>;
}

export interface AgendaNotificationStore {
  list(options?: { limit?: number; unreadOnly?: boolean }): Promise<AgendaNotification[]>;
  unreadCount(): Promise<number>;
  markRead(id: number): Promise<AgendaNotification | undefined>;
  markAllRead(): Promise<number>;
}

export interface AgendaNotificationRefresher {
  refresh(): Promise<unknown>;
}

export class AgendaUseCase {
  constructor(
    private readonly agenda: AgendaReader,
    private readonly notifications: AgendaNotificationStore,
    private readonly refresher: AgendaNotificationRefresher,
  ) {}

  async overview(unreadOnly: boolean) {
    await this.refresher.refresh();
    const [agenda, notifications, unreadCount] = await Promise.all([
      this.agenda.list(),
      this.notifications.list({ limit: 100, unreadOnly }),
      this.notifications.unreadCount(),
    ]);
    return { agenda, notifications, unreadCount };
  }

  async markRead(id: number): Promise<AgendaNotification | undefined> {
    return this.notifications.markRead(id);
  }

  async markAllRead() {
    return {
      updated: await this.notifications.markAllRead(),
      unreadCount: 0,
    };
  }
}
