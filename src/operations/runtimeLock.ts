import type { Pool, PoolClient } from "pg";

const RUNTIME_INSTANCE_ADVISORY_LOCK = 1515016;

export interface RuntimeInstanceLock {
  release(): Promise<void>;
}

export class RuntimeInstanceAlreadyActiveError extends Error {
  constructor() {
    super("Another Loto Lab runtime instance is already active for this PostgreSQL database");
    this.name = "RuntimeInstanceAlreadyActiveError";
  }
}

export async function acquireRuntimeInstanceLock(pool: Pool): Promise<RuntimeInstanceLock> {
  const client: PoolClient = await pool.connect();
  let locked = false;
  try {
    const result = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS locked",
      [RUNTIME_INSTANCE_ADVISORY_LOCK],
    );
    locked = Boolean(result.rows[0]?.locked);
    if (!locked) throw new RuntimeInstanceAlreadyActiveError();
  } catch (error) {
    client.release();
    throw error;
  }

  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      if (locked) {
        await client.query("SELECT pg_advisory_unlock($1)", [RUNTIME_INSTANCE_ADVISORY_LOCK]).catch(() => undefined);
      }
      client.release();
    },
  };
}
