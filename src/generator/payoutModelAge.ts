import type { LotteryId } from "../domain/types.js";

/** Concursos equivalentes a ~1 ano de histórico: depois disso o modelo de popularidade merece reajuste. */
const REFRESH_AFTER_CONTESTS: Partial<Record<LotteryId, number>> = {
  "mega-sena": 104,
  lotofacil: 312,
  quina: 312,
  "dia-de-sorte": 156,
  "dupla-sena": 104,
  "mais-milionaria": 104,
  timemania: 156,
};

export interface PayoutModelAge {
  fitThroughContest: number;
  latestContest: number | null;
  ageContests: number;
  refreshAfterContests: number;
  stale: boolean;
}

export function describePayoutModelAge(
  lottery: LotteryId,
  fitThroughContest: number,
  latestContest: number | undefined,
): PayoutModelAge {
  const refreshAfterContests = REFRESH_AFTER_CONTESTS[lottery] ?? 104;
  const ageContests = latestContest === undefined ? 0 : Math.max(0, latestContest - fitThroughContest);
  return {
    fitThroughContest,
    latestContest: latestContest ?? null,
    ageContests,
    refreshAfterContests,
    stale: ageContests > refreshAfterContests,
  };
}
