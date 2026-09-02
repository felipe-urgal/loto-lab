import assert from "node:assert/strict";
import test from "node:test";
import {
  AgendaUseCase,
  type AgendaItem,
  type AgendaNotification,
} from "../src/application/agenda.js";

const agendaItem: AgendaItem = {
  lottery: "mega-sena",
  currentContest: 3000,
  nextContest: 3001,
  nextDrawDate: "2026-09-03",
  estimatedPrize: 50_000_000,
  accumulated: true,
  updatedAt: "2026-09-02T10:00:00.000Z",
};

const notification: AgendaNotification = {
  id: 12,
  eventKey: "agenda:mega-sena",
  type: "next-contest",
  lottery: "mega-sena",
  severity: "info",
  title: "Próximo concurso · Mega-Sena",
  body: "Concurso #3001 em 03/09/2026.",
  actionHref: "/#generate",
  metadata: { nextContest: 3001 },
  createdAt: "2026-09-02T10:00:00.000Z",
  updatedAt: "2026-09-02T10:00:00.000Z",
};

test("agenda overview refreshes notifications before reading the current view", async () => {
  const events: string[] = [];
  const useCase = new AgendaUseCase(
    {
      list: async () => {
        events.push("agenda:list");
        return [agendaItem];
      },
    },
    {
      list: async (options) => {
        events.push(`notifications:list:${String(options?.unreadOnly)}`);
        assert.deepEqual(options, { limit: 100, unreadOnly: true });
        return [notification];
      },
      unreadCount: async () => {
        events.push("notifications:count");
        return 1;
      },
      markRead: async () => undefined,
      markAllRead: async () => 0,
    },
    {
      refresh: async () => {
        events.push("refresh");
      },
    },
  );

  const result = await useCase.overview(true);

  assert.equal(events[0], "refresh");
  assert.deepEqual(new Set(events.slice(1)), new Set([
    "agenda:list",
    "notifications:list:true",
    "notifications:count",
  ]));
  assert.deepEqual(result, {
    agenda: [agendaItem],
    notifications: [notification],
    unreadCount: 1,
  });
});

test("agenda overview preserves the all-notifications filter", async () => {
  let receivedUnreadOnly: boolean | undefined;
  const useCase = new AgendaUseCase(
    { list: async () => [] },
    {
      list: async (options) => {
        receivedUnreadOnly = options?.unreadOnly;
        return [];
      },
      unreadCount: async () => 0,
      markRead: async () => undefined,
      markAllRead: async () => 0,
    },
    { refresh: async () => undefined },
  );

  await useCase.overview(false);

  assert.equal(receivedUnreadOnly, false);
});

test("agenda mark-read delegates notification lookup without inventing a fallback", async () => {
  const ids: number[] = [];
  const useCase = new AgendaUseCase(
    { list: async () => [] },
    {
      list: async () => [],
      unreadCount: async () => 0,
      markRead: async (id) => {
        ids.push(id);
        return id === notification.id ? notification : undefined;
      },
      markAllRead: async () => 0,
    },
    { refresh: async () => undefined },
  );

  assert.deepEqual(await useCase.markRead(12), notification);
  assert.equal(await useCase.markRead(999), undefined);
  assert.deepEqual(ids, [12, 999]);
});

test("agenda read-all returns the persisted update count with zero unread", async () => {
  const useCase = new AgendaUseCase(
    { list: async () => [] },
    {
      list: async () => [],
      unreadCount: async () => 8,
      markRead: async () => undefined,
      markAllRead: async () => 8,
    },
    { refresh: async () => undefined },
  );

  assert.deepEqual(await useCase.markAllRead(), { updated: 8, unreadCount: 0 });
});
