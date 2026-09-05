export const MAIN_VIEWS = [
  "dashboard",
  "analysis",
  "generate",
  "games",
  "backtests",
] as const;

export type MainView = (typeof MAIN_VIEWS)[number];

export const LOTTERY_IDS = [
  "mega-sena",
  "lotofacil",
  "dia-de-sorte",
] as const;

export type LotteryId = (typeof LOTTERY_IDS)[number];

const mainViews = new Set<string>(MAIN_VIEWS);
const lotteryIds = new Set<string>(LOTTERY_IDS);

export function isMainView(value: string): value is MainView {
  return mainViews.has(value);
}

export function mainViewFromHash(hash: string): MainView {
  const requested = hash.replace(/^#/, "");
  return isMainView(requested) ? requested : "dashboard";
}

export function isLotteryId(value: string | null | undefined): value is LotteryId {
  return typeof value === "string" && lotteryIds.has(value);
}
