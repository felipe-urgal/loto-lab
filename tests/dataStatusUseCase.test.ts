import test from "node:test";
import assert from "node:assert/strict";
import { GetDataStatusUseCase } from "../src/application/dataStatus.js";
import type { LotteryId } from "../src/domain/types.js";

test("GetDataStatusUseCase reads every supported lottery through its application port", async () => {
  const calls: LotteryId[] = [];
  const useCase = new GetDataStatusUseCase({
    async getDataStatus(lottery) {
      calls.push(lottery);
      return { lottery, totalContests: calls.length };
    },
  });

  assert.deepEqual(await useCase.execute(), {
    items: [
      { lottery: "mega-sena", totalContests: 1 },
      { lottery: "lotofacil", totalContests: 2 },
      { lottery: "dia-de-sorte", totalContests: 3 },
      { lottery: "quina", totalContests: 4 },
      { lottery: "lotomania", totalContests: 5 },
      { lottery: "dupla-sena", totalContests: 6 },
      { lottery: "mais-milionaria", totalContests: 7 },
      { lottery: "timemania", totalContests: 8 },
      { lottery: "super-sete", totalContests: 9 },
    ],
  });
  assert.deepEqual(calls, [
    "mega-sena",
    "lotofacil",
    "dia-de-sorte",
    "quina",
    "lotomania",
    "dupla-sena",
    "mais-milionaria",
    "timemania",
    "super-sete",
  ]);
});
