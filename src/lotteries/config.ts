import type { LotteryConfig, LotteryId } from "../domain/types.js";
import { getLotteryCatalogEntry } from "../domain/lotteryCatalog.js";

export const LOTTERY_CONFIGS: Record<LotteryId, LotteryConfig> = {
  "mega-sena": {
    id: "mega-sena",
    name: getLotteryCatalogEntry("mega-sena").name,
    minNumber: 1,
    maxNumber: 60,
    drawSize: 6,
    defaultBetSize: 6,
  },
  lotofacil: {
    id: "lotofacil",
    name: getLotteryCatalogEntry("lotofacil").name,
    minNumber: 1,
    maxNumber: 25,
    drawSize: 15,
    defaultBetSize: 15,
  },
  "dia-de-sorte": {
    id: "dia-de-sorte",
    name: getLotteryCatalogEntry("dia-de-sorte").name,
    minNumber: 1,
    maxNumber: 31,
    drawSize: 7,
    defaultBetSize: 7,
  },
  quina: {
    id: "quina",
    name: getLotteryCatalogEntry("quina").name,
    minNumber: 1,
    maxNumber: 80,
    drawSize: 5,
    defaultBetSize: 5,
  },
  lotomania: {
    id: "lotomania",
    name: getLotteryCatalogEntry("lotomania").name,
    minNumber: 0,
    maxNumber: 99,
    drawSize: 20,
    defaultBetSize: 50,
  },
  "dupla-sena": {
    id: "dupla-sena",
    name: getLotteryCatalogEntry("dupla-sena").name,
    minNumber: 1,
    maxNumber: 50,
    drawSize: 6,
    defaultBetSize: 6,
  },
  "mais-milionaria": {
    id: "mais-milionaria",
    name: getLotteryCatalogEntry("mais-milionaria").name,
    minNumber: 1,
    maxNumber: 50,
    drawSize: 6,
    defaultBetSize: 6,
  },
  timemania: {
    id: "timemania",
    name: getLotteryCatalogEntry("timemania").name,
    minNumber: 1,
    maxNumber: 80,
    drawSize: 7,
    defaultBetSize: 10,
  },
  "super-sete": {
    id: "super-sete",
    name: getLotteryCatalogEntry("super-sete").name,
    minNumber: 0,
    maxNumber: 9,
    drawSize: 7,
    defaultBetSize: 7,
  },
};

export function getLotteryConfig(id: LotteryId): LotteryConfig {
  return LOTTERY_CONFIGS[id];
}
