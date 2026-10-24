import type { LotteryId } from "../domain/types.js";
import { FIXED_COUNTS } from "../domain/validation.js";

/**
 * O domínio e o PostgreSQL só aceitam certos tamanhos de núcleo fixo por modalidade. As dezenas
 * fixadas pelo apostador valem em todos os jogos de qualquer forma; só são classificadas como
 * "fixas" quando o tamanho do núcleo é persistível, senão ficam como variáveis.
 */
export function partitionPayoutCore(
  lottery: LotteryId,
  numbers: readonly number[],
  core: readonly number[],
): { fixedNumbers: number[]; variableNumbers: number[] } {
  if (FIXED_COUNTS[lottery].includes(core.length)) {
    return { fixedNumbers: [...core], variableNumbers: numbers.filter((number) => !core.includes(number)) };
  }
  return { fixedNumbers: [], variableNumbers: [...numbers] };
}
