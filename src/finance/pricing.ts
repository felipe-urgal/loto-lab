import type { Contest, LotteryId } from "../domain/types.js";

export interface PricePeriod {
  lottery: LotteryId;
  price: number;
  fromContest?: number;
  fromDate?: string;
  sourceNote: string;
}

const JULY_2025_REPRICE = "2025-07-09";

/**
 * Historical prices supported by the Loto Lab.
 *
 * Mega-Sena and Lotofacil intentionally start at the November/2019 price
 * schedule. Older contests are rejected instead of silently using a wrong
 * price. Dia de Sorte kept the R$ 2.00 simple bet in the 2019 schedule and
 * changed to R$ 2.50 at contest 753 in 2023.
 */
export const SIMPLE_BET_PRICE_PERIODS: PricePeriod[] = [
  {
    lottery: "mega-sena",
    fromContest: 2207,
    price: 4.5,
    sourceNote: "CAIXA price schedule effective from contest 2207 (2019)",
  },
  {
    lottery: "mega-sena",
    fromContest: 2588,
    price: 5,
    sourceNote: "CAIXA 2023 repricing effective from contest 2588",
  },
  {
    lottery: "mega-sena",
    fromDate: JULY_2025_REPRICE,
    price: 6,
    sourceNote: "CAIXA repricing effective from 2025-07-09",
  },
  {
    lottery: "lotofacil",
    fromContest: 1889,
    price: 2.5,
    sourceNote: "CAIXA price schedule effective from contest 1889 (2019)",
  },
  {
    lottery: "lotofacil",
    fromContest: 2801,
    price: 3,
    sourceNote: "CAIXA 2023 repricing effective from contest 2801",
  },
  {
    lottery: "lotofacil",
    fromDate: JULY_2025_REPRICE,
    price: 3.5,
    sourceNote: "CAIXA repricing effective from 2025-07-09",
  },
  {
    lottery: "dia-de-sorte",
    fromContest: 1,
    price: 2,
    sourceNote: "CAIXA price schedule: R$ 2.00 through contest 752",
  },
  {
    lottery: "dia-de-sorte",
    fromContest: 753,
    price: 2.5,
    sourceNote: "CAIXA 2023 repricing effective from contest 753",
  },
];

function applies(period: PricePeriod, contest: Contest): boolean {
  if (period.lottery !== contest.lottery) return false;
  if (period.fromContest !== undefined && contest.number < period.fromContest) return false;
  if (period.fromDate !== undefined && contest.date < period.fromDate) return false;
  return true;
}

export function simpleBetPriceForContest(contest: Contest): number {
  const periods = SIMPLE_BET_PRICE_PERIODS.filter((period) => applies(period, contest));
  const winner = periods.at(-1);

  if (!winner) {
    throw new Error(
      `No supported historical simple-bet price for ${contest.lottery} contest ${contest.number}`,
    );
  }

  return winner.price;
}
