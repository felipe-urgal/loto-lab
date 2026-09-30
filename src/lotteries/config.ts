import type { LotteryConfig, LotteryId } from "../domain/types.js";
import { getLotteryCatalogEntry } from "../domain/lotteryCatalog.js";

export const LOTTERY_CONFIGS: Record<LotteryId, LotteryConfig> = {
  "mega-sena": {
    id: "mega-sena",
    name: getLotteryCatalogEntry("mega-sena").name,
    minNumber: 1,
    maxNumber: 60,
    drawSize: 6,
  },
  lotofacil: {
    id: "lotofacil",
    name: getLotteryCatalogEntry("lotofacil").name,
    minNumber: 1,
    maxNumber: 25,
    drawSize: 15,
  },
  "dia-de-sorte": {
    id: "dia-de-sorte",
    name: getLotteryCatalogEntry("dia-de-sorte").name,
    minNumber: 1,
    maxNumber: 31,
    drawSize: 7,
  },
};

export function getLotteryConfig(id: LotteryId): LotteryConfig {
  return LOTTERY_CONFIGS[id];
}
