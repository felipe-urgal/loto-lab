import type { PoolClient } from "pg";

function normalizedError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Releases a session-level PostgreSQL advisory lock and then returns the client
 * to the pool. If the unlock cannot be confirmed, the client is discarded
 * instead: closing the PostgreSQL session is the only safe fallback because a
 * session-level lock must never be recycled into the pool still held.
 */
export async function releaseAdvisoryLockClient(
  client: PoolClient,
  query: string,
  values: unknown[] = [],
): Promise<void> {
  try {
    const result = await client.query<{ unlocked: boolean }>(query, values);
    if (result.rows[0]?.unlocked !== true) {
      throw new Error("PostgreSQL advisory lock release was not confirmed");
    }
  } catch (error) {
    const normalized = normalizedError(error);
    client.release(normalized);
    throw normalized;
  }

  client.release();
}
