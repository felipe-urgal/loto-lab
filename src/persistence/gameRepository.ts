import type { Pool, PoolClient } from "pg";
import type { GeneratedGame, LotteryId } from "../domain/types.js";
import { assertValidGeneratedGame } from "../domain/validation.js";
import type {
  GeneratedGameBatchRecord,
  GenerationPreviewRecord,
  SaveGeneratedGameBatchInput,
  SaveGenerationPreviewInput,
} from "./types.js";

export type GeneratedBatchScope = "active" | "archived" | "all";

export interface GeneratedBatchCounts {
  active: number;
  archived: number;
  realBets: number;
}

interface BatchRow {
  id: string;
  lottery: LotteryId;
  strategy_id: string | null;
  target_contest_number: number | null;
  generator_options: Record<string, unknown>;
  created_at: Date;
  archived_at: Date | null;
  has_real_bet: boolean;
}

interface GameRow {
  batch_id: string;
  numbers: number[];
  fixed_numbers: number[];
  variable_numbers: number[];
  lucky_month: string | null;
  metadata: GeneratedGame["metadata"];
}

interface PreviewRow {
  preview_id: string;
  lottery: LotteryId;
  seed: string;
  target_contest_number: number | null;
  history_signature: string;
  config_signature: string;
  game_fingerprint: string;
  generator_options: Record<string, unknown>;
  games: GeneratedGame[];
  plan: GenerationPreviewRecord["plan"];
  created_at: Date;
  expires_at: Date;
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

function mapPreview(row: PreviewRow): GenerationPreviewRecord {
  return {
    previewId: row.preview_id,
    lottery: row.lottery,
    seed: row.seed,
    ...(row.target_contest_number !== null ? { targetContestNumber: row.target_contest_number } : {}),
    historySignature: row.history_signature,
    configSignature: row.config_signature,
    gameFingerprint: row.game_fingerprint,
    generatorOptions: row.generator_options,
    games: row.games,
    plan: row.plan,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  };
}

async function insertGames(
  client: PoolClient,
  batchId: number,
  games: GeneratedGame[],
): Promise<void> {
  for (const [index, game] of games.entries()) {
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
}

function validateBatchInput(input: SaveGeneratedGameBatchInput): void {
  if (input.games.length === 0) {
    throw new Error("A generated game batch must contain at least one game");
  }
  if (input.games.some((game) => game.lottery !== input.lottery)) {
    throw new Error("Every game in a batch must match the batch lottery");
  }
  for (const game of input.games) assertValidGeneratedGame(game);
}

export class PostgresGameRepository {
  constructor(private readonly pool: Pool) {}

  async saveBatch(input: SaveGeneratedGameBatchInput): Promise<GeneratedGameBatchRecord> {
    validateBatchInput(input);
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
      await insertGames(client, batchId, input.games);
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

  async saveBatchIdempotent(
    input: SaveGeneratedGameBatchInput,
    generationKey: string,
  ): Promise<{ batch: GeneratedGameBatchRecord; created: boolean }> {
    validateBatchInput(input);
    if (!generationKey.trim()) throw new Error("generationKey is required");
    const client = await this.pool.connect();
    let batchId: number;
    let created = false;

    try {
      await client.query("BEGIN");
      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO generated_game_batches (
            lottery, strategy_id, target_contest_number, generator_options, generation_key
          ) VALUES ($1, $2, $3, $4::jsonb, $5)
          ON CONFLICT (generation_key) DO NOTHING
          RETURNING id
        `,
        [
          input.lottery,
          input.strategyId ?? null,
          input.targetContestNumber ?? null,
          JSON.stringify(input.generatorOptions ?? {}),
          generationKey,
        ],
      );

      if (inserted.rowCount && inserted.rows[0]) {
        batchId = Number(inserted.rows[0].id);
        created = true;
        await insertGames(client, batchId, input.games);
      } else {
        const existing = await client.query<{ id: string }>(
          "SELECT id FROM generated_game_batches WHERE generation_key = $1",
          [generationKey],
        );
        if (!existing.rows[0]) throw new Error("Idempotent generated batch conflict could not be resolved");
        batchId = Number(existing.rows[0].id);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const batch = await this.findBatch(batchId!);
    if (!batch) throw new Error("Generated game batch was not found after idempotent save");
    return { batch, created };
  }

  async saveGenerationPreview(input: SaveGenerationPreviewInput): Promise<GenerationPreviewRecord> {
    await this.pool.query(
      `
        INSERT INTO generation_previews (
          preview_id, lottery, seed, target_contest_number,
          history_signature, config_signature, game_fingerprint,
          generator_options, games, plan, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, NOW() + INTERVAL '24 hours')
        ON CONFLICT (lottery, seed) DO UPDATE SET
          preview_id = EXCLUDED.preview_id,
          target_contest_number = EXCLUDED.target_contest_number,
          history_signature = EXCLUDED.history_signature,
          config_signature = EXCLUDED.config_signature,
          game_fingerprint = EXCLUDED.game_fingerprint,
          generator_options = EXCLUDED.generator_options,
          games = EXCLUDED.games,
          plan = EXCLUDED.plan,
          created_at = NOW(),
          expires_at = NOW() + INTERVAL '24 hours'
      `,
      [
        input.previewId,
        input.lottery,
        input.seed,
        input.targetContestNumber ?? null,
        input.historySignature,
        input.configSignature,
        input.gameFingerprint,
        JSON.stringify(input.generatorOptions),
        JSON.stringify(input.games),
        JSON.stringify(input.plan),
      ],
    );
    const preview = await this.findGenerationPreview(input.lottery, input.seed);
    if (!preview) throw new Error("Generation preview was not found after save");
    return preview;
  }

  async findGenerationPreview(lottery: LotteryId, seed: string): Promise<GenerationPreviewRecord | undefined> {
    const result = await this.pool.query<PreviewRow>(
      `
        SELECT
          preview_id, lottery, seed, target_contest_number,
          history_signature, config_signature, game_fingerprint,
          generator_options, games, plan, created_at, expires_at
        FROM generation_previews
        WHERE lottery = $1 AND seed = $2 AND expires_at > NOW()
        LIMIT 1
      `,
      [lottery, seed],
    );
    return result.rows[0] ? mapPreview(result.rows[0]) : undefined;
  }

  async deleteExpiredGenerationPreviews(): Promise<number> {
    const result = await this.pool.query("DELETE FROM generation_previews WHERE expires_at <= NOW()");
    return result.rowCount ?? 0;
  }

  private async findBatches(ids: number[]): Promise<GeneratedGameBatchRecord[]> {
    if (ids.length === 0) return [];
    const uniqueIds = [...new Set(ids)];
    const [batchResult, gamesResult] = await Promise.all([
      this.pool.query<BatchRow>(
        `
          SELECT
            batch.*,
            EXISTS (
              SELECT 1 FROM real_bets bet WHERE bet.batch_id = batch.id
            ) AS has_real_bet
          FROM generated_game_batches batch
          WHERE batch.id = ANY($1::bigint[])
        `,
        [uniqueIds],
      ),
      this.pool.query<GameRow>(
        `
          SELECT batch_id, numbers, fixed_numbers, variable_numbers, lucky_month, metadata
          FROM generated_games
          WHERE batch_id = ANY($1::bigint[])
          ORDER BY batch_id, position
        `,
        [uniqueIds],
      ),
    ]);

    const gamesByBatch = new Map<number, GameRow[]>();
    for (const row of gamesResult.rows) {
      const batchId = Number(row.batch_id);
      const rows = gamesByBatch.get(batchId) ?? [];
      rows.push(row);
      gamesByBatch.set(batchId, rows);
    }

    const byId = new Map<number, GeneratedGameBatchRecord>();
    for (const batch of batchResult.rows) {
      const id = Number(batch.id);
      byId.set(id, {
        id,
        lottery: batch.lottery,
        ...(batch.strategy_id ? { strategyId: Number(batch.strategy_id) } : {}),
        ...(batch.target_contest_number !== null
          ? { targetContestNumber: batch.target_contest_number }
          : {}),
        generatorOptions: batch.generator_options,
        createdAt: batch.created_at.toISOString(),
        ...(batch.archived_at ? { archivedAt: batch.archived_at.toISOString() } : {}),
        hasRealBet: Boolean(batch.has_real_bet),
        games: (gamesByBatch.get(id) ?? []).map((row) => mapGame(batch.lottery, row)),
      });
    }

    return ids.map((id) => byId.get(id)).filter((item): item is GeneratedGameBatchRecord => item !== undefined);
  }

  async findBatch(id: number): Promise<GeneratedGameBatchRecord | undefined> {
    return (await this.findBatches([id]))[0];
  }

  async listRecent(
    lottery: LotteryId,
    limit = 20,
    scope: GeneratedBatchScope = "active",
  ): Promise<GeneratedGameBatchRecord[]> {
    const lifecycleFilter = scope === "active"
      ? "AND archived_at IS NULL"
      : scope === "archived"
        ? "AND archived_at IS NOT NULL"
        : "";
    const result = await this.pool.query<{ id: string }>(
      `
        SELECT id
        FROM generated_game_batches
        WHERE lottery = $1
          ${lifecycleFilter}
        ORDER BY COALESCE(archived_at, created_at) DESC, id DESC
        LIMIT $2
      `,
      [lottery, limit],
    );

    return this.findBatches(result.rows.map((row) => Number(row.id)));
  }

  async counts(lottery: LotteryId): Promise<GeneratedBatchCounts> {
    const result = await this.pool.query<{
      active: string;
      archived: string;
      real_bets: string;
    }>(
      `
        SELECT
          COUNT(*) FILTER (WHERE batch.archived_at IS NULL)::text AS active,
          COUNT(*) FILTER (WHERE batch.archived_at IS NOT NULL)::text AS archived,
          COUNT(*) FILTER (
            WHERE EXISTS (SELECT 1 FROM real_bets bet WHERE bet.batch_id = batch.id)
          )::text AS real_bets
        FROM generated_game_batches batch
        WHERE batch.lottery = $1
      `,
      [lottery],
    );
    const row = result.rows[0]!;
    return {
      active: Number(row.active),
      archived: Number(row.archived),
      realBets: Number(row.real_bets),
    };
  }

  async setArchived(id: number, archived: boolean): Promise<GeneratedGameBatchRecord | undefined> {
    const current = await this.findBatch(id);
    if (!current) return undefined;
    if (Boolean(current.archivedAt) === archived) return current;

    await this.pool.query(
      archived
        ? `UPDATE generated_game_batches SET archived_at = NOW() WHERE id = $1`
        : `UPDATE generated_game_batches SET archived_at = NULL WHERE id = $1`,
      [id],
    );

    return this.findBatch(id);
  }
}
