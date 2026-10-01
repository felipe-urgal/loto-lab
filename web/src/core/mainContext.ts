export const MAIN_VIEWS = [
  "dashboard",
  "analysis",
  "generate",
] as const;

export type MainView = (typeof MAIN_VIEWS)[number];

export const LOTTERY_IDS = [
  "mega-sena",
  "lotofacil",
  "dia-de-sorte",
  "quina",
  "lotomania",
  "dupla-sena",
  "mais-milionaria",
  "timemania",
  "super-sete",
] as const;

export type LotteryId = (typeof LOTTERY_IDS)[number];

const mainViews = new Set<string>(MAIN_VIEWS);
const lotteryIds = new Set<string>(LOTTERY_IDS);

const LEGACY_MAIN_VIEW_REDIRECTS: Readonly<Record<string, MainView>> = {
  games: "dashboard",
  backtests: "analysis",
};

export function isMainView(value: string): value is MainView {
  return mainViews.has(value);
}

export function requestedMainViewFromHash(hash: string): string {
  return hash.replace(/^#/, "");
}

export function mainViewFromHash(hash: string): MainView {
  const requested = requestedMainViewFromHash(hash);
  if (isMainView(requested)) return requested;
  return LEGACY_MAIN_VIEW_REDIRECTS[requested] ?? "dashboard";
}

export function isLotteryId(value: string | null | undefined): value is LotteryId {
  return typeof value === "string" && lotteryIds.has(value);
}
