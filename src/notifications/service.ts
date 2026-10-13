import type { Pool } from "pg";
import type { LotteryId } from "../domain/types.js";
import { LOTTERY_CONFIGS } from "../lotteries/config.js";
import { PostgresAgendaRepository } from "../persistence/agendaRepository.js";
import { PostgresNotificationRepository } from "../persistence/notificationRepository.js";
import { PostgresOperationRepository, type OperationRunRecord } from "../persistence/operationRepository.js";
import { PostgresRealBetRepository } from "../persistence/realBetRepository.js";

const LOTTERIES = Object.keys(LOTTERY_CONFIGS) as LotteryId[];
const LABELS: Record<LotteryId, string> = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
  quina: "Quina",
  lotomania: "Lotomania",
  "dupla-sena": "Dupla Sena",
  "mais-milionaria": "+Milionária",
  timemania: "Timemania",
  "super-sete": "Super Sete",
};

function money(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function date(value: string | undefined): string {
  if (!value) return "data ainda não informada";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export interface NotificationRefreshResult {
  agenda: number;
  bets: number;
  operations: number;
  unread: number;
}

type CurrentOperation = Pick<OperationRunRecord<Record<string, unknown>>, "id" | "status">;

export class NotificationService {
  private readonly pool: Pool;
  private readonly agenda: PostgresAgendaRepository;
  private readonly notifications: PostgresNotificationRepository;
  private readonly operations: PostgresOperationRepository;
  private readonly realBets: PostgresRealBetRepository;

  constructor(pool: Pool) {
    this.pool = pool;
    this.agenda = new PostgresAgendaRepository(pool);
    this.notifications = new PostgresNotificationRepository(pool);
    this.operations = new PostgresOperationRepository(pool);
    this.realBets = new PostgresRealBetRepository(pool);
  }

  async refresh(currentOperation?: CurrentOperation): Promise<NotificationRefreshResult> {
    let agendaCount = 0;
    let betCount = 0;
    let operationCount = 0;

    for (const item of await this.agenda.list()) {
      const details = [
        `Concurso #${item.nextContest} em ${date(item.nextDrawDate)}.`,
        item.estimatedPrize !== undefined ? `Prêmio estimado: ${money(item.estimatedPrize)}.` : undefined,
        item.accumulated ? "Concurso acumulado." : undefined,
      ].filter(Boolean).join(" ");
      await this.notifications.upsert({
        eventKey: `agenda:${item.lottery}`,
        type: "next-contest",
        lottery: item.lottery,
        severity: "info",
        title: `Próximo concurso · ${LABELS[item.lottery]}`,
        body: details,
        actionHref: `/#generate`,
        metadata: {
          currentContest: item.currentContest,
          nextContest: item.nextContest,
          nextDrawDate: item.nextDrawDate,
          estimatedPrize: item.estimatedPrize,
        },
      });
      agendaCount += 1;
    }

    const betsByLottery = await Promise.all(LOTTERIES.map(async lottery => ({
      lottery,
      bets: await this.realBets.listRecent(lottery, 100),
    })));
    const pending = betsByLottery.flatMap(({ lottery, bets }) =>
      bets.filter(bet => bet.status !== "checked").map(bet => ({ lottery, contestNumber: bet.contestNumber })),
    );
    const available = new Set<string>();
    if (pending.length > 0) {
      const results = await this.pool.query<{ lottery: LotteryId; contest_number: number }>(
        `SELECT c.lottery, c.contest_number
         FROM contests c
         JOIN unnest($1::text[], $2::integer[]) AS requested(lottery, contest_number)
           ON c.lottery = requested.lottery AND c.contest_number = requested.contest_number`,
        [pending.map(item => item.lottery), pending.map(item => item.contestNumber)],
      );
      for (const row of results.rows) available.add(`${row.lottery}:${row.contest_number}`);
    }

    for (const { lottery, bets } of betsByLottery) {
      for (const bet of bets) {
        if (bet.status === "checked") {
          const unknown = bet.totalPrizeValue === undefined;
          const won = !unknown && bet.totalPrizeValue! > 0;
          await this.notifications.upsert({
            eventKey: `bet:${bet.id}`,
            type: won ? "bet-prize" : "bet-checked",
            lottery,
            severity: won ? "success" : unknown ? "warning" : "info",
            title: won ? `Aposta #${bet.id} premiada` : `Aposta #${bet.id} conferida`,
            body: unknown
              ? `Concurso #${bet.contestNumber}: conferência concluída; premiação ainda não disponível.`
              : won
                ? `Concurso #${bet.contestNumber}: prêmio total ${money(bet.totalPrizeValue!)}.`
                : `Concurso #${bet.contestNumber}: conferência concluída sem prêmio registrado.`,
            actionHref: "/#games",
            metadata: { betId: bet.id, contestNumber: bet.contestNumber, totalPrizeValue: bet.totalPrizeValue ?? null },
          });
        } else {
          const hasResult = available.has(`${lottery}:${bet.contestNumber}`);
          await this.notifications.upsert({
            eventKey: `bet:${bet.id}`,
            type: hasResult ? "result-available" : "bet-awaiting",
            lottery,
            severity: hasResult ? "warning" : "info",
            title: hasResult ? `Resultado disponível · aposta #${bet.id}` : `Aposta #${bet.id} aguardando sorteio`,
            body: hasResult
              ? `O concurso #${bet.contestNumber} já está na base e a aposta aguarda reconciliação.`
              : `Aposta registrada para o concurso #${bet.contestNumber}.`,
            actionHref: "/#games",
            metadata: { betId: bet.id, contestNumber: bet.contestNumber },
          });
        }
        betCount += 1;
      }
    }

    const latest = currentOperation
      ?? (await this.operations.latest("sync-all") as OperationRunRecord<Record<string, unknown>> | undefined);
    if (latest && (latest.status === "failed" || latest.status === "partial" || latest.status === "abandoned")) {
      const abandoned = latest.status === "abandoned";
      const failed = latest.status === "failed";
      await this.notifications.upsert({
        eventKey: `operation:${latest.id}`,
        type: "operation-warning",
        severity: failed || abandoned ? "error" : "warning",
        title: abandoned ? "Sincronização interrompida" : failed ? "Sincronização falhou" : "Sincronização parcial",
        body: abandoned
          ? `Execução operacional #${latest.id} foi interrompida antes de finalizar. Uma nova sincronização é recomendada.`
          : `Execução operacional #${latest.id} terminou como ${latest.status}. Consulte o Dashboard e tente sincronizar novamente.`,
        actionHref: `/#dashboard`,
        metadata: { operationRunId: latest.id, status: latest.status },
      });
      operationCount += 1;
    }

    return {
      agenda: agendaCount,
      bets: betCount,
      operations: operationCount,
      unread: await this.notifications.unreadCount(),
    };
  }
}
