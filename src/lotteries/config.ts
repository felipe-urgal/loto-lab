import type { LotteryConfig, LotteryId } from "../domain/types.js";

export const LOTTERY_CONFIGS: Record<LotteryId, LotteryConfig> = {
  "mega-sena": {
    id: "mega-sena",
    name: "Mega-Sena",
    minNumber: 1,
    maxNumber: 60,
    drawSize: 6,
  },
  lotofacil: {
    id: "lotofacil",
    name: "Lotofácil",
    minNumber: 1,
    maxNumber: 25,
    drawSize: 15,
  },
  "dia-de-sorte": {
    id: "dia-de-sorte",
    name: "Dia de Sorte",
    minNumber: 1,
    maxNumber: 31,
    drawSize: 7,
  },
};

export function getLotteryConfig(id: LotteryId): LotteryConfig {
  return LOTTERY_CONFIGS[id];
}
