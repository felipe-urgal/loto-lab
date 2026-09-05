export interface PostgresPoolMetricsSource {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

export interface PostgresPoolMetricsSnapshot {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  waitingRequests: number;
}

function nonNegativeCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export function postgresPoolMetricsSnapshot(
  pool: PostgresPoolMetricsSource,
): PostgresPoolMetricsSnapshot {
  const totalConnections = nonNegativeCount(pool.totalCount);
  const idleConnections = Math.min(totalConnections, nonNegativeCount(pool.idleCount));

  return {
    totalConnections,
    idleConnections,
    activeConnections: totalConnections - idleConnections,
    waitingRequests: nonNegativeCount(pool.waitingCount),
  };
}
