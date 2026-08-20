import type { Pool } from "pg";
import type { GeneratedGame, LotteryId } from "../domain/types.js";
import type {
  GeneratedGameBatchRecord,
  SaveGeneratedGameBatchInput,
} from "./types.js";

interface BatchRow {
  id: string;
  lottery: LotteryId;
  strategy_id: string | null;
  target_contest_number: number | null;
  generator_options: Record<string, unknown>;
  created_at: Date;
}

interface GameRow {
  numbers: number[];
  fixed_numbers: number[];
  variable_numbers: number[];
  lucky_month: string | null;
  metadata: GeneratedGame["metadata"];
}

function mapGame(lottery: LotteryId, row: GameRow): GeneratedGame {
  return {
    lottery,
    numbers: row.numbers.map(Number),
    fixedNumbers: row.fixed_numbers.map(Number),
    variableNumbers: row.variable_numbers.map(Number),
    ...(row.lucky_month ? { luckyMonth: row.lucky_month } : {}),
    metadata: row.metadata,
  };
}

export class PostgresGameRepository {
  constructor(private readonly pool: Pool) {}

  async saveBatch(input: SaveGeneratedGameBatchInput): Promise<GeneratedGameBatchRecord> {
    if (input.games.length === 0) {
      throw new Error("A generated game batch must contain at least one game");
    }
    if (input.games.some((game) => game.lottery !== input.lottery)) {
      throw new Error("Every game in a batch must match the batch lottery");
    }

    const client = await this.pool.connect();
    let batchId: number;

    try {
      await client.query("BEGIN");
      const batch = await client.query<{ id: string }>(
        `
          INSERT INTO generated_game_batches (
            lottery, strategy_id, target_contest_number, generator_options
          ) VALUES ($1, $2, $3, $4::jsonb)
          RETURNING id
        `,
        [
          input.lottery,
          input.strategyId ?? null,
          input.targetContestNumber ?? null,
          JSON.stringify(input.generatorOptions ?? {}),
        ],
      );
      batchId = Number(batch.rows[0]!.id);

      for (const [index, game] of input.games.entries()) {
        await client.query(
          `
            INSERT INTO generated_games (
              batch_id, position, numbers, fixed_numbers, variable_numbers, lucky_month, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
          `,
          [
            batchId,
            index + 1,
            game.numbers,
            game.fixedNumbers,
            game.variableNumbers,
            game.luckyMonth ?? null,
            JSON.stringify(game.metadata),
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const saved = await this.findBatch(batchId!);
    if (!saved) throw new Error("Generated game batch was not found after insert");
    return saved;
  }

  async findBatch(id: number): Promise<GeneratedGameBatchRecord | undefined> {
    const batchResult = await this.pool.query<BatchRow>(
      "SELECT * FROM generated_game_batches WHERE id = $1",
      [id],
    );
    const batch = batchResult.rows[0];
    if (!batch) return undefined;

    const gamesResult = await this.pool.query<GameRow>(
      `
        SELECT numbers, fixed_numbers, variable_numbers, lucky_month, metadata
        FROM generated_games
        WHERE batch_id = $1
        ORDER BY position
      `,
      [id],
    );

    return {
      id: Number(batch.id),
      lottery: batch.lottery,
      ...(batch.strategy_id ? { strategyId: Number(batch.strategy_id) } : {}),
      ...(batch.target_contest_number !== null
        ? { targetContestNumber: batch.target_contest_number }
        : {}),
      generatorOptions: batch.generator_options,
      createdAt: batch.created_at.toISOString(),
      games: gamesResult.rows.map((row) => mapGame(batch.lottery, row)),
    };
  }

  async listRecent(lottery: LotteryId, limit = 20): Promise<GeneratedGameBatchRecord[]> {
    const result = await this.pool.query<{ id: string }>(
      `
        SELECT id
        FROM generated_game_batches
        WHERE lottery = $1
        ORDER BY created_at DESC, id DESC
        LIMIT $2
      `,
      [lottery, limit],
    );

    const batches = await Promise.all(result.rows.map((row) => this.findBatch(Number(row.id))));
    return batches.filter((batch): batch is GeneratedGameBatchRecord => batch !== undefined);
  }
}
