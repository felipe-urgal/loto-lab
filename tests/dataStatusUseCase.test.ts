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
    ],
  });
  assert.deepEqual(calls, ["mega-sena", "lotofacil", "dia-de-sorte"]);
});
