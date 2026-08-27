import type { Pool } from "pg";
import type { LotteryId } from "../domain/types.js";
import { PostgresAgendaRepository } from "../persistence/agendaRepository.js";
import { PostgresContestRepository } from "../persistence/contestRepository.js";
import { PostgresNotificationRepository } from "../persistence/notificationRepository.js";
import { PostgresOperationRepository, type OperationRunRecord } from "../persistence/operationRepository.js";
import { PostgresRealBetRepository } from "../persistence/realBetRepository.js";

const LOTTERIES: LotteryId[] = ["mega-sena", "lotofacil", "dia-de-sorte"];
const LABELS: Record<LotteryId, string> = {
  "mega-sena": "Mega-Sena",
  lotofacil: "Lotofácil",
  "dia-de-sorte": "Dia de Sorte",
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

export class NotificationService {
  private readonly agenda: PostgresAgendaRepository;
  private readonly contests: PostgresContestRepository;
  private readonly notifications: PostgresNotificationRepository;
  private readonly operations: PostgresOperationRepository;
  private readonly realBets: PostgresRealBetRepository;

  constructor(pool: Pool) {
    this.agenda = new PostgresAgendaRepository(pool);
    this.contests = new PostgresContestRepository(pool);
    this.notifications = new PostgresNotificationRepository(pool);
    this.operations = new PostgresOperationRepository(pool);
    this.realBets = new PostgresRealBetRepository(pool);
  }

  async refresh(): Promise<NotificationRefreshResult> {
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

    for (const lottery of LOTTERIES) {
      const bets = await this.realBets.listRecent(lottery, 100);
      for (const bet of bets) {
        if (bet.status === "checked") {
          const won = (bet.totalPrizeValue ?? 0) > 0;
          await this.notifications.upsert({
            eventKey: `bet:${bet.id}`,
            type: won ? "bet-prize" : "bet-checked",
            lottery,
            severity: won ? "success" : "info",
            title: won ? `Aposta #${bet.id} premiada` : `Aposta #${bet.id} conferida`,
            body: won
              ? `Concurso #${bet.contestNumber}: prêmio total ${money(bet.totalPrizeValue!)}.`
              : `Concurso #${bet.contestNumber}: conferência concluída sem prêmio registrado.`,
            actionHref: `/#games`,
            metadata: { betId: bet.id, contestNumber: bet.contestNumber, totalPrizeValue: bet.totalPrizeValue },
          });
        } else {
          const result = await this.contests.findByNumber(lottery, bet.contestNumber);
          await this.notifications.upsert({
            eventKey: `bet:${bet.id}`,
            type: result ? "result-available" : "bet-awaiting",
            lottery,
            severity: result ? "warning" : "info",
            title: result ? `Resultado disponível · aposta #${bet.id}` : `Aposta #${bet.id} aguardando sorteio`,
            body: result
              ? `O concurso #${bet.contestNumber} já está na base e a aposta aguarda reconciliação.`
              : `Aposta registrada para o concurso #${bet.contestNumber}.`,
            actionHref: `/#games`,
            metadata: { betId: bet.id, contestNumber: bet.contestNumber },
          });
        }
        betCount += 1;
      }
    }

    const latest = await this.operations.latest("sync-all") as OperationRunRecord<Record<string, unknown>> | undefined;
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
