import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Contest, LotteryId } from "../src/domain/types.js";
import type { ContestSource, LotteryAgendaSnapshot } from "../src/data/source.js";
import { createLotoLabServer } from "../src/api/server.js";
import { PostgresAgendaRepository } from "../src/persistence/agendaRepository.js";
import { PostgresContestRepository } from "../src/persistence/contestRepository.js";
import { PostgresNotificationRepository } from "../src/persistence/notificationRepository.js";
import { PostgresOperationRepository } from "../src/persistence/operationRepository.js";
import { runOperationalSync, type SyncAllDetails } from "../src/operations/sync.js";
import { createIsolatedPostgresDatabase } from "./helpers/postgres.js";

function contest(lottery: LotteryId, number: number): Contest {
  if (lottery === "mega-sena") {
    return {
      lottery,
      number,
      date: `2026-08-${String(number).padStart(2, "0")}`,
      numbers: [1, 2, 3, 4, 5, 6],
      prizeTiers: [
        { description: "6 acertos", winners: 0, prizeValue: 0 },
        { description: "5 acertos", winners: 0, prizeValue: 0 },
        { description: "4 acertos", winners: 0, prizeValue: 0 },
      ],
    };
  }
  if (lottery === "lotofacil") {
    return {
      lottery,
      number,
      date: `2026-08-${String(number).padStart(2, "0")}`,
      numbers: Array.from({ length: 15 }, (_, index) => index + 1),
      prizeTiers: [15, 14, 13, 12, 11].map((hits) => ({
        description: `${hits} acertos`,
        winners: 0,
        prizeValue: 0,
      })),
    };
  }
  return {
    lottery,
    number,
    date: `2026-08-${String(number).padStart(2, "0")}`,
    numbers: [1, 2, 3, 4, 5, 6, 7],
    luckyMonth: "Janeiro",
    prizeTiers: [
      { description: "7 acertos", winners: 0, prizeValue: 0 },
      { description: "6 acertos", winners: 0, prizeValue: 0 },
      { description: "5 acertos", winners: 0, prizeValue: 0 },
      { description: "4 acertos", winners: 0, prizeValue: 0 },
      { description: "Mês da Sorte", winners: 0, prizeValue: 0 },
    ],
  };
}

class FakeContestSource implements ContestSource {
  async fetchContest(lottery: LotteryId, contestNumber?: number): Promise<Contest> {
    return contest(lottery, contestNumber ?? 2);
  }

  async fetchContestRange(lottery: LotteryId, startContest: number, endContest: number): Promise<Contest[]> {
    return Array.from({ length: endContest - startContest + 1 }, (_, index) => contest(lottery, startContest + index));
  }

  async fetchAgenda(lottery: LotteryId): Promise<LotteryAgendaSnapshot> {
    return {
      lottery,
      currentContest: 2,
      nextContest: 3,
      nextDrawDate: "2026-08-20",
      estimatedPrize: lottery === "mega-sena" ? 50_000_000 : 2_000_000,
      accumulated: lottery === "mega-sena",
    };
  }
}

test(
  "operational sync fills gaps, refreshes agenda, notifications and audits the run",
  { skip: !process.env.DATABASE_URL },
  async (t) => {
    const database = await createIsolatedPostgresDatabase({ label: "operations", max: 4 });
    const { pool } = database;
    let server: ReturnType<typeof createLotoLabServer> | undefined;

    t.after(async () => {
      if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
      await database.close();
    });

    const result = await runOperationalSync(pool, { source: new FakeContestSource(), retries: 0, retryDelayMs: 0 });

    assert.equal(result.status, "success");
    assert.equal(result.details.successfulLotteries, 3);
    assert.equal(result.details.failedLotteries, 0);
    assert.equal(result.details.lotteries.length, 3);
    assert.ok(result.details.lotteries.every((item) => item.latestOfficialContest === 2));
    assert.ok(result.details.lotteries.every((item) => item.nextContest === 3));
    assert.ok(result.details.lotteries.every((item) => item.nextDrawDate === "2026-08-20"));
    assert.ok(result.details.lotteries.every((item) => item.totalStored === 2));

    const contests = new PostgresContestRepository(pool);
    for (const lottery of ["mega-sena", "lotofacil", "dia-de-sorte"] as const) {
      const status = await contests.getDataStatus(lottery);
      assert.equal(status.contestCount, 2);
      assert.equal(status.missingContestCount, 0);
      assert.equal(status.financialCoverage, 1);
    }

    const agenda = await new PostgresAgendaRepository(pool).list();
    assert.equal(agenda.length, 3);
    assert.ok(agenda.every((item) => item.nextContest === 3));

    const notificationRepository = new PostgresNotificationRepository(pool);
    const notifications = await notificationRepository.list();
    assert.equal(notifications.filter((item) => item.type === "next-contest").length, 3);
    assert.equal(await notificationRepository.unreadCount(), 3);

    const first = notifications[0]!;
    await notificationRepository.markRead(first.id);
    assert.equal(await notificationRepository.unreadCount(), 2);

    await runOperationalSync(pool, { source: new FakeContestSource(), retries: 0, retryDelayMs: 0 });
    assert.equal((await notificationRepository.list()).filter((item) => item.type === "next-contest").length, 3);
    assert.equal(await notificationRepository.unreadCount(), 2);

    server = createLotoLabServer({ pool, operationSource: new FakeContestSource() });
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;

    const agendaResponse = await fetch(`${baseUrl}/api/v1/agenda`);
    assert.equal(agendaResponse.status, 200);
    const agendaPayload = (await agendaResponse.json()) as { agenda: unknown[]; notifications: Array<{ id: number }>; unreadCount: number };
    assert.equal(agendaPayload.agenda.length, 3);
    assert.equal(agendaPayload.notifications.length, 3);
    assert.equal(agendaPayload.unreadCount, 2);

    const unread = agendaPayload.notifications.find((item) => item.id !== first.id)!;
    const readResponse = await fetch(`${baseUrl}/api/v1/notifications/${unread.id}/read`, { method: "POST" });
    assert.equal(readResponse.status, 200);

    const readAllResponse = await fetch(`${baseUrl}/api/v1/notifications/read-all`, { method: "POST" });
    assert.equal(readAllResponse.status, 200);
    assert.equal(await notificationRepository.unreadCount(), 0);

    const latest = await new PostgresOperationRepository(pool).latest<SyncAllDetails>("sync-all");
    assert.ok(latest);
    assert.equal(latest.status, "success");
    assert.ok(latest.finishedAt);
    assert.equal(latest.details.successfulLotteries, 3);
  },
);
